import { Redirect } from "expo-router";

import { useSessionState } from "@/src/lib/session-context";

export default function HomeScreen() {
  const { hydrated, session } = useSessionState();

  if (!hydrated) {
    return null;
  }

  return <Redirect href={session?.runtimeKey ? "/chats" : "/login"} />;
}
