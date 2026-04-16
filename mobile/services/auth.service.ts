import { apiRequest, USE_MOCK } from "./api";
import {
  clearBiometricReloginSession,
  saveSession,
  stashSessionForBiometricRelogin,
} from "@/stores/auth.storage";
import { isBiometricEnabled } from "@/stores/biometric.store";

export interface LoginRequest {
  email: string;
  password: string;
  stayLoggedIn?: boolean;
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

async function persistSessionAfterPasswordLogin(res: AuthResponse): Promise<void> {
  await saveSession(res.token, String(res.userId));
  if (await isBiometricEnabled()) {
    await stashSessionForBiometricRelogin(res.token, String(res.userId));
  } else {
    await clearBiometricReloginSession();
  }
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email) || data.password.length < 6) {
      throw new Error("Invalid email or password.");
    }
    const res = { token: "mock-token-123", userId: "mock-user-1" };
    await persistSessionAfterPasswordLogin(res);
    return res;
  }

  const dto = await apiRequest<{ token: string; userId: number | string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: data.email,
      password: data.password,
    }),
  });
  const res: AuthResponse = { token: dto.token, userId: String(dto.userId) };
  await persistSessionAfterPasswordLogin(res);
  return res;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email)) throw new Error("Enter a valid email address.");
    if (data.password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (data.firstName.trim().length < 2) throw new Error("First name must be at least 2 characters.");
    if (data.lastName.trim().length < 2) throw new Error("Last name must be at least 2 characters.");
    return { token: "mock-token-456", userId: "mock-user-2" };
  }

  const dto = await apiRequest<{ token: string; userId: number | string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: `${data.firstName} ${data.lastName}`.trim(),
      email: data.email,
      password: data.password,
    }),
  });

  const response: AuthResponse = { token: dto.token, userId: String(dto.userId) };
  await persistSessionAfterPasswordLogin(response);
  return response;
}

export async function forgotPassword(email: string): Promise<void> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(email)) throw new Error("Invalid email");
    return;
  }

  await apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function logoutLocalSession() {
  void clearSession();
}
