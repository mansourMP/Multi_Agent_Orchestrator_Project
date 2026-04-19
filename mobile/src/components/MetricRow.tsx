import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";

export function MetricRow({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{
            flex: 1,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 }}>
            {item.label}
          </Text>
          <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: "700" }}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}
