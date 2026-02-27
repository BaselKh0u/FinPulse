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

const mockUser = {
  id: "1",
  email: "demo@finpulse.com",
  password: "123456",
};

export async function login(
  data: LoginRequest
): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (
      data.email === mockUser.email &&
      data.password === mockUser.password
    ) {
      return Promise.resolve({
        token: "mock-token-123",
        userId: mockUser.id,
      });
    }

    throw new Error("Invalid credentials");
  }

  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
