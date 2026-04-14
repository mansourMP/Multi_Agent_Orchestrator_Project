/*
Canonical design-token source extracted on 2026-04-14 from:
- frontend/lib/ui/chrome.css
- frontend/lib/ui/tokens.ts
- mobile/src/ui/tokens.ts

No raw values in this file are newly invented. This file consolidates the
values already in use so web, Tauri, and mobile can migrate onto one source.
*/

const px = (value: number): string => `${value}px`;
const ms = (value: number): string => `${value}ms`;

export const DESIGN_SYSTEM_THEME_ATTRIBUTE = 'data-emp-theme';
export const DESIGN_SYSTEM_DEFAULT_THEME = 'light' as const;

export const DESIGN_SYSTEM_FONTS = {
  sans: '"Inter", "Geist", "SF Pro Text", "SF Pro Display", "Segoe UI", sans-serif',
  mono: '"SF Mono", "JetBrains Mono", "IBM Plex Mono", "Menlo", monospace',
} as const;

export const DESIGN_SYSTEM_FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const DESIGN_SYSTEM_LAYOUT = {
  sidebarWidth: 220,
  inspectorWidth: 360,
  titlebarHeight: 40,
} as const;

export const DESIGN_SYSTEM_SPACING_SCALE = {
  px4: 4,
  px6: 6,
  px8: 8,
  px10: 10,
  px12: 12,
  px14: 14,
  px16: 16,
  px18: 18,
  px20: 20,
  px24: 24,
  px32: 32,
  px40: 40,
  px48: 48,
} as const;

export const DESIGN_SYSTEM_SPACING_ALIASES = {
  web: {
    1: DESIGN_SYSTEM_SPACING_SCALE.px4,
    2: DESIGN_SYSTEM_SPACING_SCALE.px8,
    3: DESIGN_SYSTEM_SPACING_SCALE.px12,
    4: DESIGN_SYSTEM_SPACING_SCALE.px16,
    5: DESIGN_SYSTEM_SPACING_SCALE.px20,
    6: DESIGN_SYSTEM_SPACING_SCALE.px24,
    8: DESIGN_SYSTEM_SPACING_SCALE.px32,
    10: DESIGN_SYSTEM_SPACING_SCALE.px40,
    12: DESIGN_SYSTEM_SPACING_SCALE.px48,
  },
  mobile: {
    xs: DESIGN_SYSTEM_SPACING_SCALE.px6,
    sm: DESIGN_SYSTEM_SPACING_SCALE.px10,
    md: DESIGN_SYSTEM_SPACING_SCALE.px14,
    lg: DESIGN_SYSTEM_SPACING_SCALE.px18,
    xl: DESIGN_SYSTEM_SPACING_SCALE.px24,
    xxl: DESIGN_SYSTEM_SPACING_SCALE.px32,
  },
} as const;

export const DESIGN_SYSTEM_TYPOGRAPHY_SCALE = {
  px11: 11,
  px12: 12,
  px13: 13,
  px14: 14,
  px16: 16,
  px20: 20,
  px28: 28,
} as const;

export const DESIGN_SYSTEM_TYPOGRAPHY_ALIASES = {
  web: {
    11: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px11,
    12: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px12,
    13: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px13,
    14: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px14,
    16: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px16,
    20: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px20,
  },
  mobile: {
    hero: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px28,
    heading: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px20,
    title: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px16,
    body: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px14,
    caption: DESIGN_SYSTEM_TYPOGRAPHY_SCALE.px12,
  },
} as const;

export const DESIGN_SYSTEM_LINE_HEIGHTS = {
  compact: 1.5,
  body: 1.55,
  relaxed: 1.6,
} as const;

export const DESIGN_SYSTEM_RADIUS_SCALE = {
  px8: 8,
  px10: 10,
  px12: 12,
  px16: 16,
  px20: 20,
  px22: 22,
  pill: 999,
} as const;

export const DESIGN_SYSTEM_RADIUS_ALIASES = {
  web: {
    sm: DESIGN_SYSTEM_RADIUS_SCALE.px8,
    md: DESIGN_SYSTEM_RADIUS_SCALE.px12,
    lg: DESIGN_SYSTEM_RADIUS_SCALE.px16,
    xl: DESIGN_SYSTEM_RADIUS_SCALE.px20,
    pill: DESIGN_SYSTEM_RADIUS_SCALE.pill,
  },
  mobile: {
    sm: DESIGN_SYSTEM_RADIUS_SCALE.px10,
    md: DESIGN_SYSTEM_RADIUS_SCALE.px16,
    lg: DESIGN_SYSTEM_RADIUS_SCALE.px22,
  },
} as const;

export const DESIGN_SYSTEM_MOTION = {
  fast: 120,
  normal: 160,
  slow: 220,
} as const;

export const DESIGN_SYSTEM_ELEVATION = {
  web: {
    subtle: '0 1px 2px rgba(10, 10, 10, 0.04)',
    panel: '0 1px 2px rgba(10, 10, 10, 0.04), 0 0 0 1px rgba(10, 10, 10, 0.02)',
    focus: '0 0 0 2px rgba(10, 10, 10, 0.12)',
    darkPanel: 'inset 0 0 0 1px rgba(255, 255, 255, 0.02)',
    darkFocus: '0 0 0 2px rgba(255, 255, 255, 0.18)',
  },
  mobile: {
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
} as const;

export const DESIGN_SYSTEM_COLOR_MODES = {
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
      accent: '#0a0a0a',
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
    status: {
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
      accent: '#fafafa',
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
    status: {
      success: '#4ac786',
      successMuted: '#102117',
      warning: '#d3a548',
      warningMuted: '#21190f',
      danger: '#f06a48',
      dangerMuted: '#241210',
    },
  },
  mobileDark: {
    background: {
      page: '#07090d',
      canvasMuted: '#0d1117',
      surface: '#121821',
      surfaceElevated: '#181f2a',
      surfaceHover: '#1d2531',
    },
    border: {
      subtle: '#232d3a',
      strong: '#344155',
    },
    text: {
      primary: '#eef3fb',
      secondary: '#b5c0cf',
      tertiary: '#8591a3',
      inverse: '#07090d',
    },
    accent: {
      base: '#91b4ff',
      strong: '#c5d6ff',
      muted: '#1d2531',
      text: '#07090d',
    },
    status: {
      success: '#63d0a7',
      warning: '#d6b36a',
      danger: '#f28989',
    },
  },
} as const;

export const DESIGN_SYSTEM_MOBILE_TOKENS = {
  colors: {
    canvas: DESIGN_SYSTEM_COLOR_MODES.mobileDark.background.page,
    canvasMuted: DESIGN_SYSTEM_COLOR_MODES.mobileDark.background.canvasMuted,
    panel: DESIGN_SYSTEM_COLOR_MODES.mobileDark.background.surface,
    panelElevated: DESIGN_SYSTEM_COLOR_MODES.mobileDark.background.surfaceElevated,
    panelInteractive: DESIGN_SYSTEM_COLOR_MODES.mobileDark.background.surfaceHover,
    border: DESIGN_SYSTEM_COLOR_MODES.mobileDark.border.subtle,
    borderStrong: DESIGN_SYSTEM_COLOR_MODES.mobileDark.border.strong,
    textPrimary: DESIGN_SYSTEM_COLOR_MODES.mobileDark.text.primary,
    textSecondary: DESIGN_SYSTEM_COLOR_MODES.mobileDark.text.secondary,
    textMuted: DESIGN_SYSTEM_COLOR_MODES.mobileDark.text.tertiary,
    accent: DESIGN_SYSTEM_COLOR_MODES.mobileDark.accent.base,
    accentStrong: DESIGN_SYSTEM_COLOR_MODES.mobileDark.accent.strong,
    success: DESIGN_SYSTEM_COLOR_MODES.mobileDark.status.success,
    warning: DESIGN_SYSTEM_COLOR_MODES.mobileDark.status.warning,
    danger: DESIGN_SYSTEM_COLOR_MODES.mobileDark.status.danger,
  },
  spacing: DESIGN_SYSTEM_SPACING_ALIASES.mobile,
  radius: DESIGN_SYSTEM_RADIUS_ALIASES.mobile,
  typography: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile,
  shadow: DESIGN_SYSTEM_ELEVATION.mobile,
  motion: DESIGN_SYSTEM_MOTION,
} as const;

export const DESIGN_SYSTEM_WEB_CSS_VARIABLES = {
  shared: {
    '--app-font-sans': DESIGN_SYSTEM_FONTS.sans,
    '--app-font-mono': DESIGN_SYSTEM_FONTS.mono,
    '--app-space-1': px(DESIGN_SYSTEM_SPACING_ALIASES.web[1]),
    '--app-space-2': px(DESIGN_SYSTEM_SPACING_ALIASES.web[2]),
    '--app-space-3': px(DESIGN_SYSTEM_SPACING_ALIASES.web[3]),
    '--app-space-4': px(DESIGN_SYSTEM_SPACING_ALIASES.web[4]),
    '--app-space-5': px(DESIGN_SYSTEM_SPACING_ALIASES.web[5]),
    '--app-space-6': px(DESIGN_SYSTEM_SPACING_ALIASES.web[6]),
    '--app-space-8': px(DESIGN_SYSTEM_SPACING_ALIASES.web[8]),
    '--app-space-10': px(DESIGN_SYSTEM_SPACING_ALIASES.web[10]),
    '--app-space-12': px(DESIGN_SYSTEM_SPACING_ALIASES.web[12]),
    '--app-radius-sm': px(DESIGN_SYSTEM_RADIUS_ALIASES.web.sm),
    '--app-radius-md': px(DESIGN_SYSTEM_RADIUS_ALIASES.web.md),
    '--app-radius-lg': px(DESIGN_SYSTEM_RADIUS_ALIASES.web.lg),
    '--app-radius-xl': px(DESIGN_SYSTEM_RADIUS_ALIASES.web.xl),
    '--app-radius-pill': px(DESIGN_SYSTEM_RADIUS_ALIASES.web.pill),
    '--app-shadow-subtle': DESIGN_SYSTEM_ELEVATION.web.subtle,
    '--app-shadow-panel': DESIGN_SYSTEM_ELEVATION.web.panel,
    '--app-shadow-focus': DESIGN_SYSTEM_ELEVATION.web.focus,
    '--app-motion-fast': ms(DESIGN_SYSTEM_MOTION.fast),
    '--app-motion-normal': ms(DESIGN_SYSTEM_MOTION.normal),
    '--app-motion-slow': ms(DESIGN_SYSTEM_MOTION.slow),
    '--app-font-11': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[11]),
    '--app-font-12': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[12]),
    '--app-font-13': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[13]),
    '--app-font-14': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[14]),
    '--app-font-16': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[16]),
    '--app-font-20': px(DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.web[20]),
    '--app-line-height-compact': `${DESIGN_SYSTEM_LINE_HEIGHTS.compact}`,
    '--app-line-height-body': `${DESIGN_SYSTEM_LINE_HEIGHTS.body}`,
    '--app-line-height-relaxed': `${DESIGN_SYSTEM_LINE_HEIGHTS.relaxed}`,
    '--app-weight-regular': `${DESIGN_SYSTEM_FONT_WEIGHTS.regular}`,
    '--app-weight-medium': `${DESIGN_SYSTEM_FONT_WEIGHTS.medium}`,
    '--app-weight-semibold': `${DESIGN_SYSTEM_FONT_WEIGHTS.semibold}`,
    '--app-shell-sidebar-width': px(DESIGN_SYSTEM_LAYOUT.sidebarWidth),
    '--app-shell-inspector-width': px(DESIGN_SYSTEM_LAYOUT.inspectorWidth),
    '--app-shell-titlebar-height': px(DESIGN_SYSTEM_LAYOUT.titlebarHeight),
  },
  light: {
    '--app-bg-page': DESIGN_SYSTEM_COLOR_MODES.light.background.page,
    '--app-surface-1': DESIGN_SYSTEM_COLOR_MODES.light.background.surface,
    '--app-surface-2': DESIGN_SYSTEM_COLOR_MODES.light.background.surfaceHover,
    '--app-surface-inset': DESIGN_SYSTEM_COLOR_MODES.light.background.inset,
    '--app-bg-app': DESIGN_SYSTEM_COLOR_MODES.light.background.page,
    '--app-bg-canvas': DESIGN_SYSTEM_COLOR_MODES.light.background.page,
    '--app-bg-shell': DESIGN_SYSTEM_COLOR_MODES.light.background.surface,
    '--app-bg-panel': DESIGN_SYSTEM_COLOR_MODES.light.background.page,
    '--app-bg-panel-elevated': DESIGN_SYSTEM_COLOR_MODES.light.background.surface,
    '--app-bg-overlay': DESIGN_SYSTEM_COLOR_MODES.light.background.surfaceHover,
    '--app-border-subtle': DESIGN_SYSTEM_COLOR_MODES.light.border.subtle,
    '--app-border-strong': DESIGN_SYSTEM_COLOR_MODES.light.border.strong,
    '--app-border-muted': DESIGN_SYSTEM_COLOR_MODES.light.border.muted,
    '--app-border-accent': DESIGN_SYSTEM_COLOR_MODES.light.border.accent,
    '--app-text-primary': DESIGN_SYSTEM_COLOR_MODES.light.text.primary,
    '--app-text-secondary': DESIGN_SYSTEM_COLOR_MODES.light.text.secondary,
    '--app-text-tertiary': DESIGN_SYSTEM_COLOR_MODES.light.text.tertiary,
    '--app-text-inverse': DESIGN_SYSTEM_COLOR_MODES.light.text.inverse,
    '--app-accent': DESIGN_SYSTEM_COLOR_MODES.light.accent.base,
    '--app-accent-strong': DESIGN_SYSTEM_COLOR_MODES.light.accent.strong,
    '--app-accent-muted': DESIGN_SYSTEM_COLOR_MODES.light.accent.muted,
    '--app-accent-text': DESIGN_SYSTEM_COLOR_MODES.light.accent.text,
    '--app-success': DESIGN_SYSTEM_COLOR_MODES.light.status.success,
    '--app-success-muted': DESIGN_SYSTEM_COLOR_MODES.light.status.successMuted,
    '--app-warning': DESIGN_SYSTEM_COLOR_MODES.light.status.warning,
    '--app-warning-muted': DESIGN_SYSTEM_COLOR_MODES.light.status.warningMuted,
    '--app-danger': DESIGN_SYSTEM_COLOR_MODES.light.status.danger,
    '--app-danger-muted': DESIGN_SYSTEM_COLOR_MODES.light.status.dangerMuted,
  },
  dark: {
    '--app-bg-page': DESIGN_SYSTEM_COLOR_MODES.dark.background.page,
    '--app-surface-1': DESIGN_SYSTEM_COLOR_MODES.dark.background.surface,
    '--app-surface-2': DESIGN_SYSTEM_COLOR_MODES.dark.background.surfaceHover,
    '--app-surface-inset': DESIGN_SYSTEM_COLOR_MODES.dark.background.inset,
    '--app-bg-app': DESIGN_SYSTEM_COLOR_MODES.dark.background.page,
    '--app-bg-canvas': DESIGN_SYSTEM_COLOR_MODES.dark.background.page,
    '--app-bg-shell': DESIGN_SYSTEM_COLOR_MODES.dark.background.surface,
    '--app-bg-panel': DESIGN_SYSTEM_COLOR_MODES.dark.background.surface,
    '--app-bg-panel-elevated': DESIGN_SYSTEM_COLOR_MODES.dark.background.surfaceHover,
    '--app-bg-overlay': DESIGN_SYSTEM_COLOR_MODES.dark.background.surfaceHover,
    '--app-border-subtle': DESIGN_SYSTEM_COLOR_MODES.dark.border.subtle,
    '--app-border-strong': DESIGN_SYSTEM_COLOR_MODES.dark.border.strong,
    '--app-border-muted': DESIGN_SYSTEM_COLOR_MODES.dark.border.muted,
    '--app-border-accent': DESIGN_SYSTEM_COLOR_MODES.dark.border.accent,
    '--app-text-primary': DESIGN_SYSTEM_COLOR_MODES.dark.text.primary,
    '--app-text-secondary': DESIGN_SYSTEM_COLOR_MODES.dark.text.secondary,
    '--app-text-tertiary': DESIGN_SYSTEM_COLOR_MODES.dark.text.tertiary,
    '--app-text-inverse': DESIGN_SYSTEM_COLOR_MODES.dark.text.inverse,
    '--app-accent': DESIGN_SYSTEM_COLOR_MODES.dark.accent.base,
    '--app-accent-strong': DESIGN_SYSTEM_COLOR_MODES.dark.accent.strong,
    '--app-accent-muted': DESIGN_SYSTEM_COLOR_MODES.dark.accent.muted,
    '--app-accent-text': DESIGN_SYSTEM_COLOR_MODES.dark.accent.text,
    '--app-success': DESIGN_SYSTEM_COLOR_MODES.dark.status.success,
    '--app-success-muted': DESIGN_SYSTEM_COLOR_MODES.dark.status.successMuted,
    '--app-warning': DESIGN_SYSTEM_COLOR_MODES.dark.status.warning,
    '--app-warning-muted': DESIGN_SYSTEM_COLOR_MODES.dark.status.warningMuted,
    '--app-danger': DESIGN_SYSTEM_COLOR_MODES.dark.status.danger,
    '--app-danger-muted': DESIGN_SYSTEM_COLOR_MODES.dark.status.dangerMuted,
    '--app-shadow-subtle': 'none',
    '--app-shadow-panel': DESIGN_SYSTEM_ELEVATION.web.darkPanel,
    '--app-shadow-focus': DESIGN_SYSTEM_ELEVATION.web.darkFocus,
  },
} as const;

export function resolveWebCssVariables(mode: 'light' | 'dark') {
  return {
    ...DESIGN_SYSTEM_WEB_CSS_VARIABLES.shared,
    ...DESIGN_SYSTEM_WEB_CSS_VARIABLES[mode],
  };
}

export const DESIGN_SYSTEM_TOKENS = {
  themeAttribute: DESIGN_SYSTEM_THEME_ATTRIBUTE,
  defaultTheme: DESIGN_SYSTEM_DEFAULT_THEME,
  fonts: DESIGN_SYSTEM_FONTS,
  fontWeights: DESIGN_SYSTEM_FONT_WEIGHTS,
  layout: DESIGN_SYSTEM_LAYOUT,
  spacing: {
    scale: DESIGN_SYSTEM_SPACING_SCALE,
    aliases: DESIGN_SYSTEM_SPACING_ALIASES,
  },
  typography: {
    scale: DESIGN_SYSTEM_TYPOGRAPHY_SCALE,
    aliases: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES,
    lineHeights: DESIGN_SYSTEM_LINE_HEIGHTS,
  },
  radius: {
    scale: DESIGN_SYSTEM_RADIUS_SCALE,
    aliases: DESIGN_SYSTEM_RADIUS_ALIASES,
  },
  elevation: DESIGN_SYSTEM_ELEVATION,
  motion: DESIGN_SYSTEM_MOTION,
  colors: DESIGN_SYSTEM_COLOR_MODES,
  webCssVariables: DESIGN_SYSTEM_WEB_CSS_VARIABLES,
  mobile: DESIGN_SYSTEM_MOBILE_TOKENS,
} as const;
