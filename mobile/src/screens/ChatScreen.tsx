import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated as LegacyAnimated,
  Dimensions,
  View,
  Text,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { MobileAuthExpiredError, mobileApi, type EmpyralistStreamEvent, type MobileThreadHistoryItem } from "@/src/lib/api";
import { useMobileChatContext, usePrimaryGatewayDoctor } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { normalizeTranscriptStreamEvent, transcriptStreamEventsFromMetadata } from "@/src/lib/transcriptEvents";
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

type MobileInspectorTab = "connections" | "tools" | "memory" | "files" | "thread";

const MOBILE_INSPECTOR_TABS: { id: MobileInspectorTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "connections", label: "Connections", icon: "git-network-outline" },
  { id: "tools", label: "Tools", icon: "construct-outline" },
  { id: "memory", label: "Memory", icon: "albums-outline" },
  { id: "files", label: "Files", icon: "folder-open-outline" },
  { id: "thread", label: "Thread", icon: "chatbubble-ellipses-outline" },
];

type KinThinkingIndicatorProps = {
  theme: ReturnType<typeof useTheme>;
};

function KinThinkingIndicator({ theme }: KinThinkingIndicatorProps) {
  const textGlow = useSharedValue(0);

  useEffect(() => {
    textGlow.value = withRepeat(
      withTiming(1, {
        duration: MOBILE_MOTION_TIMINGS.slow,
        easing: MOBILE_MOTION_EASING.standard,
      }),
      -1,
      true,
    );
    return () => {
      textGlow.value = 0;
    };
  }, [textGlow]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: 0.64 + textGlow.value * 0.36,
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
      <Animated.Text
        style={[
          {
            fontSize: 12.5,
            fontWeight: "700",
            color: theme.colors.textSecondary,
            letterSpacing: 0,
          },
          textStyle,
        ]}
      >
        Thinking
      </Animated.Text>
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

function readText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeRuntimeAccessMode(value: unknown): "default_guarded" | "full_access" {
  const token = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["full_access", "autonomous_agent", "trusted_full_access", "agent_owned_full_access"].includes(token)) {
    return "full_access";
  }
  return "default_guarded";
}

function runtimeAccessModeLabel(value: unknown) {
  return normalizeRuntimeAccessMode(value) === "full_access" ? "Autonomous Agent" : "Default Guarded";
}

function runtimeAccessModeFromRecord(record: Record<string, unknown> | null | undefined): string {
  const source = readRecord(record);
  const metadata = readRecord(source.metadata);
  return readText(source.runtime_access_mode)
    || readText(source.runtimeAccessMode)
    || readText(source.runtime_access_label)
    || readText(metadata.runtime_access_mode)
    || readText(metadata.runtimeAccessMode)
    || "";
}

function runtimeTargetLabelFromToken(value: unknown) {
  const token = String(value ?? "").trim().toLowerCase();
  if (token.includes("cloud_computer") || token.includes("browser_session")) return "Cloud Computer";
  if (token.includes("self_host") || token.includes("node") || token.includes("vps")) return "Server/VPS";
  if (token.includes("gateway") || token.includes("local") || token.includes("companion") || token.includes("user_device")) return "This Device";
  if (token.includes("cloud")) return "Cloud";
  return "";
}

function agentComputerPill(source: string, access: string) {
  return `Agent Computer · ${source}${access ? ` · ${access}` : ""}`;
}

function localGatewayLabel(gateway: Record<string, unknown>) {
  const label = [
    gateway.display_name,
    gateway.device_name,
    gateway.platform,
    gateway.device_id,
  ].map((item) => String(item ?? "").trim()).find(Boolean) || "";
  const token = label.toLowerCase();
  if (token.includes("mac mini")) return "Mac mini";
  if (token.includes("mac")) return "This Mac";
  return label ? "This Device" : "This Device";
}

function runtimePillFromState(params: {
  gateway: Record<string, unknown> | null | undefined;
  doctor: Record<string, unknown> | null | undefined;
  runtimeAttachments?: { attachments?: unknown[] } | null;
}) {
  const gateway = readRecord(params.gateway);
  const doctor = readRecord(params.doctor);
  const gatewayStatus = readText(doctor.status).toLowerCase()
    || readText(gateway.status).toLowerCase()
    || readText(gateway.connection_status).toLowerCase();
  if (Object.keys(gateway).length > 0) {
    const access = runtimeAccessModeLabel(runtimeAccessModeFromRecord(gateway));
    if (["offline", "not_attached", "disconnected"].includes(gatewayStatus)) {
      return { target: "Agent Computer · Offline", access: "" };
    }
    if (["degraded", "blocked", "unhealthy", "warn"].includes(gatewayStatus)) {
      return { target: agentComputerPill("Degraded", access), access: "" };
    }
    return { target: agentComputerPill(localGatewayLabel(gateway), access), access: "" };
  }

  const attachments = Array.isArray(params.runtimeAttachments?.attachments)
    ? (params.runtimeAttachments?.attachments ?? []).map((item) => readRecord(item))
    : [];
  const preferred = attachments.find((item) => {
    const kind = readText(item.attachment_kind).toLowerCase();
    return kind === "cloud_computer" || kind === "self_hosted_business_node" || kind === "local_companion";
  });
  if (preferred) {
    const kind = readText(preferred.attachment_kind).toLowerCase();
    const status = readText(preferred.status).toLowerCase();
    const access = runtimeAccessModeLabel(runtimeAccessModeFromRecord(preferred));
    if (kind === "cloud_computer") {
      return { target: agentComputerPill(preferred.healthy === false ? "Cloud Computer degraded" : "Cloud Computer", access), access: "" };
    }
    if (kind === "self_hosted_business_node") {
      if (preferred.online === false || status === "offline") return { target: "Agent Computer · Server/VPS offline", access: "" };
      if (preferred.healthy === false || ["degraded", "unhealthy"].includes(status)) return { target: agentComputerPill("Server/VPS degraded", access), access: "" };
      return { target: agentComputerPill("Server/VPS", access), access: "" };
    }
    return { target: preferred.online === false ? "Agent Computer · Offline" : agentComputerPill("This Device", access), access: "" };
  }

  return { target: "Cloud", access: "" };
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

function streamEventStatus(value: unknown, eventType = "", detailPayload: Record<string, unknown> = {}): "running" | "done" | "error" {
  const normalizedEventType = eventType.toLowerCase();
  const status = String(value || detailPayload.decision || detailPayload.resolution || "").trim().toLowerCase();
  if (["done", "complete", "completed", "success", "succeeded", "approved", "approve", "allowed", "accepted", "resolved", "executed"].includes(status)) {
    return "done";
  }
  if (["error", "failed", "failure", "blocked", "denied", "deny", "rejected", "reject", "offline", "degraded", "cancelled", "canceled", "aborted"].includes(status)) {
    return "error";
  }
  if (
    normalizedEventType.includes("error")
    || normalizedEventType.includes("failed")
    || normalizedEventType.includes("blocked")
    || normalizedEventType.includes("interrupted")
  ) {
    return "error";
  }
  if (normalizedEventType.includes("approval.resolved")) {
    return "done";
  }
  if (
    normalizedEventType.includes("result")
    || normalizedEventType.includes("completed")
    || normalizedEventType.includes("finished")
    || normalizedEventType.includes("artifact.created")
    || normalizedEventType.includes("screenshot")
  ) {
    return "done";
  }
  return "running";
}

function streamEventData(payload: Record<string, unknown>): Record<string, unknown> {
  return payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? (payload.data as Record<string, unknown>)
    : {};
}

function streamEventGroupKey(event: EmpyralistStreamEvent): string {
  const payload = event.payload || {};
  const data = streamEventData(payload);
  const detailPayload = { ...payload, ...data };
  const eventType = String(detailPayload.event_type || detailPayload.event || detailPayload.type || detailPayload.kind || "").trim().toLowerCase();
  const groupKind = eventType.includes("approval")
    ? "approval"
    : eventType.includes("delegation")
      ? "delegation"
    : eventType.includes("artifact") || eventType.includes("screenshot")
      ? "artifact"
      : eventType.includes("tool") || eventType.includes("browser") || eventType.includes("search") || eventType.includes("file") || eventType.includes("shell") || eventType.includes("exec")
        ? "tool"
        : event.event;
  const explicitId = String(
    detailPayload.approval_id
    || detailPayload.artifact_id
    || detailPayload.tool_call_id
    || detailPayload.request_id
    || detailPayload.item_id
    || detailPayload.activity_event_id
    || detailPayload.step_id
    || detailPayload.runtime_session_id
    || detailPayload.id
    || "",
  ).trim();
  if (explicitId) {
    return `${event.event}:${groupKind}:${explicitId}`;
  }
  const title = String(payload.title || payload.label || payload.action || "").trim();
  return `${event.event}:${eventType}:${title}`;
}

function compactStreamEventDetail(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.description,
    payload.caption,
    payload.title,
    payload.summary,
    payload.result_summary,
    payload.task_summary,
    payload.detail,
    payload.message,
    payload.specialist_name,
    payload.target_summary,
    payload.query,
    payload.path,
    payload.filename,
    payload.command,
    payload.url,
    payload.status,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || "").replace(/\s+/g, " ").trim();
    if (text) {
      return text.length > 96 ? `${text.slice(0, 93)}...` : text;
    }
  }
  return undefined;
}

function buildStreamEventCard(event: EmpyralistStreamEvent): AgentPayload | null {
  const normalizedEvent = normalizeTranscriptStreamEvent(event);
  if (!normalizedEvent) return null;
  const payload = normalizedEvent.payload || {};
  const data = streamEventData(payload);
  const detailPayload = { ...payload, ...data };
  const metadata = readRecord(detailPayload.metadata);
  const eventType = String(detailPayload.event_type || detailPayload.event || detailPayload.type || detailPayload.kind || "").trim().toLowerCase();
  const status = streamEventStatus(detailPayload.status || detailPayload.state, eventType, detailPayload);
  const explicitTitle = String(detailPayload.title || detailPayload.label || detailPayload.action || "").trim();
  const toolName = String(detailPayload.tool_name || detailPayload.name || detailPayload.capability_id || detailPayload.action_id || "").trim();
  const toolToken = `${eventType} ${toolName}`.toLowerCase();
  const decision = String(detailPayload.decision || detailPayload.resolution || "").trim().toLowerCase();
  let speech = explicitTitle;

  if (!speech) {
    if (eventType.includes("approval")) {
      speech = status === "done"
        ? "Approval approved"
        : status === "error" || ["rejected", "reject", "denied", "deny"].includes(decision)
          ? "Approval denied"
          : "Waiting for approval";
    } else if (eventType === "delegation.started") {
      const specialistName = String(detailPayload.specialist_name || detailPayload.name || detailPayload.label || "").trim();
      speech = `Delegated to ${specialistName || "Specialist"}`;
    } else if (eventType === "delegation.finished") {
      speech = status === "error" ? "Specialist failed" : "Specialist finished";
    } else if (eventType.includes("screenshot")) {
      speech = "Captured screenshot";
    } else if (eventType.includes("artifact")) {
      const artifactText = `${String(detailPayload.kind || "")} ${String(detailPayload.title || "")} ${String(detailPayload.mime_type || detailPayload.mimeType || "")}`.toLowerCase();
      speech = artifactText.includes("screenshot") || artifactText.includes("image/")
        ? "Captured screenshot"
        : "Created artifact";
    } else if (eventType.includes("search")) {
      speech = status === "done" ? "Searched web" : "Searching web";
    } else if (eventType.includes("browser") || toolToken.includes("browser")) {
      speech = status === "done" ? "Used browser" : "Using browser";
    } else if (eventType.includes("file") || toolToken.includes("file")) {
      speech = status === "done" ? "Read file" : "Reading file";
    } else if (eventType.includes("shell") || eventType.includes("exec") || eventType.includes("command") || toolToken.includes("shell") || toolToken.includes("command")) {
      speech = status === "done" ? "Ran command" : "Running shell";
    } else if (eventType.includes("hardware")) {
      speech = status === "done" ? "Hardware action complete" : status === "error" ? "Hardware action blocked" : "Using hardware runtime";
    } else if (eventType.includes("error") || eventType.includes("failed")) {
      speech = "Action failed";
    } else if (eventType.includes("status") || eventType.includes("runtime")) {
      speech = status === "done" ? "Status updated" : status === "error" ? "Action blocked" : "Checking status";
    } else if (toolName) {
      speech = status === "done" ? `Used ${toolName}` : `Using ${toolName}`;
    } else if (event.event === "step") {
      speech = status === "done" ? "Step complete" : "Working";
    } else {
      speech = status === "done" ? "Action complete" : "Working";
    }
  }

  const detail = compactStreamEventDetail(detailPayload);
  const runtimeTarget = runtimeTargetLabelFromToken(detailPayload.runtime_target || metadata.runtime_target);
  const runtimeAccess = runtimeAccessModeFromRecord({ ...detailPayload, metadata });
  const runtimeDetail = [runtimeTarget, runtimeAccess ? runtimeAccessModeLabel(runtimeAccess) : ""]
    .filter(Boolean)
    .join(" · ");
  const source = [detail, runtimeDetail].filter(Boolean).join(" · ") || undefined;
  const artifactUrl = String(detailPayload.url || "").trim();
  const actions = artifactUrl && /^(https?:|file:)/i.test(artifactUrl)
    ? [{ label: "Open", command: `open:${artifactUrl}` }]
    : undefined;

  return {
    intent: "assistant",
    messageType: "tool",
    toolStatus: status,
    toolKind: eventType || event.event,
    speech,
    source,
    actions,
  };
}

function buildTransparencyCards(payload: {
  actions?: unknown[];
  interventions?: unknown[];
  stream_events?: EmpyralistStreamEvent[];
}, options?: { limit?: number }): AgentPayload[] {
  const cards: AgentPayload[] = [];
  const pushCard = (
    title: string,
    detail?: string,
    status: AgentPayload["toolStatus"] = "done",
    actions?: AgentPayload["actions"],
  ) => {
    const cleanTitle = title.trim();
    const cleanDetail = String(detail || "").trim();
    if (!cleanTitle || cards.some((item) => item.speech === cleanTitle && item.source === cleanDetail)) return;
    cards.push({
      intent: "assistant",
      messageType: "tool",
      toolStatus: status,
      speech: cleanTitle,
      source: cleanDetail || undefined,
      actions,
    });
  };

  for (const event of Array.isArray(payload.stream_events) ? payload.stream_events : []) {
    const normalizedEvent = normalizeTranscriptStreamEvent(event);
    if (!normalizedEvent) continue;
    const card = buildStreamEventCard(normalizedEvent);
    if (card) {
      pushCard(card.speech, card.source, card.toolStatus, card.actions);
    }
  }

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

  const limit = Number(options?.limit || 0);
  return limit > 0 ? cards.slice(0, limit) : cards;
}

function transcriptEventsFromTurn(turn: NonNullable<MobileThreadHistoryItem["turns"]>[number]): EmpyralistStreamEvent[] {
  const metadata = readRecord(turn?.metadata);
  return transcriptStreamEventsFromMetadata(metadata);
}

function buildCloudThreadMessages(item: MobileThreadHistoryItem): AgentPayload[] {
  const turns = Array.isArray(item.turns) ? item.turns : [];
  const orderedTurns = [...turns].sort((left, right) => {
    const leftTime = parseCloudTimestamp(left?.created_at || left?.updated_at);
    const rightTime = parseCloudTimestamp(right?.created_at || right?.updated_at);
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  });
  const messages: AgentPayload[] = [];
  for (const turn of orderedTurns) {
    const role = String(turn?.role || "").trim().toLowerCase();
    const content = String(turn?.content || "").trim();
    if (role === "user") {
      if (content) {
        messages.push({ intent: "user", speech: content });
      }
      continue;
    }
    if (role === "assistant") {
      messages.push(...buildTransparencyCards({
        stream_events: transcriptEventsFromTurn(turn),
        interventions: turn.interventions,
      }));
      if (content) {
        messages.push({ intent: "assistant", speech: content });
      }
    }
  }
  return messages;
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
    replaceSession,
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
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<MobileInspectorTab>("connections");
  const { banner, showBanner } = useTransientBanner();
  const sage = getPrimaryAgent();
  const messagesListRef = useRef<FlatList<AgentPayload>>(null);
  const activeTurnRef = useRef(0);
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
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
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
  const runtimePill = useMemo(
    () => runtimePillFromState({
      gateway: gatewayDoctor.gateway,
      doctor: gatewayDoctor.doctor,
      runtimeAttachments: chatContextQuery.data?.runtimeAttachments,
    }),
    [chatContextQuery.data?.runtimeAttachments, gatewayDoctor.doctor, gatewayDoctor.gateway],
  );
  const proofCardCount = useMemo(
    () => messages.filter((message) => message.messageType === "tool" || message.messageType === "approval").length,
    [messages],
  );

  const openInspector = React.useCallback((tab: MobileInspectorTab = "connections") => {
    setActiveInspectorTab(tab);
    setInspectorVisible(true);
  }, []);

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

  const openCloudThread = React.useCallback(
    (item: MobileThreadHistoryItem) => {
      const threadId = String(item.id || "").trim();
      if (!threadId) return;
      triggerDrawerHaptic();
      const createdAt = parseCloudTimestamp(item.created_at);
      const updatedAt = parseCloudTimestamp(item.last_turn_at || item.updated_at || item.created_at);
      replaceSession({
        id: threadId,
        title: cloudThreadPreview(item),
        agentId: activeAgent.id,
        agentName: activeAgent.label,
        runtimeRole: activeAgent.runtimeRole,
        avatarColor: activeAgent.avatarColor,
        icon: activeAgent.icon,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        messages: buildCloudThreadMessages(item),
      });
      closeHistory(false);
    },
    [activeAgent, closeHistory, replaceSession, triggerDrawerHaptic],
  );

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
    const turnRequestId = activeTurnRef.current + 1;
    activeTurnRef.current = turnRequestId;

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
      let nextStreamCardIndex = placeholderIndex + 1;
      const streamCardIndexByKey = new Map<string, number>();
      const upsertStreamEventCard = (event: EmpyralistStreamEvent) => {
        if (activeTurnRef.current !== turnRequestId) return;
        const normalizedEvent = normalizeTranscriptStreamEvent(event);
        if (!normalizedEvent) return;
        const card = buildStreamEventCard(normalizedEvent);
        if (!card) return;
        const key = streamEventGroupKey(normalizedEvent);
        const existingIndex = streamCardIndexByKey.get(key);
        if (existingIndex != null) {
          updateMessage(currentSessionId, existingIndex, card);
          appendRunActivity(card.speech);
          return;
        }
        addMessage(currentSessionId, card);
        streamCardIndexByKey.set(key, nextStreamCardIndex);
        nextStreamCardIndex += 1;
        appendRunActivity(card.speech);
      };
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
            if (activeTurnRef.current !== turnRequestId) return;
            streamedReply += delta;
            appendRunActivity("Writing");
            updateMessage(currentSessionId, placeholderIndex, {
              speech: streamedReply,
            });
          },
          onEvent: upsertStreamEventCard,
        },
      );
      const hasStructuredCards =
        (Array.isArray(payload.approvals) && payload.approvals.length > 0) ||
        (Array.isArray(payload.interventions) && payload.interventions.length > 0);

      if (activeTurnRef.current !== turnRequestId) {
        return;
      }

      updateMessage(currentSessionId, placeholderIndex, {
        speech: hasStructuredCards ? "" : (payload.reply || streamedReply || ""),
      });

      for (const card of buildTransparencyCards({
        ...payload,
        stream_events: (payload.stream_events || []).filter((event) => {
          const normalizedEvent = normalizeTranscriptStreamEvent(event);
          return normalizedEvent ? !streamCardIndexByKey.has(streamEventGroupKey(normalizedEvent)) : false;
        }),
      }, { limit: 4 })) {
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
      if (activeTurnRef.current !== turnRequestId) {
        return;
      }
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
      if (activeTurnRef.current === turnRequestId) {
        setIsLoading(false);
      }
    }
  };

  const stopCurrentTurn = React.useCallback(() => {
    activeTurnRef.current += 1;
    setIsLoading(false);
    setRunActivity([]);
    showBanner("Stopped.", "success");
  }, [showBanner]);

  const handleApprovalDecision = async (card: ApprovalCard, decision: "allow_once" | "allow_session" | "deny") => {
    if (!session?.runtimeKey) return;
    const approved = decision === "allow_once" || decision === "allow_session";
    const approvalScope = decision === "allow_session" ? "session" : "once";
    try {
      if (card.kind === "direct") {
        if (!activeSession?.id || !card.connector || !card.actionId || !card.input) return;
        if (!approved) {
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
        let nextStreamCardIndex = placeholderIndex + 1;
        const streamCardIndexByKey = new Map<string, number>();
        const upsertStreamEventCard = (event: EmpyralistStreamEvent) => {
          const normalizedEvent = normalizeTranscriptStreamEvent(event);
          if (!normalizedEvent) return;
          const card = buildStreamEventCard(normalizedEvent);
          if (!card) return;
          const key = streamEventGroupKey(normalizedEvent);
          const existingIndex = streamCardIndexByKey.get(key);
          if (existingIndex != null) {
            updateMessage(activeSession.id, existingIndex, card);
            appendRunActivity(card.speech);
            return;
          }
          addMessage(activeSession.id, card);
          streamCardIndexByKey.set(key, nextStreamCardIndex);
          nextStreamCardIndex += 1;
          appendRunActivity(card.speech);
        };
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
            onEvent: upsertStreamEventCard,
          },
        );
        updateMessage(activeSession.id, placeholderIndex, {
          speech: payload.reply || streamedReply || "",
        });
        for (const resultCard of buildTransparencyCards({
          ...payload,
          stream_events: (payload.stream_events || []).filter((event) => {
            const normalizedEvent = normalizeTranscriptStreamEvent(event);
            return normalizedEvent ? !streamCardIndexByKey.has(streamEventGroupKey(normalizedEvent)) : false;
          }),
        }, { limit: 4 })) {
          addMessage(activeSession.id, resultCard);
        }
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
        approved ? "approved" : "rejected",
        approvalScope,
      );
      if (!activeSession?.id) return;
      showBanner(approved ? "Done." : "Noted.", "success");
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

  const handleToolAction = React.useCallback((command: string) => {
    const url = command.startsWith("open:") ? command.slice("open:".length).trim() : "";
    if (!url) return;
    void Linking.openURL(url).catch(() => {
      showBanner("Could not open that artifact.", "error");
    });
  }, [showBanner]);

  const renderMessage = ({ item, index }: { item: AgentPayload; index: number }) => {
    const isUser = item.intent === "user";

    if (item.messageType === "tool") {
      const iconName =
        item.toolStatus === "running"
          ? "ellipsis-horizontal-circle-outline"
          : item.toolStatus === "error"
            ? "alert-circle-outline"
            : "checkmark-circle-outline";
      const iconColor = item.toolStatus === "error" ? theme.colors.error : theme.colors.textSecondary;
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
          <Ionicons name={iconName} size={18} color={iconColor} />
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
          {item.actions?.map((action) => (
            <ActionButton
              key={action.command}
              label={action.label}
              variant="secondary"
              onPress={() => handleToolAction(action.command)}
              style={{ alignSelf: "center" }}
            />
          ))}
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
              label="Allow once"
              variant="primary"
              onPress={() => handleApprovalDecision(item.approval!, "allow_once")}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="Allow session"
              variant="secondary"
              onPress={() => handleApprovalDecision(item.approval!, "allow_session")}
              style={{ flex: 1 }}
            />
            <ActionButton
              label="Deny"
              variant="secondary"
              onPress={() => handleApprovalDecision(item.approval!, "deny")}
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

  const InspectorAction = ({
    label,
    route,
  }: {
    label: string;
    route: string;
  }) => (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => {
        setInspectorVisible(false);
        router.push(route as never);
      }}
      style={{
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ fontSize: 12.5, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const InspectorCard = ({
    eyebrow,
    title,
    body,
    children,
  }: {
    eyebrow: string;
    title: string;
    body?: string;
    children?: React.ReactNode;
  }) => (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 5,
      }}
    >
      <Text style={{ fontSize: 10.5, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, letterSpacing: 0.7, textTransform: "uppercase" }}>
        {eyebrow}
      </Text>
      <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
        {title}
      </Text>
      {body ? (
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
          {body}
        </Text>
      ) : null}
      {children}
    </View>
  );

  const renderInspectorContent = () => {
    if (activeInspectorTab === "connections") {
      return (
        <>
          <InspectorCard
            eyebrow="AI path"
            title={runtimePill.target === "Cloud" ? "Cloud" : runtimePill.target}
            body="Sage starts in Cloud and uses Agent Computer only when connected work needs it."
          >
            <InspectorAction label="Open Connections" route="/integrations" />
          </InspectorCard>
          <InspectorCard
            eyebrow="Agent Computer"
            title={runtimePill.target.includes("Agent Computer") ? runtimePill.target : "Not selected"}
            body="This Device, dedicated computers, Cloud Computer, and Server/VPS sources stay grouped as Agent Computer."
          >
            <InspectorAction label="Manage Agent Computer" route="/gateway" />
          </InspectorCard>
        </>
      );
    }
    if (activeInspectorTab === "tools") {
      return (
        <>
          <InspectorCard
            eyebrow="Proof rows"
            title={`${proofCardCount} in this chat`}
            body="Commands, browser use, screenshots, artifacts, approvals, and specialists appear inline before Sage answers."
          />
          <InspectorCard
            eyebrow="Approvals"
            title={pendingGatewayApprovals > 0 ? `${pendingGatewayApprovals} waiting` : "None waiting"}
            body="Guarded actions ask inside chat. Autonomous Agent hardware skips Empyralis per-action prompts."
          >
            <InspectorAction label="Review approvals" route="/approvals" />
          </InspectorCard>
        </>
      );
    }
    if (activeInspectorTab === "memory") {
      return (
        <InspectorCard
          eyebrow="Memory"
          title={memoryFacts.length > 0 ? `${memoryFacts.length} visible fact${memoryFacts.length === 1 ? "" : "s"}` : "No visible memory capsule"}
          body={memoryFacts[0] || "Saved profile facts and preferences stay out of the prompt unless relevant."}
        >
          <InspectorAction label="Manage memory" route="/memory" />
        </InspectorCard>
      );
    }
    if (activeInspectorTab === "files") {
      return (
        <InspectorCard
          eyebrow="Files"
          title="Artifacts and outputs"
          body="Screenshots, generated files, and saved outputs open from inline proof cards or the library."
        >
          <InspectorAction label="Open library" route="/artifacts" />
        </InspectorCard>
      );
    }
    return (
      <>
        <InspectorCard
          eyebrow="Thread"
          title={activeSession.title || "Current chat"}
          body={`${messages.length} message${messages.length === 1 ? "" : "s"} in this local view.`}
        />
        <InspectorCard
          eyebrow="History"
          title="Cloud replay"
          body="Reopened cloud threads replay the same proof cards before the final answer."
        >
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => {
              setInspectorVisible(false);
              openHistory();
            }}
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text style={{ fontSize: 12.5, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              Open chats
            </Text>
          </TouchableOpacity>
        </InspectorCard>
      </>
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
          <TouchableOpacity
            activeOpacity={0.84}
            onPress={() => openInspector("connections")}
            style={{
              marginTop: 6,
              alignSelf: embeddedMode ? "center" : "flex-start",
              maxWidth: "100%",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.colors.textSecondary, fontFamily: "DMSans_700Bold" }}>
              {runtimePill.access ? `${runtimePill.target} · ${runtimePill.access}` : runtimePill.target}
            </Text>
          </TouchableOpacity>
        </View>
        {!historyVisible ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 }}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Open Sage panel"
              onPress={() => openInspector("connections")}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Ionicons name="options-outline" size={22} color={theme.colors.text} />
            </MotionPressable>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
              onPress={createNewThread}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={23} color={theme.colors.text} />
            </MotionPressable>
          </View>
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
                <TouchableOpacity activeOpacity={0.86} onPress={() => openInspector("memory")}>
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
          ListFooterComponent={() => (
            <>
              {isLoading ? (
                <View style={{ paddingHorizontal: SPACING.md, paddingTop: 8 }}>
                  <KinThinkingIndicator theme={theme} />
                </View>
              ) : null}
            </>
          )}
          ListEmptyComponent={null}
        />

        <View style={{ paddingBottom: 0 }}>
          <InputBar
            onSend={(text) => sendMessage(text)}
            onStop={stopCurrentTurn}
            onPlusPress={() => openInspector("connections")}
            isLoading={isLoading}
            prefilledPrompt={input}
            placeholder={requestedAgentId ? `Message ${activeAgent.label}` : "Ask Sage anything"}
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
      <Modal
        transparent
        animationType="fade"
        visible={inspectorVisible}
        onRequestClose={() => setInspectorVisible(false)}
      >
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(17, 24, 39, 0.22)" }} onPress={() => setInspectorVisible(false)} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom, 16),
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              maxHeight: "78%",
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10.5, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, letterSpacing: 0.7, textTransform: "uppercase" }}>
                  Sage
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 18, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {MOBILE_INSPECTOR_TABS.find((tab) => tab.id === activeInspectorTab)?.label || "Panel"}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12.5, color: theme.colors.textSecondary }}>
                  Connections, tools, memory, files, and thread details stay here.
                </Text>
              </View>
              <MotionPressable
                accessibilityRole="button"
                accessibilityLabel="Close Sage panel"
                onPress={() => setInspectorVisible(false)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.card,
                }}
              >
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </MotionPressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {MOBILE_INSPECTOR_TABS.map((tab) => {
                const selected = activeInspectorTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.86}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setActiveInspectorTab(tab.id)}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.text : theme.colors.border,
                      backgroundColor: selected ? theme.colors.cardHover : theme.colors.surface,
                    }}
                  >
                    <Ionicons name={tab.icon} size={17} color={selected ? theme.colors.text : theme.colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ gap: 10 }}>
              {renderInspectorContent()}
            </View>
          </View>
        </View>
      </Modal>
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
                          <MotionPressable
                            key={String(item.id || `thread-${preview}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open ${preview}`}
                            onPress={() => openCloudThread(item)}
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
                          </MotionPressable>
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
