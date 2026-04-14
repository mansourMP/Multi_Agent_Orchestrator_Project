export type AppThemePreference = 'system' | 'light' | 'dark';
export type AppResolvedTheme = 'light' | 'dark';

export const APP_THEME_ATTRIBUTE = 'data-emp-theme';
export const APP_DEFAULT_THEME: AppResolvedTheme = 'light';

export const APP_THEME_TOKENS = {
  light: {
    background: {
      page: '#ffffff',
      surface: '#f5f5f5',
      surfaceHover: '#ebebeb',
      inset: '#fafafa',
    },
    border: {
      subtle: '#e4e4e4',
      strong: '#d7d7d7',
      muted: '#f0f0f0',
    },
    text: {
      primary: '#0a0a0a',
      secondary: '#6b6b6b',
      tertiary: '#aaaaaa',
      inverse: '#ffffff',
    },
    accent: {
      base: '#0a0a0a',
      strong: '#000000',
      muted: '#ebebeb',
      text: '#ffffff',
    },
    semantic: {
      success: '#30a46c',
      successMuted: '#eef8f2',
      warning: '#a36b11',
      warningMuted: '#faf4e7',
      danger: '#e54d2e',
      dangerMuted: '#fdf0ec',
    },
  },
  dark: {
    background: {
      page: '#0a0a0a',
      surface: '#111111',
      surfaceHover: '#1a1a1a',
      inset: '#141414',
    },
    border: {
      subtle: '#242424',
      strong: '#303030',
      muted: '#181818',
    },
    text: {
      primary: '#fafafa',
      secondary: '#a1a1a1',
      tertiary: '#6f6f6f',
      inverse: '#0a0a0a',
    },
    accent: {
      base: '#ffffff',
      strong: '#fafafa',
      muted: '#1a1a1a',
      text: '#0a0a0a',
    },
    semantic: {
      success: '#4ac786',
      successMuted: '#102117',
      warning: '#d3a548',
      warningMuted: '#21190f',
      danger: '#f06a48',
      dangerMuted: '#241210',
    },
  },
} as const;

export const APP_SPACING = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

export const APP_RADIUS = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  pill: '999px',
} as const;

export const APP_SHADOW = {
  subtle: '0 1px 2px rgba(10, 10, 10, 0.04)',
  panel: '0 1px 2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.02)',
  focus: '0 0 0 2px rgba(10, 10, 10, 0.12)',
} as const;

export const APP_MOTION = {
  fast: '120ms',
  normal: '160ms',
  slow: '220ms',
} as const;

export const APP_TYPE_SCALE = {
  11: '11px',
  12: '12px',
  13: '13px',
  14: '14px',
  16: '16px',
  20: '20px',
} as const;

export function resolveAppThemePreference(
  preference: AppThemePreference,
  prefersDark: boolean,
): AppResolvedTheme {
  if (preference === 'light') {
    return 'light';
  }
  if (preference === 'dark') {
    return 'dark';
  }
  return prefersDark ? 'dark' : 'light';
}
