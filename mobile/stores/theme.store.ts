import { createContext, useContext } from "react";

export interface ThemeContextType {
  isDark: boolean;
  toggleDark: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleDark: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
