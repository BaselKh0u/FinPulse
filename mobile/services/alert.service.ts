import { apiRequest, USE_MOCK } from "./api";
import { Alert } from "../models/Alert";
import { formatPrice } from "../stores/currency.store";

let mockAlerts: Alert[] = [
  {
    id: "a1",
    symbol: "NVDA",
    type: "price_above",
    targetPrice: 500,
    description: `Above ${formatPrice(500)}`,
    isActive: true,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: "a2",
    symbol: "TSLA",
    type: "volatility",
    threshold: 5,
    description: "Change > 5%",
    isActive: true,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "a3",
    symbol: "AAPL",
    type: "earnings",
    description: "Report Released",
    isActive: false,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "a4",
    symbol: "GOOGL",
    type: "price_below",
    targetPrice: 130,
    description: `Below ${formatPrice(130)}`,
    isActive: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) return [...mockAlerts];

  const userId = getSessionUserId();
  if (!userId) {
    return [];
  }

  const rows = await apiRequest<any[]>(`/alerts/user/${userId}`);
  return rows.map((r) => ({
    id: String(r.alertId),
    stockId: r.stockId,
    symbol: String(r.symbol ?? r.stockId),
    type:
      r.conditionType === "PriceTarget"
        ? r.direction === "Below"
          ? "price_below"
          : "price_above"
        : r.conditionType === "PercentVolatility"
          ? "volatility"
          : "earnings",
    targetPrice: r.targetPrice ?? undefined,
    threshold: r.percentageThreshold ?? undefined,
    description: r.message || "Alert",
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt,
  }));
}

export async function createAlert(
  alert: Omit<Alert, "id" | "createdAt">
): Promise<Alert> {
  if (USE_MOCK) {
    const newAlert: Alert = {
      ...alert,
      id: `mock-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    mockAlerts.unshift(newAlert);
    return newAlert;
  }

  const conditionType =
    alert.type === "volatility"
      ? "PercentVolatility"
      : alert.type === "earnings"
        ? "ReportReleased"
        : "PriceTarget";
  const direction = alert.type === "price_below" ? "Below" : "Above";

  const response = await apiRequest<{ alertId: number }>("/alerts", {
    method: "POST",
    body: JSON.stringify({
      userId: getSessionUserId() ?? 0,
      stockId: alert.stockId ?? 0,
      symbol: alert.symbol,
      conditionType,
      direction,
      targetPrice: alert.targetPrice,
      percentageThreshold: alert.threshold,
      volatilityWindowMinutes: alert.type === "volatility" ? 60 : null,
      message: alert.description,
      cooldownMinutes: 60,
    }),
  });

  return {
    ...alert,
    id: String(response.alertId),
    createdAt: new Date().toISOString(),
  };
}

export async function toggleAlert(alertId: string, isActive: boolean): Promise<void> {
  if (USE_MOCK) {
    const target = mockAlerts.find((a) => a.id === alertId);
    if (target) target.isActive = isActive;
    return;
  }

  if (!isActive) {
    await apiRequest<void>(`/alerts/${alertId}/deactivate`, { method: "POST" });
  }
}

export async function deleteAlert(alertId: string): Promise<void> {
  if (USE_MOCK) {
    mockAlerts = mockAlerts.filter((a) => a.id !== alertId);
    return;
  }

  await apiRequest<void>(`/alerts/${alertId}/deactivate`, { method: "POST" });
}
