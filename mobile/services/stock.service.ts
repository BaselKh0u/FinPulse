// mobile/services/stock.service.ts

import { apiRequest, USE_MOCK } from "./api";
import { Stock } from "../models/Stock";

const mockStocks: Stock[] = [
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    price: 192.4,
    change: 1.2,
    changePercent: 0.63,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    price: 244.1,
    change: -0.8,
    changePercent: -0.32,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    price: 381.6,
    change: 0.5,
    changePercent: 0.13,
  },
];

export async function getStocks(): Promise<Stock[]> {
  if (USE_MOCK) {
    return Promise.resolve(mockStocks);
  }

  return apiRequest<Stock[]>("/stocks");
}
