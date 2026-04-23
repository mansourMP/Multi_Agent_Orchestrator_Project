import {
  DESIGN_SYSTEM_BRAND_COLORS,
  DESIGN_SYSTEM_RADIUS_ALIASES,
  DESIGN_SYSTEM_SPACING_ALIASES,
  DESIGN_SYSTEM_TYPOGRAPHY_ALIASES,
} from '@shared/design-system/tokens';

export const lightColors = DESIGN_SYSTEM_BRAND_COLORS.light;

export const darkColors = DESIGN_SYSTEM_BRAND_COLORS.dark;

export const spacing = DESIGN_SYSTEM_SPACING_ALIASES.mobile;

export const radii = DESIGN_SYSTEM_RADIUS_ALIASES.mobile;

export const typography = {
  title: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile.title,
  section: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile.section,
  body: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile.body,
  meta: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile.meta,
  caption: DESIGN_SYSTEM_TYPOGRAPHY_ALIASES.mobile.caption,
} as const;
