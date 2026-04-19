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
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panel,
        padding: 20,
        gap: 16,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontFamily: "DMSans_700Bold" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13.5, lineHeight: 20 }}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
