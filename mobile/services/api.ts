import Constants from "expo-constants";
import { clearSession, getAccessToken } from "@/stores/auth.storage";

function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) return envUrl;
  // In Expo Go (LAN mode), derive the server IP from the Expo dev server host
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    return `http://${ip}:5179/api`;
  }
  return "http://localhost:5179/api";
}

export const BASE_URL = resolveBaseUrl();
const REQUEST_TIMEOUT_MS = 12000;

export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "true";
let clearingExpiredSession = false;

async function parseErrorMessage(response: Response, endpoint?: string): Promise<string> {
  const fallback = `Something went wrong (${response.status})`;
  try {
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.message === "string" && data.message.trim()) return data.message;
    if (typeof data.error === "string" && data.error.trim()) return data.error;
    const errors = data.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown>;
      if (typeof first?.message === "string") return first.message;
    }
  } catch {
    // not JSON
  }
  if (response.status === 401) {
    const route = endpoint?.split("?")[0] ?? "";
    if (route === "/auth/login") {
      return "Invalid email or password.";
    }
    return "Session expired. Please sign in again.";
  }
  if (response.status === 403) return "You don't have permission to do that.";
  if (response.status === 404) return "Not found.";
  if (response.status >= 500) return "Server error. Please try again later.";
  return fallback;
}

const AUTH_ROUTES_WITHOUT_TOKEN = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
]);

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const skipAuth = AUTH_ROUTES_WITHOUT_TOKEN.has(endpoint.split("?")[0]);
  const token = skipAuth ? null : await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "name" in error && (error as { name?: string }).name === "AbortError") {
      throw new Error("Request timed out. Check if the server is running and reachable.");
    }
    throw new Error("Cannot reach server. Make sure phone and API are on the same network.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 && endpoint.split("?")[0] !== "/auth/login") {
      if (!clearingExpiredSession) {
        clearingExpiredSession = true;
        void clearSession().finally(() => {
          clearingExpiredSession = false;
        });
      }
    }
    throw new Error(await parseErrorMessage(response, endpoint));
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
