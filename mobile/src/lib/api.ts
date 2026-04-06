import Constants from "expo-constants";

import type { AgentSummary, ApprovalSummary, ArtifactSummary, MobileSession, RunSummary } from "./types";

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

type AppInstallMetadata = {
  packageId?: string;
  releaseChannel?: string;
  source?: "core" | "platform" | "preview";
};

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
  mode?: string;
  error?: string;
  context_used?: Record<string, unknown> | null;
};

type EmpyralistDirectChatRequest = {
  message: string;
  threadId?: string;
  provider?: string;
  model?: string;
  priorMessages?: EmpyralistChatPriorMessage[];
  approvedAction?: {
    connector: string;
    action: string;
    input: string;
  };
};

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

function normalizeEmpyralistChatResponse(payload: unknown): EmpyralistDirectChatResponse {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    reply: typeof record.reply === "string" ? record.reply : "",
    actions: Array.isArray(record.actions) ? (record.actions as EmpyralistChatAction[]) : [],
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

async function request<T>(session: MobileSession, path: string, init?: RequestInit): Promise<T> {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": session.runtimeKey,
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function requestBase<T>(baseUrl: string, apiKey: string | undefined, path: string, init?: RequestInit): Promise<T> {
  const normalizedBaseUrl = normalizeServerUrl(baseUrl);
  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(normalizedBaseUrl) : "Request failed.");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
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
      response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": session.runtimeKey,
        },
        body: JSON.stringify({
          workspace_id: session.workspaceId || getDefaultWorkspaceId(),
          thread_id: payload.threadId || undefined,
          message: payload.message,
          provider: payload.provider ?? getDefaultEmpyralistChatProvider(),
          model: payload.model ?? getDefaultEmpyralistChatModel(),
          availability: { ai_ready: true },
          prior_messages: payload.priorMessages && payload.priorMessages.length > 0 ? payload.priorMessages : undefined,
          approved_action: payload.approvedAction || undefined,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(chatUrl) : "Request failed.");
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return parseEmpyralistEventStream(response, options?.onChunk);
  },
  getRun(session: MobileSession, runId: string) {
    return request<any>(session, `/runs/${encodeURIComponent(runId)}`);
  },
  listFiles(session: MobileSession, path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    return request<any>(session, `/files/list${query}`);
  },
  readFile(session: MobileSession, path: string) {
    return request<any>(session, `/files/read?path=${encodeURIComponent(path)}`);
  },
  writeFile(
    session: MobileSession,
    payload: { path: string; content: string; overwrite?: boolean },
  ) {
    return request<any>(session, "/files/write", {
      method: "POST",
      body: JSON.stringify({ ...payload, workspace_id: session.workspaceId }),
    });
  },
  deleteFileRequest(session: MobileSession, path: string) {
    return request<any>(session, "/files/delete_request", {
      method: "POST",
      body: JSON.stringify({ path, workspace_id: session.workspaceId }),
    });
  },
  executeDeviceAction(session: MobileSession, payload: { action: string; args?: Record<string, any> }) {
    return request<any>(session, "/device/execute", {
      method: "POST",
      body: JSON.stringify({ ...payload, workspace_id: session.workspaceId }),
    });
  },
  getAudit(session: MobileSession, limit = 100) {
    return request<any>(session, `/audit?limit=${encodeURIComponent(String(limit))}`);
  },
  getAgentSnapshot(session: MobileSession) {
    return request<{ agents?: AgentSummary[] }>(
      session,
      `/agents/workspace/snapshot?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getCoreStatus(session: MobileSession) {
    return request<any>(
      session,
      `/agents/workspace/snapshot?workspace_id=${encodeURIComponent(session.workspaceId)}&history_limit=1&audit_limit=1`,
    );
  },
  getRuns(session: MobileSession) {
    return request<{ items?: RunSummary[] }>(
      session,
      `/history/runs?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getApprovals(session: MobileSession) {
    return request<{ pending?: ApprovalSummary[]; items?: ApprovalSummary[] }>(
      session,
      `/approvals?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getArtifacts(session: MobileSession) {
    return request<{ items?: ArtifactSummary[] }>(
      session,
      `/artifacts?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getAppsRegistry(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/registry");
  },
  getInstalledApps(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/installed");
  },
  getStoreApps(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/store");
  },
  getPlatformStoreApps(session: MobileSession) {
    if (!session.platformUrl) {
      throw new Error("Platform registry not configured");
    }
    return requestBase<{ items?: any[] }>(session.platformUrl, session.platformKey, "/apps/store");
  },
  getPlatformAppManifest(session: MobileSession, appId: string) {
    if (!session.platformUrl) {
      throw new Error("Platform registry not configured");
    }
    return requestBase<{ item?: any }>(
      session.platformUrl,
      session.platformKey,
      `/apps/manifest/${encodeURIComponent(appId)}`,
    );
  },
  getAppUpdates(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/updates");
  },
  getAppManifest(session: MobileSession, appId: string) {
    return request<{ item?: any }>(session, `/apps/manifest/${encodeURIComponent(appId)}`);
  },
  installApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return request<any>(session, "/apps/install", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        package_id: metadata?.packageId,
        release_channel: metadata?.releaseChannel,
        install_source: metadata?.source,
      }),
    });
  },
  uninstallApp(session: MobileSession, appId: string) {
    return request<any>(session, "/apps/uninstall", {
      method: "POST",
      body: JSON.stringify({ app_id: appId }),
    });
  },
  updateApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return request<any>(session, "/apps/update", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        package_id: metadata?.packageId,
        release_channel: metadata?.releaseChannel,
        install_source: metadata?.source,
      }),
    });
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
    return request<{ run_id: string; status: string }>(session, "/runs/start", {
      method: "POST",
      body: JSON.stringify({
        engine: "empyralis",
        workspace_id: session.workspaceId,
        user_goal: goal,
        metadata,
      }),
    });
  },
  resolveApproval(
    session: MobileSession,
    runId: string,
    approvalId: string,
    decision: "approved" | "held" | "rejected",
  ) {
    const mapped = decision === "approved" ? "proceed" : decision === "held" ? "hold" : "reject";
    return request(session, `/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision: mapped }),
    });
  },
};
