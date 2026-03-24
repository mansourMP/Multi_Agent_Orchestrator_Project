import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { buildAgentDirectory } from "@/src/lib/agents";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function formatRelativeTime(value?: string) {
  if (!value) return "Just now";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "Recent";
  const diffMinutes = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { agents: discoveredAgents, runs, approvals, loading } = useMobileOverviewData();
  const agents = useMemo(() => buildAgentDirectory(discoveredAgents), [discoveredAgents]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const runsById = useMemo(() => new Map(runs.map((run) => [run.run_id, run])), [runs]);

  const attentionItems = useMemo(() => {
    return approvals
      .slice(0, 3)
      .map((approval) => {
        const relatedRun = runsById.get(approval.run_id);
        const agent =
          agents.find((item) => item.runtimeRole === relatedRun?.agent_role || item.id === relatedRun?.agent_role) ||
          agents[0];

        return {
          id: approval.approval_id,
          agent,
          description: approval.summary || `${approval.action} is waiting for your approval.`,
        };
      })
      .filter((item) => item.agent && !dismissed.includes(item.id));
  }, [agents, approvals, dismissed, runsById]);

  const activityFeed = useMemo(() => {
    return [...runs]
      .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
      .slice(0, 5)
      .map((run) => {
        const agent =
          agents.find((item) => item.runtimeRole === run.agent_role || item.id === run.agent_role) ||
          agents[0];
        return {
          id: run.run_id,
          agent: agent?.label || "Agent",
          action: run.summary || `Run ${run.status.toLowerCase()}`,
          time: formatRelativeTime(run.started_at),
        };
      });
  }, [agents, runs]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 32 }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 30, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Today</Text>
          <Text style={{ marginTop: 4, fontSize: 15, color: theme.colors.textSecondary }}>{dateLabel}</Text>
        </View>
        <HeaderSearchButton />
      </View>

      <View
        style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase" }}>
          Daily brief
        </Text>
        <Text style={{ marginTop: 8, fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
          Good morning
        </Text>
        <Text style={{ marginTop: 6, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>
          {connected
            ? "Your agents are tracking what needs attention, what changed, and what can wait."
            : "Connect your runtime to turn this into a live daily brief instead of a static shell."}
        </Text>
      </View>

      {!connected ? (
        <View
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 14, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>Runtime not connected</Text>
          <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary }}>
            Add your server URL, API key, and workspace in Settings before expecting live alerts.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/chats/settings")}
            style={{
              marginTop: 14,
              height: 40,
              paddingHorizontal: 16,
              alignSelf: "flex-start",
              borderRadius: 14,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Open settings</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={{ marginTop: 28, fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase" }}>
        Needs attention
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        {loading && !attentionItems.length ? (
          <View
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>Loading agent signals...</Text>
          </View>
        ) : null}
        {attentionItems.map((item) => (
          <View
            key={item.id}
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: item.agent.avatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={item.agent.icon as any} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{item.agent.label}</Text>
                <Text style={{ marginTop: 4, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 21 }}>{item.description}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/chats/${item.agent.id}`)}
                    style={{
                      height: 36,
                      paddingHorizontal: 15,
                      borderRadius: 18,
                      backgroundColor: theme.colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#FFFFFF", fontWeight: "700" }}>Review</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDismissed((current) => [...current, item.id])}
                    style={{
                      height: 36,
                      paddingHorizontal: 15,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: "700" }}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}
        {!loading && connected && attentionItems.length === 0 ? (
          <View
            style={{
              padding: 16,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 14, color: theme.colors.text }}>Nothing urgent right now.</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: theme.colors.textSecondary }}>
              New approvals and agent alerts will appear here.
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={{ marginTop: 28, fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase" }}>
        Agent activity
      </Text>
      <View
        style={{
          marginTop: 12,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          overflow: "hidden",
        }}
      >
        {activityFeed.map((item, index) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: index === activityFeed.length - 1 ? "transparent" : theme.colors.border,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{item.agent}</Text>
              <Text style={{ marginTop: 3, fontSize: 14, color: theme.colors.textSecondary }}>{item.action}</Text>
            </View>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{item.time}</Text>
          </View>
        ))}
        {!loading && connected && activityFeed.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
            <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>No recent run activity yet.</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
