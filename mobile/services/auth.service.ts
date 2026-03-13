// mobile/services/auth.service.ts

import { apiRequest, USE_MOCK } from "./api";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(
  data: LoginRequest
): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email) || data.password.length < 6) {
      throw new Error("Invalid credentials");
    }

    return Promise.resolve({
      token: "mock-token-123",
      userId: "mock-user-1",
    });
  }

  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
