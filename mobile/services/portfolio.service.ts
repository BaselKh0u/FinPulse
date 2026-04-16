import { apiRequest, USE_MOCK } from "./api";

export interface PortfolioSummary {
  totalBalance: number;
  todayChange: number;
  todayChangePercent: number;
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  if (USE_MOCK) {
    return {
      totalBalance: 24592.4,
      todayChange: 438.21,
      todayChangePercent: 1.81,
    };
  }
  return apiRequest<PortfolioSummary>("/portfolio/summary");
}
