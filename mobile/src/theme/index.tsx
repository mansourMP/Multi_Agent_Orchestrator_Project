import { createContext, useContext, useMemo } from "react";

import { lightColors, radii, spacing, typography } from "./tokens";

type ThemeColors = typeof lightColors;

type ThemeValue = {
  mode: "light";
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<ThemeValue>(
    () => ({
      mode: "light",
      colors: lightColors,
      spacing,
      radii,
      typography,
    }),
    [],
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
