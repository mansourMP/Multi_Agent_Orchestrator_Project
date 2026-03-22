import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
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
import { buildAgentDirectory, getAgentById } from "@/src/lib/agents";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
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

type ChatScreenProps = {
  agentId: string;
};

export default function ChatScreen({ agentId }: ChatScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { agents } = useMobileOverviewData();
  const { sessions, ensureSessionForAgent, addMessage, setActiveSession } = useChatStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessageIndex, setFailedMessageIndex] = useState<number | null>(null);
  const { banner, showBanner } = useTransientBanner();
  const initializedSessions = useRef<Set<string>>(new Set());
  const directory = useMemo(() => buildAgentDirectory(agents), [agents]);
  const activeAgent = useMemo(
    () => getAgentById(agentId, agents) || directory[0],
    [agentId, agents, directory],
  );
  const activeSession = sessions.find((item) => item.agentId === agentId);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (!activeAgent) return;
    const sessionId = ensureSessionForAgent(activeAgent);
    setActiveSession(sessionId);
  }, [activeAgent, ensureSessionForAgent, setActiveSession]);

  useEffect(() => {
    if (!activeSession?.id || !activeAgent) return;
    if (initializedSessions.current.has(activeSession.id)) return;
    if (!activeSession || activeSession.messages.length > 0) return;
    initializedSessions.current.add(activeSession.id);
    addMessage(activeSession.id, {
      intent: "assistant",
      speech: activeAgent.intro,
    } as AgentPayload);
  }, [activeAgent, activeSession, addMessage]);

  const handleMediaUpload = () => {
    if (!activeAgent) return;
    const sessionId = activeSession?.id || ensureSessionForAgent(activeAgent);
    addMessage(sessionId, {
      intent: "assistant",
      speech: "Media uploads are disabled in V1. Use text input for now.",
    } as AgentPayload);
  };

  const handlePlusPress = () => {
    if (!activeAgent) return;
    const sessionId = activeSession?.id || ensureSessionForAgent(activeAgent);
    addMessage(sessionId, {
      intent: "assistant",
      speech: "Type what you want to do and I’ll handle it from here.",
    } as AgentPayload);
  };

  const sendMessage = async (textOverride?: string) => {
    if (!activeAgent) return;
    const finalInput = (textOverride || input).trim();
    if (!finalInput) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const sessionId = activeSession?.id || ensureSessionForAgent(activeAgent);
    const userMessage: AgentPayload = { intent: "user", speech: finalInput };
    const nextUserMessageIndex = messages.length;
    addMessage(sessionId, userMessage);
    setFailedMessageIndex(null);
    setInput("");
    setIsLoading(true);

    if (!session?.runtimeUrl || !session?.runtimeKey) {
      setFailedMessageIndex(nextUserMessageIndex);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${session.runtimeUrl}/runs/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": session.runtimeKey || "",
        },
        body: JSON.stringify({
          input: finalInput,
          agent_role: agentId,
          workspace_id: "default",
          session_id: sessionId,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const payload = await response.json();
      const runId = String(payload?.run_id ?? payload?.id ?? "");

      if (!runId) {
        throw new Error("Run start did not return run_id");
      }

      let finalRun: any = null;

      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const poll = await fetch(`${session.runtimeUrl}/runs/${encodeURIComponent(runId)}`, {
          headers: {
            "X-API-Key": session.runtimeKey || "",
          },
        });

        if (!poll.ok) {
          throw new Error(`API request failed: ${poll.status}`);
        }

        const run = await poll.json();
        const status = String(run?.status ?? "").toLowerCase();

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
            runId,
          };
          addMessage(sessionId, {
            intent: "assistant",
            speech: "Approval required",
            messageType: "approval",
            approval: approvalCard,
          } as AgentPayload);
          return;
        }

        if (status === "completed") {
          finalRun = run;
          break;
        }

        if (status === "failed") {
          finalRun = run;
          break;
        }
      }

      if (!finalRun) {
        throw new Error("Run polling timed out");
      }

      if (String(finalRun?.status ?? "").toLowerCase() === "failed") {
        throw new Error("Run failed");
      }

      const responseText =
        (typeof finalRun?.output === "string" && finalRun.output.trim()) ||
        (typeof finalRun?.result === "string" && finalRun.result.trim()) ||
        (typeof finalRun?.result_data === "string" && finalRun.result_data.trim()) ||
        (finalRun?.result_data ? JSON.stringify(finalRun.result_data) : "") ||
        "Received.";

      addMessage(sessionId, {
        intent: "assistant",
        speech: responseText,
      } as AgentPayload);
    } catch (err) {
      console.error(err);
      setFailedMessageIndex(nextUserMessageIndex);
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
      if (!activeAgent) return;
      addMessage(activeSession?.id || ensureSessionForAgent(activeAgent), {
        intent: "assistant",
        speech: decision === "approved" ? "Approval sent. Executing now." : "Action canceled.",
      } as AgentPayload);
      showBanner(decision === "approved" ? "Approval sent." : "Action canceled.", "success");
    } catch (err) {
      console.warn("Approval resolution failed", err);
      if (!activeAgent) return;
      addMessage(activeSession?.id || ensureSessionForAgent(activeAgent), {
        intent: "assistant",
        speech: "Approval failed. Check core connection.",
      } as AgentPayload);
      showBanner("Approval failed.", "error");
    }
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
            Could not reach agent
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingHorizontal: SPACING.md,
          paddingBottom: SPACING.sm,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: activeSession?.avatarColor || activeAgent?.avatarColor || theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name={(activeSession?.icon || activeAgent?.icon || "sparkles") as any} size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontFamily: "Fraunces_700Bold", color: "#111827" }}>
            {activeSession?.agentName || activeAgent?.label || "Chat"}
          </Text>
          {activeAgent?.subtitle ? (
            <Text style={{ marginTop: 2, fontSize: 12, color: "#6B7280" }} numberOfLines={1}>
              {activeAgent.subtitle}
            </Text>
          ) : null}
        </View>
      </View>
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
          contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: 96, backgroundColor: "#FFFFFF" }}
          ListFooterComponent={
            isLoading ? (
              <View style={{ paddingHorizontal: SPACING.md, paddingVertical: 8 }}>
                <View
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: "#F3F4F6",
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                >
                  {[0, 1, 2].map((dot) => (
                    <View
                      key={dot}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: "#9CA3AF",
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Start a conversation.</Text>
            </View>
          }
        />

        <View style={{ paddingBottom: 0 }}>
          <InputBar
            onSend={(text) => sendMessage(text)}
            onMediaUpload={handleMediaUpload}
            onPlusPress={handlePlusPress}
            isLoading={isLoading}
            prefilledPrompt={input}
            placeholder={`Message ${activeSession?.agentName || activeAgent?.label || "agent"}`}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
