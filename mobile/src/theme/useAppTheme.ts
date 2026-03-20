import { useColorScheme } from 'react-native';
import { lightColors, darkColors, radii, spacing, typography } from './tokens';
import { useThemeStore } from '../stores/themeStore';

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const { mode } = useThemeStore();
  
  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return {
    isDark,
    mode,
    blurIntensity: isDark ? 80 : 40,
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
      overlay: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
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
