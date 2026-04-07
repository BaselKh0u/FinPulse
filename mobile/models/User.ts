export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  joinedAt: string;
  isVerified: boolean;
  token?: string;
}

export interface UserPreferences {
  pushNotifications: boolean;
  alertSound: boolean;
  biometricLogin: boolean;
  darkMode: boolean;
  currency: string;
  refreshInterval: "15s" | "30s" | "1m" | "5m";
}
