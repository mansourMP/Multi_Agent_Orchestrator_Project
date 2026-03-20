import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";

export function ListRow({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 }}>{subtitle}</Text>
      ) : null}
      {meta ? <Text style={{ color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 }}>{meta}</Text> : null}
    </View>
  );
}
