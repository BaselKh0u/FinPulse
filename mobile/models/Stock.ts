export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface StockKeyStats {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string;
  avgVolume: string;
  marketCap: string;
  peRatio: number | null;
  week52High: number;
  week52Low: number;
  dividend: string;
  beta: number;
}

export interface StockNewsItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  sentiment: "positive" | "neutral" | "negative";
}

export interface StockSentiment {
  bullish: number;
  bearish: number;
  neutral: number;
  score: number;
  mentions: number;
  trending: boolean;
}

export interface StockDetails extends Stock {
  description: string;
  sector: string;
  industry: string;
  employees: string;
  headquarters: string;
  keyStats: StockKeyStats;
  sentiment: StockSentiment;
  news: StockNewsItem[];
  chartData: number[];
}
