import { apiRequest, USE_MOCK } from "./api";
import { Alert } from "../models/Alert";
import { formatPrice } from "../stores/currency.store";
import { getStoredUserId } from "@/stores/auth.storage";

function normalizeConditionType(v: unknown): string {
  if (v === 1 || v === "1") return "PriceTarget";
  if (v === 2 || v === "2") return "PercentVolatility";
  if (v === 3 || v === "3") return "ReportReleased";
  if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function normalizeDirection(v: unknown): string {
  if (v === 1 || v === "1") return "Above";
  if (v === 2 || v === "2") return "Below";
  if (typeof v === "string" && v.trim()) return v.trim();
  return "Above";
}

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

  const userId = await getStoredUserId();
  if (!userId) {
    return [];
  }

  const rows = await apiRequest<any[]>(`/alerts/user/${userId}`);
  return rows.map((r) => {
    const conditionType = normalizeConditionType(r.conditionType);
    const direction = normalizeDirection(r.direction);
    return {
    id: String(r.alertId),
    stockId: r.stockId,
    symbol: String(r.symbol ?? r.stockId),
    type:
      conditionType === "PriceTarget"
        ? direction === "Below"
          ? "price_below"
          : "price_above"
        : conditionType === "PercentVolatility"
          ? "volatility"
          : "earnings",
    targetPrice: r.targetPrice ?? undefined,
    threshold: r.percentageThreshold ?? undefined,
    description: r.message || "Alert",
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt,
  };
  });
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

  const uid = Number((await getStoredUserId()) ?? 0);
  if (uid <= 0) {
    throw new Error("You must be signed in to create alerts.");
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
      userId: uid,
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

  if (isActive) {
    await apiRequest<void>(`/alerts/${alertId}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: true }),
    });
  } else {
    await apiRequest<void>(`/alerts/${alertId}/deactivate`, { method: "POST" });
  }
}

export async function deleteAlert(alertId: string): Promise<void> {
  if (USE_MOCK) {
    mockAlerts = mockAlerts.filter((a) => a.id !== alertId);
    return;
  }

  await apiRequest<void>(`/alerts/${alertId}`, { method: "DELETE" });
}
