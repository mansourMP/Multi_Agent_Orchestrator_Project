import { Redirect } from "expo-router";
import { Text, View } from "react-native";

import WelcomeScreen from "@/src/screens/WelcomeScreen";
import { useSessionState } from "@/src/lib/session-context";

export default function HomeScreen() {
  const { hydrated, session } = useSessionState();

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0F1115",
          justifyContent: "center",
          paddingHorizontal: 28,
        }}
      >
        <Text style={{ color: "#F5F1EA", fontSize: 32, fontWeight: "800", letterSpacing: -0.8 }}>
          Starting Empyralis
        </Text>
        <Text style={{ color: "#9B9790", fontSize: 16, lineHeight: 24, marginTop: 10 }}>
          Loading your mobile session.
        </Text>
      </View>
    );
  }

  if (session?.runtimeKey) {
    return <Redirect href="/chats" />;
  }

  return <WelcomeScreen />;
}
