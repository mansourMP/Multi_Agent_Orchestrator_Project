import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated as LegacyAnimated,
  Dimensions,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  PanResponder,
  Pressable,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { TransientBanner } from "@/src/components/TransientBanner";
import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { InputBar } from "@/src/components/InputBar";
import { AgentPayload } from "@/src/components/Renderer";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { buildAgentThreadFromInstall, getPrimaryAgent } from "@/src/lib/agents";
import { MobileAuthExpiredError, mobileApi, type MobileThreadHistoryItem } from "@/src/lib/api";
import { useMobileChatContext, usePrimaryGatewayDoctor } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import {
  MOBILE_MOTION_EASING,
  MOBILE_MOTION_TIMINGS,
  MOBILE_SPRING_PRESETS,
} from "@/src/ui/motion";

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
const DRAWER_WIDTH = Math.min(Dimensions.get("window").width * 0.78, 320);
const EDGE_SWIPE_WIDTH = 96;
const HEADER_HEIGHT = 54;

type ChatScreenProps = {
  sessionId: string;
  agentId?: string;
  specialistId?: string;
};

type KinThinkingIndicatorProps = {
  theme: ReturnType<typeof useTheme>;
};

function KinThinkingIndicator({ theme }: KinThinkingIndicatorProps) {
  const orbPulse = useSharedValue(0);

  useEffect(() => {
    orbPulse.value = withRepeat(
      withTiming(1, {
        duration: MOBILE_MOTION_TIMINGS.slow,
        easing: MOBILE_MOTION_EASING.standard,
      }),
      -1,
      true,
    );
    return () => {
      orbPulse.value = 0;
    };
  }, [orbPulse]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: interpolate(orbPulse.value, [0, 1], [0.38, 1]),
    transform: [{ scale: interpolate(orbPulse.value, [0, 1], [0.92, 1.12]) }],
  }));

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
        style={[
          {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.textSecondary,
          },
          orbStyle,
        ]}
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
    </View>
  );
}

function formatChatTimestamp(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function parseCloudTimestamp(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isPlaceholderThreadTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === "" || normalized === "new chat" || normalized === "chat" || normalized === "primary thread";
}

function cloudThreadPreview(item: MobileThreadHistoryItem): string {
  const title = String(item.title || "").trim();
  if (title && !isPlaceholderThreadTitle(title)) {
    return title;
  }
  const turns = Array.isArray(item.turns) ? item.turns : [];
  const firstUserTurn = turns.find((turn) => String(turn?.role || "").trim().toLowerCase() === "user");
  const firstContent = String(firstUserTurn?.content || "").trim();
  if (firstContent) {
    return firstContent;
  }
  return "Conversation";
}

function humanizeToken(value: string) {
  return value
    .split(/[_\-.]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectMemoryFacts(value: unknown, limit = 3): string[] {
  const facts: string[] = [];
  const pushFact = (candidate: unknown) => {
    if (facts.length >= limit) return;
    const text = String(candidate ?? "").replace(/\s+/g, " ").trim();
    if (!text || facts.includes(text)) return;
    facts.push(text.length > 96 ? `${text.slice(0, 93)}...` : text);
  };
  const visit = (candidate: unknown) => {
    if (facts.length >= limit || candidate == null) return;
    if (typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean") {
      pushFact(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
        if (facts.length >= limit) break;
        if (typeof item === "string") {
          pushFact(`${humanizeToken(key)}: ${item}`);
        } else {
          visit(item);
        }
      }
    }
  };
  visit(value);
  return facts;
}

function buildTransparencyCards(payload: {
  actions?: unknown[];
  interventions?: unknown[];
}): AgentPayload[] {
  const cards: AgentPayload[] = [];
  const pushCard = (title: string, detail?: string) => {
    const cleanTitle = title.trim();
    const cleanDetail = String(detail || "").trim();
    if (!cleanTitle || cards.some((item) => item.speech === cleanTitle && item.source === cleanDetail)) return;
    cards.push({
      intent: "assistant",
      messageType: "tool",
      speech: cleanTitle,
      source: cleanDetail || undefined,
    });
  };

  for (const item of Array.isArray(payload.interventions) ? payload.interventions : []) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const title = String(record.title || record.label || record.kind || "").trim();
    const detail = String(record.detail || record.summary || record.message || "").trim();
    if (title) {
      pushCard(title, detail);
    }
  }

  for (const item of Array.isArray(payload.actions) ? payload.actions : []) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const kind = String(record.kind || "").trim();
    if (!kind || kind === "approval_required") continue;
    const label = String(record.label || "").trim() || humanizeToken(kind);
    const target = String(record.connector || record.href || record.goal || "").trim();
    pushCard(label, target);
  }

  return cards.slice(0, 4);
}

export default function ChatScreen({ sessionId, agentId, specialistId }: ChatScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const chatContextQuery = useMobileChatContext();
  const gatewayDoctor = usePrimaryGatewayDoctor();
  const {
    sessions,
    activeSessionId,
    createSession,
    addMessage,
    removeMessage,
    updateMessage,
    setActiveSession,
    setSessionTitle,
  } = useChatStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessageIndex, setFailedMessageIndex] = useState<number | null>(null);
  const [, setRunActivity] = useState<string[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [cloudHistory, setCloudHistory] = useState<MobileThreadHistoryItem[]>([]);
  const [cloudHistoryLoading, setCloudHistoryLoading] = useState(false);
  const [cloudHistoryError, setCloudHistoryError] = useState<string | null>(null);
  const { banner, showBanner } = useTransientBanner();
  const sage = getPrimaryAgent();
  const messagesListRef = useRef<FlatList<AgentPayload>>(null);
  const historyProgress = useRef(new LegacyAnimated.Value(0)).current;
  const embeddedMode = !sessionId;
  const requestedAgentId = String(specialistId || agentId || "").trim();
  const pendingGatewayApprovals = Number((gatewayDoctor.doctor?.approvals as { pending_count?: number } | undefined)?.pending_count ?? 0);
  const sortedSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );
  const resolvedSessionId = sessionId || activeSessionId || "";
  const requestedInstall = useMemo(
    () =>
      requestedAgentId
        ? (chatContextQuery.data?.specialistInstalls ?? []).find(
            (item) => String(item?.id || "").trim() === requestedAgentId,
          ) ?? null
        : null,
    [chatContextQuery.data?.specialistInstalls, requestedAgentId],
  );
  const sessionBackedAgent = useMemo(() => {
    if (!requestedAgentId) {
      return null;
    }
    const source = sortedSessions.find((item) => item.agentId === requestedAgentId || item.id === resolvedSessionId);
    if (!source) {
      return null;
    }
    return {
      id: source.agentId,
      label: source.agentName || "Specialist",
      runtimeRole: source.runtimeRole,
      subtitle: source.title !== "New thread" ? source.title : undefined,
      specialistId: source.agentId,
      provider: undefined,
      model: undefined,
      icon: source.icon,
      avatarColor: source.avatarColor,
      intro: "",
    };
  }, [requestedAgentId, resolvedSessionId, sortedSessions]);
  const activeAgent = useMemo(() => {
    if (!requestedAgentId) {
      return sage;
    }
    if (requestedInstall) {
      return buildAgentThreadFromInstall(requestedInstall);
    }
    if (sessionBackedAgent) {
      return sessionBackedAgent;
    }
    return {
      ...sage,
      id: requestedAgentId,
      label: "Specialist",
      runtimeRole: "specialist",
      specialistId: requestedAgentId,
      provider: undefined,
      model: undefined,
      intro: "",
    };
  }, [requestedAgentId, requestedInstall, sage, sessionBackedAgent]);
  const agentSessions = useMemo(
    () =>
      sortedSessions.filter((item) =>
        requestedAgentId
          ? item.agentId === activeAgent.id
          : item.agentId === sage.id || item.agentId === "assistant",
      ),
    [activeAgent.id, requestedAgentId, sage.id, sortedSessions],
  );
  const activeSession = agentSessions.find((item) => item.id === resolvedSessionId) ?? agentSessions[0];
  const currentSessionId = activeSession?.id ?? "";
  const messages = activeSession?.messages || [];
  const lastMessageSpeech = messages[messages.length - 1]?.speech || "";
  const channelRole = activeSession?.runtimeRole || activeAgent.runtimeRole || (requestedAgentId ? "specialist" : "private-assistant");

  const loadCloudHistory = React.useCallback(async () => {
    if (!session?.runtimeUrl || !session.runtimeKey || !embeddedMode) {
      return;
    }
    setCloudHistoryLoading(true);
    setCloudHistoryError(null);
    try {
      const payload = await mobileApi.listCloudThreads(session, { includeTurns: true, limit: 100 });
      const sortedItems = [...payload.items].sort(
        (left, right) =>
          parseCloudTimestamp(right.last_turn_at || right.updated_at || right.created_at)
          - parseCloudTimestamp(left.last_turn_at || left.updated_at || left.created_at),
      );
      setCloudHistory(sortedItems);
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        setCloudHistoryError("Session expired. Sign in again to load cloud history.");
      } else {
        setCloudHistoryError(error instanceof Error ? error.message : "Could not load cloud history.");
      }
    } finally {
      setCloudHistoryLoading(false);
    }
  }, [embeddedMode, session]);

  useEffect(() => {
    if (!historyVisible) {
      return;
    }
    void loadCloudHistory();
  }, [historyVisible, loadCloudHistory]);
  const activeProvider = requestedAgentId ? String(activeAgent.provider || "").trim() : "";
  const activeModel = requestedAgentId ? String(activeAgent.model || "").trim() : "";
  const memoryFacts = useMemo(
    () => collectMemoryFacts([
      chatContextQuery.data?.unifiedMemory?.summary,
      chatContextQuery.data?.personalContext?.summary,
    ]),
    [chatContextQuery.data?.personalContext?.summary, chatContextQuery.data?.unifiedMemory?.summary],
  );

  const scrollToBottom = React.useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (activeSession?.id) {
      if (activeSessionId !== activeSession.id) {
        setActiveSession(activeSession.id);
      }
      return;
    }

    const nextSessionId = createSession(activeAgent);
    setActiveSession(nextSessionId);
  }, [activeAgent, activeSession?.id, activeSessionId, createSession, setActiveSession]);

  useEffect(() => {
    scrollToBottom(false);
  }, [isLoading, lastMessageSpeech, messages.length, scrollToBottom]);

  const appendRunActivity = (label: string) => {
    const next = label.trim();
    if (!next) return;
    setRunActivity((current) => {
      if (current[current.length - 1] === next) return current;
      if (current.includes(next)) return current;
      return [...current, next];
    });
  };

  const triggerDrawerHaptic = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const triggerActionHaptic = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const animateHistory = React.useCallback(
    (toValue: number, onComplete?: () => void) => {
      LegacyAnimated.spring(historyProgress, {
        toValue,
        ...MOBILE_SPRING_PRESETS.sheet,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onComplete?.();
        }
      });
    },
    [historyProgress],
  );

  const openHistory = React.useCallback(
    (withHaptic = true) => {
      if (withHaptic) triggerDrawerHaptic();
      historyProgress.stopAnimation();
      historyProgress.setValue(0);
      setHistoryVisible(true);
      requestAnimationFrame(() => {
        animateHistory(1);
      });
    },
    [animateHistory, historyProgress, triggerDrawerHaptic],
  );

  const closeHistory = React.useCallback(
    (withHaptic = true) => {
      if (withHaptic) triggerDrawerHaptic();
      animateHistory(0, () => setHistoryVisible(false));
    },
    [animateHistory, triggerDrawerHaptic],
  );

  const createNewThread = React.useCallback(() => {
    triggerActionHaptic();
    const nextSessionId = createSession(activeAgent);
    setActiveSession(nextSessionId);
    closeHistory(false);
  }, [activeAgent, closeHistory, createSession, setActiveSession, triggerActionHaptic]);

  const edgeSwipeResponder = React.useMemo(
    () =>
      PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !historyVisible && gesture.x0 <= EDGE_SWIPE_WIDTH && gesture.dx > 10 && Math.abs(gesture.dy) < 24,
      onPanResponderTerminationRequest: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !historyVisible && gesture.x0 <= EDGE_SWIPE_WIDTH && gesture.dx > 10 && Math.abs(gesture.dy) < 24,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 28 || gesture.vx > 0.18) {
          openHistory();
        }
      },
      onPanResponderTerminate: () => {},
    }),
    [historyVisible, openHistory],
  );

  const drawerSwipeResponder = React.useMemo(
    () =>
      PanResponder.create({
      onPanResponderTerminationRequest: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        historyVisible && gesture.dx < -8 && Math.abs(gesture.dy) < 12,
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(0, Math.min(1 + gesture.dx / DRAWER_WIDTH, 1));
        historyProgress.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        historyProgress.stopAnimation((value: number) => {
          if (gesture.dx < -18 || gesture.vx < -0.12 || value < 0.7) {
            closeHistory();
            return;
          }
          openHistory(false);
        });
      },
      onPanResponderTerminate: () => {
        openHistory(false);
      },
    }),
    [closeHistory, historyProgress, historyVisible, openHistory],
  );

  const sendMessage = async (textOverride?: string) => {
    if (!currentSessionId) return;
    const finalInput = (textOverride || input).trim();
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

    addMessage(currentSessionId, userMessage);
    addMessage(currentSessionId, { intent: "assistant", speech: "" });
    if (activeSession.title === "New thread") {
      setSessionTitle(currentSessionId, finalInput.slice(0, 60));
    }
    setFailedMessageIndex(null);
    setInput("");
    setIsLoading(true);
    setRunActivity(["Thinking", "Writing a reply"]);

    if (!session?.runtimeKey) {
      setFailedMessageIndex(nextUserMessageIndex);
      removeMessage(currentSessionId, placeholderIndex);
      setIsLoading(false);
      setRunActivity([]);
      showBanner(`${activeAgent.label} is not connected yet.`, "error");
      return;
    }

    try {
      let streamedReply = "";
      const payload = await mobileApi.respondChat(
        session,
        {
          message: finalInput,
          threadId: currentSessionId,
          provider: activeProvider,
          model: activeModel,
          agentId: activeAgent.id,
          agentName: activeAgent.label,
          agentRole: channelRole,
          priorMessages,
        },
        {
          onChunk: (delta) => {
            streamedReply += delta;
            appendRunActivity("Writing");
            updateMessage(currentSessionId, placeholderIndex, {
              speech: streamedReply,
            });
          },
        },
      );
      const hasStructuredCards =
        (Array.isArray(payload.approvals) && payload.approvals.length > 0) ||
        (Array.isArray(payload.interventions) && payload.interventions.length > 0);

      updateMessage(currentSessionId, placeholderIndex, {
        speech: hasStructuredCards ? "" : (payload.reply || streamedReply || ""),
      });

      for (const card of buildTransparencyCards(payload)) {
        addMessage(currentSessionId, card);
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
        addMessage(currentSessionId, {
          intent: "assistant",
          speech: "Approval required",
          messageType: "approval",
          approval: approvalCard,
        } as AgentPayload);
      }

      setRunActivity([]);
    } catch (err) {
      if (err instanceof MobileAuthExpiredError) {
        setFailedMessageIndex(nextUserMessageIndex);
        removeMessage(currentSessionId, placeholderIndex);
        setRunActivity([]);
        return;
      }
      const message =
        err instanceof Error ? err.message : `${activeAgent.label} could not reply right now. Please try again.`;
      console.warn("Chat request failed:", message);
      setFailedMessageIndex(nextUserMessageIndex);
      removeMessage(currentSessionId, placeholderIndex);
      setRunActivity([]);
      showBanner(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovalDecision = async (card: ApprovalCard, decision: "approved" | "rejected") => {
    if (!session?.runtimeKey) return;
    try {
      if (card.kind === "direct") {
        if (!activeSession?.id || !card.connector || !card.actionId || !card.input) return;
        if (decision !== "approved") {
          showBanner("Noted.", "success");
          return;
        }
        const placeholderIndex = messages.length;
        addMessage(activeSession.id, {
          intent: "assistant",
          speech: "",
        } as AgentPayload);
        setIsLoading(true);
        setRunActivity(["Confirming", "Finishing up"]);
        let streamedReply = "";
        const payload = await mobileApi.respondChat(
          session,
          {
            message: "__approval_confirmed__",
            threadId: activeSession.id,
            provider: activeProvider,
            model: activeModel,
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
        setRunActivity([]);
        setIsLoading(false);
        showBanner("Done.", "success");
        return;
      }

      if (!card.approvalId || !card.runId) {
        return;
      }
      await mobileApi.resolveApproval(
        session,
        card.runId,
        card.approvalId,
        decision,
      );
      if (!activeSession?.id) return;
      showBanner(decision === "approved" ? "Done." : "Noted.", "success");
    } catch (err) {
      console.warn("Approval resolution failed", err);
      setRunActivity([]);
      setIsLoading(false);
      showBanner("That did not go through.", "error");
      return;
    }
    setRunActivity([]);
    setIsLoading(false);
  };

  const renderMessage = ({ item, index }: { item: AgentPayload; index: number }) => {
    const isUser = item.intent === "user";

    if (item.messageType === "tool") {
      return (
        <View
          style={{
            marginHorizontal: SPACING.md,
            marginVertical: 2,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textSecondary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {item.speech}
            </Text>
            {item.source ? (
              <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: theme.colors.textSecondary }}>
                {item.source}
              </Text>
            ) : null}
          </View>
        </View>
      );
    }

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
            Needs your approval
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
            <ActionButton
              label="Allow"
              variant="primary"
              onPress={() => handleApprovalDecision(item.approval!, "approved")}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="Not now"
              variant="secondary"
              onPress={() => handleApprovalDecision(item.approval!, "rejected")}
              style={{ flex: 1 }}
            />
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
          <View
            style={{
              alignSelf: "flex-start",
              borderRadius: 20,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text
              style={{
                fontSize: 15.5,
                color: theme.colors.text,
                fontFamily: "DMSans_400Regular",
                lineHeight: 25,
              }}
            >
              {item.speech}
            </Text>
          </View>
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
            paddingHorizontal: 17,
            paddingVertical: 14,
            borderRadius: 22,
            borderBottomRightRadius: 12,
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
            Please try again
          </Text>
        ) : null}
      </View>
    );
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
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: theme.colors.background,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {embeddedMode ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Open recent chats"
            onPress={() => openHistory()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Ionicons name="menu-outline" size={20} color={theme.colors.text} />
          </MotionPressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: embeddedMode ? "center" : "flex-start",
              gap: 6,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 16,
                color: theme.colors.text,
                fontFamily: "DMSans_700Bold",
                lineHeight: 22,
                textAlign: embeddedMode ? "center" : "left",
              }}
            >
              {activeAgent.label}
            </Text>
            <CoreStatusBar variant="dot" />
          </View>
          {requestedAgentId ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                fontSize: 12,
                color: theme.colors.textSecondary,
                textAlign: embeddedMode ? "center" : "left",
              }}
            >
              {String(channelRole || "specialist").replace(/[_-]+/g, " ")}
            </Text>
          ) : null}
        </View>
        {!historyVisible ? (
          <MotionPressable
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            onPress={createNewThread}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.text} />
          </MotionPressable>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <CoreStatusBar
          variant="banner"
          offlineOnly
          style={{
            marginTop: 8,
            marginHorizontal: SPACING.md,
            marginBottom: 4,
          }}
        />
        {pendingGatewayApprovals > 0 ? (
          <View
            style={{
              marginHorizontal: SPACING.md,
              marginTop: 4,
              marginBottom: 4,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                Approval required
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12.5, color: theme.colors.textSecondary }}>
                {pendingGatewayApprovals} approval{pendingGatewayApprovals === 1 ? "" : "s"} waiting before Sage can continue on your paired device.
              </Text>
            </View>
            <ActionButton
              label="Open"
              variant="secondary"
              onPress={() => router.push("/gateway")}
              style={{ alignSelf: "center" }}
            />
          </View>
        ) : null}
        <FlatList
          ref={messagesListRef}
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderMessage}
          ListHeaderComponent={memoryFacts.length > 0 ? (
            <View
              style={{
                marginHorizontal: SPACING.md,
                marginTop: 4,
                marginBottom: 8,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Memory capsule
                </Text>
                <TouchableOpacity activeOpacity={0.86} onPress={() => router.push("/memory")}>
                  <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    Edit
                  </Text>
                </TouchableOpacity>
              </View>
              {memoryFacts.map((fact) => (
                <Text key={fact} numberOfLines={2} style={{ fontSize: 12.5, color: theme.colors.textSecondary, lineHeight: 18 }}>
                  {fact}
                </Text>
              ))}
            </View>
          ) : null}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollToBottom()}
          contentContainerStyle={{
            paddingTop: SPACING.sm,
            paddingBottom: SPACING.md,
            backgroundColor: theme.colors.background,
          }}
          ListEmptyComponent={null}
        />

        {isLoading ? (
          <View style={{ paddingHorizontal: SPACING.md, paddingTop: 8 }}>
            <KinThinkingIndicator theme={theme} />
          </View>
        ) : null}

        <View style={{ paddingBottom: 0 }}>
          <InputBar
            onSend={(text) => sendMessage(text)}
            isLoading={isLoading}
            prefilledPrompt={input}
            placeholder={requestedAgentId ? `Message ${activeAgent.label}` : "Ask Sage anything"}
            textOnly
          />
        </View>
      </View>
      {banner ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: Math.max(insets.bottom, 12) + 86,
            zIndex: 60,
          }}
        >
          <TransientBanner message={banner.message} tone={banner.tone} />
        </View>
      ) : null}
      {embeddedMode ? (
        <>
          {!historyVisible ? (
            <View
              pointerEvents="box-only"
              {...edgeSwipeResponder.panHandlers}
              style={{
                position: "absolute",
                left: 0,
                top: insets.top + HEADER_HEIGHT,
                bottom: 0,
                width: EDGE_SWIPE_WIDTH,
                zIndex: 40,
              }}
            />
          ) : null}
          <Modal
            transparent
            animationType="none"
            visible={historyVisible}
            onRequestClose={() => closeHistory()}
          >
            <View style={StyleSheet.absoluteFillObject}>
              <Pressable style={{ flex: 1 }} onPress={() => closeHistory()}>
                <LegacyAnimated.View
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(17, 24, 39, 0.16)",
                    opacity: historyProgress,
                  }}
                />
              </Pressable>
              <LegacyAnimated.View
                {...drawerSwipeResponder.panHandlers}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: DRAWER_WIDTH,
                  paddingTop: insets.top + 14,
                  paddingHorizontal: 16,
                  paddingBottom: Math.max(insets.bottom, 18),
                  backgroundColor: theme.colors.background,
                  transform: [
                    {
                      translateX: historyProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-DRAWER_WIDTH, 0],
                      }),
                    },
                  ],
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 17, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    Chats
                  </Text>
                  <MotionPressable
                    onPress={createNewThread}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.card,
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.colors.text} />
                  </MotionPressable>
                </View>

                {agentSessions.length ? (
                  <FlatList
                    data={agentSessions}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    renderItem={({ item }) => {
                      const lastMessage = item.messages[item.messages.length - 1];
                      const selected = item.id === activeSession.id;
                      return (
                        <MotionPressable
                          onPress={() => {
                            triggerDrawerHaptic();
                            setActiveSession(item.id);
                            closeHistory(false);
                          }}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 10,
                            backgroundColor: selected ? theme.colors.cardHover : "transparent",
                            borderRadius: 12,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                            <Text
                              style={{ flex: 1, fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}
                              numberOfLines={1}
                            >
                              {item.title || "New chat"}
                            </Text>
                            <Text style={{ fontSize: 11.5, color: theme.colors.textSecondary }}>
                              {formatChatTimestamp(item.updatedAt)}
                            </Text>
                          </View>
                          <Text
                            style={{ marginTop: 2, fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}
                            numberOfLines={2}
                          >
                            {lastMessage?.speech?.trim() || "No messages yet"}
                          </Text>
                        </MotionPressable>
                      );
                    }}
                  />
                ) : (
                  <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
                    Start a new chat and it will appear here.
                  </Text>
                )}
                <View style={{ marginTop: 16, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>
                      Cloud history
                    </Text>
                    <MotionPressable
                      onPress={() => {
                        triggerDrawerHaptic();
                        void loadCloudHistory();
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.card,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="refresh" size={16} color={theme.colors.textSecondary} />
                    </MotionPressable>
                  </View>
                  {cloudHistoryLoading ? (
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                      Loading cloud history...
                    </Text>
                  ) : null}
                  {cloudHistoryError ? (
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: "#C2413B" }}>
                      {cloudHistoryError}
                    </Text>
                  ) : null}
                  {!cloudHistoryLoading && !cloudHistoryError && cloudHistory.length === 0 ? (
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                      No cloud conversations yet.
                    </Text>
                  ) : null}
                  {!cloudHistoryLoading && cloudHistory.length > 0 ? (
                    <View style={{ gap: 4 }}>
                      {cloudHistory.slice(0, 8).map((item) => {
                        const preview = cloudThreadPreview(item);
                        const occurredAt = item.last_turn_at || item.updated_at || item.created_at;
                        return (
                          <View
                            key={String(item.id || `thread-${preview}`)}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: "transparent",
                            }}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <Text
                                style={{ flex: 1, fontSize: 12.5, fontFamily: "DMSans_700Bold", color: theme.colors.text }}
                                numberOfLines={1}
                              >
                                {preview}
                              </Text>
                              <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                                {occurredAt ? new Date(occurredAt).toLocaleDateString() : ""}
                              </Text>
                            </View>
                            <Text
                              style={{ marginTop: 2, fontSize: 11.5, lineHeight: 16, color: theme.colors.textSecondary }}
                              numberOfLines={1}
                            >
                              Thread {String(item.id || "").trim() || "unknown"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </LegacyAnimated.View>
            </View>
          </Modal>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}
