"""
FinPulse Sentiment Microservice
--------------------------------
Primary scorer: FinBERT (ProsusAI/finbert) — a BERT model pre-trained on financial text.
Fallback scorer: VADER with finance-domain lexicon extensions.

FinBERT is loaded once at startup. If it fails to load (no internet, low memory, etc.),
the service transparently falls back to VADER so ingestion never stops.

Endpoints:
  POST /score   { "text": "Apple beats earnings expectations" }
  -> { "compound": 0.72, "positive": 0.85, "neutral": 0.12, "negative": 0.03,
       "label": "positive", "model": "finbert" }

  GET  /health  -> { "status": "ok", "model": "finbert" | "vader" }
"""

from contextlib import asynccontextmanager
import logging

import nltk
from fastapi import FastAPI
from pydantic import BaseModel

logger = logging.getLogger("finpulse.sentiment")

# ---------------------------------------------------------------------------
# VADER — always available as fallback
# ---------------------------------------------------------------------------
nltk.download("vader_lexicon", quiet=True)
from nltk.sentiment.vader import SentimentIntensityAnalyzer  # noqa: E402

_sia = SentimentIntensityAnalyzer()

_FINANCE_LEXICON: dict[str, float] = {
    "beats": 2.0, "beat": 2.0, "topped": 1.8, "tops": 1.8,
    "outperform": 2.0, "upgrade": 1.8, "upgrades": 1.8,
    "surge": 2.2, "surges": 2.2, "soar": 2.2, "soars": 2.2,
    "rally": 1.8, "rallies": 1.8, "boom": 2.0, "breakout": 1.8,
    "bullish": 2.5, "record": 1.5, "guidance": 0.8,
    "downgrade": -2.0, "downgrades": -2.0, "miss": -1.8, "misses": -1.8,
    "missed": -1.8, "plunge": -2.2, "plunges": -2.2, "crash": -2.5,
    "crashes": -2.5, "selloff": -2.0, "bearish": -2.5,
    "layoff": -2.0, "layoffs": -2.0, "bankruptcy": -3.0,
    "fraud": -2.8, "probe": -1.5, "investigation": -1.5,
    "shortfall": -2.0, "guidance cut": -2.2,
}
_sia.lexicon.update(_FINANCE_LEXICON)


def _vader_score(text: str) -> dict:
    s = _sia.polarity_scores(text)
    compound = s["compound"]
    label = "positive" if compound >= 0.05 else "negative" if compound <= -0.05 else "neutral"
    return {
        "compound": compound,
        "positive": s["pos"],
        "neutral": s["neu"],
        "negative": s["neg"],
        "label": label,
        "model": "vader",
    }


# ---------------------------------------------------------------------------
# FinBERT — loaded at startup, None if unavailable
# ---------------------------------------------------------------------------
_finbert_pipeline = None
_active_model = "vader"


def _load_finbert():
    global _finbert_pipeline, _active_model
    try:
        from transformers import pipeline
        logger.info("Loading FinBERT (ProsusAI/finbert) — first run downloads ~400 MB …")
        _finbert_pipeline = pipeline(
            "text-classification",
            model="ProsusAI/finbert",
            top_k=None,          # return all three labels
            truncation=True,
            max_length=512,
        )
        # warm-up
        _finbert_pipeline("warm up")
        _active_model = "finbert"
        logger.info("FinBERT loaded successfully.")
    except Exception as exc:
        logger.warning("FinBERT could not be loaded (%s). Falling back to VADER.", exc)
        _finbert_pipeline = None
        _active_model = "vader"


def _finbert_score(text: str) -> dict:
    """Score text with FinBERT. Returns same shape as _vader_score."""
    results = _finbert_pipeline(text)[0]   # list of {label, score}
    label_map = {r["label"].lower(): r["score"] for r in results}

    pos = label_map.get("positive", 0.0)
    neg = label_map.get("negative", 0.0)
    neu = label_map.get("neutral", 0.0)

    # compound: +1 = fully positive, -1 = fully negative
    compound = round(pos - neg, 4)
    label = "positive" if compound >= 0.05 else "negative" if compound <= -0.05 else "neutral"

    return {
        "compound": compound,
        "positive": round(pos, 4),
        "neutral": round(neu, 4),
        "negative": round(neg, 4),
        "label": label,
        "model": "finbert",
    }


def _score(text: str) -> dict:
    """Score with FinBERT when available, VADER otherwise."""
    if _finbert_pipeline is not None:
        try:
            return _finbert_score(text)
        except Exception as exc:
            logger.warning("FinBERT inference failed (%s), using VADER.", exc)
    return _vader_score(text)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_finbert()
    yield


app = FastAPI(title="FinPulse Sentiment Service", lifespan=lifespan)


class ScoreRequest(BaseModel):
    text: str


class ScoreResponse(BaseModel):
    compound: float
    positive: float
    neutral: float
    negative: float
    label: str   # "positive" | "neutral" | "negative"
    model: str   # "finbert" | "vader"


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    return ScoreResponse(**_score(req.text))


@app.get("/health")
def health():
    return {"status": "ok", "model": _active_model}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8766)
