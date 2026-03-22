import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import * as Haptics from "expo-haptics";
import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { TransientBanner } from "@/src/components/TransientBanner";
import { InputBar } from "@/src/components/InputBar";
import { AgentPayload } from "@/src/components/Renderer";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppContextStore } from "@/src/stores/appContextStore";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useTransientBanner } from "@/src/lib/useTransientBanner";

type ApprovalCard = {
  action: string;
  target?: string;
  reason?: string;
  approvalId?: string;
  runId?: string;
};

const SPACING = { sm: 8, md: 16, lg: 24 };

const baseActions = [
  {
    label: "Create File",
    prompt: "Create a new file named meeting_notes.txt with a short outline.",
  },
  {
    label: "Summarize File",
    prompt: "Summarize the file meeting_notes.txt into bullet points.",
  },
  {
    label: "Run Device Action",
    prompt: "Lock my Mac screen.",
  },
];

const appActions: Record<string, { label: string; prompt: string }[]> = {
  nutrition: [
    { label: "Log Meal", prompt: "Log today's meal notes in nutrition_log.txt." },
    { label: "Summarize Week", prompt: "Summarize nutrition_log.txt for the last 7 days." },
    { label: "Device Action", prompt: "Lock my Mac screen." },
  ],
  finance: [
    { label: "Add Expense", prompt: "Add a new expense entry to finance_log.txt." },
    { label: "Summarize Month", prompt: "Summarize finance_log.txt for this month." },
    { label: "Device Action", prompt: "Lock my Mac screen." },
  ],
  study: [
    { label: "Start Notes", prompt: "Create a study_notes.txt file with key topics." },
    { label: "Summarize Notes", prompt: "Summarize study_notes.txt into bullet points." },
    { label: "Device Action", prompt: "Lock my Mac screen." },
  ],
  health: [
    { label: "Log Check-in", prompt: "Log a health check-in in health_log.txt." },
    { label: "Summarize Week", prompt: "Summarize health_log.txt for the last 7 days." },
    { label: "Device Action", prompt: "Lock my Mac screen." },
  ],
  language: [
    { label: "Start Lesson", prompt: "Create language_notes.txt with today's lesson outline." },
    { label: "Practice Speaking", prompt: "Create a speaking_drills.txt with 5 practice prompts." },
    { label: "Review Notes", prompt: "Summarize language_notes.txt into key phrases." },
  ],
};

type ChatScreenProps = {
  showHeader?: boolean;
  showAppChip?: boolean;
};

export default function ChatScreen({ showHeader = true, showAppChip = true }: ChatScreenProps) {
  const theme = useTheme();
  const { session } = useSessionState();
  const { sessions, activeSessionId, createSession, addMessage, setSessionTitle } = useChatStore();
  const { activeApp, clearActiveApp } = useAppContextStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { banner, showBanner } = useTransientBanner();
  const initializedSessions = useRef<Set<string>>(new Set());
  const lastAppId = useRef<string | null>(null);

  useEffect(() => {
    if (!activeSessionId) {
      createSession();
    }
  }, [activeSessionId, createSession]);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messages = activeSession?.messages || [];
  const hasUserMessages = messages.some((message) => message.intent === "user");
  const showQuickActions = !hasUserMessages;
  const quickActions = activeApp ? appActions[activeApp.id] || baseActions : baseActions;

  useEffect(() => {
    if (!activeSessionId) return;
    if (initializedSessions.current.has(activeSessionId)) return;
    if (!activeSession || activeSession.messages.length > 0) return;
    initializedSessions.current.add(activeSessionId);
    addMessage(activeSessionId, {
      intent: "assistant",
      speech: "System ready. Ask me to create files, summarize documents, or run device actions.",
    } as AgentPayload);
  }, [activeSessionId, activeSession, addMessage]);

  useEffect(() => {
    if (!activeSessionId) return;
    const currentId = activeApp?.id || null;
    if (lastAppId.current === currentId) return;
    lastAppId.current = currentId;
    if (currentId && activeApp?.name) {
      addMessage(activeSessionId, {
        intent: "assistant",
        speech: `App mode: ${activeApp.name}. Actions are scoped to this app.`,
      } as AgentPayload);
    }
  }, [activeApp, activeSessionId, addMessage]);

  const handleMediaUpload = () => {
    const sessionId = activeSessionId || createSession();
    addMessage(sessionId, {
      intent: "assistant",
      speech: "Media uploads are disabled in V1. Use text input for now.",
    } as AgentPayload);
  };

  const handlePlusPress = () => {
    const sessionId = activeSessionId || createSession();
    addMessage(sessionId, {
      intent: "assistant",
      speech: "Shortcuts live below. Tap a suggestion to run it.",
    } as AgentPayload);
  };

  const sendMessage = async (textOverride?: string) => {
    const finalInput = (textOverride || input).trim();
    if (!finalInput) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sessionId = activeSessionId || createSession();
    const userMessage: AgentPayload = { intent: "user", speech: finalInput };
    addMessage(sessionId, userMessage);
    if (!activeSession?.title || activeSession.title === "New Chat") {
      setSessionTitle(sessionId, finalInput);
    }

    setInput("");
    setIsLoading(true);

    if (!session?.runtimeUrl || !session?.runtimeKey) {
      addMessage(sessionId, {
        intent: "assistant",
        speech: "Core offline. Connect in Settings to start.",
      } as AgentPayload);
      showBanner("Core offline. Connect in Settings.", "error");
      setIsLoading(false);
      return;
    }

    let runId: string | null = null;
    try {
      const created = await mobileApi.createRun(session, finalInput, undefined, {
        appId: activeApp?.id,
      });
      runId = created.run_id || null;
      if (!runId) {
        throw new Error("Core did not return a run_id");
      }
      const currentRunId = runId;

      const pollRun = async () => {
        for (let i = 0; i < 40; i += 1) {
          const run = await mobileApi.getRun(session, currentRunId);
          const status = String(run?.status || "").toLowerCase();

          if (status === "waiting_approval") {
            const pending = run?.pending_approval || {};
            const operation = run?.context?.metadata?.pack_inputs?.operations?.[0] || {};
            const actionLabel =
              operation?.mode === "delete"
                ? "Delete File"
                : operation?.mode === "write"
                ? "Write File"
                : operation?.tool === "execute_shell_command"
                ? "Device Action"
                : "Approval Required";
            const target = operation?.path || operation?.file_path;
            const approvalCard: ApprovalCard = {
              action: actionLabel,
              target: target ? String(target) : undefined,
              reason: pending?.prompt ? String(pending.prompt) : "Approval required.",
              approvalId: pending?.approval_id ? String(pending.approval_id) : undefined,
              runId: currentRunId,
            };
            addMessage(sessionId, {
              intent: "assistant",
              speech: "Approval required",
              messageType: "approval",
              approval: approvalCard,
            } as AgentPayload);
            showBanner("Approval required.", "neutral");
            return;
          }

          if (status === "completed") {
            const resultText =
              (typeof run?.result === "string" && run.result.trim()) ||
              (typeof run?.result_data === "string" && run.result_data.trim()) ||
              (run?.result_data ? JSON.stringify(run.result_data) : "") ||
              "Completed.";
            addMessage(sessionId, {
              intent: "assistant",
              speech: resultText,
            } as AgentPayload);
            showBanner("Action completed.", "success");
            return;
          }

          if (status === "failed") {
            const resultText =
              (typeof run?.result === "string" && run.result.trim()) ||
              "Run failed. Check the core logs for details.";
            addMessage(sessionId, {
              intent: "assistant",
              speech: resultText,
            } as AgentPayload);
            showBanner("Action failed.", "error");
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        addMessage(sessionId, {
          intent: "assistant",
          speech: "Still processing. Check Activity for status.",
        } as AgentPayload);
      };

      await pollRun();
    } catch (err) {
      console.error(err);
      const runtimeUrl = String(session?.runtimeUrl || "");
      const isLoopback = runtimeUrl.includes("127.0.0.1") || runtimeUrl.toLowerCase().includes("localhost");
      const message = err instanceof Error ? err.message : "";
      const statusMatch = message.match(/API request failed: (\\d{3})/);
      let friendly = "Core unreachable. Check your local core and runtime key.";
      if (statusMatch?.[1]) {
        const status = statusMatch[1];
        if (status === "401" || status === "403") {
          friendly = "Invalid runtime key. Open Settings → Configure Session.";
        } else {
          friendly = `Core returned an error (${status}). Restart the core and try again.`;
        }
      } else if (isLoopback) {
        friendly = "Core unreachable. On iPhone, 127.0.0.1/localhost won't work — use your Mac Mini IP in Settings.";
      }
      addMessage(sessionId, {
        intent: "assistant",
        speech: friendly,
      } as AgentPayload);
      showBanner("Core unreachable.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprovalDecision = async (card: ApprovalCard, decision: "approved" | "rejected") => {
    if (!session?.runtimeUrl || !session?.runtimeKey || !card.approvalId || !card.runId) {
      return;
    }
    try {
      await mobileApi.resolveApproval(session, card.runId, card.approvalId, decision);
      addMessage(activeSessionId || createSession(), {
        intent: "assistant",
        speech: decision === "approved" ? "Approval sent. Executing now." : "Action canceled.",
      } as AgentPayload);
      showBanner(decision === "approved" ? "Approval sent." : "Action canceled.", "success");
    } catch (err) {
      console.warn("Approval resolution failed", err);
      addMessage(activeSessionId || createSession(), {
        intent: "assistant",
        speech: "Approval failed. Check core connection.",
      } as AgentPayload);
      showBanner("Approval failed.", "error");
    }
  };

  const renderMessage = ({ item }: { item: AgentPayload }) => {
    const isUser = item.intent === "user";

    if (item.messageType === "approval" && item.approval) {
      return (
        <View
          style={{
            alignSelf: "stretch",
            marginHorizontal: SPACING.md,
            marginVertical: SPACING.sm,
            borderRadius: 18,
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
                height: 40,
                borderRadius: 12,
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
                height: 40,
                borderRadius: 12,
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
        <View style={{ paddingHorizontal: SPACING.md, paddingVertical: 6, maxWidth: "92%" }}>
          <Text
            style={{
              fontSize: 16,
              color: theme.colors.text,
              fontFamily: "DMSans_400Regular",
              lineHeight: 24,
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
            paddingVertical: 12,
            borderRadius: 22,
            borderBottomRightRadius: 6,
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
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}
      {showHeader ? (
        <>
          <View
            style={{
              paddingHorizontal: SPACING.md,
              paddingTop: SPACING.sm,
              paddingBottom: SPACING.sm,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 18, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
              Assistant
            </Text>
            <CoreStatusBar variant="pill" />
          </View>
          {showAppChip && activeApp ? (
            <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm }}>
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>App</Text>
                <Text style={{ fontSize: 12, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>
                  {activeApp.name}
                </Text>
                <TouchableOpacity onPress={clearActiveApp}>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <FlatList
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={renderMessage}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: 96 }}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Start a conversation.</Text>
            </View>
          }
        />

        <View style={{ paddingBottom: 0 }}>
          {showQuickActions ? (
            <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm }}>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={{
                      paddingHorizontal: 12,
                      height: 30,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onPress={() => sendMessage(action.prompt)}
                  >
                    <Text style={{ fontSize: 12, color: theme.colors.text }}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <InputBar
            onSend={(text) => sendMessage(text)}
            onMediaUpload={handleMediaUpload}
            onPlusPress={handlePlusPress}
            isLoading={isLoading}
            prefilledPrompt={input}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
