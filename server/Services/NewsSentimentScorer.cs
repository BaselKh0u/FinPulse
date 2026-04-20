namespace Server.Services;

/// <summary>
/// Lightweight sentiment from text for headlines/social when ML APIs are unavailable.
/// Tuned so a single clear keyword can cross the UI neutral band (see <see cref="NeutralBand"/>).
/// </summary>
public static class NewsSentimentScorer
{
    /// <summary>Half-width of the neutral band for mapping scores to positive/negative/neutral labels.</summary>
    public const decimal NeutralBand = 0.05m;

    private static readonly string[] Positives =
    [
        "beat", "beats", "beating", "growth", "surge", "surges", "bull", "bullish", "strong", "upgrade", "upgrades",
        "profit", "profits", "gains", "gain", "rally", "rallies", "soar", "soars", "boom", "excellent", "fantastic",
        "amazing", "huge", "rocket", "rockets", "momentum", "positive", "outperform", "buy", "recommend", "outlook",
        "raises", "raised", "raising", "guidance", "record", "breakthrough", "expands", "expansion", "partnership",
        "acquisition", "acquires", "deal", "win", "wins", "tops", "exceeds", "optimistic", "demand", "jump",
        "jumps", "climb", "climbs", "rise", "rises", "rising", "success", "breaks out", "upside", "green", "higher"
    ];

    private static readonly string[] Negatives =
    [
        "miss", "misses", "missed", "drop", "drops", "dropped", "bear", "bearish", "weak", "weakness", "downgrade",
        "downgrades", "lawsuit", "decline", "declines", "crash", "crashes", "loss", "losses", "falling", "falls",
        "terrible", "awful", "horrible", "tank", "tanks", "plunge", "plunges", "risk", "risks", "concern", "concerns",
        "selloff", "sell", "warning", "warnings", "bankruptcy", "layoff", "layoffs", "cuts", "cutting", "probe",
        "investigation", "fraud", "fine", "fines", "penalty", "down", "slump", "slumps", "recall", "halt",
        "underperform", "disappoint", "shortfall", "guidance cut", "cuts outlook"
    ];

    /// <summary>Maps Alpha Vantage NEWS_SENTIMENT <c>overall_sentiment_label</c> (e.g. Somewhat-Bullish) to [-1,1].</summary>
    public static decimal ScoreFromAlphaVantageLabel(string? label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            return 0m;
        }

        var x = label.Trim().ToUpperInvariant();
        if (x.Contains("SOMEWHAT-BULLISH", StringComparison.Ordinal) || x.Contains("SOMEWHAT BULLISH", StringComparison.Ordinal))
        {
            return 0.34m;
        }

        if (x.Contains("SOMEWHAT-BEARISH", StringComparison.Ordinal) || x.Contains("SOMEWHAT BEARISH", StringComparison.Ordinal))
        {
            return -0.34m;
        }

        if (x.Contains("BULLISH", StringComparison.Ordinal))
        {
            return 0.62m;
        }

        if (x.Contains("BEARISH", StringComparison.Ordinal))
        {
            return -0.62m;
        }

        return 0m;
    }

    public static decimal ScoreText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return 0m;
        }

        var lower = text.ToLowerInvariant();
        var pos = 0;
        foreach (var w in Positives)
        {
            if (lower.Contains(w, StringComparison.Ordinal))
            {
                pos++;
            }
        }

        var neg = 0;
        foreach (var w in Negatives)
        {
            if (lower.Contains(w, StringComparison.Ordinal))
            {
                neg++;
            }
        }

        if (pos == 0 && neg == 0)
        {
            return 0m;
        }

        var delta = pos - neg;
        // Scale so one keyword vs none often clears NeutralBand (~0.05).
        var raw = delta * 0.28m + Math.Sign(delta) * 0.05m * (pos + neg);
        return Math.Clamp(raw, -1m, 1m);
    }

    public static string LabelFromScore(decimal score) =>
        score > NeutralBand ? "Positive" : score < -NeutralBand ? "Negative" : "Neutral";

    /// <summary>Maps to API wire values used by the mobile client.</summary>
    public static string WireLabel(decimal score) =>
        score > NeutralBand ? "positive" : score < -NeutralBand ? "negative" : "neutral";
}
