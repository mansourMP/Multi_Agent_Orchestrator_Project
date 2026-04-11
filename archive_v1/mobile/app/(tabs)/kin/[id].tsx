import { useLocalSearchParams } from "expo-router";

import ChatScreen from "@/src/screens/ChatScreen";

export default function KinThreadRoute() {
  const params = useLocalSearchParams<{ id?: string }>();

  return <ChatScreen sessionId={String(params.id || "")} />;
}
