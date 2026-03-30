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
  TouchableOpacity,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TransientBanner } from "@/src/components/TransientBanner";
import { InputBar } from "@/src/components/InputBar";
import { AgentPayload } from "@/src/components/Renderer";
import { useChatStore } from "@/src/stores/chatStore";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { getPrimaryAgent } from "@/src/lib/agents";
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

function describeRunPhase(run: any) {
  const status = String(run?.status ?? "").toLowerCase();
  const route = String(run?.route?.selected ?? run?.route?.requested ?? "").toLowerCase();
  const operation = run?.context?.metadata?.pack_inputs?.operations?.[0];
  const operationMode = String(operation?.mode ?? "").toLowerCase();

  if (status === "queued" || status === "pending") {
    return "Queued on your core";
  }

  if (status === "running") {
    if (operationMode === "read") return "Reading files and context";
    if (operationMode === "write") return "Preparing a file change";
    if (operationMode === "delete") return "Preparing a delete action";
    if (route === "local") return "Working with your local core";
    if (route === "cloud") return "Reasoning in the cloud";
    return "Working on your request";
  }

  if (status === "waiting_approval") {
    return "Waiting for your approval";
  }

  if (status === "completed") {
    return "Preparing the final reply";
  }

  if (status === "failed") {
    return "Run failed";
  }

  return "Thinking";
}

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

export default function ChatScreen({ sessionId }: ChatScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { sessions, createSession, addMessage, updateMessage, setActiveSession, setSessionTitle } = useChatStore();
  const activeApp = useAppContextStore((state) => state.activeApp);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessageIndex, setFailedMessageIndex] = useState<number | null>(null);
  const [runActivity, setRunActivity] = useState<string[]>([]);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const { banner, showBanner } = useTransientBanner();
  const activeAgent = getPrimaryAgent();
  const messagesListRef = useRef<FlatList<AgentPayload>>(null);
  const loadingDotOpacities = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  const loadingDotAnimationsRef = useRef<Animated.CompositeAnimation[]>([]);
  const activeSession = sessions.find((item) => item.id === sessionId);
  const messages = activeSession?.messages || [];
  const lastMessageSpeech = messages[messages.length - 1]?.speech || "";
  const recentSessions = useMemo(() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);
  const runtimeRole = activeAgent.runtimeRole || activeAgent.id;

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

    const nextSessionId = createSession(activeAgent);
    router.replace(`/kin/${nextSessionId}`);
  }, [activeAgent, activeSession?.id, createSession, router, setActiveSession]);

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

  const handleMediaUpload = () => {
    showBanner("Media uploads are not available yet.", "error");
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
      })) as Array<{ role: "user" | "assistant"; content: string }>;

    addMessage(sessionId, userMessage);
    addMessage(sessionId, { intent: "assistant", speech: "" });
    if (activeSession.title === "New thread") {
      setSessionTitle(sessionId, finalInput.slice(0, 60));
    }
    setFailedMessageIndex(null);
    setInput("");
    setIsLoading(true);
    setRunActivity(["Connecting to Empyralist", "Waiting for response"]);

    if (!session?.runtimeKey) {
      setFailedMessageIndex(nextUserMessageIndex);
      updateMessage(sessionId, placeholderIndex, {
        speech: "Add your server API key in Profile first.",
      });
      setIsLoading(false);
      setRunActivity([]);
      showBanner("Add your server API key in Profile first.", "error");
      return;
    }

    try {
      let streamedReply = "";
      const payload = await mobileApi.respondChat(
        {
          runtimeUrl: session.runtimeUrl || "",
          runtimeKey: session.runtimeKey,
          workspaceId: session.workspaceId || "default",
          platformUrl: session.platformUrl,
          platformKey: session.platformKey,
        },
        {
          message: finalInput,
          threadId: sessionId,
          provider: "",
          model: "",
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

      updateMessage(sessionId, placeholderIndex, {
        speech: payload.reply || streamedReply || "I couldn't form a clean reply just now.",
      });

      const approvalAction = payload.actions.find(
        (action) =>
          action.kind === "approval_required" &&
          action.connector &&
          action.action &&
          action.input,
      );

      if (approvalAction) {
        const approvalCard: ApprovalCard = {
          kind: "direct",
          action: approvalAction.action || approvalAction.label || "Approval required",
          target: approvalAction.connector || undefined,
          reason: payload.reply || "This action requires your approval before I send it. Confirm?",
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
      const message = err instanceof Error ? err.message : "Could not reach KIN. Check the server connection.";
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
    if (!session?.runtimeKey) return;
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
          {
            runtimeUrl: session.runtimeUrl || "",
            runtimeKey: session.runtimeKey,
            workspaceId: session.workspaceId || "default",
            platformUrl: session.platformUrl,
            platformKey: session.platformKey,
          },
          {
            message: "__approval_confirmed__",
            threadId: activeSession.id,
            provider: "",
            model: "",
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
          speech: payload.reply || streamedReply || "Action completed.",
        });
        setRunActivity([]);
        setIsLoading(false);
        showBanner("Approval sent.", "success");
        return;
      }

      if (!card.approvalId || !card.runId) {
        return;
      }
      await mobileApi.resolveApproval(
        {
          runtimeUrl: session.runtimeUrl || "",
          runtimeKey: session.runtimeKey,
          workspaceId: session.workspaceId || "default",
          platformUrl: session.platformUrl,
          platformKey: session.platformKey,
        },
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
            Could not reach KIN
          </Text>
        ) : null}
      </View>
    );
  };

  const handleNewChat = () => {
    const nextSessionId = createSession(activeAgent);
    setRecentsOpen(false);
    router.push(`/kin/${nextSessionId}`);
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
                    router.push(`/kin/${item.id}`);
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
            {activeAgent.label}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.textSecondary }}>
            {activeApp ? `Using ${activeApp.name} app context` : "Main thread"}
          </Text>
        </View>
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
          <Ionicons name="time-outline" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>
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
            <View />
          }
        />

        {isLoading ? (
          <View style={{ paddingHorizontal: SPACING.md, paddingTop: 8 }}>
            <KinThinkingIndicator theme={theme} loadingDotOpacities={loadingDotOpacities} />
          </View>
        ) : null}

        <View style={{ paddingBottom: 0 }}>
          <InputBar
            onSend={(text) => sendMessage(text)}
            onMediaUpload={handleMediaUpload}
            isLoading={isLoading}
            prefilledPrompt={input}
            placeholder="Message KIN"
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
