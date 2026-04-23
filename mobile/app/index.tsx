import { Redirect } from "expo-router";

import WelcomeScreen from "@/src/screens/WelcomeScreen";
import { useSessionState } from "@/src/lib/session-context";

export default function HomeScreen() {
  const { hydrated, session } = useSessionState();

  if (!hydrated) {
    return null;
  }

  if (session?.runtimeKey) {
    return <Redirect href="/chats" />;
  }

  return <WelcomeScreen />;
}
