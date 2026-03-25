'use client';

import { useCallback, MutableRefObject } from 'react';
import {
  DEFAULT_CONNECTOR_LABELS,
  DEFAULT_MODEL_ALIAS_OPTIONS,
  DEFAULT_CONNECTOR_OPTIONS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  WORKSPACE_ID,
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
import { resolveActiveSkills, resolveSkillsByIds } from '@/lib/skills';
import { BRAND } from '@/lib/brand';
import { API_BASE } from '@/lib/config';
import { getLocalExecutionCapabilityTitle, inferLocalExecutionCapabilityFromCommand } from '@/lib/localExecutionCapabilities';
import { buildRunStartedMessage, RUN_WAITING_STATUS_COPY } from '@/lib/runStartCopy';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';

export const ORION_API_URL = API_BASE;
export const ORION_FRONTEND_VERSION = '2026.2.26';
const SCREENSHOT_PATH_PATTERN = /\.(png|jpg|jpeg|webp)$/i;
const AGENT_CONFIG_STORAGE_KEY = 'empyralis.agents.profile-config.v1';

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

export function usePlatformApi(state: PageState, streamRef: MutableRefObject<EventSource | null>) {
  const {
    runtimeApiKey,
    setLogs,
    setSetupSession,
    setSetupSessionId,
    setupSessionId,
    setupSession,
    setSetupSessionBusy,
    setMetricsLoading,
    setRuntimeMetrics,
    setWorkersLoading,
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
    setSetupStatus,
    setIsCredentialsLoading,
    setIsConnectorsLoading,
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

  const buildHeaders = useCallback((withJson: boolean): HeadersInit => {
    const headers = new Headers();
    if (withJson) headers.set('Content-Type', 'application/json');
    const effectiveRuntimeApiKey = runtimeApiKey || readRuntimeApiKeyFromStorage('');
    if (effectiveRuntimeApiKey) headers.set('X-API-Key', effectiveRuntimeApiKey);
    return headers;
  }, [runtimeApiKey]);

  const appendLog = useCallback((message: string, level: LogLevel = 'info', event?: string, nodeId?: string) => {
    setLogs((prev) => [...prev, { ts: new Date().toISOString(), level, message, event, nodeId }]);
  }, [setLogs]);

  const refreshSetupSession = useCallback(async (sessionId: string) => {
    const res = await fetch(`${ORION_API_URL}/setup/sessions/${sessionId}`, { headers: buildHeaders(false) });
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
  }, [buildHeaders, setSetupSession, setSetupSessionId]);

  const createSetupSession = useCallback(async () => {
    const res = await fetch(`${ORION_API_URL}/setup/sessions`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, provider }),
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
  }, [buildHeaders, provider, setSetupSession, setSetupSessionId]);

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
        const res = await fetch(`${ORION_API_URL}/setup/sessions/${setupSessionId}/actions`, {
          method: 'POST',
          headers: buildHeaders(true),
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
    [appendLog, buildHeaders, setupSessionId, setSetupSessionBusy, setSetupSession],
  );

  const cancelSetupSession = useCallback(async () => {
    if (!setupSessionId) return;
    setSetupSessionBusy(true);
    try {
      const res = await fetch(`${ORION_API_URL}/setup/sessions/${setupSessionId}/cancel`, {
        method: 'POST',
        headers: buildHeaders(false),
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
  }, [appendLog, buildHeaders, setupSessionId, setSetupSessionBusy, setSetupSession]);

  const resumeSetupSession = useCallback(async () => {
    if (!setupSessionId) return;
    setSetupSessionBusy(true);
    try {
      const res = await fetch(`${ORION_API_URL}/setup/sessions/${setupSessionId}/resume`, {
        method: 'POST',
        headers: buildHeaders(false),
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
  }, [appendLog, buildHeaders, setupSessionId, setSetupSessionBusy, setSetupSession]);

  const fetchDoctorChecks = useCallback(async (): Promise<DoctorCheck[]> => {
    const doctorRes = await fetch(`${ORION_API_URL}/doctor`, { headers: buildHeaders(false) });
    if (!doctorRes.ok) {
      if (doctorRes.status === 401) {
        throw new Error('Invalid API key. Enter runtime key in Setup step 1 (Runtime access key).');
      }
      const text = await doctorRes.text().catch(() => '');
      throw new Error(text || 'System check failed.');
    }
    const doctorPayload = await doctorRes.json();
    return Array.isArray(doctorPayload?.checks) ? (doctorPayload.checks as DoctorCheck[]) : [];
  }, [buildHeaders]);

  const fetchRuntimeMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch(`${ORION_API_URL}/metrics`, { headers: buildHeaders(false) });
      if (!res.ok) return;
      const payload = await res.json();
      if (payload && typeof payload === 'object') {
        setRuntimeMetrics(payload as RuntimeMetrics);
      }
    } catch {
      // Ignore transient metrics failures in simple mode.
    } finally {
      setMetricsLoading(false);
    }
  }, [buildHeaders, setMetricsLoading, setRuntimeMetrics]);

  const fetchLocalWorkerStatus = useCallback(async (silent = false) => {
    if (!silent) setWorkersLoading(true);
    try {
      const res = await fetch(`${ORION_API_URL}/local/workers/status`, { headers: buildHeaders(false) });
      if (!res.ok) return;
      const payload = await res.json();
      if (payload && typeof payload === 'object') {
        setLocalWorkerStatus(payload as LocalWorkerStatus);
      }
    } catch {
      // Ignore transient worker-status failures.
    } finally {
      if (!silent) setWorkersLoading(false);
    }
  }, [buildHeaders, setWorkersLoading, setLocalWorkerStatus]);

  const refreshModelAliasCatalog = useCallback(async (): Promise<ModelAliasOption[]> => {
    try {
      const res = await fetch(`${ORION_API_URL}/providers/model-aliases`, { headers: buildHeaders(false) });
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
      if (mapped.length > 0) {
        setModelAliases(mapped);
        return mapped;
      }
    } catch {
      // Keep fallback aliases when the catalog endpoint is unavailable.
    }
    return modelAliases.length > 0 ? modelAliases : DEFAULT_MODEL_ALIAS_OPTIONS;
  }, [buildHeaders, modelAliases, setModelAliases]);

  const refreshProviderCatalog = useCallback(async () => {
    try {
      const aliases = await refreshModelAliasCatalog();
      const res = await fetch(`${ORION_API_URL}/providers`, { headers: buildHeaders(false) });
      if (!res.ok) return;
      const payload = await res.json();
      const items = Array.isArray(payload?.providers) ? payload.providers : [];
      const mapped: ProviderOption[] = items
        .map((item: unknown) => {
          const i = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; auth_modes?: unknown; default_auth_mode?: unknown };
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
          } as ProviderOption;
        })
        .filter((item: ProviderOption | null): item is ProviderOption => item !== null);
      if (mapped.length > 0) {
        setProviderOptions(mapped);
      }
    } catch {
      // Keep defaults when catalog cannot be fetched.
    }
  }, [buildHeaders, refreshModelAliasCatalog, setProviderOptions]);

  const refreshProviderModels = useCallback(
    async (providerId: ProviderId, credentialForProvider?: string) => {
      const aliases = modelAliases.length > 0 ? modelAliases : await refreshModelAliasCatalog();
      const fallbackOption =
        providerOptions.find((item) => item.id === providerId) ||
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

      setModelsLoading(true);
      try {
        const search = new URLSearchParams({ workspace_id: WORKSPACE_ID });
        if (credentialForProvider) {
          search.set('credential_id', credentialForProvider);
        }
        const res = await fetch(`${ORION_API_URL}/providers/${providerId}/models?${search.toString()}`, {
          headers: buildHeaders(false),
        });
        if (!res.ok) {
          setModelOptions(fallbackModels);
          setModel((prev) => resolveSelectedModel(prev, fallbackModels));
          return;
        }
        const payload = await res.json();
        const rawModels = Array.isArray(payload?.models) ? payload.models : [];
        const models = rawModels
          .filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 120);
        const nextModels =
          models.length > 0
            ? mapModelOptionsToAliases(providerId, models, aliases)
            : fallbackModels;
        setModelOptions(nextModels);
        setModel((prev) => resolveSelectedModel(prev, nextModels));
      } catch {
        setModelOptions(fallbackModels);
        setModel((prev) => resolveSelectedModel(prev, fallbackModels));
      } finally {
        setModelsLoading(false);
      }
    },
    [buildHeaders, connectionMode, modelAliases, providerOptions, refreshModelAliasCatalog, setModelsLoading, setModelOptions, setModel],
  );

  const buildScheduledRunRequest = useCallback(() => {
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

    const activeSkills = resolveActiveSkills('automationDefaults');

    return {
      engine: 'orion',
      workflow_id: undefined,
      workspace_id: WORKSPACE_ID,
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
    inboxInput,
    leadsInput,
    slotsInput,
  ]);

  const loadWeeklySchedule = useCallback(async () => {
    setWeeklyScheduleBusy('load');
    try {
      const res = await fetch(`${ORION_API_URL}/schedules/weekly?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
        headers: buildHeaders(false),
      });
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
  }, [buildHeaders, setWeeklyScheduleBusy, setWeeklyScheduleId, setWeeklyScheduleStatusText, setWeeklyAutopilotEnabled, setWeeklyAutopilotDay, setWeeklyAutopilotTime, setWeeklyAutopilotTimezone]);

  const saveWeeklySchedule = useCallback(async () => {
    setWeeklyScheduleBusy('save');
    try {
      if (!weeklyAutopilotEnabled && !weeklyScheduleId) {
        setWeeklyScheduleStatusText('Weekly autopilot is disabled.');
        return;
      }
      if (!weeklyAutopilotEnabled && weeklyScheduleId) {
        const disableRes = await fetch(`${ORION_API_URL}/schedules/weekly/${weeklyScheduleId}`, {
          method: 'PATCH',
          headers: buildHeaders(true),
          body: JSON.stringify({ enabled: false }),
        });
        if (!disableRes.ok) {
          throw new Error(await readResponseMessage(disableRes, 'Failed to disable weekly schedule.'));
        }
        setWeeklyScheduleStatusText('Weekly autopilot disabled on server.');
        return;
      }

      const runRequest = buildScheduledRunRequest();
      if (weeklyScheduleId) {
        const patchRes = await fetch(`${ORION_API_URL}/schedules/weekly/${weeklyScheduleId}`, {
          method: 'PATCH',
          headers: buildHeaders(true),
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
        const createRes = await fetch(`${ORION_API_URL}/schedules/weekly`, {
          method: 'POST',
          headers: buildHeaders(true),
          body: JSON.stringify({
            name: 'Autopilot Weekly Schedule',
            workspace_id: WORKSPACE_ID,
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
    buildHeaders,
    buildScheduledRunRequest,
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
      const res = await fetch(`${ORION_API_URL}/credentials/vault?workspace_id=default`, { headers: buildHeaders(false) });
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
      setSetupStatus((prev) => ({ ...prev, accountConnected: matches.length > 0 }));
    } catch (error: unknown) {
      setTopError(humanizeError(error instanceof Error ? error.message : 'Unable to load connected accounts.'));
    } finally {
      setIsCredentialsLoading(false);
    }
  }, [buildHeaders, credentialId, provider, setIsCredentialsLoading, setCredentials, setCredentialId, setSetupStatus, setTopError]);

  const refreshConnectors = useCallback(async () => {
    setIsConnectorsLoading(true);
    try {
      const res = await fetch(`${ORION_API_URL}/connectors/vault?workspace_id=default`, { headers: buildHeaders(false) });
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
  }, [buildHeaders, connectorCredentialId, setIsConnectorsLoading, setConnectorCredentials, setConnectorCredentialId, setConnectorType, setTopError]);

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
      const res = await fetch(`${ORION_API_URL}/connectors/vault`, {
        method: 'POST',
        headers: buildHeaders(true),
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
    buildHeaders,
    connectorLabel,
    connectorType,
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
      const res = await fetch(`${ORION_API_URL}/connectors/vault/${connectorCredentialId}/test?workspace_id=default`, {
        method: 'POST',
        headers: buildHeaders(false),
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
  }, [appendLog, buildHeaders, connectorCredentialId, setSetupBusy, setTopError]);

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
      const openaiWarn = checks.find((check) => check.name === 'openai_connectivity' && check.status === 'warn');
      if (openaiWarn && connectionMode === 'managed') {
        throw new Error('OpenAI connection is not ready. Choose "Use my own key" or reconnect OpenAI in Setup.');
      }
      setSetupStatus((prev) => ({
        ...prev,
        runtimeReady: true,
        accountConnected:
          connectionMode === 'managed' || connectionMode === 'local_companion'
            ? true
            : prev.accountConnected,
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
  }, [appendLog, connectionMode, fetchDoctorChecks, provider, setupAction, setSetupBusy, setTopError, setSetupStatus, setShowSetupWizard]);

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
      const res = await fetch('/api/local-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          runtimeKey: runtimeApiKey,
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
    [runtimeApiKey],
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
          ? { api_key: secret, access_token: secret, oauth_token: secret }
          : { api_key: secret, auth_mode: selectedAuthMode };
      const res = await fetch(`${ORION_API_URL}/credentials/vault`, {
        method: 'POST',
        headers: buildHeaders(true),
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
    buildHeaders,
    credentialLabel,
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
        const openaiWarn = checks.find((check) => check.name === 'openai_connectivity' && check.status === 'warn');
        const failCheck = checks.find((check) => check.status === 'fail');
        if (failCheck) {
          const problem = [failCheck.detail || 'System setup failed.', failCheck.recommendation || ''].filter(Boolean).join(' ');
          throw new Error(problem);
        }
        if (openaiWarn) {
          throw new Error('OpenAI managed connection is not ready yet.');
        }
      } else if (connectionMode === 'byok') {
        if (!credentialId) throw new Error('Choose a saved account first.');
        const res = await fetch(`${ORION_API_URL}/credentials/vault/${credentialId}/test?workspace_id=default`, {
          method: 'POST',
          headers: buildHeaders(false),
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
        window.location.assign('/workspace?onboarding=tool-connected');
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
    buildHeaders,
    connectionMode,
    credentialId,
    fetchDoctorChecks,
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
      const res = await fetch(`${ORION_API_URL}/health`, { headers: buildHeaders(false) });
      if (!res.ok) return;
      const payload = await res.json();
      const minFrontend = payload?.runtime_api_min_cli_version;
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
  }, [buildHeaders, setTopError]);

  const submitDecision = useCallback(async (decision: 'Proceed' | 'Hold') => {
    if (!state.runId) return;
    try {
      const useApprovalEndpoint = Boolean(state.pendingApprovalId);
      const decisionUrl = useApprovalEndpoint
        ? `${ORION_API_URL}/runs/${state.runId}/approvals/${encodeURIComponent(state.pendingApprovalId || '')}/resolve`
        : `${ORION_API_URL}/runs/${state.runId}/decision`;
      const body = useApprovalEndpoint
        ? { decision, note: `Resolved from ${BRAND.product} web UI` }
        : { decision };
      const res = await fetch(decisionUrl, {
        method: 'POST',
        headers: buildHeaders(true),
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
  }, [appendLog, buildHeaders, fetchLocalWorkerStatus, fetchRuntimeMetrics, state]);

  const fetchRunResult = useCallback(async (targetRunId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${ORION_API_URL}/runs/${targetRunId}`, { headers: buildHeaders(false) });
      if (!res.ok) return null;
      const payload = await res.json();
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
      if (runStatus === 'running' || runStatus === 'running_local' || runStatus === 'starting') return 'running';
      return null;
    } catch {
      return null;
    }
  }, [buildHeaders, fetchLocalWorkerStatus, fetchRuntimeMetrics, state]);

  const buildLocalExecutionGoal = useCallback((draft: LocalExecutionDraft): string => {
    const operations = Array.isArray(draft.operations) ? draft.operations : [];
    if (operations.length === 0) return 'Run a local execution plan.';
    const labels = operations.slice(0, 3).map((operation) => describeLocalExecutionOperation(operation));
    const suffix = operations.length > 3 ? ` +${operations.length - 3} more` : '';
    return `Run local execution plan: ${labels.join(' · ')}${suffix}`;
  }, []);

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
      const openaiWarn = checks.find((check) => check.name === 'openai_connectivity' && check.status === 'warn');
      const selectedPreset = BUSINESS_PRESETS.find((p) => p.id === state.selectedPresetId) || BUSINESS_PRESETS[0];
      if (openaiWarn && state.provider === 'openai' && state.connectionMode === 'managed' && !localDeterministicPack) {
        throw new Error('OpenAI connection is not ready. Open Setup and reconnect your AI account.');
      }
      state.setIsChecking(false);

      const effectiveTrustMode: TrustMode = state.guidedDefaultsEnabled ? 'guarded' : state.trustMode;
      const agentSkills = resolveAgentProfileSkills(effectiveAgentRole);
      const activeSkills = agentSkills.skills.length > 0 ? agentSkills : resolveActiveSkills('automationDefaults');
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

      const runRes = await fetch(`${ORION_API_URL}/runs/start`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          engine: 'orion',
          user_goal: effectiveGoal.trim(),
          agent_role: effectiveAgentRole,
          provider: state.provider,
          model: state.model,
          credential_id: state.connectionMode === 'byok' ? state.credentialId : undefined,
          metadata: {
            trust_mode: effectiveTrustMode,
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
        }),
      });

      if (!runRes.ok) {
        if (runRes.status === 401) throw new Error('Invalid API key.');
        throw new Error(await readResponseMessage(runRes, 'Failed to start autopilot.'));
      }

      const runPayload = await runRes.json();
      const nextRunId = runPayload?.run_id;
      if (!nextRunId) throw new Error('Run ID missing.');

      const route = runPayload?.route;
      if (route && typeof route === 'object') {
        state.setLastRouteInfo(route);
        if (route.selected === 'local_companion') state.setStatus('queued_local');
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
      upsertSeededRuntimeRun({
        run_id: nextRunId,
        status: 'running',
        workflow_name: selectedPack.label,
        user_goal: effectiveGoal.trim(),
        created_at: new Date().toISOString(),
        agent_role: effectiveAgentRole,
        triggered_by: 'Direct',
        active_profile_id: typeof runPayload?.active_profile_id === 'string' ? runPayload.active_profile_id : null,
        active_profile_label: typeof runPayload?.active_profile_label === 'string' ? runPayload.active_profile_label : null,
        active_profile_provider:
          typeof runPayload?.active_profile_provider === 'string' ? runPayload.active_profile_provider : state.provider,
        active_profile_model:
          typeof runPayload?.active_profile_model === 'string' ? runPayload.active_profile_model : state.model,
        execution_target_selected:
          route && typeof route.selected === 'string'
            ? route.selected
            : selectedPack.id === 'local-execution-v1'
              ? 'local_companion'
              : state.connectionMode === 'local_companion'
                ? 'local_companion'
                : 'auto',
      });
      appendLog(
        buildRunStartedMessage(
          typeof runPayload?.active_profile_label === 'string' ? runPayload.active_profile_label : null,
          typeof runPayload?.active_profile_provider === 'string' ? runPayload.active_profile_provider : state.provider,
          typeof runPayload?.active_profile_model === 'string' ? runPayload.active_profile_model : state.model,
        ),
      );
      void fetchLocalWorkerStatus(true);
      void fetchRuntimeMetrics();
      state.setSetupStatus((prev) => ({ ...prev, runtimeReady: true, accountConnected: true, connectionTested: true }));

      const effectiveRuntimeApiKey = state.runtimeApiKey || readRuntimeApiKeyFromStorage('');
      const streamUrl = effectiveRuntimeApiKey
        ? `${ORION_API_URL}/runs/${nextRunId}/stream?api_key=${encodeURIComponent(effectiveRuntimeApiKey)}`
        : `${ORION_API_URL}/runs/${nextRunId}/stream`;
      const source = new EventSource(streamUrl);
      streamRef.current = source;

      source.addEventListener('log', (event: MessageEvent) => {
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
          }
          if (evt === 'approval_required') state.setStatus('waiting');
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
      });

      source.addEventListener('pause', () => { state.setStatus('waiting'); appendLog(RUN_WAITING_STATUS_COPY, 'warn'); });
      source.onerror = () => {
        source.close(); streamRef.current = null;
        appendLog('Stream disconnected. Syncing...', 'warn');
        void fetchLocalWorkerStatus(true);
        void (async () => {
          const synced = await fetchRunResult(nextRunId);
          if (synced) state.setStatus(synced as RunStatus);
          else state.setStatus(p => p === 'running' ? 'error' : p);
        })();
      };
    } catch (error: unknown) {
      const message = humanizeError(error instanceof Error ? error.message : 'Autopilot failed.');
      state.setStatus('error'); state.setTopError(message); appendLog(message, 'error'); state.setShowSetupWizard(true);
    } finally {
      state.setIsChecking(false); state.setIsStarting(false);
    }
  }, [appendLog, buildHeaders, buildLocalExecutionGoal, closeStream, fetchDoctorChecks, fetchLocalWorkerStatus, fetchRunResult, fetchRuntimeMetrics, localExecutionDraft, state, streamRef]);

  return {
    appendLog,
    buildHeaders,
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
    startAutopilot,
  };
}

export const useOrionApi = usePlatformApi;
