import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";
import type { BannerTone } from "@/src/lib/useTransientBanner";

export function TransientBanner({ message, tone = "neutral" }: { message: string; tone?: BannerTone }) {
  const theme = useTheme();
  const palette =
    tone === "success"
      ? { bg: "#DCFCE7", border: "#22C55E", text: "#166534" }
      : tone === "error"
      ? { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B" }
      : { bg: theme.colors.panelMuted, border: theme.colors.border, text: theme.colors.textMuted };

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        paddingVertical: 8,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: 12, color: palette.text }}>{message}</Text>
    </View>
  );
}
