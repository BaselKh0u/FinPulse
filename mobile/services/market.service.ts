import { apiRequest, USE_MOCK } from "./api";

export interface MarketMood {
  score: number;
  label: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
  change: number;
  updatedAt: string;
}

export interface TrendingStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  mentions: number;
  sentimentScore: number;
  sentimentLabel: "bullish" | "bearish" | "neutral";
}

export interface SourceSentiment {
  source: string;
  icon: string;
  positive: number;
  neutral: number;
  negative: number;
  totalPosts: number;
}

export interface SentimentMover {
  symbol: string;
  name: string;
  previousScore: number;
  currentScore: number;
  change: number;
  direction: "up" | "down";
}

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentScore: number;
  relatedSymbols: string[];
  url: string;
}

export interface MarketData {
  mood: MarketMood;
  trending: TrendingStock[];
  sources: SourceSentiment[];
  movers: SentimentMover[];
  news: MarketNewsItem[];
  retrievedAt?: string;
}

const mockMarketData: MarketData = {
  mood: {
    score: 0.68,
    label: "Greed",
    change: 0.05,
    updatedAt: new Date().toISOString(),
  },
  trending: [
    { symbol: "NVDA", name: "Nvidia Corp.", price: 460.15, changePercent: 5.85, mentions: 31200, sentimentScore: 0.91, sentimentLabel: "bullish" },
    { symbol: "TSLA", name: "Tesla Inc.", price: 235.40, changePercent: -1.20, mentions: 24800, sentimentScore: 0.34, sentimentLabel: "bearish" },
    { symbol: "AAPL", name: "Apple Inc.", price: 178.35, changePercent: 2.45, mentions: 12450, sentimentScore: 0.72, sentimentLabel: "bullish" },
    { symbol: "META", name: "Meta Platforms", price: 298.50, changePercent: 1.10, mentions: 8900, sentimentScore: 0.61, sentimentLabel: "bullish" },
    { symbol: "AMZN", name: "Amazon.com", price: 145.80, changePercent: -0.45, mentions: 7200, sentimentScore: 0.48, sentimentLabel: "bearish" },
    { symbol: "GOOGL", name: "Alphabet Inc.", price: 135.20, changePercent: 0.95, mentions: 6800, sentimentScore: 0.55, sentimentLabel: "bullish" },
  ],
  sources: [
    { source: "Twitter / X", icon: "logo-twitter", positive: 45, neutral: 30, negative: 25, totalPosts: 148500 },
    { source: "Reddit", icon: "logo-reddit", positive: 52, neutral: 28, negative: 20, totalPosts: 42300 },
    { source: "Financial News", icon: "newspaper-outline", positive: 38, neutral: 42, negative: 20, totalPosts: 8750 },
  ],
  movers: [
    { symbol: "NVDA", name: "Nvidia Corp.", previousScore: 0.74, currentScore: 0.91, change: 0.17, direction: "up" },
    { symbol: "MSFT", name: "Microsoft Corp.", previousScore: 0.58, currentScore: 0.71, change: 0.13, direction: "up" },
    { symbol: "META", name: "Meta Platforms", previousScore: 0.49, currentScore: 0.61, change: 0.12, direction: "up" },
    { symbol: "TSLA", name: "Tesla Inc.", previousScore: 0.52, currentScore: 0.34, change: -0.18, direction: "down" },
    { symbol: "JPM", name: "JPMorgan Chase", previousScore: 0.60, currentScore: 0.45, change: -0.15, direction: "down" },
    { symbol: "AMZN", name: "Amazon.com", previousScore: 0.58, currentScore: 0.48, change: -0.10, direction: "down" },
  ],
  news: [
    {
      id: "m1", title: "AI Chip Demand Surges as Tech Giants Expand Data Centers",
      summary: "Nvidia, AMD, and Intel all see increased orders as hyperscalers race to build AI infrastructure, pushing semiconductor sentiment to yearly highs.",
      source: "Bloomberg", publishedAt: "2026-03-13T10:30:00Z", sentiment: "positive", sentimentScore: 0.89,
      relatedSymbols: ["NVDA", "AMD", "INTC"], url: "#",
    },
    {
      id: "m2", title: "Federal Reserve Signals Potential Rate Cut in Q2 2026",
      summary: "Fed Chair indicates easing inflation data may support rate reductions, boosting market-wide sentiment across growth and tech sectors.",
      source: "Reuters", publishedAt: "2026-03-13T09:15:00Z", sentiment: "positive", sentimentScore: 0.76,
      relatedSymbols: ["SPY", "QQQ"], url: "#",
    },
    {
      id: "m3", title: "Tesla Faces Regulatory Scrutiny Over Autopilot Safety Claims",
      summary: "NHTSA opens new investigation into Tesla's Full Self-Driving software following multiple incident reports, raising concerns among investors.",
      source: "Wall Street Journal", publishedAt: "2026-03-13T08:00:00Z", sentiment: "negative", sentimentScore: -0.62,
      relatedSymbols: ["TSLA"], url: "#",
    },
    {
      id: "m4", title: "Apple's Services Revenue Hits All-Time High in Q1",
      summary: "App Store, iCloud, and Apple TV+ subscription growth drives record services segment, offsetting slower iPhone sales in key markets.",
      source: "CNBC", publishedAt: "2026-03-12T16:45:00Z", sentiment: "positive", sentimentScore: 0.71,
      relatedSymbols: ["AAPL"], url: "#",
    },
    {
      id: "m5", title: "Crypto Market Volatility Spills Into Tech Stocks",
      summary: "Bitcoin's sharp correction triggers risk-off sentiment that impacts high-beta tech names, with social media discussions turning cautious.",
      source: "Financial Times", publishedAt: "2026-03-12T14:20:00Z", sentiment: "negative", sentimentScore: -0.44,
      relatedSymbols: ["COIN", "MSTR"], url: "#",
    },
    {
      id: "m6", title: "Reddit IPO Anniversary: Social Sentiment Platform Gains Institutional Interest",
      summary: "One year after going public, Reddit's influence on retail investor sentiment continues to grow, with r/wallstreetbets reaching 15M members.",
      source: "The Verge", publishedAt: "2026-03-12T11:00:00Z", sentiment: "neutral", sentimentScore: 0.12,
      relatedSymbols: ["RDDT"], url: "#",
    },
    {
      id: "m7", title: "Amazon Web Services Launches New AI-Powered Analytics Tools",
      summary: "AWS introduces machine learning tools for financial data analysis, aiming to compete with specialized FinTech analytics platforms.",
      source: "TechCrunch", publishedAt: "2026-03-11T13:30:00Z", sentiment: "positive", sentimentScore: 0.58,
      relatedSymbols: ["AMZN"], url: "#",
    },
  ],
};

export async function getMarketData(): Promise<MarketData> {
  if (USE_MOCK) return JSON.parse(JSON.stringify(mockMarketData));
  return apiRequest<MarketData>("/market/overview");
}

export async function getMarketNews(page = 1): Promise<MarketNewsItem[]> {
  if (USE_MOCK) return JSON.parse(JSON.stringify(mockMarketData.news));
  return apiRequest<MarketNewsItem[]>(`/market/news?page=${page}`);
}
