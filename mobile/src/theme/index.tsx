import { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import { lightColors, darkColors, radii, spacing, typography } from "./tokens";

type ThemeBaseColors = typeof lightColors | typeof darkColors;
type ThemeColors = ThemeBaseColors & {
  accentText: string;
};

type ThemeValue = {
  mode: "light" | "dark";
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = useMemo<ThemeColors>(() => {
    const baseColors = isDark ? darkColors : lightColors;
    return {
      ...baseColors,
      accentText: isDark ? darkColors.text : lightColors.panel,
    };
  }, [isDark]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode: isDark ? "dark" : "light",
      colors,
      spacing,
      radii,
      typography,
    }),
    [isDark, colors],
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
