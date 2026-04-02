import React, { useMemo } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { getPrimaryAgent } from "@/src/lib/agents";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessions = useChatStore((state) => state.sessions);
  const createSession = useChatStore((state) => state.createSession);
  const kin = getPrimaryAgent();

  const rows = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((session) => {
          const lastMessage = session.messages[session.messages.length - 1];
          return {
            id: session.id,
            title: session.title || "New thread",
            preview: lastMessage?.speech?.trim() || "",
            timestamp: session.updatedAt,
          };
        }),
    [sessions],
  );

  const handleNewChat = () => {
    const sessionId = createSession(kin);
    router.push(`/kin/${sessionId}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: theme.colors.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 30, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>KIN</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: theme.colors.textSecondary }}>
            One visible intelligence. Apps and workers stay behind the scenes.
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <HeaderSearchButton />
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleNewChat}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View
            style={{
              marginTop: 12,
              padding: 18,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 17, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>No threads yet</Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleNewChat}
              style={{
                marginTop: 4,
                height: 40,
                paddingHorizontal: 16,
                borderRadius: 14,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#FFFFFF" }}>New thread</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => router.push(`/kin/${item.id}`)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 15,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 22,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: kin.avatarColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={kin.icon as any} size={22} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 17, fontFamily: "DMSans_700Bold", color: theme.colors.text }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginLeft: 12 }}>
                  {formatTimestamp(item.timestamp)}
                </Text>
              </View>
              {item.preview ? (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 4,
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    lineHeight: 20,
                  }}
                >
                  {item.preview}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
