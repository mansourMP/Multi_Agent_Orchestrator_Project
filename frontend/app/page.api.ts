'use client';

import { useCallback, MutableRefObject } from 'react';
import { openAuthenticatedEventStream, type AuthenticatedEventStreamConnection } from '@/lib/authenticatedEventStream';
import {
  DEFAULT_CONNECTOR_LABELS,
  DEFAULT_MODEL_ALIAS_OPTIONS,
  DEFAULT_CONNECTOR_OPTIONS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  BUSINESS_PRESETS,
  OUTCOME_PACKS,
  getProviderAuthModes,
  isConnectorId,
  isProviderId,
  mapModelOptionsToAliases,
  normalizeProviderId,
  parseJson,
  resolveModelAlias,
  type DoctorCheck,
  type LocalWorkerStatus,
  type LogLevel,
  type ModelAliasOption,
  type ProviderId,
  type ProviderOption,
  type RuntimeMetrics,
  type SetupSession,
  type VaultCredentialItem,
  type ConnectorCredentialItem,
  type LocalExecutionDraft,
  type WeeklyScheduleItem,
  type TrustMode,
  type RoutePayload,
  type PackResult,
  type RunStatus,
  type AgentRoleId,
} from './page.catalog';
import { type PageState } from './page.state';
import { apiClient } from '@/lib/api-client';
import type {
  AgentTurnApprovalRequest,
  AgentTurnIntervention,
  AgentTurnPolicyContext,
  AgentTurnRequest,
  AgentTurnResponse,
} from '@shared/api-contract';
import { loadActiveSkills, resolveSkillsByIds } from '@/lib/skills';
import { BRAND } from '@/lib/brand';
import { API_BASE } from '@/lib/config';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { getLocalExecutionCapabilityTitle, inferLocalExecutionCapabilityFromCommand } from '@/lib/localExecutionCapabilities';
import { buildRunStartedMessage, RUN_WAITING_STATUS_COPY } from '@/lib/runStartCopy';
import { StreamAssembler, extractDisplaySuffix } from '@/lib/StreamAssembler';

export const ORION_API_URL = API_BASE;
export const ORION_FRONTEND_VERSION = '2026.2.26';
const SCREENSHOT_PATH_PATTERN = /\.(png|jpg|jpeg|webp)$/i;
// TODO: per-role agent profile config is still local-only; no backend sync endpoint exists yet.
const AGENT_CONFIG_STORAGE_KEY = 'empyralis.agents.profile-config.v1';
const PROVIDER_POLL_MIN_INTERVAL_MS = 30_000;
const MODEL_ALIAS_DEBOUNCE_MS = 120;
const PROVIDER_CATALOG_DEBOUNCE_MS = 260;
const PROVIDER_MODELS_DEBOUNCE_MS = 420;

type TimedResourceCache<T> = {
  value: T | null;
  fetchedAt: number;
  promise: Promise<T> | null;
};

const modelAliasCatalogCache: TimedResourceCache<ModelAliasOption[]> = {
  value: null,
  fetchedAt: 0,
  promise: null,
};

const providerCatalogCache: TimedResourceCache<ProviderOption[]> = {
  value: null,
  fetchedAt: 0,
  promise: null,
};

const providerModelsCache = new Map<string, TimedResourceCache<string[]>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createStreamRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const RUNTIME_SESSION_STORAGE_PREFIX = 'empyralis.runtime-session.v1:';

function buildWebActor(sessionId: string): AgentTurnRequest['actor'] {
  const normalized = String(sessionId || 'web-user').trim() || 'web-user';
  return {
    type: 'user',
    id: normalized,
    display_name: 'Web user',
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
    // Ignore storage failures and continue with in-memory request flow.
  }
}

function readFreshCache<T>(cache: TimedResourceCache<T>, staleMs: number): T | null {
  if (cache.value === null) return null;
  return Date.now() - cache.fetchedAt < staleMs ? cache.value : null;
}

function readAnyCache<T>(cache: TimedResourceCache<T>): T | null {
  return cache.value;
}

function getProviderModelsCacheKey(providerId: ProviderId, credentialId?: string): string {
  return `${providerId}::${String(credentialId || '').trim()}`;
}

function getProviderModelsCacheEntry(providerId: ProviderId, credentialId?: string): TimedResourceCache<string[]> {
  const key = getProviderModelsCacheKey(providerId, credentialId);
  let cache = providerModelsCache.get(key);
  if (!cache) {
    cache = { value: null, fetchedAt: 0, promise: null };
    providerModelsCache.set(key, cache);
  }
  return cache;
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
      await sleep(debounceMs);
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

function resolveAgentProfileSkills(agentRole: string | null | undefined): ReturnType<typeof resolveSkillsByIds> {
  const roleId = String(agentRole || '').trim();
  if (!roleId || typeof window === 'undefined') {
    return { ids: [], skills: [], promptAppend: '' };
  }
  try {
    const raw = window.localStorage.getItem(AGENT_CONFIG_STORAGE_KEY);
    if (!raw) return { ids: [], skills: [], promptAppend: '' };
    const parsed = JSON.parse(raw) as Record<string, { skills?: unknown }>;
    const skillIds = Array.isArray(parsed?.[roleId]?.skills) ? parsed[roleId].skills : [];
    return resolveSkillsByIds(skillIds as string[]);
  } catch {
    return { ids: [], skills: [], promptAppend: '' };
  }
}

export async function readResponseMessage(response: Response, fallback: string): Promise<string> {
  const raw = await response.text().catch(() => '');
  if (!raw) return fallback;
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === 'object') {
    const detail = (parsed as { detail?: unknown; message?: unknown }).detail ?? (parsed as { message?: unknown }).message;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
  }
  return raw;
}

async function readResponseError(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  const raw = await response.text().catch(() => '');
  if (!raw) return { message: fallback };
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as { detail?: unknown; message?: unknown; error?: unknown };
    const message = typeof (record.detail ?? record.message) === 'string' && String(record.detail ?? record.message).trim()
      ? String(record.detail ?? record.message).trim()
      : fallback;
    const code = typeof record.error === 'string' && record.error.trim() ? record.error.trim() : undefined;
    return { message, code };
  }
  return { message: raw };
}

type RuntimeAccountAvailabilityItem = {
  provider: ProviderId;
  ready: boolean;
  status?: 'ready' | 'attention';
  source?: string;
  source_label?: string;
  detail?: string;
  profile_count?: number;
};

export type OperatorChatActionPayload = {
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

export type OperatorChatApprovedActionPayload = {
  connector: string;
  action: string;
  input: string;
};

export type OperatorChatPriorMessagePayload = {
  role: 'user' | 'assistant';
  content: string;
};

export type OperatorChatContextUsedPayload = {
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

export type OperatorChatStepStatus = 'active' | 'done' | 'error';
export type OperatorChatStepKind = 'file' | 'shell' | 'connector' | 'thinking' | 'screenshot';

export type OperatorChatStepPayload = {
  id: string;
  label: string;
  detail?: string | null;
  status: OperatorChatStepStatus;
  kind?: OperatorChatStepKind | null;
};

type StartedRunPayload = {
  run_id?: string;
  status?: string;
  route?: RoutePayload | Record<string, unknown> | null;
  pending_approval?: { approval_id?: string } | null;
  active_profile_label?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
  [key: string]: unknown;
};

export type OperatorChatResponsePayload = {
  reply: string;
  actions?: OperatorChatActionPayload[];
  approvals?: AgentTurnApprovalRequest[];
  interventions?: AgentTurnIntervention[];
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
      ? rawKind
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
    actions: Array.isArray(record.actions) ? record.actions as OperatorChatActionPayload[] : [],
    approvals: Array.isArray(record.approvals)
      ? record.approvals
          .map((approval) => normalizeOperatorChatApprovalPayload(approval))
          .filter((approval): approval is AgentTurnApprovalRequest => Boolean(approval))
      : [],
    interventions: Array.isArray(record.interventions)
      ? record.interventions
          .map((entry): AgentTurnIntervention | null => {
            const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : null;
            const title = typeof record?.title === 'string' ? record.title.trim() : '';
            const kind = typeof record?.kind === 'string' ? record.kind.trim() : '';
            if (!title || !kind) return null;
            const severity = typeof record?.severity === 'string' ? record.severity.trim().toLowerCase() : '';
            const status = typeof record?.status === 'string' ? record.status.trim().toLowerCase() : '';
            return {
              kind: kind as AgentTurnIntervention['kind'],
              title,
              detail: typeof record?.detail === 'string' && record.detail.trim() ? record.detail.trim() : null,
              severity: severity === 'warning' || severity === 'error' ? severity : 'info',
              status: status === 'ready' || status === 'waiting' || status === 'active' || status === 'completed' || status === 'failed'
                ? status as AgentTurnIntervention['status']
                : undefined,
              code: typeof record?.code === 'string' && record.code.trim() ? record.code.trim() : null,
              run_id: typeof record?.run_id === 'string' && record.run_id.trim() ? record.run_id.trim() : null,
              metadata: record?.metadata && typeof record.metadata === 'object'
                ? record.metadata as Record<string, unknown>
                : undefined,
            };
          })
          .filter((entry): entry is AgentTurnIntervention => Boolean(entry))
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

export function humanizeError(message: string): string {
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

function describeLocalExecutionOperation(operation: LocalExecutionDraft['operations'][number]): string {
  if (operation.tool === 'execute_shell_command') {
    const command = operation.command.trim();
    const capability = inferLocalExecutionCapabilityFromCommand(command);
    if (capability) return getLocalExecutionCapabilityTitle(capability);
    return command ? `shell: ${command}` : 'shell command';
  }
  if (operation.tool === 'capture_screenshot') {
    const target = operation.path.trim();
    const title = getLocalExecutionCapabilityTitle('screenshot.capture');
    return target ? `${title} → ${target}` : title;
  }
  if (operation.tool === 'browser_automation') {
    const url = operation.url.trim();
    if (operation.browserMode === 'capture_page') {
      return url ? `capture ${url}` : 'capture page';
    }
    if (operation.browserMode === 'extract_links') {
      return url ? `links from ${url}` : 'extract page links';
    }
    if (operation.browserMode === 'save_html') {
      return url ? `save html ${url}` : 'save page html';
    }
    return url ? `extract text ${url}` : 'extract page text';
  }
  const path = operation.path.trim();
  if (operation.fileMode === 'read') return path ? `read ${path}` : 'read file';
  if (operation.fileMode === 'append') return path ? `append ${path}` : 'append file';
  return path ? `write ${path}` : 'write file';
}

function normalizeOperatorChatPriorMessages(
  items: OperatorChatPriorMessagePayload[] | undefined,
): OperatorChatPriorMessagePayload[] {
  if (!Array.isArray(items)) return [];
  const bounded = items
    .map((item) => ({
      role: (item?.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: String(item?.content || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-6)
    .map((item) => ({
      ...item,
      content: item.content.length > 280 ? `${item.content.slice(0, 279).trimEnd()}…` : item.content,
    }));
  return bounded;
}

export function usePlatformApi(
  state: PageState,
  streamRef: MutableRefObject<AuthenticatedEventStreamConnection | null>,
  options?: {
    activeWorkspaceId?: string | null;
    activeTenantId?: string | null;
  },
) {
  const {
    setLogs,
    setSetupSession,
    setSetupSessionId,
    setupSessionId,
    setupSession,
    setSetupSessionBusy,
    setMetricsLoading,
    setMetricsUnavailable,
    setRuntimeMetrics,
    setWorkersLoading,
    setWorkersUnavailable,
    setLocalWorkerStatus,
    setProviderOptions,
    modelAliases,
    setModelAliases,
    connectionMode,
    setModelOptions,
    setModel,
    setModelsLoading,
    providerOptions,
    providerAuthMode,
    inboxInput,
    leadsInput,
    slotsInput,
    localExecutionDraft,
    guidedDefaultsEnabled,
    trustMode,
    selectedAgentRole,
    goal,
    provider,
    model,
    credentialId,
    connectorCredentialId,
    selectedPackId,
    selectedPresetId,
    setWeeklyScheduleId,
    setWeeklyScheduleStatusText,
    setWeeklyScheduleBusy,
    setWeeklyAutopilotEnabled,
    setWeeklyAutopilotDay,
    setWeeklyAutopilotTime,
    setWeeklyAutopilotTimezone,
    weeklyAutopilotEnabled,
    weeklyScheduleId,
    weeklyAutopilotDay,
    weeklyAutopilotTime,
    weeklyAutopilotTimezone,
    setTopError,
    setCredentials,
    setCredentialId,
    setupStatus,
    setSetupStatus,
    setIsCredentialsLoading,
    setIsConnectorsLoading,
    connectorCredentials,
    setConnectorCredentials,
    setConnectorCredentialId,
    setConnectorType,
    connectorLabel,
    connectorType,
    googleConnectorToken,
    googleUseLocalAuth,
    googleCalendarId,
    googleTimezone,
    microsoftAccessToken,
    telegramBotToken,
    telegramChatId,
    discordBotToken,
    discordChannelId,
    discordGuildId,
    instagramAccessToken,
    instagramAccountId,
    instagramPageId,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
    twilioToNumber,
    setGoogleConnectorToken,
    setMicrosoftAccessToken,
    setTelegramBotToken,
    setTelegramChatId,
    setDiscordBotToken,
    setDiscordChannelId,
    setDiscordGuildId,
    setInstagramAccessToken,
    setInstagramAccountId,
    setInstagramPageId,
    setTwilioAccountSid,
    setTwilioAuthToken,
    setTwilioFromNumber,
    setTwilioToNumber,
    setSetupBusy,
    openaiKeyInput,
    credentialLabel,
    setOpenaiKeyInput,
    setShowSetupWizard,
  } = state;
  const activeWorkspaceId = String(options?.activeWorkspaceId || '').trim() || 'default';
  const activeTenantId = String(options?.activeTenantId || '').trim() || 'default';

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

  const appendLog = useCallback((message: string, level: LogLevel = 'info', event?: string, nodeId?: string) => {
    setLogs((prev) => [...prev, { ts: new Date().toISOString(), level, message, event, nodeId }]);
  }, [setLogs]);

  const refreshSetupSession = useCallback(async (sessionId: string) => {
    const res = await controlPlaneFetch(`/api/control-plane/setup/sessions/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      throw new Error(await readResponseMessage(res, 'Failed to load setup session.'));
    }
    const payload = await res.json();
    const session = payload?.session as SetupSession | undefined;
    if (session?.id) {
      setSetupSession(session);
      setSetupSessionId(session.id);
      return session;
    }
    throw new Error('Setup session response is invalid.');
  }, [controlPlaneFetch, setSetupSession, setSetupSessionId]);

  const createSetupSession = useCallback(async () => {
    const res = await controlPlaneFetch('/api/control-plane/setup/sessions', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: activeWorkspaceId, provider }),
    });
    if (!res.ok) {
      throw new Error(await readResponseMessage(res, 'Failed to create setup session.'));
    }
    const payload = await res.json();
    const session = payload?.session as SetupSession | undefined;
    if (session?.id) {
      setSetupSession(session);
      setSetupSessionId(session.id);
      return session;
    }
    throw new Error('Setup session response is invalid.');
  }, [activeWorkspaceId, controlPlaneFetch, provider, setSetupSession, setSetupSessionId]);

  const setupAction = useCallback(
    async (
      action:
        | 'select_provider'
        | 'submit_credential'
        | 'verify'
        | 'complete'
        | 'cancel'
        | 'resume'
        | 'risk_ack'
        | 'provider_auth_choice'
        | 'credential_handling'
        | 'channel_choice',
      payload?: Record<string, unknown>,
    ) => {
      if (!setupSessionId) return;
      setSetupSessionBusy(true);
      try {
        const res = await controlPlaneFetch(`/api/control-plane/setup/sessions/${encodeURIComponent(setupSessionId)}/actions`, {
          method: 'POST',
          body: JSON.stringify({ action, payload: payload || {} }),
        });
        if (!res.ok) {
          throw new Error(await readResponseMessage(res, `Failed to apply setup action '${action}'.`));
        }
        const json = await res.json();
        const session = json?.session as SetupSession | undefined;
        if (session?.id) {
          setSetupSession(session);
        }
      } catch (error: unknown) {
        const message = humanizeError(error instanceof Error ? error.message : 'Setup action failed.');
        appendLog(message, 'warn');
      } finally {
        setSetupSessionBusy(false);
      }
    },
    [appendLog, controlPlaneFetch, setupSessionId, setSetupSessionBusy, setSetupSession],
  );

  const cancelSetupSession = useCallback(async () => {
    if (!setupSessionId) return;
    setSetupSessionBusy(true);
    try {
      const res = await controlPlaneFetch(`/api/control-plane/setup/sessions/${encodeURIComponent(setupSessionId)}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(await readResponseMessage(res, 'Failed to cancel setup session.'));
      }
      const payload = await res.json();
      const session = payload?.session as SetupSession | undefined;
      if (session?.id) setSetupSession(session);
    } catch (error: unknown) {
      appendLog(humanizeError(error instanceof Error ? error.message : 'Failed to cancel setup session.'), 'warn');
    } finally {
      setSetupSessionBusy(false);
    }
  }, [appendLog, controlPlaneFetch, setupSessionId, setSetupSessionBusy, setSetupSession]);

  const resumeSetupSession = useCallback(async () => {
    if (!setupSessionId) return;
    setSetupSessionBusy(true);
    try {
      const res = await controlPlaneFetch(`/api/control-plane/setup/sessions/${encodeURIComponent(setupSessionId)}/resume`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(await readResponseMessage(res, 'Failed to resume setup session.'));
      }
      const payload = await res.json();
      const session = payload?.session as SetupSession | undefined;
      if (session?.id) setSetupSession(session);
    } catch (error: unknown) {
      appendLog(humanizeError(error instanceof Error ? error.message : 'Failed to resume setup session.'), 'warn');
    } finally {
      setSetupSessionBusy(false);
    }
  }, [appendLog, controlPlaneFetch, setupSessionId, setSetupSessionBusy, setSetupSession]);

  const fetchDoctorChecks = useCallback(async (): Promise<DoctorCheck[]> => {
    await ensureControlPlaneSession();
    const doctorRes = await fetch('/api/doctor/preflight', { cache: 'no-store' });
    if (!doctorRes.ok) {
      if (doctorRes.status === 401) {
        throw new Error('Invalid API key. Enter runtime key in Setup step 1 (Runtime access key).');
      }
      const text = await doctorRes.text().catch(() => '');
      throw new Error(text || 'System check failed.');
    }
    const doctorPayload = await doctorRes.json();
    return Array.isArray(doctorPayload?.checks) ? (doctorPayload.checks as DoctorCheck[]) : [];
  }, []);

  const fetchRuntimeMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      await ensureControlPlaneSession();
      const res = await fetch('/api/health/overview', { cache: 'no-store' });
      if (!res.ok) {
        setRuntimeMetrics(null);
        setMetricsUnavailable(true);
        return;
      }
      const payload = await res.json();
      const metricsPayload = payload?.metrics?.payload;
      if (metricsPayload && typeof metricsPayload === 'object') {
        setRuntimeMetrics(metricsPayload as RuntimeMetrics);
        setMetricsUnavailable(false);
      }
    } catch {
      setRuntimeMetrics(null);
      setMetricsUnavailable(true);
    } finally {
      setMetricsLoading(false);
    }
  }, [setMetricsLoading, setMetricsUnavailable, setRuntimeMetrics]);

  const fetchLocalWorkerStatus = useCallback(async (silent = false) => {
    if (!silent) setWorkersLoading(true);
    try {
      await ensureControlPlaneSession();
      const res = await fetch(`/api/runtime/machines`, { cache: 'no-store' });
      if (!res.ok) {
        setLocalWorkerStatus(null);
        setWorkersUnavailable(true);
        return;
      }
      const payload = await res.json();
      if (payload && typeof payload === 'object') {
        const runtimePayload = payload as {
          summary?: LocalWorkerStatus['summary'];
          items?: Array<{
            runtime_id?: string;
            status?: string;
            online?: boolean;
            current_task_id?: string | null;
            last_seen_at?: string | null;
            note?: string | null;
          }>;
        };
        setLocalWorkerStatus({
          enabled: true,
          lease_seconds: 0,
          summary: runtimePayload.summary || {
            known: 0,
            online: 0,
            busy: 0,
            idle: 0,
            offline: 0,
            pending_runs: 0,
            claimed_runs: 0,
          },
          items: Array.isArray(runtimePayload.items)
            ? runtimePayload.items.map((item) => ({
                worker_id: String(item.runtime_id || '').trim(),
                status: String(item.status || 'offline').trim() || 'offline',
                online: Boolean(item.online),
                current_run_id: typeof item.current_task_id === 'string' ? item.current_task_id : null,
                last_seen_at: typeof item.last_seen_at === 'string' ? item.last_seen_at : null,
                note: typeof item.note === 'string' ? item.note : null,
              }))
            : [],
        });
        setWorkersUnavailable(false);
      }
    } catch {
      setLocalWorkerStatus(null);
      setWorkersUnavailable(true);
    } finally {
      if (!silent) setWorkersLoading(false);
    }
  }, [setWorkersLoading, setWorkersUnavailable, setLocalWorkerStatus]);

  const refreshModelAliasCatalog = useCallback(async (): Promise<ModelAliasOption[]> => {
    const aliases = await getOrRefreshCachedResource(
      modelAliasCatalogCache,
      PROVIDER_POLL_MIN_INTERVAL_MS,
      MODEL_ALIAS_DEBOUNCE_MS,
      async () => {
        const res = await controlPlaneFetch('/api/control-plane/providers/model-aliases');
        if (!res.ok) {
          throw new Error('Failed to load model aliases.');
        }
        const payload = await res.json();
        const items = Array.isArray(payload?.models) ? payload.models : [];
        const mapped = items
          .map((item: unknown) => {
            const value = item as {
              alias?: unknown;
              provider?: unknown;
              model?: unknown;
              resolved_model?: unknown;
              is_global_default?: unknown;
              is_provider_default?: unknown;
            };
            const rawProvider = typeof value.provider === 'string' ? value.provider.trim().toLowerCase() : '';
            const providerId = normalizeProviderId(rawProvider);
            const alias = typeof value.alias === 'string' ? value.alias.trim() : '';
            const modelId = typeof value.model === 'string' ? value.model.trim() : '';
            const resolvedModel = typeof value.resolved_model === 'string' ? value.resolved_model.trim() : '';
            if (!rawProvider || !alias || !modelId || !resolvedModel || !isProviderId(providerId)) return null;
            return {
              alias,
              provider: providerId,
              model: modelId,
              resolvedModel,
              isGlobalDefault: Boolean(value.is_global_default),
              isProviderDefault: Boolean(value.is_provider_default),
            } satisfies ModelAliasOption;
          })
          .filter((item: ModelAliasOption | null): item is ModelAliasOption => item !== null);
        return mapped.length > 0 ? mapped : DEFAULT_MODEL_ALIAS_OPTIONS;
      },
      () => readAnyCache(modelAliasCatalogCache) ?? DEFAULT_MODEL_ALIAS_OPTIONS,
    );
    setModelAliases(aliases);
    return aliases;
  }, [controlPlaneFetch, setModelAliases]);

  const refreshProviderCatalog = useCallback(async () => {
    const catalog = await getOrRefreshCachedResource(
      providerCatalogCache,
      PROVIDER_POLL_MIN_INTERVAL_MS,
      PROVIDER_CATALOG_DEBOUNCE_MS,
      async () => {
        const aliases = await refreshModelAliasCatalog();
        const res = await controlPlaneFetch('/api/control-plane/providers');
        if (!res.ok) {
          throw new Error('Failed to load provider catalog.');
        }
        const payload = await res.json();
        const items = Array.isArray(payload?.providers) ? payload.providers : [];
        const mapped: ProviderOption[] = items
          .map((item: unknown) => {
            const i = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; auth_modes?: unknown; default_auth_mode?: unknown; note?: unknown };
            const rawId = typeof i.id === 'string' ? i.id.trim().toLowerCase() : '';
            const id = normalizeProviderId(rawId);
            if (!isProviderId(id)) return null;
            const fallback = DEFAULT_PROVIDER_OPTIONS.find((entry) => entry.id === id);
            const authModes = Array.isArray(i.auth_modes)
              ? i.auth_modes
                  .filter((value): value is { id?: unknown; label?: unknown; secret_required?: unknown } => Boolean(value && typeof value === 'object'))
                  .map((value) => ({
                    id: typeof value.id === 'string' ? value.id : 'api_key',
                    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : String(value.id || 'API Key'),
                    secretRequired: Boolean(value.secret_required),
                  }))
              : fallback?.authModes ?? [];
            return {
              id,
              label: typeof i.label === 'string' && i.label.trim() ? i.label.trim() : fallback?.label ?? id,
              defaultModel: (() => {
                const rawDefaultModel =
                  typeof i.default_model === 'string' && i.default_model.trim()
                    ? i.default_model.trim()
                    : fallback?.defaultModel ?? DEFAULT_PROVIDER_MODELS[id][0];
                return resolveModelAlias(id, rawDefaultModel, aliases) ?? rawDefaultModel;
              })(),
              auth: Array.isArray(i.auth) ? i.auth.filter((v) => typeof v === 'string') as string[] : fallback?.auth ?? ['api_key'],
              defaultAuthMode:
                typeof i.default_auth_mode === 'string' && i.default_auth_mode.trim()
                  ? i.default_auth_mode.trim()
                  : fallback?.defaultAuthMode ?? fallback?.auth[0] ?? 'api_key',
              authModes,
              note: typeof i.note === 'string' && i.note.trim() ? i.note.trim() : fallback?.note,
            } as ProviderOption;
          })
          .filter((item: ProviderOption | null): item is ProviderOption => item !== null);
        return mapped.length > 0 ? mapped : DEFAULT_PROVIDER_OPTIONS;
      },
      () => readAnyCache(providerCatalogCache) ?? DEFAULT_PROVIDER_OPTIONS,
    );
    setProviderOptions(catalog);
  }, [controlPlaneFetch, refreshModelAliasCatalog, setProviderOptions]);

  const refreshProviderModels = useCallback(
    async (providerId: ProviderId, credentialForProvider?: string) => {
      const aliases = readAnyCache(modelAliasCatalogCache) ?? await refreshModelAliasCatalog();
      const fallbackOption =
        (readAnyCache(providerCatalogCache) ?? DEFAULT_PROVIDER_OPTIONS).find((item) => item.id === providerId) ||
        DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === providerId) ||
        DEFAULT_PROVIDER_OPTIONS[0];
      const fallbackModels = mapModelOptionsToAliases(
        providerId,
        DEFAULT_PROVIDER_MODELS[providerId] || [fallbackOption.defaultModel],
        aliases,
      );
      const resolveSelectedModel = (current: string, options: string[]) => {
        const normalizedCurrent = resolveModelAlias(providerId, current, aliases) ?? current;
        return options.includes(normalizedCurrent) ? normalizedCurrent : options[0];
      };

      if (connectionMode === 'byok' && !credentialForProvider) {
        setModelOptions(fallbackModels);
        setModel((prev) => resolveSelectedModel(prev, fallbackModels));
        return;
      }

      const modelsCache = getProviderModelsCacheEntry(providerId, credentialForProvider);
      const freshModels = readFreshCache(modelsCache, PROVIDER_POLL_MIN_INTERVAL_MS);
      if (freshModels !== null) {
        setModelOptions(freshModels);
        setModel((prev) => resolveSelectedModel(prev, freshModels));
        return;
      }

      setModelsLoading(true);
      try {
        const nextModels = await getOrRefreshCachedResource(
          modelsCache,
          PROVIDER_POLL_MIN_INTERVAL_MS,
          PROVIDER_MODELS_DEBOUNCE_MS,
          async () => {
            const search = new URLSearchParams({ workspace_id: activeWorkspaceId });
            if (credentialForProvider) {
              search.set('credential_id', credentialForProvider);
            }
            const res = await controlPlaneFetch(`/api/control-plane/providers/${encodeURIComponent(providerId)}/models?${search.toString()}`);
            if (!res.ok) {
              throw new Error('Failed to load provider models.');
            }
            const payload = await res.json();
            const rawModels = Array.isArray(payload?.models) ? payload.models : [];
            const models = rawModels
              .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
              .slice(0, 120);
            return models.length > 0
              ? mapModelOptionsToAliases(providerId, models, aliases)
              : fallbackModels;
          },
          () => readAnyCache(modelsCache) ?? fallbackModels,
        );
        setModelOptions(nextModels);
        setModel((prev) => resolveSelectedModel(prev, nextModels));
      } catch {
        setModelOptions(fallbackModels);
        setModel((prev) => resolveSelectedModel(prev, fallbackModels));
      } finally {
        setModelsLoading(false);
      }
    },
    [activeWorkspaceId, connectionMode, controlPlaneFetch, refreshModelAliasCatalog, setModelsLoading, setModelOptions, setModel],
  );

  const hasRuntimeProviderAccount = useCallback(async (providerId: ProviderId) => {
    const res = await controlPlaneFetch(`/api/control-plane/providers/runtime-availability?workspace_id=${encodeURIComponent(activeWorkspaceId)}`);
    if (!res.ok) throw new Error('Unable to load runtime accounts.');
    const payload = await res.json().catch(() => ({ items: [] }));
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.some((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as RuntimeAccountAvailabilityItem & Record<string, unknown>;
      const normalizedProvider = normalizeProviderId(typeof record.provider === 'string' ? record.provider.trim().toLowerCase() : '');
      return normalizedProvider === providerId && record.ready === true;
    });
  }, [activeWorkspaceId, controlPlaneFetch]);

  const buildScheduledRunRequest = useCallback(async () => {
    const selectedPack = OUTCOME_PACKS.find((pack) => pack.id === selectedPackId) || OUTCOME_PACKS[0];
    const selectedPreset = BUSINESS_PRESETS.find((preset) => preset.id === selectedPresetId) || BUSINESS_PRESETS[0];

    const effectiveTrustMode: TrustMode = guidedDefaultsEnabled ? 'guarded' : trustMode;
    const effectivePrimary = inboxInput.trim() || (guidedDefaultsEnabled ? selectedPreset.inputs.primary : '');
    const effectiveSecondary = leadsInput.trim() || (guidedDefaultsEnabled ? selectedPreset.inputs.secondary : '');
    const effectiveTertiary = slotsInput.trim() || (guidedDefaultsEnabled ? selectedPreset.inputs.tertiary : '');
    const packInputs: Record<string, string> = {};
    if (selectedPack.id === 'weekly-content-studio') {
      packInputs.topics = effectivePrimary;
      packInputs.channels = effectiveSecondary;
      packInputs.offers = effectiveTertiary;
    } else if (selectedPack.id === 'competitor-brief-digest') {
      packInputs.competitors = effectivePrimary;
      packInputs.positioning = effectiveSecondary;
      packInputs.objectives = effectiveTertiary;
    } else if (selectedPack.id === 'spreadsheet-ops-v1') {
      packInputs.file_path = effectivePrimary;
      packInputs.operation = effectiveSecondary;
      packInputs.payload = effectiveTertiary;
    } else if (selectedPack.id === 'document-studio-v1') {
      packInputs.file_path = effectivePrimary;
      packInputs.operation = effectiveSecondary;
      packInputs.payload = effectiveTertiary;
    } else {
      packInputs.inbox = effectivePrimary;
      packInputs.leads = effectiveSecondary;
      packInputs.slots = effectiveTertiary;
    }

    const activeSkills = await loadActiveSkills('automationDefaults');

    return {
      engine: 'orion',
      workflow_id: undefined,
      workspace_id: activeWorkspaceId,
      user_goal: goal.trim() || selectedPreset.goal,
      business_plan: undefined,
      agent_role: selectedAgentRole,
      provider,
      model,
      credential_id: connectionMode === 'byok' ? credentialId : undefined,
      agents: [],
      metadata: {
        trust_mode: effectiveTrustMode,
        source: 'weekly_scheduler',
        guided_defaults_enabled: guidedDefaultsEnabled,
        connection_mode: connectionMode,
        execution_target: 'auto',
        execution_reason: 'scheduled_reliability',
        outcome_pack: selectedPack.id,
        outcome_pack_label: selectedPack.label,
        outcome_scope: selectedPack.scope,
        connector_credential_id: connectorCredentialId || undefined,
        pack_inputs: packInputs,
        skill_scope: activeSkills.skills.length > 0 ? 'automation_defaults' : undefined,
        skill_bundle: activeSkills.skills.length > 0
          ? {
              skill_ids: activeSkills.ids,
              skills: activeSkills.skills,
            }
          : undefined,
        skill_prompt_append: activeSkills.promptAppend || undefined,
      },
    };
  }, [
    connectionMode,
    connectorCredentialId,
    credentialId,
    goal,
    guidedDefaultsEnabled,
    model,
    provider,
    selectedAgentRole,
    selectedPackId,
    selectedPresetId,
    trustMode,
    activeWorkspaceId,
    inboxInput,
    leadsInput,
    slotsInput,
  ]);

  const loadWeeklySchedule = useCallback(async () => {
    setWeeklyScheduleBusy('load');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/schedules/weekly?workspace_id=${encodeURIComponent(activeWorkspaceId)}`);
      if (!res.ok) return;
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (items.length === 0) {
        setWeeklyScheduleId(null);
        setWeeklyScheduleStatusText('No server-side schedule saved yet.');
        return;
      }
      const schedule = items[0] as WeeklyScheduleItem;
      if (typeof schedule.id === 'string') setWeeklyScheduleId(schedule.id);
      if (typeof schedule.enabled === 'boolean') setWeeklyAutopilotEnabled(schedule.enabled);
      if (typeof schedule.day_of_week === 'string' && schedule.day_of_week.trim()) setWeeklyAutopilotDay(schedule.day_of_week);
      if (typeof schedule.time_hhmm === 'string' && /^\d{2}:\d{2}$/.test(schedule.time_hhmm)) setWeeklyAutopilotTime(schedule.time_hhmm);
      if (schedule.timezone === 'local' || schedule.timezone === 'utc') setWeeklyAutopilotTimezone(schedule.timezone);
      setWeeklyScheduleStatusText(schedule.enabled ? `Server schedule active (${schedule.day_of_week} ${schedule.time_hhmm} ${String(schedule.timezone).toUpperCase()}).` : 'Server schedule is saved but disabled.');
    } catch {
      // Keep page usable even if scheduler endpoints are unavailable.
    } finally {
      setWeeklyScheduleBusy(null);
    }
  }, [activeWorkspaceId, controlPlaneFetch, setWeeklyScheduleBusy, setWeeklyScheduleId, setWeeklyScheduleStatusText, setWeeklyAutopilotEnabled, setWeeklyAutopilotDay, setWeeklyAutopilotTime, setWeeklyAutopilotTimezone]);

  const saveWeeklySchedule = useCallback(async () => {
    setWeeklyScheduleBusy('save');
    try {
      if (!weeklyAutopilotEnabled && !weeklyScheduleId) {
        setWeeklyScheduleStatusText('Weekly autopilot is disabled.');
        return;
      }
      if (!weeklyAutopilotEnabled && weeklyScheduleId) {
        const disableRes = await controlPlaneFetch(`/api/control-plane/schedules/weekly/${encodeURIComponent(weeklyScheduleId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: false }),
        });
        if (!disableRes.ok) {
          throw new Error(await readResponseMessage(disableRes, 'Failed to disable weekly schedule.'));
        }
        setWeeklyScheduleStatusText('Weekly autopilot disabled on server.');
        return;
      }

      const runRequest = await buildScheduledRunRequest();
      if (weeklyScheduleId) {
        const patchRes = await controlPlaneFetch(`/api/control-plane/schedules/weekly/${encodeURIComponent(weeklyScheduleId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            enabled: true,
            day_of_week: weeklyAutopilotDay,
            time_hhmm: weeklyAutopilotTime,
            timezone: weeklyAutopilotTimezone,
            run_request: runRequest,
          }),
        });
        if (!patchRes.ok) {
          throw new Error(await readResponseMessage(patchRes, 'Failed to update weekly schedule.'));
        }
      } else {
        const createRes = await controlPlaneFetch('/api/control-plane/schedules/weekly', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Autopilot Weekly Schedule',
            workspace_id: activeWorkspaceId,
            enabled: true,
            day_of_week: weeklyAutopilotDay,
            time_hhmm: weeklyAutopilotTime,
            timezone: weeklyAutopilotTimezone,
            run_request: runRequest,
          }),
        });
        if (!createRes.ok) {
          throw new Error(await readResponseMessage(createRes, 'Failed to create weekly schedule.'));
        }
        const created = await createRes.json();
        if (typeof created?.id === 'string') {
          setWeeklyScheduleId(created.id);
        }
      }
      setWeeklyScheduleStatusText(`Weekly autopilot saved (${weeklyAutopilotDay} ${weeklyAutopilotTime} ${weeklyAutopilotTimezone.toUpperCase()}).`);
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to save schedule.');
      setTopError(message);
      appendLog(message, 'warn');
    } finally {
      setWeeklyScheduleBusy(null);
    }
  }, [
    appendLog,
    buildScheduledRunRequest,
    controlPlaneFetch,
    weeklyAutopilotDay,
    weeklyAutopilotEnabled,
    weeklyAutopilotTime,
    weeklyAutopilotTimezone,
    weeklyScheduleId,
    setWeeklyScheduleBusy,
    setWeeklyScheduleStatusText,
    setWeeklyScheduleId,
    setTopError,
  ]);

  const refreshCredentials = useCallback(async () => {
    setIsCredentialsLoading(true);
    try {
      const res = await controlPlaneFetch('/api/control-plane/credentials?workspace_id=default');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to load connected accounts.');
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const vaultItems: VaultCredentialItem[] = items
        .filter((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const providerValue = (item as { provider?: unknown }).provider;
          const normalized = normalizeProviderId(typeof providerValue === 'string' ? providerValue.trim().toLowerCase() : '');
          return isProviderId(normalized);
        })
        .map((item: unknown): VaultCredentialItem => {
          const i = item as { id?: unknown; label?: unknown; provider?: unknown; metadata?: unknown };
          const normalized = normalizeProviderId(typeof i.provider === 'string' ? i.provider.trim().toLowerCase() : '');
          const providerValue = isProviderId(normalized) ? normalized : 'openai';
          const metadata = i.metadata && typeof i.metadata === 'object' ? i.metadata as Record<string, unknown> : undefined;
          const authMode = typeof metadata?.auth_mode === 'string' ? metadata.auth_mode : undefined;
          return {
            id: typeof i.id === 'string' ? i.id : '',
            label: typeof i.label === 'string' ? i.label : 'API Key',
            provider: providerValue,
            metadata,
            authMode,
          };
        })
        .filter((item: VaultCredentialItem) => item.id.length > 0);
      setCredentials(vaultItems);
      const matches = vaultItems.filter((item) => item.provider === provider);
      if (matches.length > 0 && !matches.some((item) => item.id === credentialId)) {
        setCredentialId(matches[0].id);
      }
      const runtimeAccountReady = connectionMode === 'managed'
        ? await hasRuntimeProviderAccount(provider).catch(() => false)
        : false;
      setSetupStatus((prev) => ({
        ...prev,
        accountConnected: connectionMode === 'managed' ? (runtimeAccountReady || matches.length > 0) : matches.length > 0,
      }));
    } catch (error: unknown) {
      setTopError(humanizeError(error instanceof Error ? error.message : 'Unable to load connected accounts.'));
    } finally {
      setIsCredentialsLoading(false);
    }
  }, [connectionMode, controlPlaneFetch, credentialId, hasRuntimeProviderAccount, provider, setIsCredentialsLoading, setCredentials, setCredentialId, setSetupStatus, setTopError]);

  const refreshConnectors = useCallback(async () => {
    setIsConnectorsLoading(true);
    try {
      const res = await controlPlaneFetch('/api/control-plane/connectors?workspace_id=default');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to load connectors.');
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const connectorItems: ConnectorCredentialItem[] = items
        .filter((item: unknown) => item && typeof item === 'object')
        .map((item: unknown) => {
          const i = item as { id?: unknown; label?: unknown; connector?: unknown };
          const rawConnector = typeof i.connector === 'string' ? i.connector.trim().toLowerCase() : '';
          const connector = isConnectorId(rawConnector) ? rawConnector : 'google_workspace';
          return {
            id: typeof i.id === 'string' ? i.id : '',
            label: typeof i.label === 'string' ? i.label : DEFAULT_CONNECTOR_LABELS[connector],
            connector,
          } as ConnectorCredentialItem;
        })
        .filter((item: ConnectorCredentialItem) => item.id.length > 0);
      setConnectorCredentials(connectorItems);
      if (connectorItems.length > 0) {
        const selected = connectorItems.find((item) => item.id === connectorCredentialId) || connectorItems[0];
        setConnectorCredentialId(selected.id);
        setConnectorType(selected.connector);
      }
    } catch (error: unknown) {
      setTopError(humanizeError(error instanceof Error ? error.message : 'Unable to load connectors.'));
    } finally {
      setIsConnectorsLoading(false);
    }
  }, [connectorCredentialId, controlPlaneFetch, setIsConnectorsLoading, setConnectorCredentials, setConnectorCredentialId, setConnectorType, setTopError]);

  const saveConnector = useCallback(async () => {
    const label = connectorLabel.trim() || DEFAULT_CONNECTOR_LABELS[connectorType];
    let credentials: Record<string, string>;

    if (connectorType === 'google_workspace') {
      if (!googleUseLocalAuth && !googleConnectorToken.trim()) {
        setTopError('Enter Google Workspace access token first.');
        return;
      }
      credentials = googleUseLocalAuth
        ? {
            auth_mode: 'gws_local',
            gws_config_dir: '.gws-config',
            calendar_id: googleCalendarId.trim() || 'primary',
            timezone: googleTimezone.trim() || 'UTC',
          }
        : {
            access_token: googleConnectorToken.trim(),
            calendar_id: googleCalendarId.trim() || 'primary',
            timezone: googleTimezone.trim() || 'UTC',
          };
    } else if (connectorType === 'microsoft_365') {
      if (!microsoftAccessToken.trim()) {
        setTopError('Enter Microsoft 365 access token first.');
        return;
      }
      credentials = {
        access_token: microsoftAccessToken.trim(),
      };
    } else if (connectorType === 'telegram_bot') {
      if (!telegramBotToken.trim() || !telegramChatId.trim()) {
        setTopError('Enter Telegram bot token and chat ID.');
        return;
      }
      credentials = {
        bot_token: telegramBotToken.trim(),
        chat_id: telegramChatId.trim(),
      };
    } else if (connectorType === 'discord_bot') {
      if (!discordBotToken.trim() || !discordChannelId.trim()) {
        setTopError('Enter Discord bot token and channel ID.');
        return;
      }
      credentials = {
        bot_token: discordBotToken.trim(),
        channel_id: discordChannelId.trim(),
      };
      if (discordGuildId.trim()) {
        credentials.guild_id = discordGuildId.trim();
      }
    } else if (connectorType === 'instagram_business') {
      if (!instagramAccessToken.trim() || !instagramAccountId.trim()) {
        setTopError('Enter Instagram Business access token and account ID.');
        return;
      }
      credentials = {
        access_token: instagramAccessToken.trim(),
        instagram_account_id: instagramAccountId.trim(),
      };
      if (instagramPageId.trim()) {
        credentials.page_id = instagramPageId.trim();
      }
    } else {
      if (!twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioFromNumber.trim() || !twilioToNumber.trim()) {
        setTopError('Enter Twilio account SID, auth token, from number, and to number.');
        return;
      }
      credentials = {
        account_sid: twilioAccountSid.trim(),
        auth_token: twilioAuthToken.trim(),
        from_number: twilioFromNumber.trim(),
        to_number: twilioToNumber.trim(),
      };
    }

    setSetupBusy('save');
    setTopError(null);
    try {
      const res = await controlPlaneFetch('/api/control-plane/connectors', {
        method: 'POST',
        body: JSON.stringify({
          label,
          connector: connectorType,
          workspace_id: 'default',
          credentials,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to save connector.');
      }
      const payload = await res.json();
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (id) setConnectorCredentialId(id);

      setGoogleConnectorToken('');
      setMicrosoftAccessToken('');
      setTelegramBotToken('');
      setTelegramChatId('');
      setDiscordBotToken('');
      setDiscordChannelId('');
      setDiscordGuildId('');
      setInstagramAccessToken('');
      setInstagramAccountId('');
      setInstagramPageId('');
      setTwilioAccountSid('');
      setTwilioAuthToken('');
      setTwilioFromNumber('whatsapp:+14155238886');
      setTwilioToNumber('');

      await refreshConnectors();
      const name = DEFAULT_CONNECTOR_OPTIONS.find((item) => item.id === connectorType)?.label || 'Connector';
      appendLog(`${name} connector saved.`);
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Unable to save connector.');
      setTopError(message);
      appendLog(message, 'error');
    } finally {
      setSetupBusy(null);
    }
  }, [
    appendLog,
    connectorLabel,
    connectorType,
    controlPlaneFetch,
    discordBotToken,
    discordChannelId,
    discordGuildId,
    googleCalendarId,
    googleConnectorToken,
    googleUseLocalAuth,
    googleTimezone,
    microsoftAccessToken,
    instagramAccessToken,
    instagramAccountId,
    instagramPageId,
    refreshConnectors,
    telegramBotToken,
    telegramChatId,
    twilioAccountSid,
    twilioAuthToken,
    twilioFromNumber,
    twilioToNumber,
    setSetupBusy,
    setTopError,
    setConnectorCredentialId,
    setDiscordBotToken,
    setDiscordChannelId,
    setDiscordGuildId,
    setGoogleConnectorToken,
    setMicrosoftAccessToken,
    setInstagramAccessToken,
    setInstagramAccountId,
    setInstagramPageId,
    setTelegramBotToken,
    setTelegramChatId,
    setTwilioAccountSid,
    setTwilioAuthToken,
    setTwilioFromNumber,
    setTwilioToNumber,
  ]);

  const testConnector = useCallback(async () => {
    if (!connectorCredentialId) {
      setTopError('Select a connector first.');
      return;
    }
    setSetupBusy('test');
    setTopError(null);
    try {
      const res = await controlPlaneFetch(`/api/control-plane/connectors/${encodeURIComponent(connectorCredentialId)}/test?workspace_id=default`, {
        method: 'POST',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Connector test failed.');
      }
      appendLog('Connector test passed.');
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Connector test failed.');
      setTopError(message);
      appendLog(message, 'warn');
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, connectorCredentialId, controlPlaneFetch, setSetupBusy, setTopError]);

  const runRuntimeCheck = useCallback(async () => {
    setSetupBusy('runtime');
    setTopError(null);
    try {
      const checks = await fetchDoctorChecks();
      const failCheck = checks.find((check) => check.status === 'fail');
      if (failCheck) {
        const problem = [failCheck.detail || 'System setup failed.', failCheck.recommendation || ''].filter(Boolean).join(' ');
        throw new Error(problem);
      }
      if (connectionMode === 'managed') {
        const hasRuntimeAccount = await hasRuntimeProviderAccount(provider);
        if (!hasRuntimeAccount) {
          const providerLabel = providerOptions.find((item) => item.id === provider)?.label || provider;
          throw new Error(`${providerLabel} runtime account is not ready. Open Setup and connect a direct ${providerLabel} account.`);
        }
      }
      setSetupStatus((prev) => ({
        ...prev,
        runtimeReady: true,
        accountConnected: connectionMode === 'managed' || connectionMode === 'local_companion' ? true : prev.accountConnected,
      }));
      appendLog('System check passed.');
      await setupAction('select_provider', { provider });
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Runtime check failed.');
      setSetupStatus((prev) => ({ ...prev, runtimeReady: false }));
      setShowSetupWizard(true);
      setTopError(message);
      appendLog(message, 'warn');
      await setupAction('verify', { ok: false, error: message });
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, connectionMode, fetchDoctorChecks, hasRuntimeProviderAccount, provider, providerOptions, setupAction, setSetupBusy, setTopError, setSetupStatus, setShowSetupWizard]);

  const runLocalOpsAction = useCallback(
    async (
      action:
        | 'start_services'
        | 'restart_services'
        | 'readiness'
        | 'release_status'
        | 'telegram_rebind'
        | 'ops_daemon_status'
        | 'ops_daemon_restart'
        | 'telegram_media_status',
      extra: Record<string, unknown> = {},
    ) => {
      await ensureControlPlaneSession();
      const res = await fetch('/api/local-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...extra,
        }),
      });
      const text = await res.text().catch(() => '');
      let payload: unknown = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { stdout: text };
      }
      const parsed = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
      if (!res.ok || parsed.ok === false) {
        const detail = typeof parsed.error === 'string' ? parsed.error : `Local op '${action}' failed.`;
        throw new Error(detail);
      }
      return parsed as {
        ok: boolean;
        stdout?: string;
        stderr?: string;
        transport?: string;
        running?: boolean;
        url?: string;
        runtime_url?: string;
        pid?: string | null;
        restarted?: boolean;
        watchdog?: Record<string, unknown> | null;
        bot?: Record<string, unknown> | null;
        probe?: Record<string, unknown> | null;
        connector?: Record<string, unknown> | null;
        autopilot?: Record<string, unknown> | null;
        configured_dir?: string;
        resolved_dir?: string;
        exists?: boolean;
        files_total?: number;
        bytes_total?: number;
        truncated?: boolean;
        recent_files?: Array<Record<string, unknown>>;
      };
    },
    [],
  );

  const startServicesFromWeb = useCallback(async () => {
    setSetupBusy('runtime');
    setTopError(null);
    try {
      const payload = await runLocalOpsAction('start_services');
      const out = typeof payload.stdout === 'string' ? payload.stdout : '';
      const transport = typeof payload.transport === 'string' ? payload.transport : 'unknown';
      appendLog(out.toLowerCase().includes('local stack is up.') ? 'Services started (web ops).' : 'Start command sent (web ops).');
      appendLog(`Local ops transport: ${transport}`, 'info', 'local_ops_transport');
      if (out) appendLog(out.slice(0, 1000), 'info', 'local_ops_start');
      await runRuntimeCheck();
      await refreshConnectors();
      await refreshCredentials();
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to start services.');
      setTopError(message);
      appendLog(message, 'error');
      throw error;
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, refreshConnectors, refreshCredentials, runLocalOpsAction, runRuntimeCheck, setSetupBusy, setTopError]);

  const restartServicesFromWeb = useCallback(async () => {
    setSetupBusy('runtime');
    setTopError(null);
    try {
      const payload = await runLocalOpsAction('restart_services');
      const out = typeof payload.stdout === 'string' ? payload.stdout : '';
      const transport = typeof payload.transport === 'string' ? payload.transport : 'unknown';
      appendLog(out.toLowerCase().includes('local stack is up.') ? 'Services restarted (web ops).' : 'Restart command sent (web ops).');
      appendLog(`Local ops transport: ${transport}`, 'info', 'local_ops_transport');
      if (out) appendLog(out.slice(0, 1000), 'info', 'local_ops_restart');
      await runRuntimeCheck();
      await refreshConnectors();
      await refreshCredentials();
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to restart services.');
      setTopError(message);
      appendLog(message, 'error');
      throw error;
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, refreshConnectors, refreshCredentials, runLocalOpsAction, runRuntimeCheck, setSetupBusy, setTopError]);

  const runReadinessFromWeb = useCallback(async () => {
    setSetupBusy('runtime');
    setTopError(null);
    try {
      const payload = await runLocalOpsAction('readiness');
      const out = typeof payload.stdout === 'string' ? payload.stdout : '';
      const transport = typeof payload.transport === 'string' ? payload.transport : 'unknown';
      appendLog(`Local ops transport: ${transport}`, 'info', 'local_ops_transport');
      if (out) appendLog(out.slice(0, 1200), 'info', 'local_ops_readiness');
      return out;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to run readiness check.');
      setTopError(message);
      appendLog(message, 'error');
      throw error;
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, runLocalOpsAction, setSetupBusy, setTopError]);

  const runReleaseStatusFromWeb = useCallback(async () => {
    setSetupBusy('runtime');
    setTopError(null);
    try {
      const payload = await runLocalOpsAction('release_status');
      const out = typeof payload.stdout === 'string' ? payload.stdout : '';
      const transport = typeof payload.transport === 'string' ? payload.transport : 'unknown';
      appendLog(`Local ops transport: ${transport}`, 'info', 'local_ops_transport');
      if (out) appendLog(out.slice(0, 1200), 'info', 'local_ops_release_status');
      return out;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to run release status.');
      setTopError(message);
      appendLog(message, 'error');
      throw error;
    } finally {
      setSetupBusy(null);
    }
  }, [appendLog, runLocalOpsAction, setSetupBusy, setTopError]);

  const rebindTelegramFromWeb = useCallback(async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      throw new Error('Enter Telegram bot token and chat ID first.');
    }
    setSetupBusy('save');
    setTopError(null);
    try {
      const payload = await runLocalOpsAction('telegram_rebind', {
        botToken: telegramBotToken.trim(),
        chatId: telegramChatId.trim(),
        allowAnyChat: true,
      });
      const transport = typeof payload.transport === 'string' ? payload.transport : 'unknown';
      appendLog('Telegram rebind saved from web.');
      appendLog(`Local ops transport: ${transport}`, 'info', 'local_ops_transport');
      const bot = payload.bot && typeof payload.bot === 'object' ? payload.bot : null;
      if (bot && typeof (bot as { username?: unknown }).username === 'string') {
        appendLog(`Bot username: @${String((bot as { username?: unknown }).username)}`);
      }
      await refreshConnectors();
      await fetchLocalWorkerStatus(true);
      await fetchRuntimeMetrics();
      return payload;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to rebind Telegram.');
      setTopError(message);
      appendLog(message, 'error');
      throw error;
    } finally {
      setSetupBusy(null);
    }
  }, [
    appendLog,
    fetchLocalWorkerStatus,
    fetchRuntimeMetrics,
    refreshConnectors,
    runLocalOpsAction,
    setSetupBusy,
    setTopError,
    telegramBotToken,
    telegramChatId,
  ]);

  const getOpsDaemonStatusFromWeb = useCallback(async () => {
    const payload = await runLocalOpsAction('ops_daemon_status');
    const watchdog = payload.watchdog && typeof payload.watchdog === 'object'
      ? (payload.watchdog as Record<string, unknown>)
      : null;
    return {
      running: Boolean(payload.running),
      url:
        typeof payload.url === 'string'
          ? payload.url
          : typeof payload.runtime_url === 'string'
          ? payload.runtime_url
          : '',
      pid: typeof payload.pid === 'string' ? payload.pid : null,
      transport: typeof payload.transport === 'string' ? payload.transport : 'route',
      watchdog: {
        enabled: watchdog ? Boolean(watchdog.enabled) : false,
        healthy:
          watchdog && typeof watchdog.healthy === 'boolean'
            ? watchdog.healthy
            : null,
        consecutiveFailures: watchdog ? Number(watchdog.consecutive_failures || 0) : 0,
        recoveriesTotal: watchdog ? Number(watchdog.recovery_attempts_total || 0) : 0,
        recoveriesLastHour: watchdog ? Number(watchdog.recovery_attempts_last_hour || 0) : 0,
        lastRecoveryAt: watchdog && typeof watchdog.last_recovery_at === 'number' ? watchdog.last_recovery_at : null,
        lastProbeAt: watchdog && typeof watchdog.last_probe_at === 'number' ? watchdog.last_probe_at : null,
        lastUnhealthyReason:
          watchdog && typeof watchdog.last_unhealthy_reason === 'string' && watchdog.last_unhealthy_reason.trim()
            ? watchdog.last_unhealthy_reason.trim()
            : null,
      },
    };
  }, [runLocalOpsAction]);

  const restartOpsDaemonFromWeb = useCallback(async () => {
    const payload = await runLocalOpsAction('ops_daemon_restart');
    appendLog('Ops daemon restarted from web.', 'info', 'local_ops_daemon');
    const watchdog = payload.watchdog && typeof payload.watchdog === 'object'
      ? (payload.watchdog as Record<string, unknown>)
      : null;
    return {
      running: Boolean(payload.running),
      url:
        typeof payload.url === 'string'
          ? payload.url
          : typeof payload.runtime_url === 'string'
          ? payload.runtime_url
          : '',
      pid: typeof payload.pid === 'string' ? payload.pid : null,
      restarted: Boolean(payload.restarted),
      transport: typeof payload.transport === 'string' ? payload.transport : 'route',
      watchdog: {
        enabled: watchdog ? Boolean(watchdog.enabled) : false,
        healthy:
          watchdog && typeof watchdog.healthy === 'boolean'
            ? watchdog.healthy
            : null,
        consecutiveFailures: watchdog ? Number(watchdog.consecutive_failures || 0) : 0,
        recoveriesTotal: watchdog ? Number(watchdog.recovery_attempts_total || 0) : 0,
        recoveriesLastHour: watchdog ? Number(watchdog.recovery_attempts_last_hour || 0) : 0,
        lastRecoveryAt: watchdog && typeof watchdog.last_recovery_at === 'number' ? watchdog.last_recovery_at : null,
        lastProbeAt: watchdog && typeof watchdog.last_probe_at === 'number' ? watchdog.last_probe_at : null,
        lastUnhealthyReason:
          watchdog && typeof watchdog.last_unhealthy_reason === 'string' && watchdog.last_unhealthy_reason.trim()
            ? watchdog.last_unhealthy_reason.trim()
            : null,
      },
    };
  }, [appendLog, runLocalOpsAction]);

  const getTelegramMediaStatusFromWeb = useCallback(async () => {
    const payload = await runLocalOpsAction('telegram_media_status');
    const recentRaw = Array.isArray(payload.recent_files) ? payload.recent_files : [];
    const recent = recentRaw
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          path: typeof row.path === 'string' ? row.path : '',
          bytes: Number(row.bytes || 0),
          mtime: typeof row.mtime === 'string' ? row.mtime : '',
        };
      });

    return {
      configuredDir: typeof payload.configured_dir === 'string' ? payload.configured_dir : '.orion-media/telegram',
      resolvedDir: typeof payload.resolved_dir === 'string' ? payload.resolved_dir : '.orion-media/telegram',
      exists: Boolean(payload.exists),
      filesTotal: Number(payload.files_total || 0),
      bytesTotal: Number(payload.bytes_total || 0),
      truncated: Boolean(payload.truncated),
      recent,
    };
  }, [runLocalOpsAction]);

  const saveByokCredential = useCallback(async () => {
    const selectedProviderOption = providerOptions.find((p) => p.id === provider) || DEFAULT_PROVIDER_OPTIONS[0];
    const authModes = getProviderAuthModes(selectedProviderOption);
    const selectedAuthMode = providerAuthMode || selectedProviderOption.defaultAuthMode || authModes[0]?.id || 'api_key';
    const selectedAuthConfig = authModes.find((item) => item.id === selectedAuthMode);
    const secretRequired = selectedAuthConfig?.secretRequired !== false;
    if (secretRequired && !openaiKeyInput.trim()) {
      setTopError(`Enter your ${selectedProviderOption.label} key/token first.`);
      return;
    }
    setSetupBusy('save');
    setTopError(null);
    try {
      const secret = openaiKeyInput.trim();
      const providerId = normalizeProviderId(provider);
      const credentialPayload =
        providerId === 'anthropic' && selectedAuthMode === 'local_cli'
          ? { auth_mode: 'local_cli' }
          : providerId === 'openai'
          ? selectedAuthMode === 'oauth_token'
            ? { oauth_token: secret, auth_mode: 'oauth_token' }
            : selectedAuthMode === 'access_token'
              ? { access_token: secret, auth_mode: 'access_token' }
              : { api_key: secret, auth_mode: 'api_key' }
          : providerId === 'vertex'
            ? { access_token: secret, auth_mode: selectedAuthMode }
            : { api_key: secret, auth_mode: selectedAuthMode };
      const res = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
        body: JSON.stringify({
          label:
            credentialLabel.trim()
            || (providerId === 'anthropic' && selectedAuthMode === 'local_cli'
              ? 'My Claude Subscription'
              : `My ${selectedProviderOption.label} Key`),
          provider: providerId,
          workspace_id: 'default',
          mode: 'byok',
          credentials: credentialPayload,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to save account.');
      }
      const payload = await res.json();
      const id = typeof payload?.id === 'string' ? payload.id : '';
      if (id) setCredentialId(id);
      if (providerId === 'anthropic' && selectedAuthMode === 'local_cli') {
        setModel('claude-sonnet');
      }
      setOpenaiKeyInput('');
      await refreshCredentials();
      setSetupStatus((prev) => ({ ...prev, accountConnected: true }));
      appendLog('AI account connected.');
      await setupAction('submit_credential', { credential_id: id || '__managed__' });
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Unable to save account.');
      setTopError(message);
      appendLog(message, 'error');
      setShowSetupWizard(true);
    } finally {
      setSetupBusy(null);
    }
  }, [
    appendLog,
    credentialLabel,
    controlPlaneFetch,
    openaiKeyInput,
    provider,
    providerAuthMode,
    refreshCredentials,
    setupAction,
    providerOptions,
    setModel,
    setTopError,
    setSetupBusy,
    setCredentialId,
    setOpenaiKeyInput,
    setSetupStatus,
    setShowSetupWizard,
  ]);

  const testConnection = useCallback(async () => {
    setSetupBusy('test');
    setTopError(null);
    try {
      if (connectionMode === 'managed') {
        const checks = await fetchDoctorChecks();
        const failCheck = checks.find((check) => check.status === 'fail');
        if (failCheck) {
          const problem = [failCheck.detail || 'System setup failed.', failCheck.recommendation || ''].filter(Boolean).join(' ');
          throw new Error(problem);
        }
        const hasRuntimeAccount = await hasRuntimeProviderAccount(provider);
        if (!hasRuntimeAccount) {
          const providerLabel = providerOptions.find((item) => item.id === provider)?.label || provider;
          throw new Error(`${providerLabel} runtime account is not ready yet.`);
        }
      } else if (connectionMode === 'byok') {
        if (!credentialId) throw new Error('Choose a saved account first.');
        const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credentialId)}/test?workspace_id=default`, {
          method: 'POST',
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || 'Connection test failed.');
        }
      } else {
        appendLog('Local Companion mode selected. Cloud fallback remains active until companion runtime is enabled.');
      }

      setSetupStatus((prev) => ({ ...prev, connectionTested: true, accountConnected: true }));
      appendLog('Connection test passed.');
      await setupAction('verify', { ok: true });
      await setupAction('complete');
      if (typeof window !== 'undefined') {
        window.location.assign('/connectors?onboarding=tool-connected');
        return;
      }
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Connection test failed.');
      setSetupStatus((prev) => ({ ...prev, connectionTested: false }));
      setTopError(message);
      appendLog(message, 'warn');
      setShowSetupWizard(true);
      await setupAction('verify', { ok: false, error: message });
    } finally {
      setSetupBusy(null);
    }
  }, [
    appendLog,
    connectionMode,
    controlPlaneFetch,
    credentialId,
    fetchDoctorChecks,
    hasRuntimeProviderAccount,
    provider,
    providerOptions,
    setupAction,
    setSetupBusy,
    setTopError,
    setSetupStatus,
    setShowSetupWizard,
  ]);

  const continueGuidedSetup = useCallback(async () => {
    const sessionNext = String(setupSession?.next_step || '').trim().toLowerCase();
    const allowedActions = Array.isArray(setupSession?.allowed_actions)
      ? new Set(setupSession.allowed_actions.map((item) => String(item)))
      : null;
    const canSessionAction = (action: string) => !allowedActions || allowedActions.has(action);

    if (sessionNext === 'risk_ack' && canSessionAction('risk_ack')) {
      await setupAction('risk_ack', { accepted: true, source: 'web_setup' });
      return;
    }
    if (sessionNext === 'verify' || sessionNext === 'complete') {
      await testConnection();
      return;
    }
    if (
      sessionNext === 'select_provider' ||
      sessionNext === 'credential' ||
      sessionNext === 'channels' ||
      sessionNext === 'provider_auth_choice' ||
      sessionNext === 'gateway_location' ||
      sessionNext === 'sections'
    ) {
      setTopError('Open setup and finish the required account/channel step, then continue.');
      setShowSetupWizard(true);
      return;
    }
    if (sessionNext === 'done') {
      setTopError(null);
      return;
    }

    let onboardingNextStep = 'done';
    if (!state.setupStatus.runtimeReady) onboardingNextStep = 'runtime';
    else if (!state.setupStatus.accountConnected) onboardingNextStep = 'account';
    else if (!state.setupStatus.connectionTested) onboardingNextStep = 'connection';

    if (onboardingNextStep === 'runtime') {
      await runRuntimeCheck();
      return;
    }
    if (onboardingNextStep === 'account') {
      setTopError('Connect your AI account in Setup, then continue.');
      setShowSetupWizard(true);
      return;
    }
    if (onboardingNextStep === 'connection') {
      await testConnection();
      return;
    }
    setTopError(null);
  }, [runRuntimeCheck, setShowSetupWizard, setTopError, setupAction, setupSession?.allowed_actions, setupSession?.next_step, state.setupStatus, testConnection]);

  const closeStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }, [streamRef]);

  const checkCompatibility = useCallback(async () => {
    try {
      await ensureControlPlaneSession();
      const res = await fetch('/api/platform/shell-status', { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      const minFrontend = payload?.runtimeApiMinCliVersion;
      if (minFrontend) {
        const v2t = (v: string) => v.split('.').map(Number);
        const lt = (a: string, b: string) => {
          const ta = v2t(a), tb = v2t(b);
          for (let i = 0; i < 3; i++) {
            if ((ta[i] || 0) < (tb[i] || 0)) return true;
            if ((ta[i] || 0) > (tb[i] || 0)) return false;
          }
          return false;
        };
        if (lt(ORION_FRONTEND_VERSION, minFrontend)) {
          setTopError(`Frontend version ${ORION_FRONTEND_VERSION} is older than runtime minimum ${minFrontend}. Please refresh or upgrade.`);
        }
      }
    } catch {
      // Ignore handshake errors during compat check.
    }
  }, [setTopError]);

  const submitDecision = useCallback(async (decision: 'Proceed' | 'Hold') => {
    if (!state.runId) return;
    try {
      const useApprovalEndpoint = Boolean(state.pendingApprovalId);
      const decisionUrl = useApprovalEndpoint
        ? '/api/approvals/resolve'
        : `/api/runs/${encodeURIComponent(state.runId)}/decision`;
      const body = useApprovalEndpoint
        ? {
            runId: state.runId,
            approvalId: state.pendingApprovalId || '',
            decision,
            note: `Resolved from ${BRAND.product} web UI`,
          }
        : { decision };
      await ensureControlPlaneSession();
      const res = await fetch(decisionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to send decision.');
      }
      state.setPendingApprovalId(null);
      state.setStatus('running');
      appendLog(`Decision sent: ${decision}`);
      void fetchLocalWorkerStatus(true);
      void fetchRuntimeMetrics();
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Failed to send decision.');
      state.setStatus('error');
      appendLog(message, 'error');
    }
  }, [appendLog, fetchLocalWorkerStatus, fetchRuntimeMetrics, state]);

  const fetchRunResult = useCallback(async (targetRunId: string): Promise<string | null> => {
    try {
      const payload = await apiClient.getRunDetail(targetRunId);
      void fetchLocalWorkerStatus(true);
      void fetchRuntimeMetrics();
      if (payload && typeof payload === 'object') {
        state.setLastRunPayload(payload as Record<string, unknown>);
        const route = (payload as { route?: RoutePayload }).route;
        if (route && typeof route === 'object') {
          state.setLastRouteInfo(route);
        }
        const pending = (payload as { pending_approval?: unknown }).pending_approval;
        if (pending && typeof pending === 'object') {
          const approvalId = String((pending as { approval_id?: unknown }).approval_id || '').trim();
          const approvalStatus = String((pending as { status?: unknown }).status || 'pending').toLowerCase();
          if (approvalId && approvalStatus !== 'resolved' && approvalStatus !== 'expired') {
            state.setPendingApprovalId(approvalId);
          } else {
            state.setPendingApprovalId(null);
          }
        } else {
          state.setPendingApprovalId(null);
        }
      }
      const data = payload?.result_data;
      if (data && typeof data === 'object' && typeof (data as { pack_id?: unknown }).pack_id === 'string') {
        state.setPackResult(data as PackResult);
      } else {
        state.setPackResult(null);
      }
      const runStatus = String(payload?.status || '').toLowerCase();
      if (runStatus === 'queued_local') return 'queued_local';
      if (runStatus === 'completed') return 'completed';
      if (runStatus === 'waiting_for_input') return 'waiting';
      if (runStatus === 'failed' || runStatus === 'timeout') return 'error';
      if (runStatus === 'running' || runStatus === 'executing' || runStatus === 'running_local' || runStatus === 'starting') return 'running';
      return null;
    } catch {
      return null;
    }
  }, [fetchLocalWorkerStatus, fetchRuntimeMetrics, state]);

  const sendOperatorChat = useCallback(async (
    message: string,
    options?: {
      reasoningEffort?: string | null;
      threadId?: string | null;
      priorMessages?: OperatorChatPriorMessagePayload[];
      onChunk?: (delta: string) => void;
      onSteps?: (steps: OperatorChatStepPayload[]) => void;
      approvedAction?: OperatorChatApprovedActionPayload | null;
      signal?: AbortSignal | null;
    },
  ): Promise<OperatorChatResponsePayload> => {
    const priorMessages = normalizeOperatorChatPriorMessages(options?.priorMessages);
    const effectiveTrustMode: TrustMode = guidedDefaultsEnabled ? 'guarded' : trustMode;
    const policyContext = buildOperatorChatPolicyContext(effectiveTrustMode);
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
      },
    });
    let streamedReply = '';
    let streamedSteps: OperatorChatStepPayload[] = [];
    const maxRetries = 3;
    const retryDelaysMs = [1000, 2000, 4000];
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

    const isAbortError = (error: unknown): boolean => (
      error != null
      && typeof error === 'object'
      && 'name' in error
      && String((error as { name?: unknown }).name || '') === 'AbortError'
    );

    const throwIfAborted = () => {
      if (externalSignal?.aborted) {
        throw createAbortError();
      }
    };

    const waitForRetry = async (delayMs: number): Promise<void> => {
      throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const timer = globalThis.setTimeout(() => {
          if (externalSignal && abortListener) {
            externalSignal.removeEventListener('abort', abortListener);
          }
          resolve();
        }, delayMs);
        const abortListener = () => {
          globalThis.clearTimeout(timer);
          externalSignal?.removeEventListener('abort', abortListener);
          reject(createAbortError());
        };
        if (externalSignal) {
          externalSignal.addEventListener('abort', abortListener, { once: true });
        }
      });
    };

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
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
            provider,
            model,
            reasoning_effort: options?.reasoningEffort || undefined,
            prior_messages: priorMessages.length > 0 ? priorMessages : undefined,
            approved_action: options?.approvedAction || undefined,
          },
          policy_context: policyContext,
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
          if (responseError.code) {
            error.code = responseError.code;
          }
          throw error;
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream') || !res.body) {
          const payload = normalizeOperatorChatResponsePayload(await res.json());
          const finalizedReply = responseContainsStructuredIntervention(payload)
            ? ''
            : streamAssembler.finalize(payload.reply || streamedReply);
          if (finalizedReply) {
            payload.reply = finalizedReply;
          } else if (responseContainsStructuredIntervention(payload)) {
            payload.reply = '';
          }
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
            if (suffix) {
              options?.onChunk?.(suffix);
            }
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
          if (finalizedReply) {
            resolvedFinalPayload.reply = finalizedReply;
          } else if (responseContainsStructuredIntervention(resolvedFinalPayload)) {
            resolvedFinalPayload.reply = '';
          }
          if ((!Array.isArray(resolvedFinalPayload.steps) || resolvedFinalPayload.steps.length === 0) && streamedSteps.length > 0) {
            resolvedFinalPayload.steps = streamedSteps;
          }
          return resolvedFinalPayload;
        }

        const error = new Error('Chat stream ended unexpectedly before completion.');
        error.name = 'ChatStreamUnexpectedCloseError';
        throw error;
      } catch (error) {
        if (externalSignal) {
          externalSignal.removeEventListener('abort', abortForward);
        }
        if (isAbortError(error)) {
          throw error;
        }
        const nonRetriable = error instanceof Error && (
            error.name === 'OperatorChatHttpError'
          );
        if (nonRetriable || attempt >= maxRetries) {
          throw error;
        }
        await waitForRetry(retryDelaysMs[attempt] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 1000);
        continue;
      } finally {
        if (externalSignal) {
          externalSignal.removeEventListener('abort', abortForward);
        }
      }
    }

    return normalizeOperatorChatResponsePayload({ reply: streamedReply, steps: streamedSteps });
  }, [activeTenantId, activeWorkspaceId, guidedDefaultsEnabled, model, provider, trustMode]);

  const buildLocalExecutionGoal = useCallback((draft: LocalExecutionDraft): string => {
    const operations = Array.isArray(draft.operations) ? draft.operations : [];
    if (operations.length === 0) return 'Run a local execution plan.';
    const labels = operations.slice(0, 3).map((operation) => describeLocalExecutionOperation(operation));
    const suffix = operations.length > 3 ? ` +${operations.length - 3} more` : '';
    return `Run local execution plan: ${labels.join(' · ')}${suffix}`;
  }, []);

  const startOperatorRun = useCallback(async (
    input: { goal: string; agentRole?: AgentRoleId; metadata?: Record<string, unknown> },
  ) => {
    const effectiveGoal = input.goal.trim();
    const effectiveAgentRole = input.agentRole || state.selectedAgentRole;
    if (!effectiveGoal) {
      state.setTopError(`Tell ${BRAND.assistant} what you want done first.`);
      return null;
    }
    if (state.status === 'running' || state.status === 'queued_local') return null;
    if (state.connectionMode === 'byok' && !state.credentialId) {
      state.setTopError('Connect your AI account first.');
      return null;
    }

    closeStream();
    state.setTopError(null);
    state.setLogs([]);
    state.setRunId(null);
    state.setPendingApprovalId(null);
    state.setLastRouteInfo(null);
    state.setPackResult(null);
    state.setLastRunPayload(null);
    state.setStatus('running');
    state.setIsStarting(true);

    try {
      state.setIsChecking(true);
      const checks = await fetchDoctorChecks();
      const failCheck = checks.find((check) => check.status === 'fail');
      if (failCheck) {
        const problem = [failCheck.detail || 'System setup failed.', failCheck.recommendation || ''].filter(Boolean).join(' ');
        throw new Error(problem);
      }
      if (state.connectionMode === 'managed') {
        const hasRuntimeAccount = await hasRuntimeProviderAccount(state.provider);
        if (!hasRuntimeAccount) {
          const providerLabel = state.providerOptions.find((item) => item.id === state.provider)?.label || state.provider;
          throw new Error(`${providerLabel} runtime account is not ready. Open Setup and connect a direct ${providerLabel} account.`);
        }
      }
      state.setIsChecking(false);

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
          provider: state.provider,
          model: state.model,
          credential_id: state.connectionMode === 'byok' ? state.credentialId : undefined,
          agent_role: effectiveAgentRole,
          metadata: {
            source: 'operator_chat',
            direct_chat: true,
            connection_mode: state.connectionMode,
            execution_target: state.connectionMode === 'local_companion' ? 'local_companion' : 'auto',
            ...(input.metadata || {}),
          },
        },
      });

      const runPayload = ((turnResponse as AgentTurnResponse).metadata?.created_run || {
        run_id: turnResponse.run_id,
        status: turnResponse.status,
        route: turnResponse.metadata?.route,
      }) as StartedRunPayload;
      state.setLastRunPayload(runPayload as Record<string, unknown>);
      const nextRunId = String(runPayload.run_id || '').trim();
      if (!nextRunId) throw new Error('Run ID missing.');

      const route = runPayload?.route;
      if (route && typeof route === 'object') {
        state.setLastRouteInfo(route as RoutePayload);
        if (String((route as { selected?: unknown }).selected || '').trim() === 'local_companion') state.setStatus('queued_local');
      }
      const pending = runPayload?.pending_approval;
      if (pending && typeof pending === 'object') {
        const approvalId = String((pending as { approval_id?: unknown }).approval_id || '').trim();
        if (approvalId) {
          state.setPendingApprovalId(approvalId);
          state.setStatus('waiting');
        }
      }

      state.setRunId(nextRunId);
      appendLog(
        buildRunStartedMessage(
          typeof runPayload?.active_profile_label === 'string' ? runPayload.active_profile_label : null,
          typeof runPayload?.active_profile_provider === 'string' ? runPayload.active_profile_provider : state.provider,
          typeof runPayload?.active_profile_model === 'string' ? runPayload.active_profile_model : state.model,
        ),
      );
      void fetchLocalWorkerStatus(true);
      void fetchRuntimeMetrics();

      const streamUrl = `/api/runs/${encodeURIComponent(nextRunId)}/stream`;
      const source = openAuthenticatedEventStream({
        url: streamUrl,
        onEvent: (event) => {
          if (event.event === 'pause') {
            state.setStatus('waiting');
            appendLog(RUN_WAITING_STATUS_COPY, 'warn');
            return;
          }
          if (event.event !== 'log') {
            appendLog(String(event.data || ''), 'info', event.event || 'stream_raw');
            return;
          }
          const parsed = parseJson(event.data) as {
            event?: string;
            message?: string;
            level?: LogLevel;
            data?: { node_id?: string; approval_id?: string; pack_id?: string };
          } | null;
          if (parsed && typeof parsed === 'object') {
            const evt = parsed.event || '';
            const msg = evt === 'run_error' ? humanizeError(parsed.message || '') : parsed.message || event.data;
            const level = (parsed.level as LogLevel) || 'info';
            if (evt === 'local_queued') { state.setStatus('queued_local'); void fetchLocalWorkerStatus(true); }
            if (evt === 'local_claimed') { state.setStatus('running'); void fetchLocalWorkerStatus(true); }
            if (evt === 'approval_requested' || evt === 'approval_waiting' || evt === 'approval_required') {
              const approvalId = parsed.data?.approval_id;
              if (approvalId) state.setPendingApprovalId(approvalId);
              state.setStatus('waiting');
              void fetchRunResult(nextRunId);
            }
            if (['approval_received', 'approval_resolved', 'approval_skipped'].includes(evt)) state.setPendingApprovalId(null);
            if (evt === 'approval_timeout') { state.setPendingApprovalId(null); state.setStatus('error'); }
            appendLog(msg, level, evt || undefined, parsed.data?.node_id);
            if (evt === 'run_complete') {
              state.setStatus('completed');
              state.setPendingApprovalId(null);
              void fetchLocalWorkerStatus(true);
              void fetchRunResult(nextRunId);
            }
            if (evt === 'run_error') {
              state.setStatus('error');
              state.setPendingApprovalId(null);
              void fetchLocalWorkerStatus(true);
            }
            return;
          }
          appendLog(String(event.data), 'info', 'stream_raw');
        },
        onError: () => {
          if (streamRef.current === source) streamRef.current = null;
          appendLog('Stream disconnected. Syncing...', 'warn');
          void fetchLocalWorkerStatus(true);
          void (async () => {
            const synced = await fetchRunResult(nextRunId);
            if (synced) state.setStatus(synced as RunStatus);
            else state.setStatus((current) => (current === 'running' ? 'error' : current));
          })();
        },
        onClose: () => {
          if (streamRef.current === source) streamRef.current = null;
        },
      });
      streamRef.current = source;
      return runPayload as Record<string, unknown>;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Operator run failed.');
      state.setStatus('error');
      state.setTopError(message);
      appendLog(message, 'error');
      return null;
    } finally {
      state.setIsChecking(false);
      state.setIsStarting(false);
    }
  }, [activeTenantId, activeWorkspaceId, appendLog, closeStream, fetchDoctorChecks, fetchLocalWorkerStatus, fetchRunResult, fetchRuntimeMetrics, hasRuntimeProviderAccount, state, streamRef]);

  const startAutopilot = useCallback(async (overrides?: { goal?: string; agentRole?: AgentRoleId; metadata?: Record<string, unknown> }) => {
    if (state.status === 'running' || state.status === 'queued_local') return;
    const selectedPack = OUTCOME_PACKS.find((p) => p.id === state.selectedPackId) || OUTCOME_PACKS[0];
    const localDeterministicPack =
      selectedPack.id === 'customer-ops-autopilot' ||
      selectedPack.id === 'weekly-content-studio' ||
      selectedPack.id === 'competitor-brief-digest' ||
      selectedPack.id === 'spreadsheet-ops-v1' ||
      selectedPack.id === 'document-studio-v1' ||
      selectedPack.id === 'local-execution-v1';
    const effectiveGoal =
      overrides?.goal?.trim() ||
      state.goal.trim() ||
      (selectedPack.id === 'local-execution-v1' ? buildLocalExecutionGoal(localExecutionDraft) : '');
    const effectiveAgentRole = overrides?.agentRole || state.selectedAgentRole;
    if (!effectiveGoal.trim()) {
      state.setTopError(`Tell ${BRAND.assistant} what you want done first.`);
      return;
    }
    if (state.connectionMode === 'byok' && !state.credentialId && !localDeterministicPack) {
      state.setTopError('Connect your AI account first.');
      return;
    }

    closeStream();
    state.setTopError(null);
    state.setLogs([]);
    state.setRunId(null);
    state.setPendingApprovalId(null);
    state.setLastRouteInfo(null);
    state.setPackResult(null);
    state.setLastRunPayload(null);
    state.setStatus('running');
    state.setIsStarting(true);

    try {
      state.setIsChecking(true);
      const checks = await fetchDoctorChecks();
      const failCheck = checks.find((check) => check.status === 'fail');
      if (failCheck) {
        const problem = [failCheck.detail || 'System setup failed.', failCheck.recommendation || ''].filter(Boolean).join(' ');
        throw new Error(problem);
      }
      const selectedPreset = BUSINESS_PRESETS.find((p) => p.id === state.selectedPresetId) || BUSINESS_PRESETS[0];
      if (state.connectionMode === 'managed' && !localDeterministicPack) {
        const hasRuntimeAccount = await hasRuntimeProviderAccount(state.provider);
        if (!hasRuntimeAccount) {
          const providerLabel = state.providerOptions.find((item) => item.id === state.provider)?.label || state.provider;
          throw new Error(`${providerLabel} runtime account is not ready. Open Setup and connect a direct ${providerLabel} account.`);
        }
      }
      state.setIsChecking(false);

      const runtimeSessionId = await ensureRuntimeSessionId({
        channel: 'web',
        actorLabel: 'Pack run',
        tenantId: activeTenantId,
        workspaceId: activeWorkspaceId,
        metadata: {
          source: 'pack_run',
          outcome_pack: selectedPack.id,
        },
      });

      const effectiveTrustMode: TrustMode = state.guidedDefaultsEnabled ? 'guarded' : state.trustMode;
      const agentSkills = resolveAgentProfileSkills(effectiveAgentRole);
      const activeSkills = agentSkills.skills.length > 0 ? agentSkills : await loadActiveSkills('automationDefaults');
      const activeSkillScope = agentSkills.skills.length > 0 ? 'agent_profile' : activeSkills.skills.length > 0 ? 'automation_defaults' : undefined;
      const effectivePrimary = state.inboxInput.trim() || (state.guidedDefaultsEnabled ? selectedPreset.inputs.primary : '');
      const effectiveSecondary = state.leadsInput.trim() || (state.guidedDefaultsEnabled ? selectedPreset.inputs.secondary : '');
      const effectiveTertiary = state.slotsInput.trim() || (state.guidedDefaultsEnabled ? selectedPreset.inputs.tertiary : '');
      const packInputs: Record<string, unknown> = {};
      if (selectedPack.id === 'weekly-content-studio') {
        packInputs.topics = effectivePrimary;
        packInputs.channels = effectiveSecondary;
        packInputs.offers = effectiveTertiary;
      } else if (selectedPack.id === 'competitor-brief-digest') {
        packInputs.competitors = effectivePrimary;
        packInputs.positioning = effectiveSecondary;
        packInputs.objectives = effectiveTertiary;
      } else if (selectedPack.id === 'spreadsheet-ops-v1') {
        packInputs.file_path = effectivePrimary;
        packInputs.operation = effectiveSecondary;
        packInputs.payload = effectiveTertiary;
      } else if (selectedPack.id === 'document-studio-v1') {
        packInputs.file_path = effectivePrimary;
        packInputs.operation = effectiveSecondary;
        packInputs.payload = effectiveTertiary;
      } else if (selectedPack.id === 'local-execution-v1') {
        const operations = Array.isArray(localExecutionDraft.operations) ? localExecutionDraft.operations : [];
        if (operations.length === 0) throw new Error('Add at least one local operation first.');
        packInputs.operations = operations.map((operation, index) => {
          if (operation.tool === 'execute_shell_command') {
            const command = operation.command.trim();
            if (!command) throw new Error(`Enter a shell command for step ${index + 1}.`);
            const capability = inferLocalExecutionCapabilityFromCommand(command);
            return {
              tool: 'execute_shell_command',
              capability: capability || undefined,
              command,
              cwd: operation.cwd.trim() || undefined,
            };
          }
          if (operation.tool === 'capture_screenshot') {
            const screenshotPath = operation.path.trim();
            if (screenshotPath && !SCREENSHOT_PATH_PATTERN.test(screenshotPath)) {
              throw new Error(`Use a screenshot file path ending in .png, .jpg, or .webp for step ${index + 1}, or leave it blank.`);
            }
            return {
              tool: 'capture_screenshot',
              capability: 'screenshot.capture',
              path: screenshotPath || undefined,
            };
          }
          if (operation.tool === 'browser_automation') {
            const url = operation.url.trim();
            if (!/^https?:\/\//i.test(url)) {
              throw new Error(`Enter an http or https URL for browser step ${index + 1}.`);
            }
            const savePath = operation.path.trim();
            const sessionProfile = operation.browserSessionProfile.trim();
            let browserActions: Array<Record<string, unknown>> | undefined;
            const browserActionScript = operation.browserActionScript.trim();
            if (browserActionScript) {
              try {
                const parsed = JSON.parse(browserActionScript);
                if (!Array.isArray(parsed)) throw new Error('Browser script must be a JSON array.');
                browserActions = parsed.map((item, actionIndex) => {
                  if (!item || typeof item !== 'object') {
                    throw new Error(`Browser action ${actionIndex + 1} must be an object.`);
                  }
                  return item as Record<string, unknown>;
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Invalid browser script JSON.';
                throw new Error(`Browser script for step ${index + 1} is invalid: ${message}`);
              }
            }
            if (operation.browserMode === 'capture_page') {
              if (savePath && !/\.(png|jpg|jpeg)$/i.test(savePath)) {
                throw new Error(`Use a .png, .jpg, or .jpeg path for browser capture step ${index + 1}, or leave it blank.`);
              }
            } else if (savePath && !/\.(html?|json|txt)$/i.test(savePath)) {
              throw new Error(`Use an .html, .htm, .json, or .txt path for browser step ${index + 1}, or leave it blank.`);
            }
            const waitForSelector = operation.waitForSelector.trim();
            const clickSelector = operation.clickSelector.trim();
            const typeSelector = operation.typeSelector.trim();
            const typeText = operation.typeText;
            if (typeSelector && !typeText.trim()) {
              throw new Error(`Enter text for browser type step ${index + 1}.`);
            }
            if (typeText.trim() && !typeSelector) {
              throw new Error(`Enter a CSS selector for browser typing in step ${index + 1}.`);
            }
            return {
              tool: 'browser_automation',
              mode: operation.browserMode,
              url,
              path: savePath || undefined,
              session_profile: sessionProfile || undefined,
              browser_actions: browserActions,
              wait_for_selector: waitForSelector || undefined,
              click_selector: clickSelector || undefined,
              type_selector: typeSelector || undefined,
              type_text: typeText.trim() ? typeText : undefined,
            };
          }
          const path = operation.path.trim();
          if (!path) throw new Error(`Enter a file path for step ${index + 1}.`);
          if (operation.fileMode !== 'read' && !operation.content.trim()) {
            throw new Error(`Enter file content for step ${index + 1}.`);
          }
          return {
            tool: 'read_write_files',
            mode: operation.fileMode,
            path,
            content: operation.fileMode === 'read' ? undefined : operation.content,
          };
        });
        packInputs.continue_on_error = localExecutionDraft.continueOnError;
      } else {
        packInputs.inbox = effectivePrimary;
        packInputs.leads = effectiveSecondary;
        packInputs.slots = effectiveTertiary;
      }

      const turnResponse = await apiClient.turn({
        tenant_id: activeTenantId,
        workspace_id: activeWorkspaceId,
        thread_id: runtimeSessionId,
        session_id: runtimeSessionId,
        channel: 'web',
        actor: buildWebActor(runtimeSessionId),
        message: effectiveGoal.trim(),
        execution_mode: 'durable',
        response_mode: 'artifact',
        context_hints: {
          provider: state.provider,
          model: state.model,
          credential_id: state.connectionMode === 'byok' ? state.credentialId : undefined,
          agent_role: effectiveAgentRole,
          metadata: {
            trust_mode: effectiveTrustMode,
            trust_preset: 'standard_local',
            remembered_grants: {
              folders: [],
              browser_session: false,
              shell_capabilities: [],
            },
            source: 'mom_mode',
            guided_defaults_enabled: state.guidedDefaultsEnabled,
            connection_mode: state.connectionMode,
            execution_target: selectedPack.id === 'local-execution-v1'
              ? 'local_companion'
              : state.connectionMode === 'local_companion'
                ? 'local_companion'
                : 'auto',
            outcome_pack: selectedPack.id,
            outcome_pack_label: selectedPack.label,
            outcome_scope: selectedPack.scope,
            connector_credential_id: state.connectorCredentialId || undefined,
            pack_inputs: packInputs,
            skill_scope: activeSkillScope,
            skill_bundle: activeSkills.skills.length > 0
              ? {
                  skill_ids: activeSkills.ids,
                  skills: activeSkills.skills,
                }
              : undefined,
            skill_prompt_append: activeSkills.promptAppend || undefined,
            skill_policy_mode: activeSkills.skills.length > 0 ? 'warn' : undefined,
            schedule: {
              enabled: state.weeklyAutopilotEnabled,
              day: state.weeklyAutopilotDay,
              time: state.weeklyAutopilotTime,
              timezone: state.weeklyAutopilotTimezone,
            },
            ...(overrides?.metadata || {}),
          },
        },
      });

      const runPayload = ((turnResponse as AgentTurnResponse).metadata?.created_run || {
        run_id: turnResponse.run_id,
        status: turnResponse.status,
        route: turnResponse.metadata?.route,
      }) as StartedRunPayload;
      state.setLastRunPayload(runPayload as Record<string, unknown>);
      const nextRunId = String(runPayload.run_id || '').trim();
      if (!nextRunId) throw new Error('Run ID missing.');

      const route = runPayload?.route;
      if (route && typeof route === 'object') {
        state.setLastRouteInfo(route as RoutePayload);
        if (String((route as { selected?: unknown }).selected || '').trim() === 'local_companion') state.setStatus('queued_local');
      }
      const pending = runPayload?.pending_approval;
      if (pending && typeof pending === 'object') {
        const approvalId = String((pending as { approval_id?: unknown }).approval_id || '').trim();
        if (approvalId) {
          state.setPendingApprovalId(approvalId);
          state.setStatus('waiting');
        }
      }

      state.setRunId(nextRunId);
      appendLog(
        buildRunStartedMessage(
          typeof runPayload?.active_profile_label === 'string' ? runPayload.active_profile_label : null,
          typeof runPayload?.active_profile_provider === 'string' ? runPayload.active_profile_provider : state.provider,
          typeof runPayload?.active_profile_model === 'string' ? runPayload.active_profile_model : state.model,
        ),
      );
      void fetchLocalWorkerStatus(true);
      void fetchRuntimeMetrics();

      const streamUrl = `/api/runs/${encodeURIComponent(nextRunId)}/stream`;
      const source = openAuthenticatedEventStream({
        url: streamUrl,
        onEvent: (event) => {
          if (event.event === 'pause') {
            state.setStatus('waiting');
            appendLog(RUN_WAITING_STATUS_COPY, 'warn');
            return;
          }
          if (event.event !== 'log') {
            appendLog(String(event.data || ''), 'info', event.event || 'stream_raw');
            return;
          }
          const parsed = parseJson(event.data) as {
            event?: string;
            message?: string;
            level?: LogLevel;
            data?: { node_id?: string; approval_id?: string; pack_id?: string };
          } | null;
          if (parsed && typeof parsed === 'object') {
            const evt = parsed.event || '';
            const msg = evt === 'run_error' ? humanizeError(parsed.message || '') : parsed.message || event.data;
            const level = (parsed.level as LogLevel) || 'info';
            if (evt === 'local_queued') { state.setStatus('queued_local'); void fetchLocalWorkerStatus(true); }
            if (evt === 'local_claimed') { state.setStatus('running'); void fetchLocalWorkerStatus(true); }
            if (evt === 'approval_requested' || evt === 'approval_waiting') {
              const approvalId = parsed.data?.approval_id;
              if (approvalId) state.setPendingApprovalId(approvalId);
              state.setStatus('waiting');
              void fetchRunResult(nextRunId);
            }
            if (evt === 'approval_required') {
              state.setStatus('waiting');
              void fetchRunResult(nextRunId);
            }
            if (['approval_received', 'approval_resolved', 'approval_skipped'].includes(evt)) state.setPendingApprovalId(null);
            if (evt === 'approval_timeout') { state.setPendingApprovalId(null); state.setStatus('error'); }
            if (evt === 'pack_summary' && parsed.data?.pack_id) {
              state.setPackResult(parsed.data as unknown as PackResult);
            }
            appendLog(msg, level, evt || undefined, parsed.data?.node_id);
            if (evt === 'run_complete') {
              state.setStatus('completed'); state.setPendingApprovalId(null);
              void fetchLocalWorkerStatus(true); void fetchRunResult(nextRunId);
            }
            if (evt === 'run_error') {
              state.setStatus('error'); state.setPendingApprovalId(null);
              void fetchLocalWorkerStatus(true);
              if (msg.toLowerCase().includes('key')) { state.setSetupStatus(p => ({ ...p, connectionTested: false })); state.setShowSetupWizard(true); }
            }
            return;
          }
          appendLog(String(event.data), 'info', 'stream_raw');
        },
        onError: () => {
          if (streamRef.current === source) streamRef.current = null;
          appendLog('Stream disconnected. Syncing...', 'warn');
          void fetchLocalWorkerStatus(true);
          void (async () => {
            const synced = await fetchRunResult(nextRunId);
            if (synced) state.setStatus(synced as RunStatus);
            else state.setStatus(p => p === 'running' ? 'error' : p);
          })();
        },
        onClose: () => {
          if (streamRef.current === source) streamRef.current = null;
        },
      });
      streamRef.current = source;
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Autopilot failed.');
      state.setStatus('error'); state.setTopError(message); appendLog(message, 'error'); state.setShowSetupWizard(true);
    } finally {
      state.setIsChecking(false); state.setIsStarting(false);
    }
  }, [activeTenantId, activeWorkspaceId, appendLog, buildLocalExecutionGoal, closeStream, fetchDoctorChecks, fetchLocalWorkerStatus, fetchRunResult, fetchRuntimeMetrics, hasRuntimeProviderAccount, localExecutionDraft, state, streamRef]);

  return {
    appendLog,
    refreshSetupSession,
    createSetupSession,
    setupAction,
    cancelSetupSession,
    resumeSetupSession,
    fetchDoctorChecks,
    fetchRuntimeMetrics,
    fetchLocalWorkerStatus,
    refreshProviderCatalog,
    refreshProviderModels,
    hasRuntimeProviderAccount,
    loadWeeklySchedule,
    saveWeeklySchedule,
    refreshCredentials,
    refreshConnectors,
    saveConnector,
    testConnector,
    runRuntimeCheck,
    startServicesFromWeb,
    restartServicesFromWeb,
    runReadinessFromWeb,
    runReleaseStatusFromWeb,
    rebindTelegramFromWeb,
    getOpsDaemonStatusFromWeb,
    restartOpsDaemonFromWeb,
    getTelegramMediaStatusFromWeb,
    saveByokCredential,
    testConnection,
    continueGuidedSetup,
    closeStream,
    checkCompatibility,
    submitDecision,
    fetchRunResult,
    sendOperatorChat,
    startOperatorRun,
    startAutopilot,
  };
}

export const useOrionApi = usePlatformApi;
