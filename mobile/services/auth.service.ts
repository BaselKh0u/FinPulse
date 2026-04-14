import { apiRequest, USE_MOCK } from "./api";
import { clearSession, setSession } from "./session";

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
  userId: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(data: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email) || data.password.length < 6) {
      throw new Error("Invalid credentials");
    }
    const session = { token: "mock-token-123", userId: 1 };
    await setSession(session.userId, session.token, Boolean(data.stayLoggedIn));
    return session;
  }

  const response = await apiRequest<{ userId: number; message: string; fullName?: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: data.email,
      passwordHash: data.password,
    }),
  });

  const session = { token: "server-session", userId: response.userId };
  await setSession(session.userId, session.token, Boolean(data.stayLoggedIn));
  return session;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(data.email)) throw new Error("Invalid email");
    if (data.password.length < 6) throw new Error("Password too short");
    if (data.firstName.trim().length < 2) throw new Error("First name too short");
    if (data.lastName.trim().length < 2) throw new Error("Last name too short");
    const session = { token: "mock-token-456", userId: 2 };
    await setSession(session.userId, session.token, false);
    return session;
  }

  const response = await apiRequest<{ message: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      fullName: `${data.firstName} ${data.lastName}`.trim(),
      email: data.email,
      passwordHash: data.password,
    }),
  });

  // Register endpoint currently returns message only, so user logs in afterward.
  return { token: "server-session", userId: 0 };
}

export async function forgotPassword(email: string): Promise<void> {
  if (USE_MOCK) {
    if (!EMAIL_REGEX.test(email)) throw new Error("Invalid email");
    return;
  }

  // Backend forgot-password endpoint does not exist yet.
  return;
}

export function logoutLocalSession() {
  void clearSession();
}
