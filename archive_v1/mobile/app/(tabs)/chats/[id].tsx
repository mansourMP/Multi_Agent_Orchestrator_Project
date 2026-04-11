import { useLocalSearchParams } from "expo-router";

import ChatScreen from "@/src/screens/ChatScreen";

export default function ChatThreadRoute() {
  const params = useLocalSearchParams<{ id?: string }>();

  return <ChatScreen sessionId={String(params.id || "")} />;
}
