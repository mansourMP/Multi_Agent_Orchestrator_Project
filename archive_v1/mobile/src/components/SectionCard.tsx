import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panel,
        padding: 18,
        gap: 14,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 }}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
