import { getSessionToken, getSessionUserId } from "./session";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "http://localhost:5179/api";

export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "true";

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getSessionToken();
  const userId = getSessionUserId();

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { "X-User-Id": String(userId) } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
