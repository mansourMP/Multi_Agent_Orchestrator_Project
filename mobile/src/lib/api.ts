import Constants from "expo-constants";

import type {
  AgentTurnIntervention,
  AgentTurnRequest,
  AgentTurnResponse,
  ApprovalListResponse,
  ApprovalResolveResponse,
  ArtifactListResponse,
  ConnectorListResponse,
  HealthResponse,
  MachineListResponse,
  NotificationDeviceRegistrationResponse,
  RunDetailResponse,
  RunListResponse,
  NotificationListResponse,
  NotificationReadResponse,
} from "@shared/api-contract";
import { createApiClient } from "@shared/api-contract/client";
import type { MobileSession } from "./types";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  runtimeUrl?: string;
  workspaceId?: string;
  platformUrl?: string;
  empyralistApiUrl?: string;
  empyralistChatProvider?: string;
  empyralistChatModel?: string;
};

export function getDefaultRuntimeUrl() {
  return process.env.EXPO_PUBLIC_RUNTIME_URL || extra.runtimeUrl || "http://127.0.0.1:8001";
}

function getConfiguredEmpyralistApiUrl() {
  return (
    process.env.EXPO_PUBLIC_EMPYRALIST_API_URL ||
    process.env.EMPYRALIST_API_URL ||
    extra.empyralistApiUrl ||
    ""
  );
}

export function getDefaultEmpyralistApiUrl() {
  return getConfiguredEmpyralistApiUrl() || getDefaultRuntimeUrl();
}

export function getDefaultEmpyralistChatProvider() {
  return (
    process.env.EXPO_PUBLIC_EMPYRALIST_CHAT_PROVIDER ||
    process.env.EMPYRALIST_CHAT_PROVIDER ||
    extra.empyralistChatProvider ||
    ""
  );
}

export function getDefaultEmpyralistChatModel() {
  return (
    process.env.EXPO_PUBLIC_EMPYRALIST_CHAT_MODEL ||
    process.env.EMPYRALIST_CHAT_MODEL ||
    extra.empyralistChatModel ||
    ""
  );
}

export function getDefaultWorkspaceId() {
  return process.env.EXPO_PUBLIC_WORKSPACE_ID || extra.workspaceId || "default";
}

export function getDefaultPlatformUrl() {
  return process.env.EXPO_PUBLIC_PLATFORM_URL || extra.platformUrl || "";
}

export async function testRuntimeConnection(apiKey: string, runtimeUrl: string = getDefaultRuntimeUrl()) {
  const baseUrl = normalizeServerUrl(runtimeUrl);
  if (!String(apiKey || "").trim()) {
    throw new Error("API key is required.");
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers: {
        "X-API-Key": String(apiKey || "").trim(),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = payload && typeof payload.detail === "string" && payload.detail.trim()
      ? payload.detail.trim()
      : "Health check failed.";
    throw new Error(detail);
  }
  return response.json().catch(() => ({}));
}

export type EmpyralistChatPriorMessage = {
  role: "user" | "assistant";
  content: string;
};

export type EmpyralistChatAction = {
  id: string;
  kind: "run" | "workflow" | "connect" | "open" | "approval_required";
  label: string;
  variant?: "primary" | "secondary";
  connector?: string | null;
  action?: string | null;
  input?: string | null;
  href?: string | null;
  goal?: string | null;
};

export type EmpyralistDirectChatResponse = {
  reply: string;
  actions: EmpyralistChatAction[];
  approvals?: Record<string, unknown>[];
  interventions?: AgentTurnIntervention[];
  mode?: string;
  error?: string;
  context_used?: Record<string, unknown> | null;
};

type EmpyralistDirectChatRequest = {
  message: string;
  threadId?: string;
  provider?: string;
  model?: string;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  priorMessages?: EmpyralistChatPriorMessage[];
  approvedAction?: {
    connector: string;
    action: string;
    input: string;
  };
};

function createMobileRequestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildMobileActor(session: MobileSession, actorId: string): AgentTurnRequest["actor"] {
  return {
    type: "user",
    id: actorId,
    display_name: "Mobile user",
  };
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function formatNetworkError(baseUrl: string) {
  const normalized = normalizeServerUrl(baseUrl);
  const target = normalized || "the configured server";
  const isLoopback = /127\.0\.0\.1|localhost/i.test(target);
  const hint = isLoopback
    ? " On a real phone, use your computer's LAN IP instead of 127.0.0.1 or localhost."
    : "";
  return `Network request failed for ${target}.${hint}`;
}

function getEmpyralistApiBaseUrl(session?: MobileSession | null) {
  return normalizeServerUrl(
    getConfiguredEmpyralistApiUrl() ||
      session?.runtimeUrl ||
      getDefaultRuntimeUrl()
  );
}

function getEmpyralistChatEndpoint(session?: MobileSession | null) {
  return `${getEmpyralistApiBaseUrl(session)}/turn`;
}

async function fetchAgentRegistryJson(
  session: MobileSession,
  path: string,
  options?: RequestInit,
) {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        ...(session.runtimeKey ? { "X-API-Key": session.runtimeKey } : {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "Agent registry request failed.");
  }
  return payload;
}

function buildMobileRuntimeClient(session: MobileSession) {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  return createApiClient({
    buildUrl: (path) => `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
    getHeaders: () => (session.runtimeKey ? { "X-API-Key": session.runtimeKey } : undefined),
    fetchFn: async (input, init) => {
      try {
        return await fetch(input, init);
      } catch (error) {
        throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
      }
    },
  });
}

function normalizeEmpyralistChatResponse(payload: unknown): EmpyralistDirectChatResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    reply: typeof record.reply === "string" ? record.reply : "",
    actions: Array.isArray(record.actions) ? (record.actions as EmpyralistChatAction[]) : [],
    approvals: Array.isArray(record.approvals) ? (record.approvals as Record<string, unknown>[]) : [],
    interventions: Array.isArray(record.interventions) ? (record.interventions as AgentTurnIntervention[]) : [],
    mode: typeof record.mode === "string" ? record.mode : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    context_used: record.context_used && typeof record.context_used === "object"
      ? (record.context_used as Record<string, unknown>)
      : null,
  };
}

function applyEmpyralistSseEvent(
  eventName: string,
  raw: string,
  onChunk?: (delta: string) => void,
): { finalPayload?: EmpyralistDirectChatResponse; delta?: string } {
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }

  if (eventName === "chunk") {
    const delta =
      parsed && typeof parsed === "object" && typeof (parsed as { delta?: unknown }).delta === "string"
        ? String((parsed as { delta?: unknown }).delta || "")
        : raw;
    if (delta) {
      onChunk?.(delta);
      return { delta };
    }
    return {};
  }

  if (eventName === "final") {
    return { finalPayload: normalizeEmpyralistChatResponse(parsed) };
  }

  return {};
}

async function parseEmpyralistEventStream(
  response: Response,
  onChunk?: (delta: string) => void,
): Promise<EmpyralistDirectChatResponse> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    return normalizeEmpyralistChatResponse(await response.json());
  }

  const reader = typeof response.body?.getReader === "function" ? response.body.getReader() : null;
  const decoder = new TextDecoder();
  let finalPayload: EmpyralistDirectChatResponse | null = null;
  let streamedReply = "";
  let buffer = "";
  let currentEvent = "message";
  let currentData: string[] = [];

  const dispatch = () => {
    if (currentData.length === 0) return;
    const { finalPayload: nextFinal, delta } = applyEmpyralistSseEvent(
      currentEvent,
      currentData.join("\n"),
      onChunk,
    );
    if (delta) {
      streamedReply += delta;
    }
    if (nextFinal) {
      finalPayload = nextFinal;
    }
  };

  const processBuffer = (flush = false) => {
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line) {
        dispatch();
        currentEvent = "message";
        currentData = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim() || "message";
        continue;
      }
      if (line.startsWith("data:")) {
        currentData.push(line.slice(5).trim());
      }
    }
    if (flush && buffer.trim()) {
      const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim() || "message";
      } else if (line.startsWith("data:")) {
        currentData.push(line.slice(5).trim());
      }
      buffer = "";
      dispatch();
    }
  };

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }
    buffer += decoder.decode();
    processBuffer(true);
  } else {
    buffer = await response.text();
    processBuffer(true);
  }

  return finalPayload || { reply: streamedReply, actions: [] };
}

export const mobileApi = {
  async respondChat(
    session: MobileSession,
    payload: EmpyralistDirectChatRequest,
    options?: { onChunk?: (delta: string) => void },
  ) {
    const chatUrl = getEmpyralistChatEndpoint(session);
    let response: Response;
    try {
      const actorId = payload.threadId || createMobileRequestId("mobile-chat");
      const requestBody: AgentTurnRequest = {
        tenant_id: "default",
        workspace_id: session.workspaceId || getDefaultWorkspaceId(),
        session_id: actorId,
        channel: "mobile",
        actor: buildMobileActor(session, actorId),
        message: payload.message,
        attachments: [],
        execution_mode: "sync",
        response_mode: "stream",
        context_hints: {
          provider: payload.provider ?? getDefaultEmpyralistChatProvider(),
          model: payload.model ?? getDefaultEmpyralistChatModel(),
          agent_role: payload.agentRole || undefined,
          prior_messages: payload.priorMessages && payload.priorMessages.length > 0 ? payload.priorMessages : undefined,
          approved_action: payload.approvedAction || undefined,
          metadata: {
            source: "mobile_chat",
            thread_id: payload.threadId || undefined,
            agent_id: payload.agentId || undefined,
            agent_label: payload.agentName || undefined,
            agent_role: payload.agentRole || undefined,
            availability: { ai_ready: true },
          },
        },
      };
      response = await buildMobileRuntimeClient(session).openTurnStreamResponse(requestBody);
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(chatUrl) : "Request failed.");
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return parseEmpyralistEventStream(response, options?.onChunk);
  },
  getRun(session: MobileSession, runId: string) {
    return buildMobileRuntimeClient(session).getRunDetail(runId) as Promise<RunDetailResponse>;
  },
  getCoreStatus(session: MobileSession) {
    return buildMobileRuntimeClient(session).getHealth().then((payload: HealthResponse) => ({
      ok: Boolean(payload?.ok),
      runtime: {
        ok: Boolean(payload?.ok),
        model_name: payload?.codex_model ?? payload?.model_name ?? payload?.model ?? null,
        model: payload?.model ?? payload?.codex_model ?? null,
        modelId: payload?.modelId ?? payload?.model_id ?? payload?.codex_model ?? null,
        model_id: payload?.model_id ?? payload?.modelId ?? payload?.codex_model ?? null,
      },
    }));
  },
  getRuns(session: MobileSession) {
    return buildMobileRuntimeClient(session).listRuns({
      workspace_id: session.workspaceId,
    }) as Promise<RunListResponse>;
  },
  getApprovals(session: MobileSession) {
    return buildMobileRuntimeClient(session).listApprovals({
      workspace_id: session.workspaceId,
    }) as Promise<ApprovalListResponse>;
  },
  getArtifacts(session: MobileSession) {
    return buildMobileRuntimeClient(session).listArtifacts({
      workspace_id: session.workspaceId,
    }) as Promise<ArtifactListResponse>;
  },
  getMachines(session: MobileSession) {
    return buildMobileRuntimeClient(session).listMachines() as Promise<MachineListResponse>;
  },
  getConnectors(session: MobileSession) {
    return buildMobileRuntimeClient(session).listConnectors({
      workspace_id: session.workspaceId,
    }) as Promise<ConnectorListResponse>;
  },
  getChatContext(session: MobileSession) {
    const query = new URLSearchParams({ workspace_id: session.workspaceId });
    return fetchAgentRegistryJson(session, `/agent-registry/chat-context?${query.toString()}`) as Promise<Record<string, unknown>>;
  },
  getNotifications(session: MobileSession, params?: {
    workspace_id?: string;
    channel?: string;
    session_key?: string;
    direction?: string;
    action?: string;
    run_id?: string;
    trace_id?: string;
    limit?: number;
    include_backlog?: boolean;
    since_id?: string;
    since_ts?: string;
  }) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) {
      if (value == null || value === "") continue;
      query.set(key, String(value));
    }
    return buildMobileRuntimeClient(session).listNotifications(
      Object.fromEntries(query.entries()),
    ) as Promise<NotificationListResponse>;
  },
  markNotificationsRead(session: MobileSession, notificationIds: string[], options?: { markAll?: boolean }) {
    return buildMobileRuntimeClient(session).markNotificationsRead({
      notification_ids: notificationIds,
      workspace_id: session.workspaceId,
      mark_all: Boolean(options?.markAll),
    }) as Promise<NotificationReadResponse>;
  },
  registerNotificationDevice(session: MobileSession, request: {
    device_id: string;
    push_token: string;
    provider?: string;
    platform?: string;
    device_name?: string;
    app_id?: string;
    capabilities?: string[];
  }) {
    return buildMobileRuntimeClient(session).registerNotificationDevice({
      workspace_id: session.workspaceId,
      device_id: request.device_id,
      push_token: request.push_token,
      provider: request.provider,
      platform: request.platform,
      device_name: request.device_name,
      app_id: request.app_id,
      capabilities: request.capabilities,
    }) as Promise<NotificationDeviceRegistrationResponse>;
  },
  publishPersonalContextEvent(session: MobileSession, request: {
    source_app: string;
    event_type: string;
    entity_id: string;
    summary?: string;
    payload?: Record<string, unknown>;
    priority?: number;
    scope?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    return fetchAgentRegistryJson(session, "/agent-registry/personal-context/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: session.workspaceId,
        ...request,
      }),
    }) as Promise<Record<string, unknown>>;
  },
  proposeSelfWakeup(session: MobileSession, request: {
    summary: string;
    reason: string;
    due_at?: string;
    payload?: Record<string, unknown>;
    policy_context?: Record<string, unknown>;
  }) {
    return fetchAgentRegistryJson(session, "/agent-registry/scheduler/self-wakeups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: session.workspaceId,
        ...request,
      }),
    }) as Promise<Record<string, unknown>>;
  },
  async testConnector(session: MobileSession, connectorId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const response = await fetch(`${baseUrl}/connectors/vault/${encodeURIComponent(connectorId)}/test?workspace_id=${encodeURIComponent(session.workspaceId)}`, {
      method: "POST",
      headers: session.runtimeKey ? { "X-API-Key": session.runtimeKey } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Connector test failed.");
    }
    return payload;
  },
  async disconnectConnector(session: MobileSession, connectorId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const response = await fetch(`${baseUrl}/connectors/vault/${encodeURIComponent(connectorId)}?workspace_id=${encodeURIComponent(session.workspaceId)}`, {
      method: "DELETE",
      headers: session.runtimeKey ? { "X-API-Key": session.runtimeKey } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Connector disconnect failed.");
    }
    return payload;
  },
  createRun(
    session: MobileSession,
    goal: string,
    agentRole?: string,
    options?: { appId?: string },
  ) {
    const metadata: Record<string, any> = agentRole ? { agent_role: agentRole } : {};
    if (options?.appId) {
      metadata.app_id = options.appId;
    }
    const turnRequest: AgentTurnRequest = {
      tenant_id: "default",
      workspace_id: session.workspaceId,
      session_id: createMobileRequestId("mobile-run"),
      channel: "mobile",
      actor: buildMobileActor(session, `mobile-runner:${session.workspaceId || "default"}`),
      message: goal,
      attachments: [],
      execution_mode: "durable",
      response_mode: "artifact",
      context_hints: {
        engine: "empyralis",
        agent_role: agentRole || undefined,
        metadata,
      },
    };
    return buildMobileRuntimeClient(session).turn(turnRequest) as Promise<AgentTurnResponse>;
  },
  resolveApproval(
    session: MobileSession,
    runId: string,
    approvalId: string,
    decision: "approved" | "held" | "rejected",
  ) {
    void runId;
    const mapped = decision === "approved" ? "approved" : "rejected";
    return buildMobileRuntimeClient(session).resolveApproval(approvalId, {
      approval_id: approvalId,
      resolution: mapped,
      actor: "user",
    }) as Promise<ApprovalResolveResponse>;
  },
};
