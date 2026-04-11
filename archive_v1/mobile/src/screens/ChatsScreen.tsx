import React, { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { SurfaceStatusBanner } from "@/src/components/SurfaceStatusBanner";
import {
  buildAgentThreadFromInstall,
  getFallbackSpecialists,
  getPrimaryAgent,
  type AgentThread,
} from "@/src/lib/agents";
import { useMobileChatContext, useMobileOverviewData } from "@/src/lib/mobile-data";
import { sessionHasRuntimeAccess } from "@/src/lib/session";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const { approvals } = useMobileOverviewData();
  const chatContextQuery = useMobileChatContext();
  const sessions = useChatStore((state) => state.sessions);
  const createSession = useChatStore((state) => state.createSession);
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);

  const connected = sessionHasRuntimeAccess(session);
  const sage = getPrimaryAgent();
  const unseenChanges = Number(chatContextQuery.data?.personalContext.summary?.unseen_count || 0);
  const specialistCount = chatContextQuery.data?.specialistInstalls.length ?? 0;
  const pendingApprovals = approvals.length;
  const degradedMessage = chatContextQuery.statusMessage || null;

  const specialistChannels = useMemo(() => {
    const installs = chatContextQuery.data?.specialistInstalls ?? [];
    if (installs.length > 0) {
      return installs.map((install) => buildAgentThreadFromInstall(install));
    }
    return getFallbackSpecialists();
  }, [chatContextQuery.data?.specialistInstalls]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  const findSessionForAgent = React.useCallback(
    (agent: AgentThread) =>
      sortedSessions.find((item) => item.agentId === agent.id || (agent.id === sage.id && item.agentId === "assistant")),
    [sage.id, sortedSessions],
  );

  const openChannel = React.useCallback(
    (agent: AgentThread) => {
      const sessionId = ensureSessionForAgent(agent);
      router.push(`/chats/${sessionId}`);
    },
    [ensureSessionForAgent, router],
  );

  const startNewSageThread = React.useCallback(() => {
    const sessionId = createSession(sage);
    router.push(`/chats/${sessionId}`);
  }, [createSession, router, sage]);

  const subtitle = connected
    ? "Sage stays pinned. Specialists sit below it as separate channels."
    : "Preview the channel model now. Pair and connect to load live specialists.";

  const sageSession = findSessionForAgent(sage);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Chat"
        subtitle={subtitle}
        action={{
          accessibilityLabel: "Start a new Sage thread",
          icon: "add",
          onPress: startNewSageThread,
          variant: "primary",
        }}
      />

      {!connected ? (
        <View
          style={{
            marginBottom: 14,
            padding: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            Sign in to your cloud workspace
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
            Mobile is cloud-first now. Advanced pairing and runtime overrides still exist in session settings for local companion testing.
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push("/session")}
            style={{
              height: 42,
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Open sign-in</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {degradedMessage ? (
        <View style={{ marginBottom: 14 }}>
          <SurfaceStatusBanner message={degradedMessage} />
        </View>
      ) : null}

      <Text
        style={{
          fontSize: 11,
          fontFamily: "DMSans_700Bold",
          color: theme.colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        }}
      >
        Pinned
      </Text>

      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => openChannel(sage)}
        style={{
          marginTop: 10,
          padding: 18,
          borderRadius: 22,
          backgroundColor: "#0F172A",
          gap: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: "rgba(255,255,255,0.14)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={sage.icon as any} size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: "#FFFFFF" }}>
                  {sage.label}
                </Text>
                <View
                  style={{
                    height: 22,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.14)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.8 }}>
                    PINNED
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: "rgba(255,255,255,0.76)" }}>
                {connected
                  ? "Master channel for context review, follow-ups, and specialist orchestration."
                  : sage.subtitle}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.78)" />
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricPill label="Specialists" value={specialistCount || specialistChannels.length} tone="dark" />
          <MetricPill label="Unseen" value={unseenChanges} tone="dark" />
          <MetricPill label="Approvals" value={pendingApprovals} tone="dark" />
        </View>

        <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.76)" }} numberOfLines={2}>
          {sageSession?.messages[sageSession.messages.length - 1]?.speech?.trim() || "Open Sage to start the main conversation."}
        </Text>
      </TouchableOpacity>

      <Text
        style={{
          marginTop: 22,
          fontSize: 11,
          fontFamily: "DMSans_700Bold",
          color: theme.colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 1.1,
        }}
      >
        Specialist Channels
      </Text>

      <View style={{ marginTop: 10, gap: 10 }}>
        {specialistChannels.map((agent) => {
          const sessionForAgent = findSessionForAgent(agent);
          return (
            <TouchableOpacity
              key={agent.id}
              activeOpacity={0.84}
              onPress={() => openChannel(agent)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: agent.avatarColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={agent.icon as any} size={20} color="#FFFFFF" />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }} numberOfLines={1}>
                    {agent.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                    {formatTimestamp(sessionForAgent?.updatedAt)}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }} numberOfLines={2}>
                  {sessionForAgent?.messages[sessionForAgent.messages.length - 1]?.speech?.trim() || agent.subtitle || "Ready for a focused conversation."}
                </Text>
              </View>

              <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          );
        })}
      </View>

      {!!sortedSessions.length ? (
        <>
          <Text
            style={{
              marginTop: 22,
              fontSize: 11,
              fontFamily: "DMSans_700Bold",
              color: theme.colors.textSecondary,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            }}
          >
            Recent Activity
          </Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {sortedSessions.slice(0, 4).map((sessionItem) => (
              <TouchableOpacity
                key={sessionItem.id}
                activeOpacity={0.84}
                onPress={() => router.push(`/chats/${sessionItem.id}`)}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }} numberOfLines={1}>
                    {sessionItem.agentName}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatTimestamp(sessionItem.updatedAt)}</Text>
                </View>
                <Text style={{ fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary }} numberOfLines={2}>
                  {sessionItem.messages[sessionItem.messages.length - 1]?.speech?.trim() || sessionItem.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "dark" | "light";
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: tone === "dark" ? "rgba(255,255,255,0.12)" : "#111827",
      }}
    >
      <Text style={{ color: tone === "dark" ? "rgba(255,255,255,0.74)" : "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
        {label}
      </Text>
      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}
