import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import {
  buildAgentThreadFromInstall,
  getFallbackSpecialists,
  getPrimaryAgent,
  type AgentThread,
} from "@/src/lib/agents";
import { useMobileChatContext } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type AgentRowModel = {
  thread: AgentThread;
  subtitle: string;
};

function humanizeToken(value: string, fallback: string) {
  const token = String(value || "").trim();
  if (!token) return fallback;
  return token
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function readChannelLabel(install: Record<string, any> | null | undefined) {
  const channelBindings = install?.channel_bindings && typeof install.channel_bindings === "object"
    ? install.channel_bindings
    : {};
  for (const [channelKey, binding] of Object.entries(channelBindings)) {
    if (binding === true) {
      return humanizeToken(channelKey, "Channel");
    }
    if (binding && typeof binding === "object" && Boolean((binding as Record<string, unknown>).enabled)) {
      return humanizeToken(channelKey, "Channel");
    }
  }

  const metadata = install?.metadata && typeof install.metadata === "object" ? install.metadata : {};
  const manifest = metadata.manifest && typeof metadata.manifest === "object" ? metadata.manifest : {};
  const manifestChannels = manifest.channels && typeof manifest.channels === "object" ? manifest.channels : {};
  for (const [channelKey, enabled] of Object.entries(manifestChannels)) {
    if (enabled) {
      return humanizeToken(channelKey, "Channel");
    }
  }

  return "No channel";
}

function readStatusLabel(install: Record<string, any> | null | undefined) {
  const metadata = install?.metadata && typeof install.metadata === "object" ? install.metadata : {};
  const specialistMode = String(metadata.specialist_mode || "").trim().toLowerCase();
  const status = String(install?.status || metadata.status || "").trim().toLowerCase();

  if (specialistMode === "customer_live") return "Live";
  if (specialistMode === "owner_test") return "Test";
  if (specialistMode === "owner_edit") return "Draft";
  if (status === "active") return "Live";
  if (status === "paused") return "Paused";
  if (status === "draft") return "Draft";
  if (status) return humanizeToken(status, "Unknown");
  return "Unknown";
}

function AgentRow({
  theme,
  label,
  subtitle,
  icon,
  avatarColor,
  onPress,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  subtitle: string;
  icon: string;
  avatarColor: string;
  onPress: () => void;
}) {
  return (
    <MotionPressable
      onPress={onPress}
      style={{
        minHeight: 84,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: avatarColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon as any} size={18} color="#FFFFFF" />
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: "DMSans_700Bold",
            color: theme.colors.text,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: theme.colors.textSecondary,
          }}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
    </MotionPressable>
  );
}

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const chatContextQuery = useMobileChatContext();
  const sessions = useChatStore((state) => state.sessions);
  const createSession = useChatStore((state) => state.createSession);
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);

  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const sage = getPrimaryAgent();

  const specialistRows = useMemo<AgentRowModel[]>(() => {
    const installs = chatContextQuery.data?.specialistInstalls ?? [];
    if (installs.length > 0) {
      return installs.map((install) => {
        const thread = buildAgentThreadFromInstall(install);
        return {
          thread,
          subtitle: `${readChannelLabel(install)} · ${readStatusLabel(install)}`,
        };
      });
    }
    return getFallbackSpecialists().map((thread) => ({
      thread,
      subtitle: "No channel · Draft",
    }));
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
      router.push(`/chats/${sessionId}?agentId=${encodeURIComponent(agent.id)}&specialistId=${encodeURIComponent(agent.specialistId || agent.id)}`);
    },
    [ensureSessionForAgent, router],
  );

  const startNewSageThread = React.useCallback(() => {
    const sessionId = createSession(sage);
    router.push(`/chats/${sessionId}`);
  }, [createSession, router, sage]);

  const sageSession = findSessionForAgent(sage);
  const sageSubtitle = sageSession?.messages[sageSession.messages.length - 1]?.speech?.trim()
    || "Your personal AI assistant";
  const headerSubtitle = connected
    ? "Open Sage or any of your deployed agents."
    : "Pair this phone with your workspace to load Sage and your agents.";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Agents"
        subtitle={headerSubtitle}
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
            marginBottom: 16,
            padding: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            Pair the phone with your desktop workspace
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
            QR pairing opens the session setup with runtime values prefilled. The fallback pairing code does the same if scanning is not available.
          </Text>
          <ActionButton
            label="Open pairing"
            variant="primary"
            onPress={() => router.push("/session")}
            style={{ alignSelf: "flex-start", marginTop: 2 }}
          />
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
        Sage
      </Text>

      <View style={{ marginTop: 10 }}>
        <AgentRow
          theme={theme}
          label={sage.label}
          subtitle={sageSubtitle}
          icon={sage.icon}
          avatarColor={sage.avatarColor}
          onPress={() => openChannel(sage)}
        />
      </View>

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
        Your Agents
      </Text>

      <View style={{ marginTop: 10, gap: 10 }}>
        {specialistRows.length > 0 ? (
          specialistRows.map(({ thread, subtitle }) => (
            <AgentRow
              key={thread.id}
              theme={theme}
              label={thread.label}
              subtitle={subtitle}
              icon={thread.icon}
              avatarColor={thread.avatarColor}
              onPress={() => openChannel(thread)}
            />
          ))
        ) : (
          <View
            style={{
              minHeight: 84,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              No agents yet
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary }}>
              Create a specialist in Studio and it will appear here as its own independent agent.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
