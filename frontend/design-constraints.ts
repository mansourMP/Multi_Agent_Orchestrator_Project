import type { CSSProperties } from 'react';

export const DESIGN_TOKENS = {
  color: {
    canvas: '#f6f7f9',
    surface: '#ffffff',
    surfaceMuted: '#fafbfc',
    surfaceSubtle: '#f2f4f7',
    surfaceInteractive: '#f8fafc',
    overlay: 'rgba(15, 23, 42, 0.16)',
    textPrimary: '#14171f',
    textSecondary: '#5c6473',
    textTertiary: '#838b99',
    textInverse: '#ffffff',
    borderSubtle: '#e6e9ef',
    borderStrong: '#d6dbe4',
    accent: '#5e6ad2',
    accentStrong: '#4b57c5',
    accentSoft: '#eef1ff',
    accentText: '#2d3690',
    success: '#197a52',
    successSoft: '#edf8f2',
    warning: '#9a6700',
    warningSoft: '#fff7e6',
    danger: '#c2415d',
    dangerSoft: '#fff1f4',
    info: '#3b82f6',
    infoSoft: '#eef5ff',
  },
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    xl: 18,
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
    family: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
    size: {
      caption: 12,
      label: 13,
      body: 14,
      bodyLg: 16,
      titleSm: 18,
      title: 24,
      hero: 32,
    },
    weight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.15,
      snug: 1.3,
      normal: 1.5,
      relaxed: 1.65,
    },
    tracking: {
      tight: '-0.02em',
      normal: '-0.01em',
      wide: '0.08em',
    },
  },
  control: {
    heightSm: 36,
    heightMd: 40,
    heightLg: 44,
    iconSm: 32,
    iconMd: 36,
  },
  shadow: {
    subtle: '0 1px 2px rgba(16, 24, 40, 0.04)',
    focus: '0 0 0 3px rgba(94, 106, 210, 0.18)',
  },
  motion: {
    fast: '140ms ease',
    base: '180ms ease',
  },
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
    maxWidth: options?.narrow ? 960 : 1280,
    margin: '0 auto',
    padding: `${DESIGN_TOKENS.space[7]}px ${DESIGN_TOKENS.space[6]}px ${DESIGN_TOKENS.space[8]}px`,
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
    border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    borderRadius: DESIGN_TOKENS.radius.xl,
    padding: options?.padding ?? DESIGN_TOKENS.space[6],
    boxShadow: DESIGN_TOKENS.shadow.subtle,
    transition: `border-color ${DESIGN_TOKENS.motion.fast}, background ${DESIGN_TOKENS.motion.fast}`,
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
    letterSpacing: DESIGN_TOKENS.type.tracking.normal,
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

export function bodyTextStyle(emphasis: 'primary' | 'secondary' | 'tertiary' = 'secondary'): CSSProperties {
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
  };
}

export function metaTextStyle(): CSSProperties {
  return {
    margin: 0,
    color: DESIGN_TOKENS.color.textTertiary,
    fontSize: DESIGN_TOKENS.type.size.caption,
    lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
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
  const sizeMap: Record<ButtonSize, { height: number; paddingX: number; fontSize: number; radius: number; minWidth?: number }> = {
    sm: { height: DESIGN_TOKENS.control.heightSm, paddingX: 12, fontSize: DESIGN_TOKENS.type.size.label, radius: DESIGN_TOKENS.radius.md },
    md: { height: DESIGN_TOKENS.control.heightMd, paddingX: 14, fontSize: DESIGN_TOKENS.type.size.label, radius: DESIGN_TOKENS.radius.md },
    lg: { height: DESIGN_TOKENS.control.heightLg, paddingX: 16, fontSize: DESIGN_TOKENS.type.size.body, radius: DESIGN_TOKENS.radius.lg },
    'icon-sm': { height: DESIGN_TOKENS.control.iconSm, paddingX: 0, fontSize: DESIGN_TOKENS.type.size.label, radius: DESIGN_TOKENS.radius.md, minWidth: DESIGN_TOKENS.control.iconSm },
    'icon-md': { height: DESIGN_TOKENS.control.iconMd, paddingX: 0, fontSize: DESIGN_TOKENS.type.size.label, radius: DESIGN_TOKENS.radius.md, minWidth: DESIGN_TOKENS.control.iconMd },
  };
  const visualMap: Record<ButtonTone, CSSProperties> = {
    primary: {
      background: DESIGN_TOKENS.color.accent,
      color: DESIGN_TOKENS.color.textInverse,
      border: `1px solid ${DESIGN_TOKENS.color.accent}`,
    },
    secondary: {
      background: DESIGN_TOKENS.color.surface,
      color: DESIGN_TOKENS.color.textPrimary,
      border: `1px solid ${DESIGN_TOKENS.color.borderStrong}`,
    },
    ghost: {
      background: 'transparent',
      color: DESIGN_TOKENS.color.textSecondary,
      border: `1px solid transparent`,
    },
    danger: {
      background: DESIGN_TOKENS.color.dangerSoft,
      color: DESIGN_TOKENS.color.danger,
      border: `1px solid ${DESIGN_TOKENS.color.dangerSoft}`,
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
    transition: `background ${DESIGN_TOKENS.motion.fast}, border-color ${DESIGN_TOKENS.motion.fast}, color ${DESIGN_TOKENS.motion.fast}, opacity ${DESIGN_TOKENS.motion.fast}`,
    ...visualMap[tone],
    ...(disabled
      ? {
          opacity: 0.5,
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
    minHeight: options?.multiline ? 96 : DESIGN_TOKENS.control.heightMd,
    padding: options?.multiline ? `${DESIGN_TOKENS.space[4]}px` : `0 ${DESIGN_TOKENS.space[4]}px`,
    borderRadius: DESIGN_TOKENS.radius.md,
    border: `1px solid ${options?.invalid ? DESIGN_TOKENS.color.danger : DESIGN_TOKENS.color.borderStrong}`,
    background: options?.disabled ? DESIGN_TOKENS.color.surfaceSubtle : DESIGN_TOKENS.color.surface,
    color: DESIGN_TOKENS.color.textPrimary,
    fontFamily: DESIGN_TOKENS.type.family,
    fontSize: DESIGN_TOKENS.type.size.body,
    lineHeight: DESIGN_TOKENS.type.lineHeight.normal,
    outline: 'none',
    boxShadow: 'none',
  };
}

export function badgeStyle(tone: BadgeTone = 'neutral'): CSSProperties {
  const mapping: Record<BadgeTone, CSSProperties> = {
    neutral: {
      background: DESIGN_TOKENS.color.surfaceSubtle,
      color: DESIGN_TOKENS.color.textSecondary,
      border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    },
    accent: {
      background: DESIGN_TOKENS.color.accentSoft,
      color: DESIGN_TOKENS.color.accentText,
      border: `1px solid ${DESIGN_TOKENS.color.accentSoft}`,
    },
    success: {
      background: DESIGN_TOKENS.color.successSoft,
      color: DESIGN_TOKENS.color.success,
      border: `1px solid ${DESIGN_TOKENS.color.successSoft}`,
    },
    warning: {
      background: DESIGN_TOKENS.color.warningSoft,
      color: DESIGN_TOKENS.color.warning,
      border: `1px solid ${DESIGN_TOKENS.color.warningSoft}`,
    },
    danger: {
      background: DESIGN_TOKENS.color.dangerSoft,
      color: DESIGN_TOKENS.color.danger,
      border: `1px solid ${DESIGN_TOKENS.color.dangerSoft}`,
    },
  };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: DESIGN_TOKENS.space[2],
    minHeight: 24,
    paddingInline: DESIGN_TOKENS.space[3],
    borderRadius: DESIGN_TOKENS.radius.pill,
    fontSize: DESIGN_TOKENS.type.size.caption,
    fontWeight: DESIGN_TOKENS.type.weight.medium,
    lineHeight: 1,
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
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: DESIGN_TOKENS.space[4],
    flexWrap: 'wrap',
  };
}

export function listRowStyle(options?: { interactive?: boolean }): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: DESIGN_TOKENS.space[4],
    padding: `${DESIGN_TOKENS.space[5]}px ${DESIGN_TOKENS.space[6]}px`,
    borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
    background: DESIGN_TOKENS.color.surface,
    transition: `background ${DESIGN_TOKENS.motion.fast}, border-color ${DESIGN_TOKENS.motion.fast}`,
    ...(options?.interactive
      ? {
          cursor: 'pointer',
        }
      : {}),
  };
}

export function iconButtonStyle(options?: { tone?: 'neutral' | 'danger'; disabled?: boolean }): CSSProperties {
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
    border: `1px solid ${tone === 'danger' ? DESIGN_TOKENS.color.dangerSoft : DESIGN_TOKENS.color.borderSubtle}`,
    background: tone === 'danger' ? DESIGN_TOKENS.color.dangerSoft : DESIGN_TOKENS.color.surface,
    color: tone === 'danger' ? DESIGN_TOKENS.color.danger : DESIGN_TOKENS.color.textSecondary,
    transition: `background ${DESIGN_TOKENS.motion.fast}, border-color ${DESIGN_TOKENS.motion.fast}, color ${DESIGN_TOKENS.motion.fast}, opacity ${DESIGN_TOKENS.motion.fast}`,
    ...(disabled
      ? {
          opacity: 0.5,
          cursor: 'not-allowed',
        }
      : {}),
  };
}

export function statCardStyle(): CSSProperties {
  return {
    ...panelStyle({ padding: DESIGN_TOKENS.space[5] }),
    display: 'grid',
    gap: DESIGN_TOKENS.space[2],
    alignContent: 'start',
    minHeight: 132,
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
