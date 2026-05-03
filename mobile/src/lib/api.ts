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
  runtimeKey?: string;
  runtimeAuthScheme?: "api_key" | "bearer";
  workspaceId?: string;
  platformUrl?: string;
  empyralistApiUrl?: string;
  empyralistChatProvider?: string;
  empyralistChatModel?: string;
};

export function getDefaultRuntimeUrl() {
  return normalizeServerUrl(
    process.env.EXPO_PUBLIC_RUNTIME_URL ||
    getConfiguredEmpyralistApiUrl() ||
    extra.runtimeUrl ||
    "",
  );
}

export function getDefaultRuntimeKey() {
  return String(process.env.EXPO_PUBLIC_RUNTIME_KEY || extra.runtimeKey || "").trim();
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
  return normalizeServerUrl(
    getConfiguredEmpyralistApiUrl() ||
    process.env.EXPO_PUBLIC_RUNTIME_URL ||
    extra.runtimeUrl ||
    "",
  );
}

export function getDefaultEmpyralistChatProvider() {
  return String(
    process.env.EXPO_PUBLIC_EMPYRALIST_CHAT_PROVIDER ||
    process.env.EMPYRALIST_CHAT_PROVIDER ||
    extra.empyralistChatProvider ||
    "",
  ).trim();
}

export function getDefaultEmpyralistChatModel() {
  return String(
    process.env.EXPO_PUBLIC_EMPYRALIST_CHAT_MODEL ||
    process.env.EMPYRALIST_CHAT_MODEL ||
    extra.empyralistChatModel ||
    "",
  ).trim();
}

export function getDefaultWorkspaceId() {
  return String(process.env.EXPO_PUBLIC_WORKSPACE_ID || extra.workspaceId || "").trim();
}

export function getDefaultPlatformUrl() {
  return normalizeServerUrl(process.env.EXPO_PUBLIC_PLATFORM_URL || extra.platformUrl || "");
}

export function getConfiguredBootstrapSession(): MobileSession | null {
  const runtimeKey = getDefaultRuntimeKey();
  const runtimeUrl = getDefaultRuntimeUrl();
  if (!runtimeKey || !runtimeUrl) {
    return null;
  }
  const explicitAuthScheme =
    process.env.EXPO_PUBLIC_RUNTIME_AUTH_SCHEME ||
    process.env.RUNTIME_AUTH_SCHEME ||
    extra.runtimeAuthScheme ||
    undefined;
  const authScheme =
    explicitAuthScheme === "bearer" || explicitAuthScheme === "api_key"
      ? explicitAuthScheme
      : resolveSessionAuthScheme({ runtimeKey });
  return {
    runtimeUrl,
    runtimeKey,
    authScheme,
    platformUrl: getDefaultPlatformUrl() || undefined,
  };
}

export async function testRuntimeConnection(apiKey: string, runtimeUrl: string = getDefaultRuntimeUrl()) {
  const baseUrl = normalizeServerUrl(runtimeUrl);
  if (!baseUrl) {
    throw new Error("Cloud API URL is not configured.");
  }
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

export type MobileAuthLoginResponse = {
  token: string;
  current_tenant_id?: string | null;
  default_tenant_id?: string | null;
  current_workspace_id?: string | null;
  default_workspace_id?: string | null;
  auth_session?: {
    session_id?: string | null;
    expires_at?: number | null;
  } | null;
  session_recovery?: {
    refresh_token?: string | null;
    refresh_expires_at?: number | null;
  } | null;
  user?: {
    email?: string | null;
    display_name?: string | null;
    name?: string | null;
  } | null;
};

export type MobileAccountShellResponse = {
  account?: {
    email?: string | null;
    displayName?: string | null;
  } | null;
  workspaceMemberships?: {
    workspace?: {
      id?: string | null;
      tenantId?: string | null;
    } | null;
  }[];
};

export type MobileAuthProvidersResponse = {
  email?: { enabled?: boolean } | null;
  google?: { enabled?: boolean } | null;
  apple?: { enabled?: boolean } | null;
};

export type MobileBillingSummaryResponse = {
  hosted_sage_ai?: {
    allowed?: boolean | null;
    policy?: string | null;
    message?: string | null;
    monthly_credit_cap?: number | null;
    monthly_credits_used?: number | null;
    monthly_credits_remaining?: number | null;
    monthly_cap_usd?: number | null;
    monthly_cost_usd?: number | null;
    monthly_remaining_usd?: number | null;
    credits_per_usd?: number | null;
  } | null;
  usage?: Record<string, unknown> | null;
};

export type SageMemoryCategory =
  | "work_context"
  | "personal_context"
  | "top_of_mind"
  | "brief_history"
  | "earlier_context"
  | "long_term_background";

export type SageMemoryItem = {
  id: string;
  category: SageMemoryCategory;
  category_label?: string;
  title: string;
  content: string;
  pinned?: boolean;
  updated_at?: string;
};

export type SageMemoryResponse = {
  workspace_id?: string;
  updated_at?: string;
  items: SageMemoryItem[];
};

export type SageMemoryStoragePolicyResponse = {
  workspace_id?: string;
  updated_at?: string;
  authority?: string;
  runtime_format?: string;
  markdown_format?: string;
  local_cache_policy?: string;
  max_entries?: number;
  used_entries?: number;
  remaining_entries?: number;
  retention?: Record<string, unknown> | null;
};

export type SageMemoryExportResponse = {
  workspace_id?: string;
  exported_at?: string;
  export_type?: string;
  markdown?: string;
  items?: SageMemoryItem[];
  summary?: Record<string, unknown> | null;
  storage_policy?: SageMemoryStoragePolicyResponse | null;
};

export type SageMemoryWipeResponse = {
  workspace_id?: string;
  deleted_count?: number;
  updated_at?: string;
  previous_updated_at?: string | null;
  items?: SageMemoryItem[];
  storage_policy?: SageMemoryStoragePolicyResponse | null;
};

export type MobileThreadHistoryItem = {
  id: string;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_turn_at?: string | null;
  turns?: Array<{
    role?: string | null;
    content?: string | null;
    created_at?: string | null;
  }>;
};

export type MobileThreadHistoryResponse = {
  items: MobileThreadHistoryItem[];
  total: number;
};

export type MobileScheduleRecord = {
  id: string;
  name: string;
  enabled: boolean;
  cron?: string;
  timezone?: string;
  wake_mode?: string;
  delivery?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_run_id?: string | null;
  last_error?: string | null;
  run_request?: Record<string, unknown>;
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

export class MobileAuthExpiredError extends Error {
  constructor(message = "Your session expired. Please sign in again.") {
    super(message);
    this.name = "MobileAuthExpiredError";
  }
}

type MobileAuthSessionHandlers = {
  getSession?: () => MobileSession | null;
  saveSession?: (session: MobileSession) => Promise<void>;
  signOut?: () => Promise<void>;
};

let mobileAuthSessionHandlers: MobileAuthSessionHandlers = {};

export function configureMobileAuthSessionHandlers(handlers: MobileAuthSessionHandlers) {
  mobileAuthSessionHandlers = handlers;
}

function createMobileRequestId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildMobileActor(session: MobileSession, actorId: string): AgentTurnRequest["actor"] {
  const stableActorId =
    String(session.deviceId || session.authSessionId || session.userEmail || actorId || "").trim() || actorId;
  return {
    type: "user",
    id: stableActorId,
    display_name: String(session.userDisplayName || "Mobile user").trim() || "Mobile user",
  };
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export function resolveSessionAuthScheme(session?: Pick<MobileSession, "authScheme" | "runtimeKey"> | null) {
  const explicit = session?.authScheme;
  if (explicit === "bearer" || explicit === "api_key") {
    return explicit;
  }
  const token = String(session?.runtimeKey || "").trim();
  if (token.split(".").length === 3) {
    return "bearer";
  }
  return "api_key";
}

export function buildSessionAuthHeaders(
  session?: Pick<MobileSession, "authScheme" | "runtimeKey"> | null,
): Record<string, string> | undefined {
  const token = String(session?.runtimeKey || "").trim();
  if (!token) {
    return undefined;
  }
  return resolveSessionAuthScheme(session) === "bearer"
    ? { Authorization: `Bearer ${token}` }
    : { "X-API-Key": token };
}

function resolveActiveMobileSession(session?: MobileSession | null) {
  return mobileAuthSessionHandlers.getSession?.() || session || null;
}

function mergeSessionHeaders(
  session: MobileSession | null | undefined,
  headers?: HeadersInit,
): Headers {
  const merged = new Headers(headers || {});
  merged.delete("Authorization");
  merged.delete("X-API-Key");
  const authHeaders = buildSessionAuthHeaders(session);
  for (const [key, value] of Object.entries(authHeaders || {})) {
    merged.set(key, value);
  }
  return merged;
}

function buildRefreshedMobileSession(
  current: MobileSession,
  payload: MobileAuthLoginResponse,
): MobileSession {
  return {
    ...current,
    runtimeKey: String(payload.token || "").trim() || current.runtimeKey,
    authScheme: "bearer",
    tenantId:
      String(payload.current_tenant_id || payload.default_tenant_id || "").trim()
      || current.tenantId,
    workspaceId:
      String(payload.current_workspace_id || payload.default_workspace_id || "").trim()
      || current.workspaceId,
    refreshToken: String(payload.session_recovery?.refresh_token || "").trim() || current.refreshToken,
    refreshExpiresAt: Number(payload.session_recovery?.refresh_expires_at || 0) || current.refreshExpiresAt,
    authSessionId: String(payload.auth_session?.session_id || "").trim() || current.authSessionId,
    userEmail: String(payload.user?.email || "").trim() || current.userEmail,
    userDisplayName:
      String(payload.user?.display_name || payload.user?.name || "").trim()
      || current.userDisplayName,
  };
}

async function refreshMobileSession(current: MobileSession): Promise<MobileSession | null> {
  const baseUrl = normalizeServerUrl(current.runtimeUrl);
  const refreshToken = String(current.refreshToken || "").trim();
  if (!baseUrl || !refreshToken) {
    return null;
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        channel: "mobile",
        device_id: current.deviceId || undefined,
        workspace_id: current.workspaceId || undefined,
      }),
    });
  } catch {
    return null;
  }
  const payload = await response.json().catch(() => null) as ({ detail?: unknown } & MobileAuthLoginResponse) | null;
  if (!response.ok || !payload?.token) {
    return null;
  }
  const refreshed = buildRefreshedMobileSession(current, payload);
  if (mobileAuthSessionHandlers.saveSession) {
    await mobileAuthSessionHandlers.saveSession(refreshed);
  }
  return refreshed;
}

async function handleUnauthorizedSession(session?: MobileSession | null): Promise<never> {
  const activeSession = resolveActiveMobileSession(session);
  const refreshed = activeSession ? await refreshMobileSession(activeSession) : null;
  if (refreshed) {
    throw new Error("__mobile_session_refreshed__");
  }
  await mobileAuthSessionHandlers.signOut?.();
  throw new MobileAuthExpiredError();
}

async function performSessionFetch(
  session: MobileSession,
  url: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const activeSession = resolveActiveMobileSession(session) || session;
  try {
    const response = await fetch(url, {
      ...init,
      headers: mergeSessionHeaders(activeSession, init.headers),
    });
    if (response.status === 401) {
      if (retried) {
        await mobileAuthSessionHandlers.signOut?.();
        throw new MobileAuthExpiredError();
      }
      try {
        await handleUnauthorizedSession(activeSession);
      } catch (error) {
        if (error instanceof Error && error.message === "__mobile_session_refreshed__") {
          const retriedSession = resolveActiveMobileSession(activeSession) || activeSession;
          return performSessionFetch(retriedSession, url, init, true);
        }
        throw error;
      }
    }
    return response;
  } catch (error) {
    if (error instanceof MobileAuthExpiredError) {
      throw error;
    }
    throw new Error(error instanceof TypeError ? formatNetworkError(url) : "Request failed.");
  }
}

function formatNetworkError(baseUrl: string) {
  const normalized = normalizeServerUrl(baseUrl);
  const target = normalized || "the configured server";
  return `Network request failed for ${target}.`;
}

function requireCloudApiBaseUrl(value: string, purpose: string) {
  const baseUrl = normalizeServerUrl(value);
  if (!baseUrl) {
    throw new Error(`Cloud API URL is not configured for ${purpose}.`);
  }
  return baseUrl;
}

function requireSessionWorkspaceId(session: MobileSession, purpose: string) {
  const workspaceId = String(session.workspaceId || "").trim();
  if (!workspaceId) {
    throw new Error(`Could not ${purpose} because your Sage workspace is not ready yet.`);
  }
  return workspaceId;
}

async function readResponseErrorMessage(response: Response, fallback: string) {
  const retryAfter = String(response.headers.get("Retry-After") || "").trim();
  const suffix = retryAfter ? ` Try again in about ${retryAfter} seconds.` : "";
  try {
    const raw = await response.text();
    if (!raw.trim()) {
      return `${fallback}${suffix}`.trim();
    }
    try {
      const payload = JSON.parse(raw) as {
        detail?: unknown;
        error?: { message?: unknown } | null;
        retry_after_seconds?: unknown;
      };
      const detail =
        typeof payload?.error?.message === "string" && payload.error.message.trim()
          ? payload.error.message.trim()
          : typeof payload?.detail === "string" && payload.detail.trim()
            ? payload.detail.trim()
            : payload?.detail && typeof payload.detail === "object" && typeof (payload.detail as any).message === "string"
              ? String((payload.detail as any).message || "").trim()
              : "";
      const payloadRetryAfter =
        typeof payload?.retry_after_seconds === "number"
          ? payload.retry_after_seconds
          : Number((payload?.detail as any)?.details?.retry_after_seconds || 0);
      const retrySuffix =
        payloadRetryAfter && payloadRetryAfter > 0
          ? ` Try again in about ${payloadRetryAfter} seconds.`
          : suffix;
      return `${detail || fallback}${retrySuffix}`.trim();
    } catch {
      return `${raw.trim() || fallback}${suffix}`.trim();
    }
  } catch {
    return `${fallback}${suffix}`.trim();
  }
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
    response = await performSessionFetch(session, `${baseUrl}${path}`, options);
  } catch (error) {
    if (error instanceof MobileAuthExpiredError) {
      throw error;
    }
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "Agent registry request failed.");
  }
  return payload;
}

async function fetchSessionJson<T>(
  session: MobileSession,
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: Record<string, unknown> | null;
    fallback: string;
  },
): Promise<T> {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  let response: Response;
  try {
    response = await performSessionFetch(session, `${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: options.body
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (error instanceof MobileAuthExpiredError) {
      throw error;
    }
    if (error instanceof Error && error.message.trim()) {
      throw error;
    }
    throw new Error(options.fallback);
  }

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, options.fallback));
  }

  return response.json().catch(() => ({})) as Promise<T>;
}

function buildMobileRuntimeClient(session: MobileSession) {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  return createApiClient({
    buildUrl: (path) => `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
    getHeaders: () => buildSessionAuthHeaders(resolveActiveMobileSession(session) || session),
    fetchFn: async (input, init) => {
      try {
        return await performSessionFetch(resolveActiveMobileSession(session) || session, String(input), init);
      } catch (error) {
        if (error instanceof MobileAuthExpiredError) {
          throw error;
        }
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
  async getAuthProviders(runtimeUrl?: string) {
    const baseUrl = requireCloudApiBaseUrl(runtimeUrl || getDefaultRuntimeUrl(), "sign-in");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/providers`, {
        method: "GET",
      });
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not load sign-in options.");
    }
    const payload = await response.json().catch(() => null) as { detail?: unknown } & MobileAuthProvidersResponse;
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Could not load sign-in options.");
    }
    return payload;
  },
  async loginWithPassword(request: {
    runtimeUrl?: string;
    email: string;
    password: string;
    deviceId?: string;
    deviceName?: string;
    devicePlatform?: string;
  }) {
    const baseUrl = requireCloudApiBaseUrl(request.runtimeUrl || getDefaultRuntimeUrl(), "login");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: request.email,
          password: request.password,
          channel: "mobile",
          device_id: request.deviceId || undefined,
          device_name: request.deviceName || undefined,
          device_platform: request.devicePlatform || undefined,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Login failed.");
    }
    const payload = await response.json().catch(() => null) as { detail?: unknown } & MobileAuthLoginResponse;
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Login failed.");
    }
    return payload;
  },
  async loginWithProvider(request: {
    runtimeUrl?: string;
    provider: "apple" | "google";
    identityToken: string;
    email?: string;
    name?: string;
    avatarUrl?: string;
    deviceId?: string;
    deviceName?: string;
    devicePlatform?: string;
  }) {
    const baseUrl = requireCloudApiBaseUrl(request.runtimeUrl || getDefaultRuntimeUrl(), "sign-in");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/provider-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: request.provider,
          identity_token: request.identityToken,
          email: request.email || undefined,
          name: request.name || undefined,
          avatar_url: request.avatarUrl || undefined,
          channel: "mobile",
          device_id: request.deviceId || undefined,
          device_name: request.deviceName || undefined,
          device_platform: request.devicePlatform || undefined,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Sign-in failed.");
    }
    const payload = await response.json().catch(() => null) as { detail?: unknown } & MobileAuthLoginResponse;
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Sign-in failed.");
    }
    return payload;
  },
  async bootstrapMobileBetaSession(request: {
    runtimeUrl?: string;
    deviceId: string;
    deviceName?: string;
    devicePlatform?: string;
  }) {
    const baseUrl = requireCloudApiBaseUrl(request.runtimeUrl || getDefaultRuntimeUrl(), "mobile bootstrap");
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/mobile-beta-bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_id: request.deviceId,
          device_name: request.deviceName || undefined,
          device_platform: request.devicePlatform || undefined,
        }),
      });
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not start your mobile session.");
    }
    const payload = await response.json().catch(() => null) as { detail?: unknown } & MobileAuthLoginResponse;
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Could not start your mobile session.");
    }
    return payload;
  },
  async getAccountShell(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/auth/account-shell`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not load account shell.");
    }
    const payload = await response.json().catch(() => null) as { detail?: unknown } & MobileAccountShellResponse;
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Could not load account shell.");
    }
    return payload;
  },
  getBillingSummary(session: MobileSession) {
    const workspaceId = requireSessionWorkspaceId(session, "load hosted credits");
    return fetchSessionJson<MobileBillingSummaryResponse>(
      session,
      `/billing/summary?workspace_id=${encodeURIComponent(workspaceId)}`,
      {
        fallback: "Could not load hosted credits.",
      },
    );
  },
  async listSageMemory(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory${query}`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not load Sage memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not load Sage memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryResponse;
  },
  async getSageMemoryStoragePolicy(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory/storage-policy${query}`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not load memory policy.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not load memory policy."));
    }
    return (await response.json().catch(() => null)) as SageMemoryStoragePolicyResponse;
  },
  async exportSageMemory(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory/export${query}`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not export memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not export memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryExportResponse;
  },
  async wipeSageMemory(session: MobileSession, confirmation = "WIPE SAGE MEMORY") {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory/wipe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: requireSessionWorkspaceId(session, "wipe memory"),
          confirm: confirmation,
        }),
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not wipe memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not wipe memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryWipeResponse;
  },
  async createSageMemoryEntry(
    session: MobileSession,
    request: {
      category: SageMemoryCategory;
      title: string;
      content: string;
      pinned?: boolean;
    },
  ) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: requireSessionWorkspaceId(session, "save memory"),
          category: request.category,
          title: request.title,
          content: request.content,
          pinned: Boolean(request.pinned),
        }),
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not save Sage memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not save Sage memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryResponse & { entry?: SageMemoryItem };
  },
  async updateSageMemoryEntry(
    session: MobileSession,
    entryId: string,
    request: {
      category: SageMemoryCategory;
      title: string;
      content: string;
      pinned?: boolean;
    },
  ) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/api/sage-memory/entries/${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: requireSessionWorkspaceId(session, "save memory"),
          category: request.category,
          title: request.title,
          content: request.content,
          pinned: Boolean(request.pinned),
        }),
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not save Sage memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not save Sage memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryResponse & { entry?: SageMemoryItem };
  },
  async deleteSageMemoryEntry(session: MobileSession, entryId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const workspaceId = requireSessionWorkspaceId(session, "remove memory");
    let response: Response;
    try {
      response = await performSessionFetch(
        session,
        `${baseUrl}/api/sage-memory/entries/${encodeURIComponent(entryId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
        {
          method: "DELETE",
        },
      );
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not remove Sage memory.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not remove Sage memory."));
    }
    return (await response.json().catch(() => null)) as SageMemoryResponse & { deleted?: SageMemoryItem };
  },
  async listCloudThreads(session: MobileSession, options?: { includeTurns?: boolean; limit?: number }) {
    const includeTurns = options?.includeTurns !== false;
    const limit = Number(options?.limit || 100);
    const runtimeClient = buildMobileRuntimeClient(session);
    const payload = await runtimeClient.listThreads({
      include_turns: includeTurns,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 100,
    }) as unknown;
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const itemsRaw = Array.isArray(record.items) ? record.items : [];
    const items = itemsRaw
      .filter((item) => item && typeof item === "object")
      .map((item) => item as MobileThreadHistoryItem);
    return {
      items,
      total: Number(record.total || items.length || 0),
    } as MobileThreadHistoryResponse;
  },
  async respondChat(
    session: MobileSession,
    payload: EmpyralistDirectChatRequest,
    options?: { onChunk?: (delta: string) => void },
  ) {
    const chatUrl = getEmpyralistChatEndpoint(session);
    const requestedProvider = String((payload.provider ?? getDefaultEmpyralistChatProvider()) || "").trim();
    const requestedModel = String((payload.model ?? getDefaultEmpyralistChatModel()) || "").trim();
    let response: Response;
    try {
      const threadId = String(payload.threadId || createMobileRequestId("mobile-chat")).trim() || createMobileRequestId("mobile-chat");
      const requestBody = {
        channel: "mobile",
        actor: buildMobileActor(session, threadId),
        thread_id: threadId,
        message: payload.message,
        attachments: [],
        execution_mode: "sync",
        response_mode: "stream",
        context_hints: {
          provider: requestedProvider || undefined,
          model: requestedModel || undefined,
          agent_role: payload.agentRole || undefined,
          prior_messages: payload.priorMessages && payload.priorMessages.length > 0 ? payload.priorMessages : undefined,
          approved_action: payload.approvedAction || undefined,
          metadata: {
            source: "mobile_chat",
            thread_id: threadId,
            agent_id: payload.agentId || undefined,
            agent_label: payload.agentName || undefined,
            agent_role: payload.agentRole || undefined,
            availability: { ai_ready: true },
          },
        },
      } as unknown as AgentTurnRequest;
      const tenantId = String(session.tenantId || "").trim();
      if (tenantId) {
        requestBody.tenant_id = tenantId;
      }
      const workspaceId = String(session.workspaceId || "").trim();
      if (workspaceId) {
        requestBody.workspace_id = workspaceId;
      }
      response = await buildMobileRuntimeClient(session).openTurnStreamResponse(requestBody);
    } catch (error) {
      throw new Error(error instanceof TypeError ? formatNetworkError(chatUrl) : "Request failed.");
    }

    if (!response.ok) {
      const fallback = response.status === 429
        ? "Sage is receiving too many requests right now. Please try again shortly."
        : `API request failed: ${response.status}`;
      throw new Error(await readResponseErrorMessage(response, fallback));
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
    return buildMobileRuntimeClient(session).listRuns(
      session.workspaceId ? { workspace_id: session.workspaceId } : {},
    ) as Promise<RunListResponse>;
  },
  getApprovals(session: MobileSession) {
    return buildMobileRuntimeClient(session).listApprovals(
      session.workspaceId ? { workspace_id: session.workspaceId } : {},
    ) as Promise<ApprovalListResponse>;
  },
  getArtifacts(session: MobileSession) {
    return buildMobileRuntimeClient(session).listArtifacts(
      session.workspaceId ? { workspace_id: session.workspaceId } : {},
    ) as Promise<ArtifactListResponse>;
  },
  getMachines(session: MobileSession) {
    return buildMobileRuntimeClient(session).listMachines() as Promise<MachineListResponse>;
  },
  getConnectors(session: MobileSession) {
    return buildMobileRuntimeClient(session).listConnectors(
      session.workspaceId ? { workspace_id: session.workspaceId } : {},
    ) as Promise<ConnectorListResponse>;
  },
  listGatewayRegistrations(session: MobileSession) {
    const workspaceId = requireSessionWorkspaceId(session, "load paired gateways");
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations?workspace_id=${encodeURIComponent(workspaceId)}`,
      {
        fallback: "Could not load paired gateways.",
      },
    );
  },
  createGatewayPairingIntent(
    session: MobileSession,
    request: {
      display_name?: string;
      platform?: string;
      ttl_seconds?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const workspaceId = requireSessionWorkspaceId(session, "pair a gateway");
    return fetchSessionJson<Record<string, unknown>>(
      session,
      "/api/gateway/pairings/intents",
      {
        method: "POST",
        body: {
          workspace_id: workspaceId,
          display_name: request.display_name,
          platform: request.platform,
          ttl_seconds: request.ttl_seconds,
          metadata: request.metadata || {},
        },
        fallback: "Could not create a gateway pairing token.",
      },
    );
  },
  getGatewayDoctor(session: MobileSession, gatewayId: string) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor`,
      {
        fallback: "Could not load gateway health.",
      },
    );
  },
  getGatewayWhatsappStatus(session: MobileSession, gatewayId: string) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(gatewayId)}`,
      {
        fallback: "Could not load WhatsApp personal state.",
      },
    );
  },
  getGatewayTelegramStatus(session: MobileSession, gatewayId: string) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/personal-channels/telegram/gateways/${encodeURIComponent(gatewayId)}`,
      {
        fallback: "Could not load Telegram personal state.",
      },
    );
  },
  listGatewayApprovals(session: MobileSession, gatewayId: string) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/approvals`,
      {
        fallback: "Could not load gateway approvals.",
      },
    );
  },
  resolveGatewayApproval(
    session: MobileSession,
    gatewayId: string,
    approvalId: string,
    decision: "approved" | "rejected",
    note?: string,
  ) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
      {
        method: "POST",
        body: {
          decision,
          note,
        },
        fallback: "Could not resolve the gateway approval.",
      },
    );
  },
  listGatewayBrowserSessions(session: MobileSession, gatewayId: string) {
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/browser/sessions`,
      {
        fallback: "Could not load gateway browser sessions.",
      },
    );
  },
  controlGatewayBrowserSession(
    session: MobileSession,
    gatewayId: string,
    browserSessionId: string,
    action: "takeover" | "resume" | "interrupt",
    request: {
      note?: string;
      run_id?: string;
      trace_id?: string;
    } = {},
  ) {
    const workspaceId = requireSessionWorkspaceId(session, "control a gateway browser session");
    return fetchSessionJson<Record<string, unknown>>(
      session,
      `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/browser/sessions/${encodeURIComponent(browserSessionId)}/${action}`,
      {
        method: "POST",
        body: {
          workspace_id: workspaceId,
          run_id: request.run_id || `mobile-gateway-${action}-${Date.now().toString(36)}`,
          trace_id: request.trace_id || `mobile-gateway-${action}-${Date.now().toString(36)}`,
          note: request.note,
        },
        fallback: `Could not ${action} the gateway browser session.`,
      },
    );
  },
  async getVaultConnectors(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    const response = await performSessionFetch(session, `${baseUrl}/connectors/vault${query}`, {
      method: "GET",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Could not load integrations.");
    }
    return payload as ConnectorListResponse;
  },
  getChatContext(session: MobileSession) {
    const query = session.workspaceId
      ? `?${new URLSearchParams({ workspace_id: session.workspaceId }).toString()}`
      : "";
    return fetchAgentRegistryJson(session, `/agent-registry/chat-context${query}`) as Promise<Record<string, unknown>>;
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
    const request: Record<string, unknown> = {
      notification_ids: notificationIds,
      mark_all: Boolean(options?.markAll),
    };
    if (session.workspaceId) {
      request.workspace_id = session.workspaceId;
    }
    return buildMobileRuntimeClient(session).markNotificationsRead(request as any) as Promise<NotificationReadResponse>;
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
    const requestBody: Record<string, unknown> = {
      device_id: request.device_id,
      push_token: request.push_token,
      provider: request.provider,
      platform: request.platform,
      device_name: request.device_name,
      app_id: request.app_id,
      capabilities: request.capabilities,
    };
    if (session.workspaceId) {
      requestBody.workspace_id = session.workspaceId;
    }
    return buildMobileRuntimeClient(session).registerNotificationDevice(
      requestBody as any,
    ) as Promise<NotificationDeviceRegistrationResponse>;
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
    const body: Record<string, unknown> = {
      ...request,
    };
    if (session.workspaceId) {
      body.workspace_id = session.workspaceId;
    }
    return fetchAgentRegistryJson(session, "/agent-registry/personal-context/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as Promise<Record<string, unknown>>;
  },
  proposeSelfWakeup(session: MobileSession, request: {
    summary: string;
    reason: string;
    due_at?: string;
    payload?: Record<string, unknown>;
    policy_context?: Record<string, unknown>;
  }) {
    const body: Record<string, unknown> = {
      ...request,
    };
    if (session.workspaceId) {
      body.workspace_id = session.workspaceId;
    }
    return fetchAgentRegistryJson(session, "/agent-registry/scheduler/self-wakeups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as Promise<Record<string, unknown>>;
  },
  async listSchedules(session: MobileSession) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const workspaceId = requireSessionWorkspaceId(session, "load automations");
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/schedules?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not load automations.");
    }
    const payload = await response.json().catch(() => null) as { items?: unknown[]; detail?: unknown } | null;
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not load automations."));
    }
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        enabled: Boolean(item.enabled),
        cron: typeof item.cron === "string" ? item.cron : undefined,
        timezone: typeof item.timezone === "string" ? item.timezone : undefined,
        wake_mode: typeof item.wake_mode === "string" ? item.wake_mode : undefined,
        delivery: typeof item.delivery === "string" ? item.delivery : undefined,
        next_run_at: typeof item.next_run_at === "string" ? item.next_run_at : null,
        last_run_at: typeof item.last_run_at === "string" ? item.last_run_at : null,
        last_run_id: typeof item.last_run_id === "string" ? item.last_run_id : null,
        last_error: typeof item.last_error === "string" ? item.last_error : null,
        run_request: item.run_request && typeof item.run_request === "object"
          ? item.run_request as Record<string, unknown>
          : undefined,
      }));
  },
  async createSchedule(session: MobileSession, request: {
    name: string;
    cron: string;
    run_request: Record<string, unknown>;
    enabled?: boolean;
    timezone?: "local" | "utc";
    wake_mode?: "now" | "next-heartbeat";
    delivery?: "announce" | "silent";
  }) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const workspaceId = requireSessionWorkspaceId(session, "create this automation");
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/schedules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: request.name,
          enabled: request.enabled ?? true,
          cron: request.cron,
          timezone: request.timezone || "local",
          wake_mode: request.wake_mode || "now",
          delivery: request.delivery || "announce",
          run_request: request.run_request,
        }),
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not create this automation.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not create this automation."));
    }
    return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
  },
  async updateSchedule(session: MobileSession, scheduleId: string, request: {
    enabled?: boolean;
    name?: string;
    cron?: string;
    wake_mode?: "now" | "next-heartbeat";
    delivery?: "announce" | "silent";
    timezone?: "local" | "utc";
    run_request?: Record<string, unknown>;
  }) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/schedules/${encodeURIComponent(scheduleId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not update this automation.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not update this automation."));
    }
    return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
  },
  async triggerScheduleNow(session: MobileSession, scheduleId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    let response: Response;
    try {
      response = await performSessionFetch(session, `${baseUrl}/schedules/${encodeURIComponent(scheduleId)}/run-now`, {
        method: "POST",
      });
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        throw error;
      }
      throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Could not run this automation.");
    }
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, "Could not run this automation."));
    }
    return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
  },
  async testConnector(session: MobileSession, connectorId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    const response = await performSessionFetch(session, `${baseUrl}/connectors/vault/${encodeURIComponent(connectorId)}/test${query}`, {
      method: "POST",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Connector test failed.");
    }
    return payload;
  },
  async disconnectConnector(session: MobileSession, connectorId: string) {
    const baseUrl = normalizeServerUrl(session.runtimeUrl);
    const query = session.workspaceId
      ? `?workspace_id=${encodeURIComponent(session.workspaceId)}`
      : "";
    const response = await performSessionFetch(session, `${baseUrl}/connectors/vault/${encodeURIComponent(connectorId)}${query}`, {
      method: "DELETE",
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
    const turnRequest = {
      session_id: createMobileRequestId("mobile-run"),
      channel: "mobile",
      actor: buildMobileActor(session, `mobile-runner:${session.workspaceId || "personal"}`),
      message: goal,
      attachments: [],
      execution_mode: "durable",
      response_mode: "artifact",
      context_hints: {
        engine: "empyralis",
        agent_role: agentRole || undefined,
        metadata,
      },
    } as unknown as AgentTurnRequest;
    if (session.tenantId) {
      turnRequest.tenant_id = session.tenantId;
    }
    if (session.workspaceId) {
      turnRequest.workspace_id = session.workspaceId;
    }
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
