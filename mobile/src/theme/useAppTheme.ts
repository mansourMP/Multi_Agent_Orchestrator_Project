import { lightColors, radii, spacing, typography } from './tokens';

export function useAppTheme() {
  const colors = lightColors;

  return {
    isDark: false,
    mode: 'light' as const,
    blurIntensity: 40,
    radii,
    spacing,
    typography,
    colors: {
      background: colors.app,
      surface: colors.surface,
      card: colors.panel,
      border: colors.border,
      text: colors.text,
      textSecondary: colors.textMuted,
      textMuted: colors.textMuted,
      accent: colors.primary,
      overlay: 'rgba(255,255,255,0.85)',
      cardHover: colors.panelMuted,
      indicator: colors.border,
      iconMuted: colors.textMuted,
      error: colors.error,
      errorMuted: colors.errorMuted,
      success: colors.success,
      successMuted: colors.successMuted,
      warning: colors.warning,
      warningMuted: colors.warningMuted,
    }
  };
}
