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
  const dto = await apiRequest<{
    userId: number;
    fullName: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
    isVerified: boolean;
    createdAt: string;
  }>("/user/profile");
  const [firstName, ...rest] = dto.fullName.trim().split(" ");
  const avatarUrl = typeof dto.avatarUrl === "string" && dto.avatarUrl.trim().length > 0
    ? dto.avatarUrl.trim()
    : undefined;
  return {
    id: String(dto.userId),
    firstName: firstName || "",
    lastName: rest.join(" ") || "",
    email: dto.email,
    phone: dto.phone,
    avatarUrl,
    isVerified: dto.isVerified,
    joinedAt: dto.createdAt,
  };
}

export async function getPreferences(): Promise<UserPreferences> {
  if (USE_MOCK) return { ...mockPrefs };
  const dto = await apiRequest<{
    pushNotifications: boolean;
    alertSound: boolean;
    biometricLogin: boolean;
    darkMode: boolean;
    currency: string;
    refreshInterval: number | string;
  }>("/user/preferences");
  const refreshInterval =
    typeof dto.refreshInterval === "number"
      ? dto.refreshInterval <= 15
        ? "15s"
        : dto.refreshInterval <= 30
          ? "30s"
          : dto.refreshInterval <= 60
            ? "1m"
            : "5m"
      : (dto.refreshInterval as UserPreferences["refreshInterval"]);
  return {
    pushNotifications: dto.pushNotifications,
    alertSound: dto.alertSound,
    biometricLogin: dto.biometricLogin,
    darkMode: dto.darkMode,
    currency: dto.currency,
    refreshInterval,
  };
}

export async function updatePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  if (USE_MOCK) {
    mockPrefs = { ...mockPrefs, ...patch };
    return { ...mockPrefs };
  }
  const backendPatch: Record<string, unknown> = { ...patch };
  if (typeof patch.refreshInterval === "string") {
    backendPatch.refreshInterval =
      patch.refreshInterval === "15s"
        ? 15
        : patch.refreshInterval === "30s"
          ? 30
          : patch.refreshInterval === "1m"
            ? 60
            : 300;
  }
  await apiRequest("/user/preferences", {
    method: "PATCH",
    body: JSON.stringify(backendPatch),
  });
  return getPreferences();
}

export async function updateProfile(patch: Partial<Pick<User, "firstName" | "lastName" | "phone">>): Promise<User> {
  if (USE_MOCK) {
    Object.assign(mockUser, patch);
    return { ...mockUser };
  }
  const fullName = `${patch.firstName ?? ""} ${patch.lastName ?? ""}`.trim();
  await apiRequest("/user/profile", {
    method: "PATCH",
    body: JSON.stringify({
      fullName: fullName || undefined,
      phone: patch.phone,
    }),
  });
  return getUserProfile();
}

export async function updateAvatar(avatarUrl: string): Promise<string> {
  if (USE_MOCK) {
    mockUser.avatarUrl = avatarUrl;
    return avatarUrl;
  }
  const res = await apiRequest<{ avatarUrl: string }>("/user/avatar", {
    method: "POST",
    body: JSON.stringify({ avatarUrl }),
  });
  return res.avatarUrl;
}

export async function registerDeviceToken(expoPushToken: string, platform: string): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest("/user/device-token", {
    method: "POST",
    body: JSON.stringify({ expoPushToken, platform }),
  });
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export async function resendVerificationEmail(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest("/auth/resend-verification", { method: "POST" });
}

export async function deleteAccount(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest("/auth/delete-account", { method: "DELETE" });
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
