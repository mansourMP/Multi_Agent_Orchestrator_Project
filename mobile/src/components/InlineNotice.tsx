import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";

export function InlineNotice({
  title,
  message,
  tone = "neutral",
}: {
  title: string;
  message: string;
  tone?: "neutral" | "error";
}) {
  const theme = useTheme();
  const color =
    tone === "error"
      ? { bg: theme.colors.errorMuted, border: theme.colors.error, text: theme.colors.error }
      : { bg: theme.colors.panelMuted, border: theme.colors.border, text: theme.colors.textMuted };

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.bg,
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ color: tone === "error" ? theme.colors.error : theme.colors.text, fontSize: 14, fontWeight: "700" }}>
        {title}
      </Text>
      <Text style={{ color: color.text, fontSize: 13, lineHeight: 20 }}>{message}</Text>
    </View>
  );
}
