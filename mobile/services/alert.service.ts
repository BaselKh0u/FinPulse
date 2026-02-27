// mobile/services/alert.service.ts

import { apiRequest, USE_MOCK } from "./api";
import { Alert } from "../models/Alert";

const mockAlerts: Alert[] = [
  {
    id: "a1",
    symbol: "AAPL",
    type: "price_below",
    targetPrice: 180,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "a2",
    symbol: "TSLA",
    type: "price_above",
    targetPrice: 260,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export async function getAlerts(): Promise<Alert[]> {
  if (USE_MOCK) return Promise.resolve(mockAlerts);
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
    mockAlerts.push(newAlert);
    return Promise.resolve(newAlert);
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
    return Promise.resolve();
  }

  await apiRequest<void>(`/alerts/${alertId}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}