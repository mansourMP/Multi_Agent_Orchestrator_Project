import { resolveRouteIdFromTarget } from '../workspace/workspace-shell.js';

function capitalize(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function pickFirstValue(record, keys, fallback = null) {
  if (!record || typeof record !== 'object') {
    return fallback;
  }

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key];
    }
  }

  return fallback;
}

export function pickFirstString(record, keys, fallback = null) {
  const value = pickFirstValue(record, keys, fallback);
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

export function formatSurfaceTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatSurfaceBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function normalizeSurfaceRecord(record, {
  titleKeys = ['title', 'label', 'name', 'summary', 'id'],
  subtitleKeys = ['subtitle', 'message', 'description', 'kind', 'type'],
  statusKeys = ['status', 'state', 'level'],
  timestampKeys = ['updated_at', 'updatedAt', 'created_at', 'createdAt', 'timestamp'],
  sizeKeys = ['size_bytes', 'sizeBytes', 'bytes', 'size'],
  fallbackTitle = 'Untitled',
} = {}) {
  const id = pickFirstString(record, ['id', 'notification_id', 'artifact_id', 'run_id', 'approval_id'], fallbackTitle);
  const title = pickFirstString(record, titleKeys, id ?? fallbackTitle) ?? fallbackTitle;
  const subtitle = pickFirstString(record, subtitleKeys, null);
  const status = pickFirstString(record, statusKeys, null);
  const timestampValue = pickFirstString(record, timestampKeys, null);
  const sizeValue = pickFirstValue(record, sizeKeys, null);

  return {
    id,
    title,
    subtitle,
    status,
    timestamp: formatSurfaceTimestamp(timestampValue),
    sizeLabel: formatSurfaceBytes(typeof sizeValue === 'number' ? sizeValue : null),
    raw: record,
  };
}

export function resolveMobileWorkspaceApiPaths(workspaceId, overrides = {}) {
  const defaults = {
    workspaceEntry: '/(workspace)',
    sessionCreate: '/api/sessions',
    chatThread: (threadId = 'primary') =>
      `/api/threads/${encodeURIComponent(threadId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
    chatSend: '/api/turn',
    runs: `/api/runs?workspace_id=${encodeURIComponent(workspaceId)}`,
    agentTraces: `/api/agent-traces?workspace_id=${encodeURIComponent(workspaceId)}`,
    agentTraceDetail: (traceId) =>
      `/api/agent-traces/${encodeURIComponent(traceId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
    approvals: `/api/approvals?workspace_id=${encodeURIComponent(workspaceId)}`,
    approvalAction: (approvalId) =>
      `/api/approvals/${encodeURIComponent(approvalId)}/resolve?workspace_id=${encodeURIComponent(workspaceId)}`,
    notifications: `/api/notifications?workspace_id=${encodeURIComponent(workspaceId)}`,
    artifacts: `/api/artifacts?workspace_id=${encodeURIComponent(workspaceId)}`,
  };

  return {
    ...defaults,
    ...overrides,
  };
}

export function assertWorkspaceRouteAvailable(foundation, routeId, label = routeId) {
  const route = foundation?.routeManifest?.routeIndex?.[routeId];
  if (!route) {
    throw new Error(`Mobile ${label} surface is not available in this workspace.`);
  }
  return route;
}

export function resolveAllowedWorkspaceRoute(foundation, candidateRoute) {
  if (!candidateRoute) {
    return foundation.routeManifest.defaultRouteId;
  }

  const routeId = resolveRouteIdFromTarget(foundation.bootstrap.workspace.id, candidateRoute);
  if (!routeId) {
    return foundation.routeManifest.defaultRouteId;
  }

  return foundation.routeManifest.routeIndex[routeId]?.id ?? foundation.routeManifest.defaultRouteId;
}

export function resolveAllowedWorkspaceScreen(foundation, candidateRoute) {
  const routeId = resolveAllowedWorkspaceRoute(foundation, candidateRoute);
  return foundation.routeManifest.routeIndex[routeId]?.screen ?? foundation.routeManifest.defaultRoute;
}

export function writeWorkspaceSurfaceResource({
  foundation,
  queryKey,
  persistenceKey,
  data,
}) {
  foundation.services.queryClient.set(queryKey, data);
  foundation.services.persistence.setJson(persistenceKey, data);
  return data;
}

export async function loadWorkspaceSurfaceResource({
  foundation,
  routeId,
  queryKey,
  persistenceKey,
  path,
  emptyValue,
  transform,
  scopeLabel,
  refresh = false,
}) {
  assertWorkspaceRouteAvailable(foundation, routeId, scopeLabel);

  const emptyData = typeof emptyValue === 'function' ? emptyValue() : emptyValue;
  const cachedMemory = refresh ? null : foundation.services.queryClient.peek(queryKey);
  if (cachedMemory !== null) {
    return {
      status: 'ready',
      statusMessage: null,
      source: 'memory',
      data: cachedMemory,
    };
  }

  const cachedPersisted = foundation.services.persistence.getJson(persistenceKey);

  try {
    const raw = await foundation.services.transport.requestJson(path);
    const data = transform(raw);
    writeWorkspaceSurfaceResource({
      foundation,
      queryKey,
      persistenceKey,
      data,
    });
    return {
      status: 'ready',
      statusMessage: null,
      source: 'live',
      data,
    };
  } catch (error) {
    if (cachedPersisted !== null) {
      return {
        status: 'degraded',
        statusMessage: `Showing cached ${scopeLabel} because cloud sync failed.`,
        source: 'persisted',
        data: cachedPersisted,
        error,
      };
    }

    return {
      status: 'error',
      statusMessage: `${capitalize(scopeLabel)} are unavailable because the cloud workspace is unreachable.`,
      source: 'empty',
      data: emptyData,
      error,
    };
  }
}

export function combineSurfaceResults(results) {
  const messages = results
    .map((result) => result.statusMessage)
    .filter((message) => typeof message === 'string' && message.trim());

  if (results.some((result) => result.status === 'error')) {
    return {
      status: 'error',
      statusMessage: messages.join(' '),
    };
  }

  if (results.some((result) => result.status === 'degraded')) {
    return {
      status: 'degraded',
      statusMessage: messages.join(' '),
    };
  }

  return {
    status: 'ready',
    statusMessage: messages.join(' ') || null,
  };
}

export function normalizeListPayload(payload, preferredKeys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    for (const key of preferredKeys) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

export class WorkspaceSurfaceRequestError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = 'WorkspaceSurfaceRequestError';
    this.status = status;
    this.detail = detail;
  }
}

export async function requestWorkspaceSurfaceJson({
  foundation,
  path,
  init = {},
  allowStatuses = [],
}) {
  const response = await foundation.services.transport.request(path, init);
  let payload = null;
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

  if (!response.ok && !allowStatuses.includes(response.status)) {
    const detail = payload && typeof payload === 'object' && 'detail' in payload
      ? payload.detail
      : payload;
    throw new WorkspaceSurfaceRequestError(
      typeof detail === 'string'
        ? detail
        : `Workspace transport request failed with status ${response.status}.`,
      response.status,
      detail,
    );
  }

  return payload;
}
