import React, { createContext, useContext, useMemo } from 'react';

import { AppTokens, appTokens } from './tokens';

type ThemeContextValue = {
  name: 'dark';
  tokens: AppTokens;
};

const ThemeContext = createContext<ThemeContextValue>({
  name: 'dark',
  tokens: appTokens,
});

export function AppThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useMemo<ThemeContextValue>(() => ({
    name: 'dark',
    tokens: appTokens,
  }), []);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
