import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TransientBanner } from "@/src/components/TransientBanner";
import { SurfaceStatusBanner } from "@/src/components/SurfaceStatusBanner";
import { InputBar } from "@/src/components/InputBar";
import { AgentPayload } from "@/src/components/Renderer";
import {
  buildAgentThreadFromInstall,
  getPrimaryAgent,
  type AgentThread,
} from "@/src/lib/agents";
import { mobileApi } from "@/src/lib/api";
import { useMobileChatContext, useMobileOverviewData } from "@/src/lib/mobile-data";
import { sessionHasRuntimeAccess } from "@/src/lib/session";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore, type ChatSession } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import { useAppContextStore } from "@/src/stores/appContextStore";

type ApprovalCard = {
  kind?: "run" | "direct";
  action: string;
  target?: string;
  reason?: string;
  approvalId?: string;
  runId?: string;
  connector?: string;
  actionId?: string;
  input?: string;
};

const SPACING = { sm: 8, md: 16, lg: 24 };

type ChatScreenProps = {
  sessionId: string;
};

type KinThinkingIndicatorProps = {
  theme: ReturnType<typeof useTheme>;
  loadingDotOpacities: Animated.Value[];
};

function KinThinkingIndicator({ theme, loadingDotOpacities }: KinThinkingIndicatorProps) {
  const orbPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(orbPulse, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      orbPulse.stopAnimation();
      orbPulse.setValue(0);
    };
  }, [orbPulse]);

  const orbOpacity = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });
  const orbShadowRadius = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });
  const orbShadowOpacity = orbPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        alignSelf: "flex-start",
      }}
    >
      <Animated.View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.textSecondary,
          opacity: orbOpacity,
          shadowColor: theme.colors.textSecondary,
          shadowRadius: Platform.OS === "ios" ? orbShadowRadius : 0,
          shadowOpacity: Platform.OS === "ios" ? orbShadowOpacity : 0,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: "700",
          color: theme.colors.textSecondary,
          letterSpacing: -0.2,
        }}
      >
        Thinking
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {loadingDotOpacities.map((opacity, dot) => (
          <Animated.View
            key={dot}
            style={{
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: theme.colors.textSecondary,
              opacity,
            }}
          />
        ))}
      </View>
    </View>
  );
}

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

function normalizeBackendThreadMessages(
  turns: Array<{
    role?: string;
    content?: string;
    approvals?: Record<string, any>[];
  }> | undefined,
): AgentPayload[] {
  const items = Array.isArray(turns) ? turns : [];
  const messages: AgentPayload[] = [];
  for (const turn of items) {
    const role = String(turn?.role || "").trim().toLowerCase();
    const speech = String(turn?.content || "").trim();
    const approvals = Array.isArray(turn?.approvals) ? turn.approvals : [];
    if (!speech && approvals.length === 0) continue;
    const firstApproval = approvals[0] && typeof approvals[0] === "object" ? approvals[0] as Record<string, any> : null;
    if (firstApproval) {
      messages.push({
        intent: role === "user" ? "user" : "assistant",
        speech: speech || "Approval required",
        messageType: "approval",
        approval: {
          kind: "run",
          action: String(firstApproval.action || firstApproval.label || "Approval required").trim() || "Approval required",
          target: typeof firstApproval.target === "string" ? firstApproval.target : undefined,
          reason: typeof firstApproval.prompt === "string" ? firstApproval.prompt : undefined,
          approvalId: typeof firstApproval.approval_id === "string" ? firstApproval.approval_id : undefined,
          runId: typeof firstApproval.run_id === "string" ? firstApproval.run_id : undefined,
        },
      });
      continue;
    }
    messages.push({
      intent: role === "user" ? "user" : "assistant",
      speech,
    });
  }
  return messages;
}

function resolveAgentThread(
  session: ChatSession | undefined,
  specialistInstalls: Record<string, any>[],
  sage: AgentThread,
): AgentThread {
  if (!session) {
    return sage;
  }

  if (session.agentId === sage.id || session.agentId === "assistant") {
    return sage;
  }

  const normalizedSessionName = String(session.agentName || "").trim().toLowerCase();
  const matchingInstall = specialistInstalls.find((install) => {
    const installId = String(install?.id || "").trim();
    const installLabel = String(
      install?.label ||
        install?.metadata?.manifest?.identity?.name ||
        install?.metadata?.identity?.name ||
        "",
    )
      .trim()
      .toLowerCase();
    return installId === session.agentId || (installLabel && installLabel === normalizedSessionName);
  });

  if (matchingInstall) {
    return buildAgentThreadFromInstall(matchingInstall);
  }

  return {
    id: session.agentId || "specialist",
    label: session.agentName || "Specialist",
    runtimeRole: session.runtimeRole,
    subtitle: session.runtimeRole ? `${session.runtimeRole} channel` : "Scoped specialist channel",
    icon: session.icon || "sparkles",
    avatarColor: session.avatarColor || "#111827",
    intro: `Scoped channel for ${session.agentName || "specialist"} work.`,
  };
}

export default function ChatScreen({ sessionId }: ChatScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const {
    sessions,
    createSession,
    addMessage,
    updateMessage,
    setActiveSession,
    setSessionTitle,
    setSessionDraft,
    setSessionBackendThreadId,
    replaceSessionMessages,
  } = useChatStore();
  const activeApp = useAppContextStore((state) => state.activeApp);
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessageIndex, setFailedMessageIndex] = useState<number | null>(null);
  const [runActivity, setRunActivity] = useState<string[]>([]);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"customer" | "owner">("customer");
  const { banner, showBanner } = useTransientBanner();
  const overview = useMobileOverviewData();
  const chatContextQuery = useMobileChatContext();
  const sage = getPrimaryAgent();
  const messagesListRef = useRef<FlatList<AgentPayload>>(null);
  const loadingDotOpacities = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  const loadingDotAnimationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const activeSession = sessions.find((item) => item.id === sessionId);
  const specialistInstalls = useMemo(
    () => chatContextQuery.data?.specialistInstalls ?? [],
    [chatContextQuery.data?.specialistInstalls],
  );
  const activeAgent = useMemo(
    () => resolveAgentThread(activeSession, specialistInstalls, sage),
    [activeSession, sage, specialistInstalls],
  );
  const draft = activeSession?.draft || "";
  const messages = activeSession?.messages || [];
  const lastMessageSpeech = messages[messages.length - 1]?.speech || "";
  const recentSessions = useMemo(() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);
  const pendingApprovals = overview.approvals.length;
  const liveRuns = overview.runs.length;
  const unseenChanges = Number(chatContextQuery.data?.personalContext.summary?.unseen_count || 0);
  const recentChanges = (chatContextQuery.data?.personalContext.recentChanges ?? []).slice(0, 3);
  const degradedMessage = chatContextQuery.statusMessage || overview.statusMessage;
  const channelLabel = activeAgent.label;
  const channelRole = activeSession?.runtimeRole || activeAgent.runtimeRole || "specialist";
  const channelSubtitle = viewMode === "owner"
    ? "Owner controls for this mobile thread"
    : activeApp
      ? `Using ${activeApp.name} app context`
      : activeAgent.id === sage.id
        ? "Pinned Sage channel"
        : "Specialist customer thread";
  const latestRunActivity = runActivity[runActivity.length - 1];
  const outboundThreadId = useMemo(() => {
    if (activeAgent.id === sage.id) return undefined;
    const token = String(activeSession?.backendThreadId || sessionId).trim();
    return token || undefined;
  }, [activeAgent.id, activeSession?.backendThreadId, sage.id, sessionId]);

  const scrollToBottom = React.useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (activeSession?.id) {
      setActiveSession(activeSession.id);
      return;
    }

    const nextSessionId = createSession(sage);
    router.replace(`/chats/${nextSessionId}`);
  }, [activeSession?.id, createSession, router, sage, setActiveSession]);

  useEffect(() => {
    if (!activeSession?.id || activeAgent.id !== sage.id) return;
    const backendThreadId = String(chatContextQuery.data?.threadId || "").trim();
    if (!backendThreadId || activeSession.backendThreadId === backendThreadId) return;
    setSessionBackendThreadId(activeSession.id, backendThreadId);
  }, [
    activeAgent.id,
    activeSession?.backendThreadId,
    activeSession?.id,
    chatContextQuery.data?.threadId,
    sage.id,
    setSessionBackendThreadId,
  ]);

  useEffect(() => {
    if (!activeSession?.id || activeAgent.id !== sage.id) return;
    if ((activeSession.messages || []).length > 0) return;
    const backendThreadId = String(chatContextQuery.data?.threadId || "").trim();
    const turns = chatContextQuery.data?.thread?.turns ?? [];
    if (!backendThreadId || !turns.length) return;
    const messagesFromBackend = normalizeBackendThreadMessages(turns);
    if (!messagesFromBackend.length) return;
    replaceSessionMessages(activeSession.id, messagesFromBackend, {
      title: String(chatContextQuery.data?.thread?.title || "").trim() || undefined,
      backendThreadId,
    });
  }, [
    activeAgent.id,
    activeSession?.id,
    activeSession?.messages,
    chatContextQuery.data?.thread?.title,
    chatContextQuery.data?.thread?.turns,
    chatContextQuery.data?.threadId,
    replaceSessionMessages,
    sage.id,
  ]);

  useEffect(() => {
    scrollToBottom(false);
  }, [isLoading, lastMessageSpeech, messages.length, scrollToBottom]);

  useEffect(() => {
    loadingDotAnimationsRef.current.forEach((animation) => animation.stop());
    loadingDotAnimationsRef.current = [];

    if (!isLoading) {
      loadingDotOpacities.forEach((opacity) => {
        opacity.stopAnimation();
        opacity.setValue(0.3);
      });
      return;
    }

    const animations = loadingDotOpacities.map((opacity, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loadingDotAnimationsRef.current = animations;
    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [isLoading, loadingDotOpacities]);

  const handleMediaUpload = (_formData?: FormData) => {
    showBanner("Uploads will land through the file bridge soon. Use pairing or desktop export for now.", "error");
  };

  const appendRunActivity = (label: string) => {
    const next = label.trim();
    if (!next) return;
    setRunActivity((current) => {
      if (current[current.length - 1] === next) return current;
      if (current.includes(next)) return current;
      return [...current, next];
    });
  };

  const sendMessage = async (textOverride?: string) => {
    if (!activeSession?.id) return;
    const finalInput = (textOverride || draft).trim();
    if (!finalInput) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const userMessage: AgentPayload = { intent: "user", speech: finalInput };
    const nextUserMessageIndex = messages.length;
    const placeholderIndex = nextUserMessageIndex + 1;
    const priorMessages = messages
      .filter((message) => message.messageType !== "approval" && message.speech?.trim())
      .slice(-6)
      .map((message) => ({
        role: message.intent === "user" ? "user" : "assistant",
        content: message.speech.trim(),
      })) as { role: "user" | "assistant"; content: string }[];

    addMessage(sessionId, userMessage);
    addMessage(sessionId, { intent: "assistant", speech: "" });
    if (activeSession.title === "New thread") {
      setSessionTitle(sessionId, finalInput.slice(0, 60));
    }
    setFailedMessageIndex(null);
    setSessionDraft(sessionId, "");
    setIsLoading(true);
    setRunActivity(["Contacting Empyralis cloud", "Waiting for response"]);

    const runtimeSession = session;
    if (!runtimeSession || !sessionHasRuntimeAccess(runtimeSession)) {
      setFailedMessageIndex(nextUserMessageIndex);
      updateMessage(sessionId, placeholderIndex, {
        speech: "Sign in to your Empyralis account first. Advanced local runtime fallback is only needed for companion testing.",
      });
      setIsLoading(false);
      setRunActivity([]);
      showBanner("Sign in to your Empyralis account first. Advanced local runtime fallback is only for testing.", "error");
      return;
    }

    try {
      let streamedReply = "";
      const payload = await mobileApi.respondChat(
        runtimeSession,
        {
          message: finalInput,
          clientSessionId: activeSession.id,
          threadId: activeAgent.id === sage.id ? undefined : outboundThreadId,
          provider: "",
          model: "",
          agentId: activeAgent.id,
          agentName: activeAgent.label,
          agentRole: channelRole,
          priorMessages,
        },
        {
          onChunk: (delta) => {
            streamedReply += delta;
            appendRunActivity("Streaming response");
            updateMessage(sessionId, placeholderIndex, {
              speech: streamedReply,
            });
          },
        },
      );
      const hasStructuredCards =
        (Array.isArray(payload.approvals) && payload.approvals.length > 0) ||
        (Array.isArray(payload.interventions) && payload.interventions.length > 0);

      updateMessage(sessionId, placeholderIndex, {
        speech: hasStructuredCards ? "" : (payload.reply || streamedReply || ""),
      });
      const responseThreadId = String(payload.thread_id || outboundThreadId || "").trim();
      if (responseThreadId) {
        setSessionBackendThreadId(sessionId, responseThreadId);
      }

      const approvalAction = payload.actions.find(
        (action) =>
          action.kind === "approval_required" &&
          action.connector &&
          action.action &&
          action.input,
      );

      if (approvalAction) {
        const firstApproval = Array.isArray(payload.approvals) ? payload.approvals[0] : null;
        const approvalCard: ApprovalCard = {
          kind: "direct",
          action: approvalAction.action || approvalAction.label || "Approval required",
          target: approvalAction.connector || undefined,
          reason: typeof firstApproval?.prompt === "string" ? firstApproval.prompt : "",
          connector: approvalAction.connector || undefined,
          actionId: approvalAction.action || undefined,
          input: approvalAction.input || undefined,
        };
        addMessage(sessionId, {
          intent: "assistant",
          speech: "Approval required",
          messageType: "approval",
          approval: approvalCard,
        } as AgentPayload);
      }

      setRunActivity([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Could not reach ${channelLabel}. Check the server connection.`;
      console.warn("Chat request failed:", message);
      setFailedMessageIndex(nextUserMessageIndex);
      updateMessage(sessionId, placeholderIndex, {
        speech: message,
      });
      setRunActivity([]);
      showBanner(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovalDecision = async (card: ApprovalCard, decision: "approved" | "rejected") => {
    const runtimeSession = session;
    if (!runtimeSession || !sessionHasRuntimeAccess(runtimeSession)) return;
    try {
      if (card.kind === "direct") {
        if (!activeSession?.id || !card.connector || !card.actionId || !card.input) return;
        if (decision !== "approved") {
          addMessage(activeSession.id, {
            intent: "assistant",
            speech: "Action canceled.",
          } as AgentPayload);
          showBanner("Action canceled.", "success");
          return;
        }
        const placeholderIndex = messages.length;
        addMessage(activeSession.id, {
          intent: "assistant",
          speech: "",
        } as AgentPayload);
        setIsLoading(true);
        setRunActivity(["Confirming approval", "Executing action"]);
        let streamedReply = "";
        const payload = await mobileApi.respondChat(
          runtimeSession,
          {
            message: "__approval_confirmed__",
            clientSessionId: activeSession.id,
            threadId: activeAgent.id === sage.id ? undefined : outboundThreadId,
            provider: "",
            model: "",
            agentId: activeAgent.id,
            agentName: activeAgent.label,
            agentRole: channelRole,
            approvedAction: {
              connector: card.connector,
              action: card.actionId,
              input: card.input,
            },
          },
          {
            onChunk: (delta) => {
              streamedReply += delta;
              updateMessage(activeSession.id, placeholderIndex, {
                speech: streamedReply,
              });
            },
          },
        );
        updateMessage(activeSession.id, placeholderIndex, {
          speech: payload.reply || streamedReply || "",
        });
        const responseThreadId = String(payload.thread_id || outboundThreadId || "").trim();
        if (responseThreadId) {
          setSessionBackendThreadId(activeSession.id, responseThreadId);
        }
        setRunActivity([]);
        setIsLoading(false);
        showBanner("Approval sent.", "success");
        return;
      }

      if (!card.approvalId || !card.runId) {
        return;
      }
      await mobileApi.resolveApproval(
        runtimeSession,
        card.runId,
        card.approvalId,
        decision,
      );
      if (!activeSession?.id) return;
      addMessage(activeSession.id, {
        intent: "assistant",
        speech: decision === "approved" ? "Approval sent. Executing now." : "Action canceled.",
      } as AgentPayload);
      showBanner(decision === "approved" ? "Approval sent." : "Action canceled.", "success");
    } catch (err) {
      console.warn("Approval resolution failed", err);
      if (!activeSession?.id) return;
      addMessage(activeSession.id, {
        intent: "assistant",
        speech: "Approval failed. Check core connection.",
      } as AgentPayload);
      setRunActivity([]);
      setIsLoading(false);
      showBanner("Approval failed.", "error");
      return;
    }
    setRunActivity([]);
    setIsLoading(false);
  };

  const renderMessage = ({ item, index }: { item: AgentPayload; index: number }) => {
    const isUser = item.intent === "user";

    if (item.messageType === "approval" && item.approval) {
      return (
        <View
          style={{
            alignSelf: "stretch",
            marginHorizontal: SPACING.md,
            marginVertical: SPACING.sm,
            borderRadius: 22,
            padding: SPACING.md,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Approval required
          </Text>
          <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text, marginTop: 6 }}>
            {item.approval.action}
          </Text>
          {item.approval.target ? (
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: SPACING.sm }}>
              {item.approval.target}
            </Text>
          ) : null}
          {item.approval.reason ? (
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: SPACING.sm }}>
              Reason: {item.approval.reason}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md }}>
            <TouchableOpacity
              style={{
                flex: 1,
                height: 42,
                borderRadius: 14,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => handleApprovalDecision(item.approval!, "approved")}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                height: 42,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => handleApprovalDecision(item.approval!, "rejected")}
            >
              <Text style={{ color: theme.colors.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (!item.speech?.trim()) return null;

    if (!isUser) {
      return (
        <View
          style={{
            paddingHorizontal: SPACING.md,
            paddingVertical: 8,
            maxWidth: "92%",
          }}
        >
          <Text
            style={{
              fontSize: 16,
              color: theme.colors.text,
              fontFamily: "DMSans_400Regular",
              lineHeight: 26,
            }}
          >
            {item.speech}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={{
          alignSelf: "flex-end",
          paddingHorizontal: SPACING.md,
          paddingVertical: 4,
          maxWidth: "78%",
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.accent,
            paddingHorizontal: 16,
            paddingVertical: 13,
            borderRadius: 20,
            borderBottomRightRadius: 10,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              color: "#fff",
              fontFamily: "DMSans_500Medium",
              lineHeight: 22,
            }}
          >
            {item.speech}
          </Text>
        </View>
        {failedMessageIndex === index ? (
          <Text
            style={{
              marginTop: 6,
              marginRight: 6,
              fontSize: 12,
              color: "#9CA3AF",
              textAlign: "right",
            }}
          >
            Could not reach {channelLabel}
          </Text>
        ) : null}
      </View>
    );
  };

  const handleNewChat = () => {
    const nextSessionId = createSession(activeAgent);
    setRecentsOpen(false);
    router.push(`/chats/${nextSessionId}`);
  };

  if (!activeSession) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}
      <Modal visible={recentsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRecentsOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 28, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Recent threads</Text>
            <TouchableOpacity
              onPress={() => setRecentsOpen(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.88}
            onPress={handleNewChat}
            style={{
              marginTop: 18,
              height: 48,
              borderRadius: 16,
              backgroundColor: theme.colors.accent,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>New thread</Text>
          </TouchableOpacity>

          <FlatList
            data={recentSessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const lastMessage = item.messages[item.messages.length - 1];
              const selected = item.id === activeSession.id;
              return (
                <TouchableOpacity
                  activeOpacity={0.84}
                  onPress={() => {
                    setRecentsOpen(false);
                    router.push(`/chats/${item.id}`);
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ flex: 1, fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }} numberOfLines={1}>
                      {item.title || "New thread"}
                    </Text>
                    <Text style={{ marginLeft: 12, fontSize: 12, color: theme.colors.textSecondary }}>
                      {formatTimestamp(item.updatedAt)}
                    </Text>
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary }} numberOfLines={2}>
                    {lastMessage?.speech?.trim() || "New thread"}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: activeSession?.avatarColor || activeAgent?.avatarColor || theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name={(activeSession?.icon || activeAgent?.icon || "sparkles") as any} size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            {channelLabel}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.textSecondary }}>
            {channelSubtitle}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleMediaUpload()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name="add" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setRecentsOpen(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View
          style={{
            flexDirection: "row",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 4,
            gap: 4,
          }}
        >
          {(["customer", "owner"] as const).map((mode) => {
            const selected = viewMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                activeOpacity={0.86}
                onPress={() => setViewMode(mode)}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: selected ? theme.colors.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: selected ? "#FFFFFF" : theme.colors.textSecondary,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {mode === "customer" ? "Customer" : "Owner"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {viewMode === "customer" ? (
          <>
            {degradedMessage ? (
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
                <SurfaceStatusBanner message={degradedMessage} />
              </View>
            ) : null}
            <FlatList
              ref={messagesListRef}
              data={messages}
              keyExtractor={(_, i) => i.toString()}
              renderItem={renderMessage}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollToBottom()}
              contentContainerStyle={{
                paddingTop: SPACING.sm,
                paddingBottom: SPACING.md,
                backgroundColor: theme.colors.background,
              }}
              ListEmptyComponent={
                <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      padding: 18,
                      gap: 8,
                    }}
                  >
                    <Text style={{ fontSize: 20, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                      {channelLabel}
                    </Text>
                    <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                      {activeAgent.intro}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                      {activeAgent.id === sage.id
                        ? "Use this main thread for direct help, context review, and specialist routing."
                        : "Customer View stays chat-first. Owner controls are available in the Owner tab above."}
                    </Text>
                  </View>
                </View>
              }
            />

            {isLoading ? (
              <View style={{ paddingHorizontal: SPACING.md, paddingTop: 8, gap: 6 }}>
                <KinThinkingIndicator theme={theme} loadingDotOpacities={loadingDotOpacities} />
                {latestRunActivity ? (
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{latestRunActivity}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={{ paddingBottom: 0 }}>
              <InputBar
                onSend={(text) => sendMessage(text)}
                onMediaUpload={handleMediaUpload}
                isLoading={isLoading}
                value={draft}
                onChangeText={(next) => setSessionDraft(sessionId, next)}
                placeholder={`Message ${channelLabel}`}
              />
            </View>
          </>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 18,
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "DMSans_700Bold",
                  color: theme.colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 1.1,
                }}
              >
                Channel
              </Text>
              <Text style={{ fontSize: 20, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {channelLabel}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                {activeAgent.id === sage.id
                  ? "Sage stays pinned as the main daily-use channel. It can review changes, steer work, and route intentionally."
                  : "This specialist stays scoped to its own channel, context, and install boundary by default."}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <OwnerMetric label="Role" value={channelRole} />
                <OwnerMetric label="Messages" value={String(messages.length)} />
                <OwnerMetric label="Updated" value={formatTimestamp(activeSession?.updatedAt) || "Now"} />
              </View>
            </View>

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 18,
                gap: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "DMSans_700Bold",
                  color: theme.colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 1.1,
                }}
              >
                Mobile State
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <OwnerStatCard label="Approvals" value={pendingApprovals} theme={theme} />
                <OwnerStatCard label="Live runs" value={liveRuns} theme={theme} />
                <OwnerStatCard
                  label={activeAgent.id === sage.id ? "Unseen" : "Scoped"}
                  value={activeAgent.id === sage.id ? unseenChanges : 1}
                  theme={theme}
                />
              </View>
              {latestRunActivity ? (
                <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                  Current activity: {latestRunActivity}
                </Text>
              ) : null}
            </View>

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 18,
                gap: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "DMSans_700Bold",
                  color: theme.colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 1.1,
                }}
              >
                Quick Actions
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <OwnerActionButton label="Applications" icon="grid-outline" onPress={() => router.push("/apps" as never)} theme={theme} />
                <OwnerActionButton label="Notifications" icon="notifications-outline" onPress={() => router.push("/inbox" as never)} theme={theme} />
                <OwnerActionButton label="Account & Connect" icon="link-outline" onPress={() => router.push("/session" as never)} theme={theme} />
                <OwnerActionButton label="Recent Threads" icon="time-outline" onPress={() => setRecentsOpen(true)} theme={theme} />
              </View>
            </View>

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 18,
                gap: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "DMSans_700Bold",
                  color: theme.colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 1.1,
                }}
              >
                {activeAgent.id === sage.id ? "Recent Context" : "Boundary"}
              </Text>
              {activeAgent.id === sage.id ? (
                recentChanges.length ? (
                  recentChanges.map((item, index) => (
                    <View
                      key={`${item.event_type || "event"}-${item.entity_id || index}`}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                        padding: 12,
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                        {String(item.summary || item.event_type || "Context change")}
                      </Text>
                      <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
                        {String(item.source_app || "context")} • {String(item.priority || "normal")}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                    No unseen context changes yet. Sage will surface structured changes here instead of raw device state.
                  </Text>
                )
              ) : (
                <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                  This specialist should only see the memory, files, artifacts, and context explicitly scoped to this install. Cross-agent access stays brokered, not implied.
                </Text>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function OwnerMetric({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "#111827",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
        {label}: {value}
      </Text>
    </View>
  );
}

function OwnerStatCard({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 11, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{value}</Text>
    </View>
  );
}

function OwnerActionButton({
  label,
  icon,
  onPress,
  theme,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        minWidth: "47%",
        flexGrow: 1,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        padding: 14,
        gap: 8,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
      <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
