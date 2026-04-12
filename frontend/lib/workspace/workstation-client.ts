'use client';

export type WorkstationClientScope = {
  workspaceId: string;
  tenantId: string;
  kernelKey: string;
};

export type WorkstationSessionActor = {
  type: string;
  id: string;
  display_name?: string | null;
};

export type WorkstationSessionRecord = {
  session_id: string;
  workspace_id?: string;
  tenant_id?: string;
  channel?: string;
  actor?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: string;
};

export type WorkstationTurnResponse = {
  status?: string;
  reply?: string;
  run_id?: string | null;
  thread_id?: string | null;
  session_id?: string | null;
  approvals?: Record<string, unknown>[];
  interventions?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
};

export type WorkstationClientDependencies = {
  scope: WorkstationClientScope;
  transport: {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  };
  queryClient: {
    peek: <T>(key: string) => T | null;
    set: <T>(key: string, value: T) => T;
  };
  realtime: {
    trackEventSource: <T extends EventSource>(source: T) => T;
  };
  getApiBaseUrl: () => string;
};

export type WorkstationClientRequestOptions = {
  path: string;
  init?: RequestInit;
  allowStatuses?: number[];
};

export type WorkstationClientStreamOptions = {
  sinceId?: string;
  sinceTs?: string;
  includeBacklog?: boolean;
  limit?: number;
};

export type WorkstationClientPaths = {
  workspaceBootstrap: (workspaceId: string) => string;
  sessionCreate: string;
  turnSubmit: string;
  thread: (threadId: string) => string;
  runs: (limit?: number) => string;
  approvals: (limit?: number) => string;
  approvalResolve: (approvalId: string, runId?: string | null) => string;
  artifacts: (limit?: number) => string;
  notifications: (limit?: number) => string;
  notificationsStream: (options?: WorkstationClientStreamOptions) => string;
  channelEventsStream: (options?: WorkstationClientStreamOptions) => string;
};

export class WorkstationClientError extends Error {
  readonly status: number;

  readonly detail: unknown;

  readonly code: string | null;

  constructor(message: string, status: number, detail: unknown, code: string | null = null) {
    super(message);
    this.name = 'WorkstationClientError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export type WorkstationClient = {
  scope: WorkstationClientScope;
  paths: WorkstationClientPaths;
  requestJson: <T>(options: WorkstationClientRequestOptions) => Promise<T | null>;
  getThread: (options: { threadId: string; allowMissing?: boolean }) => Promise<Record<string, unknown> | null>;
  listRuns: (options?: { limit?: number }) => Promise<Record<string, unknown>>;
  listApprovals: (options?: { limit?: number }) => Promise<Record<string, unknown>>;
  listArtifacts: (options?: { limit?: number }) => Promise<Record<string, unknown>>;
  createSession: (options: {
    actor: WorkstationSessionActor;
    threadId: string;
    channel?: string;
    source?: string;
    forceNew?: boolean;
  }) => Promise<WorkstationSessionRecord>;
  submitTurn: (options: {
    actor: WorkstationSessionActor;
    sessionId: string;
    threadId: string;
    message: string;
    channel?: string;
    source?: string;
  }) => Promise<WorkstationTurnResponse>;
  submitTurnWithSessionRetry: (options: {
    actor: WorkstationSessionActor;
    threadId: string;
    message: string;
    channel?: string;
    source?: string;
  }) => Promise<{
    response: WorkstationTurnResponse;
    session: WorkstationSessionRecord;
    renewed: boolean;
  }>;
  resolveApproval: (options: {
    approvalId: string;
    payload: Record<string, unknown>;
    runId?: string | null;
  }) => Promise<Record<string, unknown> | null>;
  openNotificationsStream: (options?: WorkstationClientStreamOptions) => EventSource;
  openChannelEventsStream: (options?: WorkstationClientStreamOptions) => EventSource;
  snapshot: () => {
    scope: WorkstationClientScope;
    paths: {
      sessionCreate: string;
      turnSubmit: string;
      runs: string;
      approvals: string;
      artifacts: string;
      notifications: string;
      notificationsStream: string;
      channelEventsStream: string;
    };
  };
};

function buildQueryString(
  entries: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export function buildWorkstationApiPaths(workspaceId: string): WorkstationClientPaths {
  return {
    workspaceBootstrap: (targetWorkspaceId) =>
      `/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/bootstrap`,
    sessionCreate: '/api/sessions',
    turnSubmit: '/api/turn',
    thread: (threadId) =>
      `/api/threads/${encodeURIComponent(threadId)}${buildQueryString({ workspace_id: workspaceId })}`,
    runs: (limit = 80) =>
      `/api/runs${buildQueryString({ workspace_id: workspaceId, limit })}`,
    approvals: (limit = 80) =>
      `/api/approvals${buildQueryString({ workspace_id: workspaceId, limit })}`,
    approvalResolve: (approvalId, runId) => (
      runId
        ? `/api/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve${buildQueryString({ workspace_id: workspaceId })}`
        : `/api/approvals/${encodeURIComponent(approvalId)}/resolve${buildQueryString({ workspace_id: workspaceId })}`
    ),
    artifacts: (limit = 80) =>
      `/api/artifacts${buildQueryString({ workspace_id: workspaceId, limit })}`,
    notifications: (limit = 80) =>
      `/api/notifications${buildQueryString({ workspace_id: workspaceId, limit })}`,
    notificationsStream: (options = {}) =>
      `/api/notifications${buildQueryString({
        workspace_id: workspaceId,
        stream: 'true',
        since_id: options.sinceId,
        since_ts: options.sinceTs,
        include_backlog: options.includeBacklog ? 'true' : undefined,
        limit: options.limit ?? 120,
      })}`,
    channelEventsStream: (options = {}) =>
      `/api/events/inbox/stream${buildQueryString({
        workspace_id: workspaceId,
        since_id: options.sinceId,
        since_ts: options.sinceTs,
        include_backlog: options.includeBacklog ? 'true' : undefined,
        limit: options.limit ?? 120,
      })}`,
  };
}

function extractErrorDetail(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'detail' in (payload as Record<string, unknown>)) {
    return (payload as Record<string, unknown>).detail;
  }
  return payload;
}

function extractErrorCode(payload: unknown, detail: unknown): string | null {
  if (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).code === 'string') {
    return String((payload as Record<string, unknown>).code);
  }
  if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).code === 'string') {
    return String((detail as Record<string, unknown>).code);
  }
  return null;
}

function fallbackErrorMessage(status: number): string {
  if (status === 401) {
    return 'Authentication is required for this workstation request.';
  }
  if (status === 403) {
    return 'This workstation request is outside the current workspace access scope.';
  }
  if (status === 404) {
    return 'The requested workstation resource was not found.';
  }
  if (status === 409) {
    return 'The workstation session scope changed. Renew the session and retry.';
  }
  if (status >= 500) {
    return 'The workstation backend is unavailable right now.';
  }
  return `Workstation request failed with status ${status}.`;
}

function normalizeClientError(status: number, payload: unknown): WorkstationClientError {
  const detail = extractErrorDetail(payload);
  const code = extractErrorCode(payload, detail);
  const message =
    typeof detail === 'string' && detail.trim()
      ? detail
      : fallbackErrorMessage(status);
  return new WorkstationClientError(message, status, detail, code);
}

function mergeJsonHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers ?? {});
  if (!merged.has('content-type')) {
    merged.set('content-type', 'application/json');
  }
  return merged;
}

function resolveAbsoluteUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const root = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

function sessionCacheKey(
  scope: WorkstationClientScope,
  threadId: string,
  channel: string,
  actorId: string,
): string {
  return `workstation:session:${scope.kernelKey}:${channel}:${threadId}:${actorId}`;
}

export function createWorkstationClient(
  dependencies: WorkstationClientDependencies,
): WorkstationClient {
  const { scope, transport, queryClient, realtime, getApiBaseUrl } = dependencies;
  const paths = buildWorkstationApiPaths(scope.workspaceId);

  async function requestJson<T>({
    path,
    init = {},
    allowStatuses = [],
  }: WorkstationClientRequestOptions): Promise<T | null> {
    const response = await transport.request(path, init);
    let payload: unknown = null;
    const text = await response.text();

    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok && allowStatuses.includes(response.status)) {
      return null;
    }

    if (!response.ok) {
      throw normalizeClientError(response.status, payload);
    }

    return payload as T;
  }

  async function createSession({
    actor,
    threadId,
    channel = 'web',
    source = 'workstation_client',
    forceNew = false,
  }: {
    actor: WorkstationSessionActor;
    threadId: string;
    channel?: string;
    source?: string;
    forceNew?: boolean;
  }): Promise<WorkstationSessionRecord> {
    const cacheKey = sessionCacheKey(scope, threadId, channel, actor.id);
    if (!forceNew) {
      const cached = queryClient.peek<WorkstationSessionRecord>(cacheKey);
      if (cached?.session_id) {
        return cached;
      }
    }

    const session = await requestJson<WorkstationSessionRecord>({
      path: paths.sessionCreate,
      init: {
        method: 'POST',
        headers: mergeJsonHeaders(),
        body: JSON.stringify({
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          channel,
          actor,
          metadata: {
            thread_id: threadId,
            source,
          },
        }),
      },
    });

    queryClient.set(cacheKey, session as WorkstationSessionRecord);
    return session as WorkstationSessionRecord;
  }

  async function submitTurn({
    actor,
    sessionId,
    threadId,
    message,
    channel = 'web',
    source = 'workstation_client',
  }: {
    actor: WorkstationSessionActor;
    sessionId: string;
    threadId: string;
    message: string;
    channel?: string;
    source?: string;
  }): Promise<WorkstationTurnResponse> {
    return (await requestJson<WorkstationTurnResponse>({
      path: paths.turnSubmit,
      init: {
        method: 'POST',
        headers: mergeJsonHeaders(),
        body: JSON.stringify({
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          thread_id: threadId,
          session_id: sessionId,
          channel,
          actor,
          message,
          attachments: [],
          context_hints: {
            source,
            thread_id: threadId,
          },
          execution_mode: 'sync',
          response_mode: 'artifact',
          policy_context: {},
        }),
      },
    })) as WorkstationTurnResponse;
  }

  return {
    scope,
    paths,
    requestJson,
    getThread: ({ threadId, allowMissing = false }) =>
      requestJson<Record<string, unknown>>({
        path: paths.thread(threadId),
        allowStatuses: allowMissing ? [404] : [],
      }),
    listRuns: ({ limit = 80 } = {}) =>
      requestJson<Record<string, unknown>>({
        path: paths.runs(limit),
      }) as Promise<Record<string, unknown>>,
    listApprovals: ({ limit = 80 } = {}) =>
      requestJson<Record<string, unknown>>({
        path: paths.approvals(limit),
      }) as Promise<Record<string, unknown>>,
    listArtifacts: ({ limit = 80 } = {}) =>
      requestJson<Record<string, unknown>>({
        path: paths.artifacts(limit),
      }) as Promise<Record<string, unknown>>,
    createSession,
    submitTurn,
    submitTurnWithSessionRetry: async ({
      actor,
      threadId,
      message,
      channel = 'web',
      source = 'workstation_client',
    }) => {
      let session = await createSession({
        actor,
        threadId,
        channel,
        source,
        forceNew: false,
      });

      try {
        const response = await submitTurn({
          actor,
          sessionId: String(session.session_id),
          threadId,
          message,
          channel,
          source,
        });
        return { response, session, renewed: false };
      } catch (error) {
        if (!(error instanceof WorkstationClientError) || error.status !== 409) {
          throw error;
        }

        session = await createSession({
          actor,
          threadId,
          channel,
          source,
          forceNew: true,
        });
        const response = await submitTurn({
          actor,
          sessionId: String(session.session_id),
          threadId,
          message,
          channel,
          source,
        });
        return { response, session, renewed: true };
      }
    },
    resolveApproval: ({ approvalId, payload, runId }) =>
      requestJson<Record<string, unknown>>({
        path: paths.approvalResolve(approvalId, runId),
        init: {
          method: 'POST',
          headers: mergeJsonHeaders(),
          body: JSON.stringify(payload),
        },
      }),
    openNotificationsStream: (options = {}) =>
      realtime.trackEventSource(
        new EventSource(
          resolveAbsoluteUrl(getApiBaseUrl(), paths.notificationsStream(options)),
          { withCredentials: true },
        ),
      ),
    openChannelEventsStream: (options = {}) =>
      realtime.trackEventSource(
        new EventSource(
          resolveAbsoluteUrl(getApiBaseUrl(), paths.channelEventsStream(options)),
          { withCredentials: true },
        ),
      ),
    snapshot: () => ({
      scope,
      paths: {
        sessionCreate: paths.sessionCreate,
        turnSubmit: paths.turnSubmit,
        runs: paths.runs(),
        approvals: paths.approvals(),
        artifacts: paths.artifacts(),
        notifications: paths.notifications(),
        notificationsStream: paths.notificationsStream(),
        channelEventsStream: paths.channelEventsStream(),
      },
    }),
  };
}
