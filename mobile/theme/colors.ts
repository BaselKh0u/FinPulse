export const LightColors = {
  primary: "#0B1220",
  primaryLight: "#1A2540",
  accent: "#2C66FF",
  background: "#F6F7FB",
  card: "#FFFFFF",
  white: "#FFFFFF",

  textPrimary: "#0B1220",
  textSecondary: "#6B758A",
  textTertiary: "#A7B0C0",
  textMuted: "#9AA3B2",
  placeholder: "#A7B0C0",

  success: "#18C08B",
  successLight: "rgba(24, 192, 139, 0.18)",
  danger: "#FF4D4F",
  dangerLight: "rgba(255, 77, 79, 0.12)",
  warning: "#F5A623",
  warningLight: "rgba(245, 166, 35, 0.12)",

  border: "#E3E7EF",
  borderLight: "#C9D1E1",
  divider: "#EFF2F7",

  iconBackground: "#EFF2F7",
  iconBackgroundAlt: "#E9EDF6",

  tabActive: "#2C66FF",
  tabInactive: "#9AA3B2",

  shadow: "#000000",

  bullish: "#18C08B",
  bearish: "#FF4D4F",
  neutral: "#9AA3B2",

  sentimentPositive: "#18C08B",
  sentimentNeutral: "#9AA3B2",
  sentimentNegative: "#FF4D4F",

  chartLine: "#18C08B",
  chartFill: "rgba(24, 192, 139, 0.08)",

  balanceCard: "#0B1220",
  logoBox: "#0B1220",
} as const;

export const DarkColors: typeof LightColors = {
  primary: "#2C66FF",
  primaryLight: "#2A3A5C",
  accent: "#4D8AFF",
  background: "#0B1220",
  card: "#141E30",
  white: "#FFFFFF",

  textPrimary: "#FFFFFF",
  textSecondary: "#A0ADBE",
  textTertiary: "#6A7A90",
  textMuted: "#4A5568",
  placeholder: "#4A5568",

  success: "#18C08B",
  successLight: "rgba(24, 192, 139, 0.22)",
  danger: "#FF6B6B",
  dangerLight: "rgba(255, 107, 107, 0.15)",
  warning: "#F5A623",
  warningLight: "rgba(245, 166, 35, 0.15)",

  border: "#1E2D44",
  borderLight: "#2A3A5C",
  divider: "#161D2E",

  iconBackground: "#1C2A42",
  iconBackgroundAlt: "#1E2D44",

  tabActive: "#4D8AFF",
  tabInactive: "#6A7A90",

  shadow: "#000000",

  bullish: "#18C08B",
  bearish: "#FF6B6B",
  neutral: "#6A7A90",

  sentimentPositive: "#18C08B",
  sentimentNeutral: "#6A7A90",
  sentimentNegative: "#FF6B6B",

  chartLine: "#18C08B",
  chartFill: "rgba(24, 192, 139, 0.12)",

  balanceCard: "#132D5E",
  logoBox: "#132D5E",
};

// Default export for backward compatibility — will be overridden by ThemeProvider
export let Colors = { ...LightColors };

export function applyTheme(dark: boolean) {
  const source = dark ? DarkColors : LightColors;
  Object.assign(Colors, source);
}

export type ColorName = keyof typeof LightColors;
