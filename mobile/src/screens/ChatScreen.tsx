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
import { mobileApi, normalizeServerUrl } from "@/src/lib/api";
import { buildAgentDirectory, getAgentById } from "@/src/lib/agents";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import { extractRunReply } from "@/src/lib/run-response";

type ApprovalCard = {
  action: string;
  target?: string;
  reason?: string;
  approvalId?: string;
  runId?: string;
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
  const [runActivity, setRunActivity] = useState<string[]>([]);
  const { banner, showBanner } = useTransientBanner();
  const initializedSessions = useRef<Set<string>>(new Set());
  const directory = useMemo(() => buildAgentDirectory(agents), [agents]);
  const activeAgent = useMemo(
    () => getAgentById(agentId, agents) || directory[0],
    [agentId, agents, directory],
  );
  const activeSession = sessions.find((item) => item.agentId === agentId);
  const messages = activeSession?.messages || [];
  const runtimeRole = activeAgent?.runtimeRole || agentId;

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
    setRunActivity(["Understanding your request"]);

    if (!session?.runtimeUrl || !session?.runtimeKey) {
      setFailedMessageIndex(nextUserMessageIndex);
      setIsLoading(false);
      setRunActivity([]);
      showBanner("Add your server URL and API key in Settings first.", "error");
      return;
    }

    try {
      appendRunActivity("Starting secure run");
      const runtimeUrl = normalizeServerUrl(session.runtimeUrl);
      const response = await fetch(`${runtimeUrl}/runs/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": session.runtimeKey || "",
        },
        body: JSON.stringify({
          input: finalInput,
          user_goal: finalInput,
          agent_role: runtimeRole,
          workspace_id: session.workspaceId || "default",
          session_id: sessionId,
          metadata: {
            execution_target: "cloud",
            agent_role: runtimeRole,
            agent_label: activeAgent.label,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const payload = await response.json();
      const runId = String(payload?.run_id || "").trim();

      if (!runId) {
        throw new Error("Run start did not return run_id");
      }

      appendRunActivity("Connected to your core");
      const runStatusUrl = `${runtimeUrl}/runs/${encodeURIComponent(runId)}`;

      let finalRun: any = null;

      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const poll = await fetch(runStatusUrl, {
          headers: {
            "X-API-Key": session.runtimeKey || "",
          },
        });

        if (!poll.ok) {
          throw new Error(`API request failed: ${poll.status}`);
        }

        const run = await poll.json();
        const status = String(run?.status ?? "").toLowerCase();
        appendRunActivity(describeRunPhase(run));

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

      addMessage(sessionId, {
        intent: "assistant",
        speech: extractRunReply(finalRun),
      } as AgentPayload);
      setRunActivity([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach the agent. Check the server connection.";
      console.warn("Chat request failed:", message);
      setFailedMessageIndex(nextUserMessageIndex);
      setRunActivity([]);
      showBanner(message, "error");
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
            paddingVertical: 6,
            maxWidth: "92%",
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 20,
              borderTopLeftRadius: 10,
              paddingHorizontal: 16,
              paddingVertical: 13,
            }}
          >
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
            Could not reach agent
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {banner ? <TransientBanner message={banner.message} tone={banner.tone} /> : null}
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
            {activeSession?.agentName || activeAgent?.label || "Chat"}
          </Text>
          {activeAgent?.subtitle ? (
            <Text style={{ marginTop: 2, fontSize: 12, color: theme.colors.textSecondary }} numberOfLines={1}>
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
          contentContainerStyle={{ paddingTop: SPACING.sm, paddingBottom: 96, backgroundColor: theme.colors.background }}
          ListFooterComponent={
            isLoading ? (
              <View style={{ paddingHorizontal: SPACING.md, paddingVertical: 8, gap: 10 }}>
                <View
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
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
                        backgroundColor: theme.colors.textSecondary,
                      }}
                    />
                  ))}
                </View>

                <View
                  style={{
                    alignSelf: "stretch",
                    backgroundColor: theme.colors.surface,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: theme.colors.textSecondary,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      fontFamily: "DMSans_700Bold",
                    }}
                  >
                    Agent activity
                  </Text>
                  {runActivity.map((step, index) => (
                    <View
                      key={`${step}-${index}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: index === runActivity.length - 1 ? theme.colors.accent : theme.colors.border,
                          marginTop: 6,
                        }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          lineHeight: 21,
                          color: index === runActivity.length - 1 ? theme.colors.text : theme.colors.textSecondary,
                        }}
                      >
                        {step}
                      </Text>
                    </View>
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
