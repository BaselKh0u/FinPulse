export type AlertType = "price_above" | "price_below" | "volatility" | "earnings";

export interface Alert {
  id: string;
  symbol: string;
  type: AlertType;
  targetPrice?: number;
  threshold?: number;
  description: string;
  isActive: boolean;
  createdAt: string;
}

export const ALERT_TYPE_CONFIG: Record<AlertType, { label: string; color: string; bg: string }> = {
  price_above: { label: "PRICE TARGET", color: "#2C66FF", bg: "rgba(44,102,255,0.1)" },
  price_below: { label: "DIP ALERT", color: "#FF4D4F", bg: "rgba(255,77,79,0.1)" },
  volatility: { label: "VOLATILITY", color: "#F5A623", bg: "rgba(245,166,35,0.1)" },
  earnings: { label: "EARNINGS", color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
};
