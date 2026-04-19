import { Text, View } from "react-native";

import { useTheme } from "@/src/theme";

export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.title, fontFamily: "Fraunces_700Bold" }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
        {subtitle}
      </Text>
    </View>
  );
}
