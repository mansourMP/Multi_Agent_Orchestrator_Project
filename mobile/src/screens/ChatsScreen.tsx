import React, { useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { buildAgentDirectory } from "@/src/lib/agents";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useChatStore } from "@/src/stores/chatStore";

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { agents } = useMobileOverviewData();
  const sessions = useChatStore((state) => state.sessions);
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);

  const rows = useMemo(() => {
    const directory = buildAgentDirectory(agents);

    return directory
      .map((agent) => {
        const session = sessions.find((item) => item.agentId === agent.id);
        const lastMessage = session?.messages[session.messages.length - 1];

        return {
          agent,
          preview: lastMessage?.speech?.trim() || agent.subtitle || agent.intro,
          timestamp: session?.updatedAt,
        };
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || a.agent.label.localeCompare(b.agent.label));
  }, [agents, sessions]);

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 32, fontFamily: "Fraunces_700Bold", color: "#111827" }}>Chats</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <HeaderSearchButton />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/chats/settings")}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="settings-outline" size={18} color="#111827" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.agent.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ marginLeft: 84, height: 1, backgroundColor: "#E5E7EB" }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => {
              ensureSessionForAgent(item.agent);
              router.push(`/chats/${item.agent.id}`);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 14,
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: item.agent.avatarColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={item.agent.icon as any} size={22} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 17, fontFamily: "DMSans_700Bold", color: "#111827" }} numberOfLines={1}>
                  {item.agent.label}
                </Text>
                <Text style={{ fontSize: 12, color: "#6B7280", marginLeft: 12 }}>
                  {formatTimestamp(item.timestamp)}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  color: "#6B7280",
                  lineHeight: 20,
                }}
              >
                {item.preview}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
