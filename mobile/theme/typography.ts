import { TextStyle } from "react-native";

export const Fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const Typography: Record<string, TextStyle> = {
  h1: { fontSize: 36, fontFamily: Fonts.bold },
  h2: { fontSize: 30, fontFamily: Fonts.bold },
  h3: { fontSize: 24, fontFamily: Fonts.bold },
  h4: { fontSize: 20, fontFamily: Fonts.bold },

  bodyLarge: { fontSize: 18, fontFamily: Fonts.medium },
  body: { fontSize: 16, fontFamily: Fonts.regular },
  bodyMedium: { fontSize: 16, fontFamily: Fonts.medium },
  bodySemiBold: { fontSize: 16, fontFamily: Fonts.semiBold },
  bodyBold: { fontSize: 16, fontFamily: Fonts.bold },

  caption: { fontSize: 14, fontFamily: Fonts.regular },
  captionMedium: { fontSize: 14, fontFamily: Fonts.medium },
  captionSemiBold: { fontSize: 14, fontFamily: Fonts.semiBold },
  captionBold: { fontSize: 14, fontFamily: Fonts.bold },

  small: { fontSize: 12, fontFamily: Fonts.regular },
  smallMedium: { fontSize: 12, fontFamily: Fonts.medium },
  smallBold: { fontSize: 12, fontFamily: Fonts.bold },

  label: { fontSize: 13, fontFamily: Fonts.semiBold },

  button: { fontSize: 16, fontFamily: Fonts.bold },
  buttonSmall: { fontSize: 14, fontFamily: Fonts.semiBold },

  tabLabel: { fontSize: 12, fontFamily: Fonts.medium },

  price: { fontSize: 46, fontFamily: Fonts.bold },
  priceSmall: { fontSize: 20, fontFamily: Fonts.bold },
  balance: { fontSize: 46, fontFamily: Fonts.bold },
} as const;
