import {
  openAuthenticatedEventStream,
  type AuthenticatedEventStreamConnection,
} from '@/lib/authenticatedEventStream';
import type {
  AgentTurnRequest,
  AgentTurnResponse,
  ArtifactListResponse,
  MachineListResponse,
  NotificationListResponse,
  RunDetailResponse,
  RunListResponse,
  RunReplayResponse,
  SessionCreateRequest,
  SessionResponse,
} from '@/lib/api-contract';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { API_BASE } from '@/lib/config';

export class ApiClientError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

type RequestMode = 'proxy' | 'runtime';

type RequestOptions = {
  mode?: RequestMode;
  ensureSession?: boolean;
};

type TurnStreamRequestOptions = {
  clientRequestId?: string;
  lastEventId?: string;
  signal?: AbortSignal | null;
};

type NotificationStreamOptions = {
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
  onOpen?: () => void;
  onEvent?: Parameters<typeof openAuthenticatedEventStream>[0]['onEvent'];
  onError?: Parameters<typeof openAuthenticatedEventStream>[0]['onError'];
  onClose?: () => void;
};

function normalizedRuntimeBase(): string {
  return String(process.env.NEXT_PUBLIC_API_URL || API_BASE || '').trim().replace(/\/$/, '');
}

function normalizedPath(path: string): string {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function buildRequestUrl(path: string, mode: RequestMode = 'proxy'): string {
  const normalized = normalizedPath(path);
  if (mode === 'runtime' && typeof window === 'undefined') {
    return `${normalizedRuntimeBase()}${normalized}`;
  }
  return normalized.startsWith('/api/') ? normalized : `/api${normalized}`;
}

function optionalSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const candidates = [
    'empyralis.sessionToken',
    'orion.sessionToken',
    'orion.controlPlaneToken',
  ];
  for (const key of candidates) {
    try {
      const value = window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
      if (value && value.trim()) return value.trim();
    } catch {
      // Ignore storage access failures and rely on same-origin cookies.
    }
  }
  return null;
}

async function parseError(response: Response): Promise<ApiClientError> {
  const raw = await response.text().catch(() => '');
  let details: unknown;
  let message = `API request failed (${response.status})`;
  if (raw.trim()) {
    try {
      details = JSON.parse(raw) as unknown;
      const record = details && typeof details === 'object' ? details as Record<string, unknown> : {};
      if (typeof record.detail === 'string' && record.detail.trim()) message = record.detail.trim();
      else if (typeof record.message === 'string' && record.message.trim()) message = record.message.trim();
      else message = raw.trim();
    } catch {
      message = raw.trim();
    }
  }
  return new ApiClientError(message, response.status, details);
}

async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<Response> {
  if (options.ensureSession !== false) {
    await ensureControlPlaneSession();
  }
  const headers = new Headers(init.headers || {});
  const sessionToken = optionalSessionToken();
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  return fetch(buildRequestUrl(path, options.mode), {
    ...init,
    headers,
    cache: init.cache || 'no-store',
    credentials: init.credentials || 'same-origin',
  });
}

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const response = await authenticatedFetch(path, init, options);
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export const apiClient = {
  async createSession(request: SessionCreateRequest): Promise<SessionResponse> {
    return jsonRequest<SessionResponse>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  },

  async getSession(sessionId: string): Promise<SessionResponse> {
    return jsonRequest<SessionResponse>(`/sessions/${encodeURIComponent(sessionId)}`);
  },

  async turn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    return jsonRequest<AgentTurnResponse>('/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  },

  async openTurnStreamResponse(
    request: AgentTurnRequest,
    options: TurnStreamRequestOptions = {},
  ): Promise<Response> {
    const hints = request.context_hints && typeof request.context_hints === 'object'
      ? { ...request.context_hints }
      : {};
    if (options.clientRequestId) hints.request_id = options.clientRequestId;
    if (options.lastEventId) hints.last_event_id = options.lastEventId;
    const payload: AgentTurnRequest = {
      ...request,
      execution_mode: request.execution_mode || 'sync',
      response_mode: request.response_mode || 'stream',
      context_hints: hints,
    };
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (options.lastEventId) headers.set('Last-Event-ID', options.lastEventId);
    return authenticatedFetch('/turn', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: options.signal || undefined,
    });
  },

  async listRuns(params: {
    workspace_id?: string;
    limit?: number;
    offset?: number;
    status?: string;
    pack_id?: string;
  } = {}): Promise<RunListResponse> {
    const query = buildQuery(params);
    return jsonRequest<RunListResponse>(`/runs${query ? `?${query}` : ''}`);
  },

  async getRunDetail(runId: string): Promise<RunDetailResponse> {
    return jsonRequest<RunDetailResponse>(`/runs/${encodeURIComponent(runId)}`);
  },

  async getRunReplay(runId: string): Promise<RunReplayResponse> {
    return jsonRequest<RunReplayResponse>(`/runs/${encodeURIComponent(runId)}/replay`);
  },

  async listArtifacts(params: {
    workspace_id?: string;
    history_limit?: number;
    limit?: number;
  } = {}): Promise<ArtifactListResponse> {
    const query = buildQuery(params);
    return jsonRequest<ArtifactListResponse>(`/artifacts${query ? `?${query}` : ''}`);
  },

  async fetchArtifactContent(path: string): Promise<Blob> {
    const response = await authenticatedFetch(`/artifacts/content?path=${encodeURIComponent(String(path || '').trim())}`, {
      method: 'GET',
    });
    if (!response.ok) throw await parseError(response);
    return response.blob();
  },

  async listMachines(): Promise<MachineListResponse> {
    return jsonRequest<MachineListResponse>('/machines');
  },

  async listNotifications(params: {
    workspace_id?: string;
    channel?: string;
    session_key?: string;
    direction?: string;
    action?: string;
    run_id?: string;
    trace_id?: string;
    limit?: number;
  } = {}): Promise<NotificationListResponse> {
    const query = buildQuery(params);
    return jsonRequest<NotificationListResponse>(`/notifications${query ? `?${query}` : ''}`);
  },

  openNotificationsStream(options: NotificationStreamOptions): AuthenticatedEventStreamConnection {
    const query = buildQuery({
      workspace_id: options.workspace_id,
      channel: options.channel,
      session_key: options.session_key,
      direction: options.direction,
      action: options.action,
      run_id: options.run_id,
      trace_id: options.trace_id,
      limit: options.limit,
      include_backlog: options.include_backlog,
      since_id: options.since_id,
      since_ts: options.since_ts,
      stream: true,
    });
    return openAuthenticatedEventStream({
      url: `/api/notifications${query ? `?${query}` : '?stream=true'}`,
      onOpen: options.onOpen,
      onEvent: options.onEvent,
      onError: options.onError,
      onClose: options.onClose,
    });
  },
};
