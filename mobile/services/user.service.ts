import { apiRequest, USE_MOCK } from "./api";
import {
  clearSession,
  getAccessToken,
  getStoredUserId,
  stashSessionForBiometricRelogin,
} from "@/stores/auth.storage";
import { isBiometricEnabled } from "@/stores/biometric.store";
import { User, UserPreferences } from "@/models/User";

const mockUser: User = {
  id: "mock-user-1",
  firstName: "Basel",
  lastName: "Kh",
  email: "basel@example.com",
  phone: "+972 54-XXX-XXXX",
  joinedAt: "2025-09-01T00:00:00Z",
  isVerified: true,
  token: "mock-token-123",
};

let mockPrefs: UserPreferences = {
  pushNotifications: true,
  alertSound: true,
  biometricLogin: false,
  darkMode: false,
  currency: "USD",
  refreshInterval: "30s",
};

export async function getUserProfile(): Promise<User> {
  if (USE_MOCK) return { ...mockUser };
  return apiRequest<User>("/api/User/profile");
}

export async function getPreferences(): Promise<UserPreferences> {
  if (USE_MOCK) return { ...mockPrefs };
  return apiRequest<UserPreferences>("/api/User/preferences");
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  if (USE_MOCK) {
    mockPrefs = { ...mockPrefs, ...patch };
    return { ...mockPrefs };
  }
  return apiRequest<UserPreferences>("/api/User/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function updateProfile(patch: Partial<Pick<User, "firstName" | "lastName" | "phone">>): Promise<User> {
  if (USE_MOCK) {
    Object.assign(mockUser, patch);
    return { ...mockUser };
  }
  return apiRequest<User>("/api/User/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function logout(): Promise<void> {
  try {
    if (await isBiometricEnabled()) {
      const t = await getAccessToken();
      const u = await getStoredUserId();
      if (t && u) await stashSessionForBiometricRelogin(t, u);
    }
  } catch {
    // non-fatal — still log out
  }
  try {
    if (!USE_MOCK) {
      await apiRequest("/auth/logout", { method: "POST" });
    }
  } finally {
    await clearSession();
  }
}
