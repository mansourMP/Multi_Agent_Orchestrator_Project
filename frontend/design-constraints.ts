import type { CSSProperties } from 'react';

export const DESIGN_LANGUAGE = {
  name: 'quiet-operator',
  posture: ['restrained', 'precise', 'dense', 'high-trust'],
  avoid: ['gradients', 'gloss', 'oversized radii', 'heavy shadows', 'bright playful accents'],
  emphasize: ['muted surfaces', 'disciplined spacing', 'sharp hierarchy', 'calm status colors'],
} as const;

const COLOR_SCALE = {
  graphite950: '#101319',
  graphite900: '#151a22',
  graphite800: '#202733',
  graphite700: '#2f3948',
  graphite600: '#4b5668',
  graphite500: '#697487',
  graphite400: '#8a94a3',
  graphite300: '#b8c0cb',
  graphite200: '#d4dae2',
  graphite100: '#e7ebf0',
  graphite50: '#f4f6f8',
  paper: '#fbfcfd',
  blue700: '#274b73',
  blue600: '#315a86',
  blue500: '#3b678f',
  blue50: '#eef3f8',
  green700: '#2f5f47',
  green50: '#edf4ef',
  amber700: '#7d631d',
  amber50: '#faf4e7',
  rose700: '#9b4752',
  rose50: '#f9eff1',
  slateBlue700: '#48657e',
  slateBlue50: '#edf2f5',
} as const;

const BORDER_WIDTH = {
  subtle: 1,
  strong: 1,
  emphasis: 1,
} as const;

const TRANSITION_CURVE = {
  fast: '120ms ease',
  base: '160ms ease',
} as const;

const SHADOW_SCALE = {
  subtle: '0 1px 2px rgba(16, 19, 25, 0.03)',
  focus: '0 0 0 3px rgba(49, 90, 134, 0.12)',
} as const;

export const DESIGN_TOKENS = {
  color: {
    canvas: COLOR_SCALE.graphite50,
    surface: COLOR_SCALE.paper,
    surfaceMuted: '#f7f8fa',
    surfaceSubtle: '#f1f3f6',
    surfaceInteractive: '#f6f8fa',
    overlay: 'rgba(10, 12, 16, 0.34)',
    textPrimary: COLOR_SCALE.graphite950,
    textSecondary: COLOR_SCALE.graphite600,
    textTertiary: COLOR_SCALE.graphite500,
    textInverse: '#f8fafc',
    borderSubtle: COLOR_SCALE.graphite100,
    borderStrong: COLOR_SCALE.graphite200,
    accent: COLOR_SCALE.blue600,
    accentStrong: COLOR_SCALE.blue700,
    accentSoft: COLOR_SCALE.blue50,
    accentText: COLOR_SCALE.blue700,
    success: COLOR_SCALE.green700,
    successSoft: COLOR_SCALE.green50,
    warning: COLOR_SCALE.amber700,
    warningSoft: COLOR_SCALE.amber50,
    danger: COLOR_SCALE.rose700,
    dangerSoft: COLOR_SCALE.rose50,
    info: COLOR_SCALE.slateBlue700,
    infoSoft: COLOR_SCALE.slateBlue50,
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
    pill: 999,
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
  },
  type: {
    family:
      '"SF Pro Text", "SF Pro Display", "Segoe UI Variable", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    mono: '"SF Mono", "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
    size: {
      caption: 11,
      label: 12,
      body: 14,
      bodyLg: 15,
      titleSm: 17,
      title: 22,
      hero: 30,
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.1,
      snug: 1.25,
      normal: 1.45,
      relaxed: 1.6,
    },
    tracking: {
      tight: '-0.03em',
      normal: '-0.015em',
      wide: '0.08em',
    },
  },
  control: {
    heightSm: 32,
    heightMd: 36,
    heightLg: 40,
    iconSm: 30,
    iconMd: 34,
  },
  border: BORDER_WIDTH,
  shadow: SHADOW_SCALE,
  motion: TRANSITION_CURVE,
  interaction: {
    hoverSurface: '#f5f7f9',
    hoverBorder: COLOR_SCALE.graphite300,
    activeSurface: '#eef2f6',
    disabledOpacity: 0.45,
  },
} as const;

export const SHELL_CHROME = {
  sidebarExpanded: 208,
  sidebarCollapsed: 60,
  topbarHeight: 54,
  desktopTitlebarHeight: 32,
  pageInsetX: 24,
  pageInsetBottom: 32,
} as const;

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md';
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function mergeStyles(...styles: Array<CSSProperties | undefined>): CSSProperties {
  return Object.assign({}, ...styles.filter(Boolean));
}

export function pageShellStyle(options?: { narrow?: boolean }): CSSProperties {
  return {
    width: '100%',
    maxWidth: options?.narrow ? 920 : 1240,
    margin: '0 auto',
    padding: `${DESIGN_TOKENS.space[7]}px ${DESIGN_TOKENS.space[5]}px ${DESIGN_TOKENS.space[8]}px`,
    display: 'grid',
    gap: DESIGN_TOKENS.space[6],
  };
}

export function panelStyle(options?: {
  muted?: boolean;
  padding?: number;
  interactive?: boolean;
}): CSSProperties {
  return {
    background: options?.muted ? DESIGN_TOKENS.color.surfaceMuted : DESIGN_TOKENS.color.surface,
    border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    borderRadius: DESIGN_TOKENS.radius.xl,
    padding: options?.padding ?? DESIGN_TOKENS.space[5],
    boxShadow: DESIGN_TOKENS.shadow.subtle,
    transition: [
      `border-color ${DESIGN_TOKENS.motion.fast}`,
      `background ${DESIGN_TOKENS.motion.fast}`,
      `box-shadow ${DESIGN_TOKENS.motion.fast}`,
    ].join(', '),
    ...(options?.interactive
      ? {
          cursor: 'pointer',
        }
      : {}),
  };
}

export function sectionTitleStyle(): CSSProperties {
  return {
    margin: 0,
    color: DESIGN_TOKENS.color.textPrimary,
    fontSize: DESIGN_TOKENS.type.size.titleSm,
    fontWeight: DESIGN_TOKENS.type.weight.semibold,
    lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
    letterSpacing: DESIGN_TOKENS.type.tracking.tight,
  };
}

export function eyebrowStyle(): CSSProperties {
  return {
    margin: 0,
    color: DESIGN_TOKENS.color.textTertiary,
    fontSize: DESIGN_TOKENS.type.size.caption,
    fontWeight: DESIGN_TOKENS.type.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: DESIGN_TOKENS.type.tracking.wide,
  };
}

export function bodyTextStyle(
  emphasis: 'primary' | 'secondary' | 'tertiary' = 'secondary',
): CSSProperties {
  const color =
    emphasis === 'primary'
      ? DESIGN_TOKENS.color.textPrimary
      : emphasis === 'tertiary'
        ? DESIGN_TOKENS.color.textTertiary
        : DESIGN_TOKENS.color.textSecondary;

  return {
    margin: 0,
    color,
    fontSize: DESIGN_TOKENS.type.size.body,
    lineHeight: DESIGN_TOKENS.type.lineHeight.relaxed,
    letterSpacing: DESIGN_TOKENS.type.tracking.normal,
  };
}

export function metaTextStyle(): CSSProperties {
  return {
    margin: 0,
    color: DESIGN_TOKENS.color.textTertiary,
    fontSize: DESIGN_TOKENS.type.size.caption,
    lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
    letterSpacing: '0.01em',
  };
}

export function buttonStyle(options?: {
  tone?: ButtonTone;
  size?: ButtonSize;
  disabled?: boolean;
}): CSSProperties {
  const tone = options?.tone || 'secondary';
  const size = options?.size || 'md';
  const disabled = Boolean(options?.disabled);

  const sizeMap: Record<
    ButtonSize,
    { height: number; paddingX: number; fontSize: number; radius: number; minWidth?: number }
  > = {
    sm: {
      height: DESIGN_TOKENS.control.heightSm,
      paddingX: 12,
      fontSize: DESIGN_TOKENS.type.size.label,
      radius: DESIGN_TOKENS.radius.md,
    },
    md: {
      height: DESIGN_TOKENS.control.heightMd,
      paddingX: 14,
      fontSize: DESIGN_TOKENS.type.size.label,
      radius: DESIGN_TOKENS.radius.md,
    },
    lg: {
      height: DESIGN_TOKENS.control.heightLg,
      paddingX: 16,
      fontSize: DESIGN_TOKENS.type.size.body,
      radius: DESIGN_TOKENS.radius.lg,
    },
    'icon-sm': {
      height: DESIGN_TOKENS.control.iconSm,
      paddingX: 0,
      fontSize: DESIGN_TOKENS.type.size.label,
      radius: DESIGN_TOKENS.radius.md,
      minWidth: DESIGN_TOKENS.control.iconSm,
    },
    'icon-md': {
      height: DESIGN_TOKENS.control.iconMd,
      paddingX: 0,
      fontSize: DESIGN_TOKENS.type.size.label,
      radius: DESIGN_TOKENS.radius.md,
      minWidth: DESIGN_TOKENS.control.iconMd,
    },
  };

  const visualMap: Record<ButtonTone, CSSProperties> = {
    primary: {
      background: DESIGN_TOKENS.color.accentStrong,
      color: DESIGN_TOKENS.color.textInverse,
      border: `${DESIGN_TOKENS.border.strong}px solid ${DESIGN_TOKENS.color.accentStrong}`,
    },
    secondary: {
      background: DESIGN_TOKENS.color.surface,
      color: DESIGN_TOKENS.color.textPrimary,
      border: `${DESIGN_TOKENS.border.strong}px solid ${DESIGN_TOKENS.color.borderStrong}`,
    },
    ghost: {
      background: 'transparent',
      color: DESIGN_TOKENS.color.textSecondary,
      border: `${DESIGN_TOKENS.border.strong}px solid transparent`,
    },
    danger: {
      background: DESIGN_TOKENS.color.dangerSoft,
      color: DESIGN_TOKENS.color.danger,
      border: `${DESIGN_TOKENS.border.strong}px solid ${DESIGN_TOKENS.color.dangerSoft}`,
    },
  };

  return {
    height: sizeMap[size].height,
    minWidth: sizeMap[size].minWidth,
    paddingInline: sizeMap[size].paddingX,
    borderRadius: sizeMap[size].radius,
    fontFamily: DESIGN_TOKENS.type.family,
    fontSize: sizeMap[size].fontSize,
    fontWeight: DESIGN_TOKENS.type.weight.medium,
    lineHeight: 1,
    letterSpacing: DESIGN_TOKENS.type.tracking.normal,
    boxShadow: 'none',
    transition: [
      `background ${DESIGN_TOKENS.motion.fast}`,
      `border-color ${DESIGN_TOKENS.motion.fast}`,
      `color ${DESIGN_TOKENS.motion.fast}`,
      `opacity ${DESIGN_TOKENS.motion.fast}`,
    ].join(', '),
    ...visualMap[tone],
    ...(disabled
      ? {
          opacity: DESIGN_TOKENS.interaction.disabledOpacity,
          cursor: 'not-allowed',
        }
      : {}),
  };
}

export function inputStyle(options?: {
  invalid?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}): CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    minHeight: options?.multiline ? 88 : DESIGN_TOKENS.control.heightMd,
    padding: options?.multiline ? `${DESIGN_TOKENS.space[4]}px` : `0 ${DESIGN_TOKENS.space[4]}px`,
    borderRadius: DESIGN_TOKENS.radius.md,
    border: `${DESIGN_TOKENS.border.strong}px solid ${options?.invalid ? DESIGN_TOKENS.color.danger : DESIGN_TOKENS.color.borderStrong}`,
    background: options?.disabled ? DESIGN_TOKENS.color.surfaceSubtle : DESIGN_TOKENS.color.surface,
    color: DESIGN_TOKENS.color.textPrimary,
    fontFamily: DESIGN_TOKENS.type.family,
    fontSize: DESIGN_TOKENS.type.size.body,
    lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
    letterSpacing: DESIGN_TOKENS.type.tracking.normal,
    outline: 'none',
    boxShadow: 'none',
  };
}

export function badgeStyle(tone: BadgeTone = 'neutral'): CSSProperties {
  const mapping: Record<BadgeTone, CSSProperties> = {
    neutral: {
      background: DESIGN_TOKENS.color.surfaceSubtle,
      color: DESIGN_TOKENS.color.textSecondary,
      border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    },
    accent: {
      background: DESIGN_TOKENS.color.accentSoft,
      color: DESIGN_TOKENS.color.accentText,
      border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.accentSoft}`,
    },
    success: {
      background: DESIGN_TOKENS.color.successSoft,
      color: DESIGN_TOKENS.color.success,
      border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.successSoft}`,
    },
    warning: {
      background: DESIGN_TOKENS.color.warningSoft,
      color: DESIGN_TOKENS.color.warning,
      border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.warningSoft}`,
    },
    danger: {
      background: DESIGN_TOKENS.color.dangerSoft,
      color: DESIGN_TOKENS.color.danger,
      border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.dangerSoft}`,
    },
  };

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DESIGN_TOKENS.space[2],
    minHeight: 22,
    paddingInline: DESIGN_TOKENS.space[3],
    borderRadius: DESIGN_TOKENS.radius.pill,
    fontSize: DESIGN_TOKENS.type.size.caption,
    fontWeight: DESIGN_TOKENS.type.weight.medium,
    lineHeight: 1,
    letterSpacing: '0.01em',
    ...mapping[tone],
  };
}

export function dividerStyle(): CSSProperties {
  return {
    width: '100%',
    height: 1,
    background: DESIGN_TOKENS.color.borderSubtle,
  };
}

export function pageHeaderStyle(): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: DESIGN_TOKENS.space[4],
    alignItems: 'start',
    paddingBottom: DESIGN_TOKENS.space[4],
    borderBottom: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
  };
}

export function pageTitleStyle(options?: { hero?: boolean }): CSSProperties {
  return {
    margin: 0,
    color: DESIGN_TOKENS.color.textPrimary,
    fontSize: options?.hero ? 28 : 24,
    fontWeight: DESIGN_TOKENS.type.weight.semibold,
    lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
    letterSpacing: DESIGN_TOKENS.type.tracking.tight,
  };
}

export function listRowStyle(options?: { interactive?: boolean }): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: DESIGN_TOKENS.space[4],
    padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[5]}px`,
    borderBottom: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    background: DESIGN_TOKENS.color.surface,
    transition: `background ${DESIGN_TOKENS.motion.fast}, border-color ${DESIGN_TOKENS.motion.fast}`,
    ...(options?.interactive
      ? {
          cursor: 'pointer',
        }
      : {}),
  };
}

export function iconButtonStyle(options?: {
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
}): CSSProperties {
  const tone = options?.tone || 'neutral';
  const disabled = Boolean(options?.disabled);

  return {
    width: DESIGN_TOKENS.control.iconMd,
    minWidth: DESIGN_TOKENS.control.iconMd,
    height: DESIGN_TOKENS.control.iconMd,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DESIGN_TOKENS.radius.md,
    border: `${DESIGN_TOKENS.border.subtle}px solid ${tone === 'danger' ? DESIGN_TOKENS.color.dangerSoft : DESIGN_TOKENS.color.borderSubtle}`,
    background: tone === 'danger' ? DESIGN_TOKENS.color.dangerSoft : DESIGN_TOKENS.color.surface,
    color: tone === 'danger' ? DESIGN_TOKENS.color.danger : DESIGN_TOKENS.color.textSecondary,
    transition: [
      `background ${DESIGN_TOKENS.motion.fast}`,
      `border-color ${DESIGN_TOKENS.motion.fast}`,
      `color ${DESIGN_TOKENS.motion.fast}`,
      `opacity ${DESIGN_TOKENS.motion.fast}`,
    ].join(', '),
    ...(disabled
      ? {
          opacity: DESIGN_TOKENS.interaction.disabledOpacity,
          cursor: 'not-allowed',
        }
      : {}),
  };
}

export function statCardStyle(): CSSProperties {
  return {
    ...panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }),
    display: 'grid',
    gap: DESIGN_TOKENS.space[2],
    alignContent: 'start',
    minHeight: 104,
    background: DESIGN_TOKENS.color.surfaceMuted,
  };
}

export function modalOverlayStyle(): CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    background: DESIGN_TOKENS.color.overlay,
    display: 'grid',
    placeItems: 'center',
    padding: DESIGN_TOKENS.space[5],
  };
}

export function modalCardStyle(): CSSProperties {
  return {
    ...panelStyle({ padding: 0 }),
    width: 'min(100%, 560px)',
    overflow: 'hidden',
  };
}
