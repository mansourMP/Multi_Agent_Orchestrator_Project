import { createContext, useContext, useMemo } from "react";
import { Appearance } from "react-native";

import { darkColors, lightColors, radii, spacing, typography } from "./tokens";

type ThemeColors = typeof lightColors | typeof darkColors;

type ThemeValue = {
  mode: "light" | "dark";
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = Appearance.getColorScheme();
  const mode: "light" | "dark" = scheme === "dark" ? "dark" : "light";

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      colors: mode === "dark" ? darkColors : lightColors,
      spacing,
      radii,
      typography,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
