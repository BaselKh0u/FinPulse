import { apiRequest, USE_MOCK } from "./api";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(data: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email) || data.password.length < 6) {
      throw new Error("Invalid credentials");
    }
    return { token: "mock-token-123", userId: "mock-user-1" };
  }

  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email)) throw new Error("Invalid email");
    if (data.password.length < 6) throw new Error("Password too short");
    if (data.firstName.trim().length < 2) throw new Error("First name too short");
    if (data.lastName.trim().length < 2) throw new Error("Last name too short");
    return { token: "mock-token-456", userId: "mock-user-2" };
  }

  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function forgotPassword(email: string): Promise<void> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(email)) throw new Error("Invalid email");
    return;
  }

  await apiRequest("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
