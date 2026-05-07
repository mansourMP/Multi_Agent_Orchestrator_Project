import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MotionPressable } from "@/src/components/system/MotionPressable";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 28,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            borderRadius: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            paddingHorizontal: 22,
            paddingVertical: 26,
            gap: 20,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 32,
              lineHeight: 38,
              letterSpacing: -0.8,
              fontFamily: "Fraunces_700Bold",
              textAlign: "center",
            }}
          >
            Welcome to Empyralis
          </Text>

          <View style={{ gap: 12 }}>
            <MotionPressable
              onPress={() => router.push("/login")}
              style={{
                minHeight: 52,
                paddingHorizontal: 18,
                borderRadius: 18,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "DMSans_700Bold" }}>
                Set up Sage
              </Text>
            </MotionPressable>

            <MotionPressable
              onPress={() => router.push("/apps")}
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                Or open Discover
              </Text>
            </MotionPressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
