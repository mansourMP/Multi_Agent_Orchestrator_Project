'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { openAuthenticatedEventStream, type AuthenticatedEventStreamConnection } from '@/lib/authenticatedEventStream';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { StreamAssembler, extractDisplaySuffix } from '@/lib/StreamAssembler';
import { BRAND } from '@/lib/brand';
import { buildRunStartedMessage, RUN_WAITING_STATUS_COPY } from '@/lib/runStartCopy';
import {
  DEFAULT_PROVIDER_OPTIONS,
  isProviderId,
  normalizeProviderId,
  parseJson,
  type ProviderId,
  type ProviderOption,
  type RoutePayload,
  type RunStatus,
  type TrustMode,
} from './page.catalog';
import type {
  AgentTurnApprovalRequest,
  AgentTurnIntervention,
  AgentTurnPolicyContext,
  AgentTurnRequest,
  AgentTurnResponse,
} from '@shared/api-contract';

type UseSagePlatformApiOptions = {
  activeWorkspaceId?: string | null;
  activeTenantId?: string | null;
  trustMode?: TrustMode;
};

type StartedRunPayload = {
  run_id?: string;
  status?: string;
  route?: RoutePayload | Record<string, unknown> | null;
  pending_approval?: { approval_id?: string; status?: string } | null;
  active_profile_label?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
  [key: string]: unknown;
};

type OperatorChatActionPayload = {
  id: string;
  kind: 'run' | 'workflow' | 'connect' | 'open' | 'approval_required';
  label: string;
  variant?: 'primary' | 'secondary';
  type?: string | null;
  href?: string | null;
  goal?: string | null;
  connector?: string | null;
  action?: string | null;
  input?: string | null;
};

type OperatorChatApprovedActionPayload = {
  connector: string;
  action: string;
  input: string;
};

type OperatorChatPriorMessagePayload = {
  role: 'user' | 'assistant';
  content: string;
};

type OperatorChatContextUsedPayload = {
  tool_capabilities?: Array<{
    id: string;
    label: string;
    connected: boolean;
    authenticated?: boolean | null;
    runtime_usable?: boolean | null;
    read_actions?: string[];
    write_actions?: string[];
    approval_required_actions?: string[];
  }>;
  workspace: string;
  requested_provider?: string | null;
  effective_provider?: string | null;
  requested_model?: string | null;
  effective_model?: string | null;
  provider_overridden?: boolean;
  model_overridden?: boolean;
  fallback_used?: boolean;
  fallback_reason?: string | null;
  reasoning_effort?: string | null;
  connected_systems?: string[];
  prior_messages_used: boolean;
  history_mode: 'none' | 'raw_messages' | 'summary';
  run_created: boolean;
};

type OperatorChatStepStatus = 'active' | 'done' | 'error';
type OperatorChatStepKind = 'file' | 'shell' | 'connector' | 'thinking' | 'screenshot';

type OperatorChatStepPayload = {
  id: string;
  label: string;
  detail?: string | null;
  status: OperatorChatStepStatus;
  kind?: OperatorChatStepKind | null;
};

type OperatorChatResponsePayload = {
  reply: string;
  actions?: OperatorChatActionPayload[];
  approvals?: AgentTurnApprovalRequest[];
  interventions?: AgentTurnIntervention[];
  artifacts?: Array<Record<string, unknown>>;
  suggestions?: string[];
  mode?: string;
  usage_masked?: Record<string, unknown> | null;
  provider?: string | null;
  model?: string | null;
  attempted_providers?: string;
  error?: string;
  context_used?: OperatorChatContextUsedPayload | null;
  steps?: OperatorChatStepPayload[];
};

type TimedResourceCache<T> = {
  value: T | null;
  fetchedAt: number;
  promise: Promise<T> | null;
};

const PROVIDER_POLL_MIN_INTERVAL_MS = 30_000;
const PROVIDER_CATALOG_DEBOUNCE_MS = 180;
const PROVIDER_MODELS_DEBOUNCE_MS = 220;
const RUNTIME_SESSION_STORAGE_PREFIX = 'empyralis.runtime-session.v1:';

const providerCatalogCache: TimedResourceCache<ProviderOption[]> = {
  value: null,
  fetchedAt: 0,
  promise: null,
};

const providerModelsCache = new Map<string, TimedResourceCache<string[]>>();

function humanizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid api key')) {
    return `Runtime access key is invalid. Open Setup and enter the same access key used by the ${BRAND.product} runtime.`;
  }
  if (lower.includes('incorrect api key') || lower.includes('invalid_api_key')) {
    return 'Your AI connection is invalid. Open Setup and reconnect your AI account.';
  }
  if (lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return `Authorization failed. Check ${BRAND.company} runtime key and AI provider key.`;
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return `Runtime is offline. Start ${BRAND.company} services to see live runs.`;
  }
  return message;
}

function createStreamRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildWebActor(sessionId: string): AgentTurnRequest['actor'] {
  const normalized = String(sessionId || 'web-user').trim() || 'web-user';
  return {
    type: 'user',
    id: normalized,
    display_name: 'Web user',
  };
}

function buildOperatorChatPolicyContext(trustMode: TrustMode): AgentTurnPolicyContext {
  const effectiveTrustMode: TrustMode = trustMode === 'auto' ? 'auto' : trustMode;
  const sessionMode = effectiveTrustMode === 'auto' ? 'agent' : 'copilot';
  return {
    trust_mode: effectiveTrustMode,
    session_mode: sessionMode,
    approval_ui: 'card',
    interactive_approvals: sessionMode !== 'agent',
  };
}

function readStoredRuntimeSessionId(clientSessionKey: string): string | null {
  if (typeof window === 'undefined') return null;
  const normalized = String(clientSessionKey || '').trim();
  if (!normalized) return null;
  try {
    const value = window.sessionStorage.getItem(`${RUNTIME_SESSION_STORAGE_PREFIX}${normalized}`);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function storeRuntimeSessionId(clientSessionKey: string, runtimeSessionId: string): void {
  if (typeof window === 'undefined') return;
  const normalizedKey = String(clientSessionKey || '').trim();
  const normalizedValue = String(runtimeSessionId || '').trim();
  if (!normalizedKey || !normalizedValue) return;
  try {
    window.sessionStorage.setItem(`${RUNTIME_SESSION_STORAGE_PREFIX}${normalizedKey}`, normalizedValue);
  } catch {
    // Ignore storage failures.
  }
}

async function ensureRuntimeSessionId(input: {
  clientSessionKey?: string | null;
  channel?: string;
  actorLabel?: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const clientSessionKey = String(input.clientSessionKey || '').trim();
  const cached = clientSessionKey ? readStoredRuntimeSessionId(clientSessionKey) : null;
  if (cached) return cached;

  const actorId = clientSessionKey || createStreamRequestId();
  const session = await apiClient.createSession({
    tenant_id: String(input.tenantId || '').trim() || 'default',
    workspace_id: String(input.workspaceId || '').trim() || 'default',
    channel: String(input.channel || 'web').trim() || 'web',
    actor: {
      ...buildWebActor(actorId),
      display_name: String(input.actorLabel || 'Web user').trim() || 'Web user',
    },
    metadata: {
      ...(clientSessionKey ? { client_session_key: clientSessionKey } : {}),
      ...(input.metadata || {}),
    },
  });

  const runtimeSessionId = String(session.session_id || '').trim();
  if (!runtimeSessionId) throw new Error('Runtime session bootstrap failed.');
  if (clientSessionKey) storeRuntimeSessionId(clientSessionKey, runtimeSessionId);
  return runtimeSessionId;
}

function readFreshCache<T>(cache: TimedResourceCache<T>, staleMs: number): T | null {
  if (cache.value === null) return null;
  return Date.now() - cache.fetchedAt < staleMs ? cache.value : null;
}

function readAnyCache<T>(cache: TimedResourceCache<T>): T | null {
  return cache.value;
}

async function getOrRefreshCachedResource<T>(
  cache: TimedResourceCache<T>,
  staleMs: number,
  debounceMs: number,
  loader: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  const fresh = readFreshCache(cache, staleMs);
  if (fresh !== null) return fresh;
  if (cache.promise) return cache.promise;

  cache.promise = (async () => {
    if (debounceMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, debounceMs));
      const refreshedDuringDebounce = readFreshCache(cache, staleMs);
      if (refreshedDuringDebounce !== null) return refreshedDuringDebounce;
    }
    try {
      const next = await loader();
      cache.value = next;
      cache.fetchedAt = Date.now();
      return next;
    } catch {
      const existing = readAnyCache(cache);
      if (existing !== null) return existing;
      const next = fallback();
      cache.value = next;
      cache.fetchedAt = Date.now();
      return next;
    } finally {
      cache.promise = null;
    }
  })();

  return cache.promise;
}

function getProviderModelsCacheKey(providerId: ProviderId): string {
  return providerId;
}

function getProviderModelsCacheEntry(providerId: ProviderId): TimedResourceCache<string[]> {
  const key = getProviderModelsCacheKey(providerId);
  let cache = providerModelsCache.get(key);
  if (!cache) {
    cache = { value: null, fetchedAt: 0, promise: null };
    providerModelsCache.set(key, cache);
  }
  return cache;
}

function normalizeOperatorChatApprovalPayload(payload: unknown): AgentTurnApprovalRequest | null {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!prompt) return null;
  const status = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
  return {
    approval_id: typeof record.approval_id === 'string' ? record.approval_id : null,
    run_id: typeof record.run_id === 'string' ? record.run_id : null,
    prompt,
    labels: Array.isArray(record.labels) ? record.labels.map((item) => String(item || '').trim()).filter(Boolean) : [],
    capabilities: Array.isArray(record.capabilities) ? record.capabilities.map((item) => String(item || '').trim()).filter(Boolean) : [],
    actions: Array.isArray(record.actions) ? record.actions.map((item) => String(item || '').trim()).filter(Boolean) : [],
    target: typeof record.target === 'string' && record.target.trim() ? record.target.trim() : null,
    scope: 'once',
    reusable: typeof record.reusable === 'boolean' ? record.reusable : false,
    consequence: typeof record.consequence === 'string' && record.consequence.trim() ? record.consequence.trim() : null,
    status: status === 'approved' || status === 'rejected' || status === 'waiting' ? status : 'waiting',
  };
}

function normalizeOperatorChatStepPayload(payload: unknown): OperatorChatStepPayload | null {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!label) return null;
  const id = typeof record.id === 'string' && record.id.trim()
    ? record.id.trim()
    : `${label.toLowerCase().replace(/\s+/g, '-')}:${typeof record.detail === 'string' ? record.detail.trim() : ''}`;
  const rawStatus = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
  const rawKind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
  return {
    id,
    label,
    detail: typeof record.detail === 'string' && record.detail.trim() ? record.detail.trim() : null,
    status: rawStatus === 'done' || rawStatus === 'error' ? rawStatus : 'active',
    kind: rawKind === 'file' || rawKind === 'shell' || rawKind === 'connector' || rawKind === 'thinking' || rawKind === 'screenshot'
      ? rawKind as OperatorChatStepKind
      : null,
  };
}

function upsertOperatorChatStepPayload(
  current: OperatorChatStepPayload[],
  nextStep: OperatorChatStepPayload,
): OperatorChatStepPayload[] {
  const existingIndex = current.findIndex((step) => step.id === nextStep.id);
  if (existingIndex === -1) return [...current, nextStep];
  return current.map((step, index) => (index === existingIndex ? { ...step, ...nextStep } : step));
}

function normalizeOperatorChatResponsePayload(payload: unknown): OperatorChatResponsePayload {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return {
    reply: typeof record.reply === 'string' ? record.reply : '',
    actions: Array.isArray(record.actions) ? record.actions as OperatorChatResponsePayload['actions'] : [],
    approvals: Array.isArray(record.approvals)
      ? record.approvals
          .map((approval) => normalizeOperatorChatApprovalPayload(approval))
          .filter((approval): approval is AgentTurnApprovalRequest => Boolean(approval))
      : [],
    interventions: Array.isArray(record.interventions)
      ? record.interventions
          .map((entry): AgentTurnIntervention | null => {
            const next = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
            const title = typeof next?.title === 'string' ? next.title.trim() : '';
            const kind = typeof next?.kind === 'string' ? next.kind.trim() : '';
            if (!title || !kind) return null;
            const severity = typeof next?.severity === 'string' ? next.severity.trim().toLowerCase() : '';
            const status = typeof next?.status === 'string' ? next.status.trim().toLowerCase() : '';
            return {
              kind: kind as AgentTurnIntervention['kind'],
              title,
              detail: typeof next?.detail === 'string' && next.detail.trim() ? next.detail.trim() : null,
              severity: severity === 'warning' || severity === 'error' ? severity : 'info',
              status: status === 'ready' || status === 'waiting' || status === 'active' || status === 'completed' || status === 'failed'
                ? status as AgentTurnIntervention['status']
                : undefined,
              code: typeof next?.code === 'string' && next.code.trim() ? next.code.trim() : null,
              run_id: typeof next?.run_id === 'string' && next.run_id.trim() ? next.run_id.trim() : null,
              metadata: next?.metadata && typeof next.metadata === 'object' ? next.metadata as Record<string, unknown> : undefined,
            };
          })
          .filter((entry): entry is AgentTurnIntervention => Boolean(entry))
      : [],
    artifacts: Array.isArray(record.artifacts)
      ? record.artifacts.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      : [],
    suggestions: Array.isArray(record.suggestions)
      ? record.suggestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [],
    mode: typeof record.mode === 'string' ? record.mode : undefined,
    usage_masked: record.usage_masked && typeof record.usage_masked === 'object'
      ? record.usage_masked as Record<string, unknown>
      : null,
    provider: typeof record.provider === 'string' ? record.provider : null,
    model: typeof record.model === 'string' ? record.model : null,
    attempted_providers: typeof record.attempted_providers === 'string' ? record.attempted_providers : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
    context_used: record.context_used && typeof record.context_used === 'object'
      ? record.context_used as OperatorChatContextUsedPayload
      : null,
    steps: Array.isArray(record.steps)
      ? record.steps
          .map((step) => normalizeOperatorChatStepPayload(step))
          .filter((step): step is OperatorChatStepPayload => Boolean(step))
      : [],
  };
}

function responseContainsStructuredIntervention(payload: Pick<OperatorChatResponsePayload, 'approvals' | 'interventions'>): boolean {
  return Boolean(
    (Array.isArray(payload.approvals) && payload.approvals.length > 0)
      || (Array.isArray(payload.interventions) && payload.interventions.length > 0),
  );
}

async function readResponseError(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  const raw = await response.text().catch(() => '');
  if (!raw) return { message: fallback };
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as { detail?: unknown; message?: unknown; error?: unknown; code?: unknown };
    const message = typeof (record.detail ?? record.message ?? record.error) === 'string' && String(record.detail ?? record.message ?? record.error).trim()
      ? String(record.detail ?? record.message ?? record.error).trim()
      : fallback;
    const code = typeof record.code === 'string' && record.code.trim() ? record.code.trim() : undefined;
    return { message, code };
  }
  return { message: raw };
}

function mapRunStatus(value: unknown): RunStatus | null {
  const runStatus = String(value || '').toLowerCase();
  if (runStatus === 'queued_local') return 'queued_local';
  if (runStatus === 'completed') return 'completed';
  if (runStatus === 'waiting_for_input' || runStatus === 'waiting') return 'waiting';
  if (runStatus === 'failed' || runStatus === 'timeout') return 'error';
  if (runStatus === 'running' || runStatus === 'executing' || runStatus === 'running_local' || runStatus === 'starting') return 'running';
  return null;
}

export function useSagePlatformApi(options: UseSagePlatformApiOptions) {
  const activeWorkspaceId = String(options.activeWorkspaceId || '').trim() || 'default';
  const activeTenantId = String(options.activeTenantId || '').trim() || 'default';
  const effectiveTrustMode = options.trustMode || 'guarded';
  const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);

  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [model, setModel] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [lastRunPayload, setLastRunPayload] = useState<Record<string, unknown> | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers();
    const nextHeaders = new Headers(init?.headers || {});
    nextHeaders.forEach((value, key) => headers.set(key, value));
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const closeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, []);

  const refreshProviderCatalog = useCallback(async (): Promise<ProviderOption[]> => {
    return getOrRefreshCachedResource(
      providerCatalogCache,
      PROVIDER_POLL_MIN_INTERVAL_MS,
      PROVIDER_CATALOG_DEBOUNCE_MS,
      async () => {
        const res = await controlPlaneFetch('/api/control-plane/providers');
        if (!res.ok) throw new Error('Failed to load provider catalog.');
        const payload = await res.json();
        const items = Array.isArray(payload?.providers) ? payload.providers : [];
        return items
          .map((item: unknown) => {
            const next = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; default_auth_mode?: unknown; note?: unknown };
            const rawId = typeof next.id === 'string' ? next.id.trim().toLowerCase() : '';
            const id = normalizeProviderId(rawId);
            if (!isProviderId(id)) return null;
            return {
              id,
              label: typeof next.label === 'string' && next.label.trim() ? next.label.trim() : id,
              defaultModel: typeof next.default_model === 'string' && next.default_model.trim() ? next.default_model.trim() : '',
              auth: Array.isArray(next.auth) ? next.auth.filter((value): value is string => typeof value === 'string') : ['api_key'],
              defaultAuthMode: typeof next.default_auth_mode === 'string' && next.default_auth_mode.trim() ? next.default_auth_mode.trim() : 'api_key',
              authModes: [],
              note: typeof next.note === 'string' && next.note.trim() ? next.note.trim() : undefined,
            } satisfies ProviderOption;
          })
          .filter((item: ProviderOption | null): item is ProviderOption => item !== null);
      },
      () => readAnyCache(providerCatalogCache) ?? DEFAULT_PROVIDER_OPTIONS,
    );
  }, [controlPlaneFetch]);

  const refreshProviderModels = useCallback(async (providerId: ProviderId) => {
    const modelsCache = getProviderModelsCacheEntry(providerId);
    setModelsLoading(true);
    try {
      const nextModels = await getOrRefreshCachedResource(
        modelsCache,
        PROVIDER_POLL_MIN_INTERVAL_MS,
        PROVIDER_MODELS_DEBOUNCE_MS,
        async () => {
          const res = await controlPlaneFetch(`/api/control-plane/providers/${encodeURIComponent(providerId)}/models?workspace_id=${encodeURIComponent(activeWorkspaceId)}`);
          if (!res.ok) throw new Error('Failed to load provider models.');
          const payload = await res.json();
          const rawModels = Array.isArray(payload?.models) ? payload.models : [];
          return rawModels
            .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item: string) => item.trim())
            .slice(0, 120);
        },
        () => readAnyCache(modelsCache) ?? [],
      );
      setModelOptions(nextModels);
      setModel((current) => (current && nextModels.includes(current) ? current : nextModels[0] || ''));
    } catch {
      setModelOptions([]);
      setModel('');
    } finally {
      setModelsLoading(false);
    }
  }, [activeWorkspaceId, controlPlaneFetch]);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      setModelsLoading(true);
      try {
        const [catalog, availabilityRes] = await Promise.all([
          refreshProviderCatalog(),
          controlPlaneFetch(`/api/control-plane/providers/runtime-availability?workspace_id=${encodeURIComponent(activeWorkspaceId)}`),
        ]);
        if (!alive) return;
        const availabilityPayload = availabilityRes.ok ? await availabilityRes.json().catch(() => ({ items: [] })) : { items: [] };
        const readyProviders = new Set(
          (Array.isArray(availabilityPayload?.items) ? availabilityPayload.items : [])
            .filter((item: unknown) => item && typeof item === 'object' && (item as { ready?: unknown }).ready === true)
            .map((item: unknown) => normalizeProviderId(String((item as { provider?: unknown }).provider || '').trim().toLowerCase()))
            .filter((value: string): value is ProviderId => isProviderId(value)),
        );
        const preferred =
          catalog.find((item) => readyProviders.has(item.id))
          || catalog[0]
          || null;
        if (!preferred) {
          setProvider(null);
          setModelOptions([]);
          setModel('');
          return;
        }
        setProvider(preferred.id);
        await refreshProviderModels(preferred.id);
      } catch {
        if (!alive) return;
        setProvider(null);
        setModelOptions([]);
        setModel('');
      } finally {
        if (alive) setModelsLoading(false);
      }
    };
    void boot();
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, controlPlaneFetch, refreshProviderCatalog, refreshProviderModels]);

  const fetchRunResult = useCallback(async (targetRunId: string): Promise<RunStatus | null> => {
    try {
      const payload = await apiClient.getRunDetail(targetRunId);
      if (payload && typeof payload === 'object') {
        setLastRunPayload(payload as Record<string, unknown>);
        const pending = (payload as { pending_approval?: unknown }).pending_approval;
        if (pending && typeof pending === 'object') {
          const approvalId = String((pending as { approval_id?: unknown }).approval_id || '').trim();
          const approvalStatus = String((pending as { status?: unknown }).status || 'pending').toLowerCase();
          if (approvalId && approvalStatus !== 'resolved' && approvalStatus !== 'expired') {
            setPendingApprovalId(approvalId);
          } else {
            setPendingApprovalId(null);
          }
        } else {
          setPendingApprovalId(null);
        }
      }
      return mapRunStatus((payload as { status?: unknown })?.status);
    } catch {
      return null;
    }
  }, []);

  const sendOperatorChat = useCallback(async (
    message: string,
    options?: {
      reasoningEffort?: string | null;
      threadId?: string | null;
      masterAgentInstallId?: string | null;
      runtimeProfileId?: string | null;
      priorMessages?: OperatorChatPriorMessagePayload[];
      onChunk?: (delta: string) => void;
      onSteps?: (steps: OperatorChatStepPayload[]) => void;
      approvedAction?: OperatorChatApprovedActionPayload | null;
      signal?: AbortSignal | null;
    },
  ): Promise<OperatorChatResponsePayload> => {
    const priorMessages = Array.isArray(options?.priorMessages)
      ? options.priorMessages
          .filter((item): item is OperatorChatPriorMessagePayload => Boolean(item && typeof item === 'object'))
          .map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.content || '').trim(),
          }))
          .filter((item) => item.content)
      : [];
    await ensureControlPlaneSession();
    const clientSessionKey = String(options?.threadId || '').trim() || `direct-chat:${createStreamRequestId()}`;
    const runtimeSessionId = await ensureRuntimeSessionId({
      clientSessionKey,
      channel: 'web',
      actorLabel: 'Web user',
      tenantId: activeTenantId,
      workspaceId: activeWorkspaceId,
      metadata: {
        source: 'direct_chat',
        thread_id: clientSessionKey,
        ...(String(options?.masterAgentInstallId || '').trim()
          ? { master_agent_install_id: String(options?.masterAgentInstallId || '').trim() }
          : {}),
        ...(String(options?.runtimeProfileId || '').trim()
          ? { runtime_profile_id: String(options?.runtimeProfileId || '').trim() }
          : {}),
      },
    });

    let streamedReply = '';
    let streamedSteps: OperatorChatStepPayload[] = [];
    const externalSignal = options?.signal || null;
    const clientRequestId = createStreamRequestId();
    let lastEventId = '';
    const streamAssembler = new StreamAssembler();

    const createAbortError = (): Error => {
      try {
        return new DOMException('The operation was aborted.', 'AbortError');
      } catch {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        return error;
      }
    };

    const throwIfAborted = () => {
      if (externalSignal?.aborted) {
        throw createAbortError();
      }
    };

    throwIfAborted();
    let finalPayloadRaw: unknown = null;
    let buffer = '';
    let currentEvent: { event: string; data: string[]; id?: string } = { event: 'message', data: [] };
    const controller = new AbortController();
    const abortForward = () => controller.abort();
    if (externalSignal) {
      externalSignal.addEventListener('abort', abortForward, { once: true });
    }

    try {
      const turnRequest: AgentTurnRequest = {
        tenant_id: activeTenantId,
        workspace_id: activeWorkspaceId,
        thread_id: clientSessionKey,
        session_id: runtimeSessionId,
        channel: 'web',
        actor: buildWebActor(runtimeSessionId),
        message: message.trim(),
        execution_mode: 'sync',
        response_mode: 'stream',
        context_hints: {
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          reasoning_effort: options?.reasoningEffort || undefined,
          prior_messages: priorMessages.length > 0 ? priorMessages : undefined,
          approved_action: options?.approvedAction || undefined,
          metadata: {
            ...(String(options?.masterAgentInstallId || '').trim()
              ? { master_agent_install_id: String(options?.masterAgentInstallId || '').trim() }
              : {}),
            ...(String(options?.runtimeProfileId || '').trim()
              ? { runtime_profile_id: String(options?.runtimeProfileId || '').trim() }
              : {}),
          },
        },
        policy_context: buildOperatorChatPolicyContext(effectiveTrustMode),
      };
      const res = await apiClient.openTurnStreamResponse(turnRequest, {
        clientRequestId,
        lastEventId: lastEventId || undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const responseError = await readResponseError(res, 'Failed to get assistant reply.');
        const error = new Error(responseError.message) as Error & { code?: string };
        error.name = 'OperatorChatHttpError';
        if (responseError.code) error.code = responseError.code;
        throw error;
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') || !res.body) {
        const payload = normalizeOperatorChatResponsePayload(await res.json());
        const finalizedReply = responseContainsStructuredIntervention(payload)
          ? ''
          : streamAssembler.finalize(payload.reply || streamedReply);
        if (finalizedReply) payload.reply = finalizedReply;
        else if (responseContainsStructuredIntervention(payload)) payload.reply = '';
        if ((!Array.isArray(payload.steps) || payload.steps.length === 0) && streamedSteps.length > 0) {
          payload.steps = streamedSteps;
        }
        return payload;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const dispatchEvent = () => {
        if (currentEvent.data.length === 0) return;
        const eventName = currentEvent.event || 'message';
        const raw = currentEvent.data.join('\n');
        const parsed = parseJson(raw);
        if (typeof currentEvent.id === 'string' && currentEvent.id.trim()) {
          lastEventId = currentEvent.id.trim();
        }
        if (eventName === 'chunk') {
          const delta = parsed && typeof parsed === 'object' && typeof (parsed as { delta?: unknown }).delta === 'string'
            ? String((parsed as { delta?: unknown }).delta || '')
            : raw;
          const previousDisplay = streamedReply;
          const nextDisplay = streamAssembler.ingestDelta(delta);
          const suffix = extractDisplaySuffix(previousDisplay, nextDisplay);
          streamedReply = nextDisplay;
          if (suffix) options?.onChunk?.(suffix);
        } else if (eventName === 'step') {
          const nextStep = normalizeOperatorChatStepPayload(parsed ?? raw);
          if (nextStep) {
            streamedSteps = upsertOperatorChatStepPayload(streamedSteps, nextStep);
            options?.onSteps?.([...streamedSteps]);
          }
        } else if (eventName === 'final') {
          finalPayloadRaw = parsed ?? raw;
        }
      };

      const processBuffer = (flush = false) => {
        while (true) {
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex === -1) break;
          const rawLine = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (!line) {
            dispatchEvent();
            currentEvent = { event: 'message', data: [] };
            continue;
          }
          if (line.startsWith(':')) continue;
          const separatorIndex = line.indexOf(':');
          const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
          const value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1).replace(/^\s/, '');
          if (field === 'event') currentEvent.event = value || 'message';
          else if (field === 'data') currentEvent.data.push(value);
          else if (field === 'id') currentEvent.id = value;
        }
        if (flush && buffer.trim()) {
          const tail = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
          if (tail) {
            const separatorIndex = tail.indexOf(':');
            const field = separatorIndex === -1 ? tail : tail.slice(0, separatorIndex);
            const value = separatorIndex === -1 ? '' : tail.slice(separatorIndex + 1).replace(/^\s/, '');
            if (field === 'event') currentEvent.event = value || 'message';
            else if (field === 'data') currentEvent.data.push(value);
            else if (field === 'id') currentEvent.id = value;
          }
          buffer = '';
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer(false);
      }
      buffer += decoder.decode();
      processBuffer(true);
      dispatchEvent();

      if (finalPayloadRaw != null) {
        const resolvedFinalPayload = normalizeOperatorChatResponsePayload(finalPayloadRaw);
        const finalizedReply = responseContainsStructuredIntervention(resolvedFinalPayload)
          ? ''
          : streamAssembler.finalize(resolvedFinalPayload.reply || streamedReply);
        streamedReply = finalizedReply;
        if (finalizedReply) resolvedFinalPayload.reply = finalizedReply;
        else if (responseContainsStructuredIntervention(resolvedFinalPayload)) resolvedFinalPayload.reply = '';
        if ((!Array.isArray(resolvedFinalPayload.steps) || resolvedFinalPayload.steps.length === 0) && streamedSteps.length > 0) {
          resolvedFinalPayload.steps = streamedSteps;
        }
        return resolvedFinalPayload;
      }

      throw new Error('Chat stream ended unexpectedly before completion.');
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortForward);
      }
    }
  }, [activeTenantId, activeWorkspaceId, effectiveTrustMode, model, provider]);

  const startOperatorRun = useCallback(async (
    input: { goal: string; agentRole?: string; metadata?: Record<string, unknown> },
  ) => {
    const effectiveGoal = input.goal.trim();
    if (!effectiveGoal) {
      setTopError(`Tell ${BRAND.assistant} what you want done first.`);
      return null;
    }

    closeStream();
    setTopError(null);
    setRunId(null);
    setPendingApprovalId(null);
    setLastRunPayload(null);
    setStatus('running');

    try {
      const runtimeSessionId = await ensureRuntimeSessionId({
        channel: 'web',
        actorLabel: 'Operator run',
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        metadata: {
          source: 'operator_run',
        },
      });

      const turnResponse = await apiClient.turn({
        tenant_id: activeTenantId,
        workspace_id: activeWorkspaceId,
        thread_id: runtimeSessionId,
        session_id: runtimeSessionId,
        channel: 'web',
        actor: buildWebActor(runtimeSessionId),
        message: effectiveGoal,
        execution_mode: 'durable',
        response_mode: 'artifact',
        context_hints: {
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(input.agentRole ? { agent_role: input.agentRole } : {}),
          metadata: {
            source: 'operator_chat',
            direct_chat: true,
            ...(input.metadata || {}),
          },
        },
      });

      const runPayload = ((turnResponse as AgentTurnResponse).metadata?.created_run || {
        run_id: turnResponse.run_id,
        status: turnResponse.status,
        route: turnResponse.metadata?.route,
      }) as StartedRunPayload;
      setLastRunPayload(runPayload as Record<string, unknown>);
      const nextRunId = String(runPayload.run_id || '').trim();
      if (!nextRunId) throw new Error('Run ID missing.');

      const pending = runPayload?.pending_approval;
      if (pending && typeof pending === 'object') {
        const approvalId = String((pending as { approval_id?: unknown }).approval_id || '').trim();
        if (approvalId) {
          setPendingApprovalId(approvalId);
          setStatus('waiting');
        }
      }

      setRunId(nextRunId);
      const activeProvider = typeof runPayload?.active_profile_provider === 'string' ? runPayload.active_profile_provider : provider;
      const activeModel = typeof runPayload?.active_profile_model === 'string' ? runPayload.active_profile_model : model;
      setTopError(null);

      const streamUrl = `/api/runs/${encodeURIComponent(nextRunId)}/stream`;
      const source = openAuthenticatedEventStream({
        url: streamUrl,
        onEvent: (event) => {
          if (event.event === 'pause') {
            setStatus('waiting');
            return;
          }
          if (event.event !== 'log') {
            return;
          }
          const parsed = parseJson(event.data) as {
            event?: string;
            message?: string;
            data?: { approval_id?: string };
          } | null;
          if (!parsed || typeof parsed !== 'object') {
            return;
          }
          const evt = parsed.event || '';
          const msg = evt === 'run_error' ? humanizeError(parsed.message || '') : parsed.message || '';
          if (evt === 'local_queued') setStatus('queued_local');
          if (evt === 'local_claimed') setStatus('running');
          if (evt === 'approval_requested' || evt === 'approval_waiting' || evt === 'approval_required') {
            const approvalId = parsed.data?.approval_id;
            if (approvalId) setPendingApprovalId(approvalId);
            setStatus('waiting');
            void fetchRunResult(nextRunId);
          }
          if (['approval_received', 'approval_resolved', 'approval_skipped'].includes(evt)) setPendingApprovalId(null);
          if (evt === 'approval_timeout') {
            setPendingApprovalId(null);
            setStatus('error');
          }
          if (evt === 'run_complete') {
            setStatus('completed');
            setPendingApprovalId(null);
            void fetchRunResult(nextRunId);
          }
          if (evt === 'run_error') {
            setStatus('error');
            setPendingApprovalId(null);
            setTopError(msg || 'Run failed.');
          }
        },
        onError: () => {
          if (streamRef.current === source) streamRef.current = null;
          void (async () => {
            const synced = await fetchRunResult(nextRunId);
            if (synced) setStatus(synced);
            else setStatus((current) => (current === 'running' ? 'error' : current));
          })();
        },
        onClose: () => {
          if (streamRef.current === source) streamRef.current = null;
        },
      });
      streamRef.current = source;
      return {
        ...runPayload,
        active_profile_provider: activeProvider,
        active_profile_model: activeModel,
        started_message: buildRunStartedMessage(
          typeof runPayload?.active_profile_label === 'string' ? runPayload.active_profile_label : null,
          activeProvider,
          activeModel,
        ),
      } as Record<string, unknown>;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Operator run failed.');
      setStatus('error');
      setTopError(message);
      return null;
    }
  }, [activeTenantId, activeWorkspaceId, closeStream, fetchRunResult, model, provider]);

  useEffect(() => () => closeStream(), [closeStream]);

  const trustLabel = useMemo(() => effectiveTrustMode, [effectiveTrustMode]);

  return {
    provider,
    model,
    setModel,
    modelOptions,
    modelsLoading,
    status,
    setStatus,
    runId,
    pendingApprovalId,
    lastRunPayload,
    topError,
    setTopError,
    trustLabel,
    closeStream,
    fetchRunResult,
    sendOperatorChat,
    startOperatorRun,
  };
}
