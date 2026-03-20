import { Link } from "expo-router";
import { Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function NotFoundScreen() {
  const theme = useTheme();

  return (
    <MobileScreen>
      <View
        style={{
          flex: 1,
          minHeight: 320,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: "700" }}>Screen not found</Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: "center", maxWidth: 280 }}>
          This route does not exist in Mobile V1. Return to the main cockpit.
        </Text>
        <Link
          href="/"
          style={{
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.primary,
            color: "#FFFFFF",
            fontWeight: "700",
          }}
        >
          Go home
        </Link>
      </View>
    </MobileScreen>
  );
}
