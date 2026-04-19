import { useLocalSearchParams } from "expo-router";

import ChatScreen from "@/src/screens/ChatScreen";

export default function ChatThreadRoute() {
  const params = useLocalSearchParams<{ id?: string; agentId?: string; specialistId?: string }>();

  return (
    <ChatScreen
      sessionId={String(params.id || "")}
      agentId={typeof params.agentId === "string" ? params.agentId : undefined}
      specialistId={typeof params.specialistId === "string" ? params.specialistId : undefined}
    />
  );
}
