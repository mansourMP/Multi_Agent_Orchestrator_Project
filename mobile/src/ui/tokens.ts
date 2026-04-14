export const appTokens = {
  colors: {
    canvas: '#07090d',
    canvasMuted: '#0d1117',
    panel: '#121821',
    panelElevated: '#181f2a',
    panelInteractive: '#1d2531',
    border: '#232d3a',
    borderStrong: '#344155',
    textPrimary: '#eef3fb',
    textSecondary: '#b5c0cf',
    textMuted: '#8591a3',
    accent: '#91b4ff',
    accentStrong: '#c5d6ff',
    success: '#63d0a7',
    warning: '#d6b36a',
    danger: '#f28989',
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
  },
  typography: {
    hero: 28,
    heading: 20,
    title: 16,
    body: 14,
    caption: 12,
  },
  shadow: {
    panel: {
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 10,
      },
      elevation: 8,
    },
  },
};

export type AppTokens = typeof appTokens;
