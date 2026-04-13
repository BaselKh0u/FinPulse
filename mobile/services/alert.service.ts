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
  return apiRequest<Alert[]>("/alerts");
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

  return apiRequest<Alert>("/alerts", {
    method: "POST",
    body: JSON.stringify(alert),
  });
}

export async function toggleAlert(alertId: string, isActive: boolean): Promise<void> {
  if (USE_MOCK) {
    const target = mockAlerts.find((a) => a.id === alertId);
    if (target) target.isActive = isActive;
    return;
  }

  await apiRequest<void>(`/alerts/${alertId}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function deleteAlert(alertId: string): Promise<void> {
  if (USE_MOCK) {
    mockAlerts = mockAlerts.filter((a) => a.id !== alertId);
    return;
  }

  await apiRequest<void>(`/alerts/${alertId}`, { method: "DELETE" });
}
