export const Colors = {
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
} as const;

export type ColorName = keyof typeof Colors;
