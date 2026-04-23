import { Text } from "react-native";

import { MotionBanner } from "@/src/components/system/MotionBanner";
import { useTheme } from "@/src/theme";
import type { BannerTone } from "@/src/lib/useTransientBanner";

export function TransientBanner({ message, tone = "neutral" }: { message: string; tone?: BannerTone }) {
  const theme = useTheme();
  const palette =
    tone === "success"
      ? { bg: theme.colors.successMuted, border: theme.colors.success, text: theme.colors.success }
      : tone === "error"
      ? { bg: theme.colors.errorMuted, border: theme.colors.error, text: theme.colors.error }
      : { bg: theme.colors.panelMuted, border: theme.colors.border, text: theme.colors.textMuted };

  return (
    <MotionBanner
      style={{
        marginHorizontal: 20,
        marginTop: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        paddingVertical: 10,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: palette.text }}>{message}</Text>
    </MotionBanner>
  );
}
