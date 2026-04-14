import { apiRequest, USE_MOCK } from "./api";
import { Stock, StockDetails } from "../models/Stock";

let mockStocks: Stock[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 178.35,
    change: 4.28,
    changePercent: 2.45,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    price: 235.4,
    change: -2.86,
    changePercent: -1.2,
  },
  {
    symbol: "NVDA",
    name: "Nvidia Corp.",
    price: 460.15,
    change: 25.4,
    changePercent: 5.85,
  },
];

export async function getStocks(): Promise<Stock[]> {
  if (USE_MOCK) return Promise.resolve(mockStocks);
  return apiRequest<Stock[]>("/stock");
}

export async function addStock(newStock: Stock): Promise<void> {
  if (USE_MOCK) {
    const exists = mockStocks.some(
      (s) => s.symbol.toUpperCase() === newStock.symbol.toUpperCase()
    );
    if (!exists) mockStocks = [newStock, ...mockStocks];
    return;
  }

  await apiRequest("/stock", {
    method: "POST",
    body: JSON.stringify(newStock),
  });
}

export async function removeStock(symbol: string): Promise<void> {
  if (USE_MOCK) {
    mockStocks = mockStocks.filter(
      (s) => s.symbol.toUpperCase() !== symbol.toUpperCase()
    );
    return;
  }

  await apiRequest(`/stock/${symbol}`, { method: "DELETE" });
}

const allAvailableStocks: Stock[] = [
  { symbol: "AAPL", name: "Apple Inc.", price: 178.35, change: 4.28, changePercent: 2.45 },
  { symbol: "MSFT", name: "Microsoft Corp.", price: 330.1, change: 4.88, changePercent: 1.5 },
  { symbol: "TSLA", name: "Tesla Inc.", price: 235.4, change: -2.86, changePercent: -1.2 },
  { symbol: "GOOGL", name: "Alphabet Inc.", price: 135.2, change: 1.27, changePercent: 0.95 },
  { symbol: "AMZN", name: "Amazon.com Inc.", price: 145.8, change: -0.66, changePercent: -0.45 },
  { symbol: "META", name: "Meta Platforms", price: 298.5, change: 3.25, changePercent: 1.1 },
  { symbol: "NVDA", name: "Nvidia Corp.", price: 460.15, change: 25.4, changePercent: 5.85 },
  { symbol: "NFLX", name: "Netflix Inc.", price: 478.2, change: 6.12, changePercent: 1.3 },
  { symbol: "JPM", name: "JPMorgan Chase", price: 172.45, change: -1.2, changePercent: -0.69 },
  { symbol: "V", name: "Visa Inc.", price: 265.3, change: 2.1, changePercent: 0.8 },
];

export async function searchStocks(query: string): Promise<Stock[]> {
  if (USE_MOCK) {
    const q = query.trim().toLowerCase();
    if (!q) return allAvailableStocks;
    return allAvailableStocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
    );
  }

  return apiRequest<Stock[]>(`/stock/search?q=${encodeURIComponent(query)}`);
}

function generateChart(base: number, points = 30): number[] {
  const data: number[] = [base * 0.94];
  for (let i = 1; i < points; i++) {
    const prev = data[i - 1];
    data.push(prev + (Math.random() - 0.48) * (base * 0.015));
  }
  data.push(base);
  return data;
}

const mockDetailsMap: Record<string, Omit<StockDetails, keyof Stock>> = {
  AAPL: {
    description: "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide. The company offers iPhone, Mac, iPad, and wearables, home and accessories.",
    sector: "Technology", industry: "Consumer Electronics",
    employees: "164,000", headquarters: "Cupertino, CA",
    keyStats: { open: 176.80, high: 179.22, low: 175.90, close: 178.35, volume: "58.3M", avgVolume: "62.1M", marketCap: "2.78T", peRatio: 28.4, week52High: 199.62, week52Low: 131.66, dividend: "0.96 (0.54%)", beta: 1.29 },
    sentiment: { bullish: 68, bearish: 12, neutral: 20, score: 0.72, mentions: 12450, trending: true },
    news: [
      { id: "n1", title: "Apple's AI Strategy Could Drive Record iPhone Sales in 2026", source: "Bloomberg", publishedAt: "2026-03-13T08:30:00Z", url: "#", sentiment: "positive" },
      { id: "n2", title: "Apple Vision Pro 2 Rumors: What We Know So Far", source: "The Verge", publishedAt: "2026-03-12T14:00:00Z", url: "#", sentiment: "neutral" },
      { id: "n3", title: "Warren Buffett Increases Apple Stake in Latest Filing", source: "CNBC", publishedAt: "2026-03-11T10:15:00Z", url: "#", sentiment: "positive" },
    ],
    chartData: generateChart(178.35),
  },
  TSLA: {
    description: "Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems. The company operates through Automotive and Energy Generation and Storage segments.",
    sector: "Consumer Cyclical", industry: "Auto Manufacturers",
    employees: "140,473", headquarters: "Austin, TX",
    keyStats: { open: 238.00, high: 240.10, low: 233.55, close: 235.40, volume: "102.5M", avgVolume: "118.7M", marketCap: "748.2B", peRatio: 62.7, week52High: 299.29, week52Low: 152.37, dividend: "N/A", beta: 2.07 },
    sentiment: { bullish: 52, bearish: 30, neutral: 18, score: 0.34, mentions: 24800, trending: true },
    news: [
      { id: "n4", title: "Tesla Cybertruck Deliveries Ramp Up Across Europe", source: "Reuters", publishedAt: "2026-03-13T06:00:00Z", url: "#", sentiment: "positive" },
      { id: "n5", title: "Tesla Faces Increased Competition in China EV Market", source: "WSJ", publishedAt: "2026-03-12T11:30:00Z", url: "#", sentiment: "negative" },
      { id: "n6", title: "Elon Musk Hints at New Affordable Tesla Model", source: "TechCrunch", publishedAt: "2026-03-10T15:45:00Z", url: "#", sentiment: "neutral" },
    ],
    chartData: generateChart(235.4),
  },
  NVDA: {
    description: "NVIDIA Corporation provides graphics and compute and networking solutions worldwide. Its GPU platform is used in gaming, professional visualization, datacenter, and automotive markets.",
    sector: "Technology", industry: "Semiconductors",
    employees: "29,600", headquarters: "Santa Clara, CA",
    keyStats: { open: 440.00, high: 465.50, low: 438.20, close: 460.15, volume: "45.8M", avgVolume: "52.3M", marketCap: "1.14T", peRatio: 64.2, week52High: 502.66, week52Low: 222.97, dividend: "0.16 (0.03%)", beta: 1.68 },
    sentiment: { bullish: 82, bearish: 5, neutral: 13, score: 0.91, mentions: 31200, trending: true },
    news: [
      { id: "n7", title: "Nvidia's New Blackwell GPUs See Unprecedented Demand", source: "Bloomberg", publishedAt: "2026-03-13T09:00:00Z", url: "#", sentiment: "positive" },
      { id: "n8", title: "AI Spending Boom Benefits Nvidia More Than Rivals", source: "Financial Times", publishedAt: "2026-03-12T07:30:00Z", url: "#", sentiment: "positive" },
      { id: "n9", title: "Nvidia Partners With Healthcare Giants for AI Diagnostics", source: "CNBC", publishedAt: "2026-03-11T12:00:00Z", url: "#", sentiment: "positive" },
    ],
    chartData: generateChart(460.15),
  },
};

const defaultDetails: Omit<StockDetails, keyof Stock> = {
  description: "Detailed company information will be available when connected to the backend.",
  sector: "Technology", industry: "N/A",
  employees: "N/A", headquarters: "N/A",
  stabilityScore: 50,
  keyStats: { open: 0, high: 0, low: 0, close: 0, volume: "N/A", avgVolume: "N/A", marketCap: "N/A", peRatio: null, week52High: 0, week52Low: 0, dividend: "N/A", beta: 1.0 },
  sentiment: { bullish: 33, bearish: 33, neutral: 34, score: 0, mentions: 0, trending: false },
  news: [],
  chartData: [],
};

export async function getStockDetails(symbol: string): Promise<StockDetails> {
  if (USE_MOCK) {
    const base = allAvailableStocks.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase())
      ?? { symbol: symbol.toUpperCase(), name: symbol.toUpperCase(), price: 100, change: 0, changePercent: 0 };
    const extra = mockDetailsMap[symbol.toUpperCase()] ?? {
      ...defaultDetails,
      chartData: generateChart(base.price),
    };
    return { ...base, ...extra };
  }

  return apiRequest<StockDetails>(`/stock/${symbol}/details`);
}

export async function getStockHistory(symbol: string, range: string): Promise<number[]> {
  if (USE_MOCK) {
    const base = allAvailableStocks.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase())?.price ?? 100;
    return generateChart(base, 40);
  }

  return apiRequest<number[]>(`/stock/${symbol}/history?range=${encodeURIComponent(range)}`);
}