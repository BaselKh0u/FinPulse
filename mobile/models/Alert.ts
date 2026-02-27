export interface Alert {
  id: string;
  symbol: string;
  type: "price_above" | "price_below";
  targetPrice: number;
  isActive: boolean;
  createdAt: string; // ISO date string
}
