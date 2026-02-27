// mobile/services/api.ts

const BASE_URL = "http://localhost:3000"; // בהמשך תשנה לשרת אמיתי

export const USE_MOCK = true; // כרגע עובדים עם Mock

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error("API request failed");
  }

  return response.json();
}
