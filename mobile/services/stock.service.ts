import { apiRequest, USE_MOCK } from "./api";
import { Stock } from "../models/Stock";

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
  return apiRequest<Stock[]>("/stocks");
}

export async function addStock(newStock: Stock): Promise<void> {
  if (USE_MOCK) {
    const exists = mockStocks.some((s) => s.symbol.toUpperCase() === newStock.symbol.toUpperCase());
    if (!exists) mockStocks = [newStock, ...mockStocks];
    return;
  }

  await apiRequest("/stocks", {
    method: "POST",
    body: JSON.stringify(newStock),
  });
}