import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useChatStore } from "@/src/stores/chatStore";
import { useThemeStore } from "@/src/stores/themeStore";

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { clearAllSessions } = useChatStore();
  const { mode, setMode } = useThemeStore();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const statusQuery = useQuery({
    queryKey: ["settings-core-status", session?.runtimeUrl, session?.workspaceId],
    enabled,
    queryFn: async () => mobileApi.getCoreStatus(session!),
    refetchInterval: 15000,
  });

  const connected = enabled && !statusQuery.isError;
  const runtimeOk = Boolean(statusQuery.data?.runtime?.ok);

  const handleClearChat = () => {
    clearAllSessions();
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: Math.max(insets.top, 12), paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Fraunces_700Bold", color: theme.colors.text, marginLeft: 8 }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Core connection and configuration
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10 }}>Appearance</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["dark", "light", "system"] as const).map((value) => {
                const selected = mode === value;
                return (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setMode(value)}
                    style={{
                      paddingHorizontal: 12,
                      height: 30,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: selected ? "#fff" : theme.colors.text }}>
                      {value === "dark" ? "Dark" : value === "light" ? "Light" : "System"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 }}>Core Connection</Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              {session?.runtimeUrl || "Not configured"}
            </Text>
          </View>

          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 }}>Platform Registry</Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              {session?.platformUrl || "Preview mode only"}
            </Text>
          </View>

          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 }}>Status</Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              {connected ? "● Connected" : "○ Offline"}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 6 }}>
              {runtimeOk ? "Model Ready" : "Model Unavailable"}
            </Text>
          </View>

          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 }}>Space</Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>
              {session?.workspaceId || "default"}
            </Text>
          </View>

          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
            }}
            onPress={() => router.push("/session")}
          >
            <Text style={{ fontSize: 14, color: theme.colors.text }}>Configure Session</Text>
          </TouchableOpacity>

          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 8 }} />

          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.error + '40',
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
            }}
            onPress={handleClearChat}
          >
            <Text style={{ fontSize: 14, color: theme.colors.error }}>Clear All Conversations</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
