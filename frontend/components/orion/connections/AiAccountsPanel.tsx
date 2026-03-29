'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ChevronDown,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_MODEL_ALIAS_OPTIONS,
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  getProviderAuthModes,
  isProviderId,
  mapModelOptionsToAliases,
  normalizeProviderId,
  resolveModelAlias,
  type ModelAliasOption,
  type ProviderId,
  type ProviderOption,
} from '@/app/page.catalog';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { getDesktopBridge, type OpenAiCodexOauthResult } from '@/lib/desktopBridge';

type ProviderCredentialRow = {
  id: string;
  label: string;
  provider: ProviderId;
  metadata?: Record<string, unknown>;
  authMode?: string;
  created_at?: string;
  updated_at?: string;
};

type ProviderProfileRow = {
  id: string;
  provider: ProviderId;
  label: string;
  credential_id?: string | null;
  auth_mode?: string | null;
  workspace_id?: string | null;
  priority?: number;
  enabled: boolean;
  model?: string | null;
  health?: string | null;
  cooldown_until?: string | null;
  last_error?: string | null;
  last_used_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  success_count?: number;
  failure_count?: number;
  created_at?: string;
  updated_at?: string;
};

type ProviderProfilesHealth = {
  healthy: number;
  cooldown: number;
  disabled: number;
  total: number;
};

type RuntimeAvailabilityItem = {
  provider: ProviderId;
  label: string;
  ready: boolean;
  status: 'ready' | 'attention';
  source: string;
  source_label: string;
  detail: string;
  profile_count: number;
};

type LocalOpenAiAuthStatus = {
  available: boolean;
  importable: boolean;
  auth_file_exists: boolean;
  auth_file_path?: string;
  auth_mode?: string | null;
  has_access_token: boolean;
  has_api_key: boolean;
  sign_in_url?: string;
  detail?: string;
};

type ProviderAccountFormState = {
  provider: ProviderId;
  label: string;
  authMode: string;
  secret: string;
  projectId: string;
  location: string;
  model: string;
  enableRuntime: boolean;
};

type AiAccountsPanelProps = {
  workspaceId: string;
  mode?: 'manage' | 'connect';
  returnTo?: string;
};

type ClaudeAuthStatus = {
  ok?: boolean;
  available?: boolean;
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
  message?: string;
};

type ProviderCardState = {
  provider: ProviderId;
  label: string;
  credential: ProviderCredentialRow | null;
  profile: ProviderProfileRow | null;
  availability: RuntimeAvailabilityItem | null;
  order: number | null;
  isDefaultProfile: boolean;
  isActiveProfile: boolean;
  enabled: boolean;
  errorMessage: string | null;
};

const DEFAULT_PROVIDER_FORM: ProviderAccountFormState = {
  provider: 'anthropic',
  label: 'My Claude Subscription',
  authMode: 'local_cli',
  secret: '',
  projectId: '',
  location: 'us-central1',
  model: 'claude-sonnet',
  enableRuntime: true,
};

function formatDate(value?: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function normalizeProvidersError(message?: string | null): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (
    !normalized ||
    lowered === 'failed to fetch' ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed') ||
    lowered.includes('aborted') ||
    lowered.includes('timed out')
  ) {
    return 'Unable to reach the local control plane. Start Empyralis services, then try again.';
  }
  return normalized;
}

function providerOptionFor(provider: ProviderId, options: ProviderOption[]): ProviderOption {
  return options.find((item) => item.id === provider)
    || DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider)
    || DEFAULT_PROVIDER_OPTIONS[0];
}

function providerLabel(provider: ProviderId, options: ProviderOption[]): string {
  return providerOptionFor(provider, options).label || provider;
}

function providerAuthModeLabel(provider: ProviderId, authMode: string | undefined, options: ProviderOption[]): string {
  const resolved = String(authMode || '').trim().toLowerCase();
  const item = getProviderAuthModes(providerOptionFor(provider, options)).find((entry) => entry.id === resolved);
  if (item?.label) return item.label;
  if (resolved === 'local_cli') return 'Claude Subscription';
  if (resolved === 'oauth_token') return 'Saved OpenAI / Codex token';
  if (resolved === 'api_key') return 'API Key';
  if (resolved === 'access_token') return provider === 'vertex' ? 'Vertex access token' : 'OpenAI access token';
  return resolved || 'Default';
}

function defaultProviderModel(provider: ProviderId, authMode: string, options: ProviderOption[]): string {
  if (provider === 'anthropic' && authMode === 'local_cli') {
    return providerOptionFor('anthropic', options).defaultModel || DEFAULT_PROVIDER_MODELS.anthropic[0] || 'claude-sonnet';
  }
  const fallback = providerOptionFor(provider, options).defaultModel;
  return fallback || DEFAULT_PROVIDER_MODELS[provider]?.[0] || '';
}

function defaultProviderLabel(provider: ProviderId, authMode: string): string {
  if (provider === 'anthropic' && authMode === 'local_cli') return DEFAULT_PROVIDER_LABELS.claude_code_cli;
  return DEFAULT_PROVIDER_LABELS[provider] || 'AI Account';
}

function knownProviderId(value?: unknown): ProviderId | null {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'claude_code_cli') return 'anthropic';
  return isProviderId(raw) ? raw : null;
}

function parseModelAliasCatalog(items: unknown[]): ModelAliasOption[] {
  return items
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
      const provider = normalizeProviderId(rawProvider);
      const alias = typeof value.alias === 'string' ? value.alias.trim() : '';
      const model = typeof value.model === 'string' ? value.model.trim() : '';
      const resolvedModel = typeof value.resolved_model === 'string' ? value.resolved_model.trim() : '';
      if (!rawProvider || !alias || !model || !resolvedModel) return null;
      return {
        alias,
        provider,
        model,
        resolvedModel,
        isGlobalDefault: Boolean(value.is_global_default),
        isProviderDefault: Boolean(value.is_provider_default),
      } satisfies ModelAliasOption;
    })
    .filter((item: ModelAliasOption | null): item is ModelAliasOption => item !== null);
}

function buildProviderCredentialPayload(state: ProviderAccountFormState): Record<string, unknown> {
  if (state.provider === 'anthropic') {
    if (state.authMode === 'local_cli') return { auth_mode: 'local_cli' };
    return { api_key: state.secret.trim(), auth_mode: state.authMode || 'api_key' };
  }
  if (state.provider === 'gemini') {
    return { api_key: state.secret.trim(), auth_mode: state.authMode || 'api_key' };
  }
  if (state.provider === 'vertex') {
    return {
      access_token: state.secret.trim(),
      project_id: state.projectId.trim(),
      location: state.location.trim() || 'us-central1',
      auth_mode: state.authMode || 'access_token',
    };
  }
  const token = state.secret.trim();
  if (state.authMode === 'access_token') {
    return { access_token: token, auth_mode: 'access_token' };
  }
  if (state.authMode === 'oauth_token') {
    return { oauth_token: token, auth_mode: 'oauth_token' };
  }
  return { api_key: token, auth_mode: 'api_key' };
}

function providerSetupGuidance(provider: ProviderId, authMode: string, option: ProviderOption): string {
  if (provider === 'openai') {
    if (authMode === 'oauth_token') {
      return 'Paste a saved OpenAI token you already control, or use Sign in with ChatGPT above.';
    }
    if (authMode === 'access_token') {
      return 'Paste a direct OpenAI access token. Use this only if your organization issues access tokens instead of API keys.';
    }
    return option.note || 'Use a direct OpenAI API key. Empyralis does not route your requests through third-party model gateways.';
  }
  if (provider === 'anthropic' && authMode === 'local_cli') {
    return option.note || 'Use the Claude subscription already signed into the local Claude CLI on this machine.';
  }
  return option.note || 'Use direct provider credentials only.';
}

function providerAccountContextLine(item: ProviderCredentialRow): string {
  if (item.provider === 'anthropic' && item.authMode === 'local_cli') {
    return 'Uses the local Claude subscription already signed into the `claude` CLI on this Mac.';
  }
  if (item.provider === 'vertex') {
    const projectId = String(item.metadata?.project_id || '').trim();
    const location = String(item.metadata?.location || '').trim();
    return [projectId ? `Project ${projectId}` : '', location ? `Region ${location}` : '']
      .filter(Boolean)
      .join(' • ') || 'Saved access token for Vertex AI.';
  }
  return 'Saved in the encrypted Empyralis vault for this workspace.';
}

function openAiCodexCredentialLabel(result: OpenAiCodexOauthResult): string {
  const email = String(result.email || '').trim();
  return email ? `ChatGPT / Codex (${email})` : 'ChatGPT / Codex';
}

function profileTone(profile: ProviderProfileRow | null): CSSProperties {
  if (!profile) {
    return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
  }
  if (profile.health === 'cooldown') {
    return { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
  }
  if (profile.enabled) {
    return { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
}

function profileStatusLabel(profile: ProviderProfileRow | null, mode: 'manage' | 'connect'): string {
  if (!profile) return 'Vault only';
  if (profile.health === 'cooldown') return 'Cooldown';
  if (mode === 'connect') return profile.enabled ? 'Ready' : 'Saved only';
  return profile.enabled ? 'Enabled for runtime' : 'Disabled';
}

function claudeAuthTone(loggedIn: boolean): CSSProperties {
  return loggedIn
    ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
    : { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
}

function sortProviderProfiles(left: ProviderProfileRow, right: ProviderProfileRow): number {
  const leftPriority = typeof left.priority === 'number' ? left.priority : 100;
  const rightPriority = typeof right.priority === 'number' ? right.priority : 100;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const leftCreated = String(left.created_at || '');
  const rightCreated = String(right.created_at || '');
  if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);
  return String(left.id || '').localeCompare(String(right.id || ''));
}

function normalizeClaudeCliError(message: string): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (lowered.includes('not logged in') || lowered.includes('/login')) {
    return 'Claude is not signed in on this machine yet. Use Sign in to Claude in the add-account dialog, then refresh status.';
  }
  return normalized;
}

function providerAccentStyles(provider: ProviderId): { border: string; soft: string; tint: string } {
  if (provider === 'openai') {
    return { border: 'var(--tone-accent)', soft: 'color-mix(in srgb, var(--tone-accent) 16%, transparent)', tint: 'color-mix(in srgb, var(--tone-accent) 6%, var(--bg-surface))' };
  }
  if (provider === 'anthropic') {
    return { border: 'var(--tone-warning)', soft: 'color-mix(in srgb, var(--tone-warning) 16%, transparent)', tint: 'color-mix(in srgb, var(--tone-warning) 7%, var(--bg-surface))' };
  }
  if (provider === 'gemini') {
    return { border: 'var(--tone-success)', soft: 'color-mix(in srgb, var(--tone-success) 16%, transparent)', tint: 'color-mix(in srgb, var(--tone-success) 7%, var(--bg-surface))' };
  }
  return { border: 'var(--tone-accent)', soft: 'color-mix(in srgb, var(--tone-accent) 14%, transparent)', tint: 'color-mix(in srgb, var(--tone-accent) 5%, var(--bg-surface))' };
}

function summarizeProviderCardError(message: string | null): string | null {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= 76) return normalized;
  return `${normalized.slice(0, 75).trimEnd()}…`;
}

const secondaryProviderActionButtonStyle: CSSProperties = {
  minHeight: 30,
  paddingInline: 10,
  width: 'fit-content',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  textDecoration: 'none',
};

export default function AiAccountsPanel({ workspaceId, mode = 'manage', returnTo = '/' }: AiAccountsPanelProps) {
  const router = useRouter();
  const openAiDesktopBridge = getDesktopBridge();
  const openAiDesktopSignInAvailable = Boolean(openAiDesktopBridge?.openaiCodexOauthLogin);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(DEFAULT_PROVIDER_OPTIONS);
  const [modelAliases, setModelAliases] = useState<ModelAliasOption[]>(DEFAULT_MODEL_ALIAS_OPTIONS);
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentialRow[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRow[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderProfilesHealth>({ healthy: 0, cooldown: 0, disabled: 0, total: 0 });
  const [runtimeAvailability, setRuntimeAvailability] = useState<RuntimeAvailabilityItem[]>([]);
  const [localOpenAiAuth, setLocalOpenAiAuth] = useState<LocalOpenAiAuthStatus | null>(null);
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState('');
  const [providerNotice, setProviderNotice] = useState('');
  const [lastConnectedAccountLabel, setLastConnectedAccountLabel] = useState('');
  const [providerBusy, setProviderBusy] = useState<Record<string, string>>({});
  const [providerDetailsOpen, setProviderDetailsOpen] = useState<Record<string, boolean>>({});
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderAccountFormState>(DEFAULT_PROVIDER_FORM);
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<ClaudeAuthStatus | null>(null);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const selectedProviderOption = useMemo(
    () => providerOptionFor(providerForm.provider, providerOptions),
    [providerForm.provider, providerOptions],
  );
  const selectedProviderAuthModes = useMemo(
    () => getProviderAuthModes(selectedProviderOption),
    [selectedProviderOption],
  );
  const effectiveModelAliases = useMemo(
    () => (modelAliases.length > 0 ? modelAliases : DEFAULT_MODEL_ALIAS_OPTIONS),
    [modelAliases],
  );
  const usesClaudeLocalCli = providerForm.provider === 'anthropic' && providerForm.authMode === 'local_cli';
  const groupedModelAliases = useMemo(() => {
    return providerOptions
      .map((option) => ({
        provider: option.id,
        label: option.label,
        items: effectiveModelAliases
          .filter((item) => item.provider === option.id)
          .sort((left, right) => {
            if (left.isProviderDefault !== right.isProviderDefault) return left.isProviderDefault ? -1 : 1;
            if (left.isGlobalDefault !== right.isGlobalDefault) return left.isGlobalDefault ? -1 : 1;
            return left.alias.localeCompare(right.alias);
          }),
      }))
      .filter((group) => group.items.length > 0);
  }, [effectiveModelAliases, providerOptions]);

  const providerProfilesByCredential = useMemo(() => {
    const map = new Map<string, ProviderProfileRow[]>();
    for (const profile of providerProfiles) {
      const credentialId = String(profile.credential_id || '').trim();
      if (!credentialId) continue;
      const bucket = map.get(credentialId) || [];
      bucket.push(profile);
      map.set(credentialId, bucket);
    }
    return map;
  }, [providerProfiles]);

  const orphanProviderProfiles = useMemo(() => {
    const credentialIds = new Set(providerCredentials.map((item) => item.id));
    return providerProfiles.filter((profile) => {
      const credentialId = String(profile.credential_id || '').trim();
      return !credentialId || !credentialIds.has(credentialId);
    });
  }, [providerCredentials, providerProfiles]);

  const runtimeProfileGroups = useMemo(() => {
    const orphanIds = new Set(orphanProviderProfiles.map((item) => item.id));
    const groups = new Map<ProviderId, ProviderProfileRow[]>();
    for (const profile of providerProfiles) {
      if (orphanIds.has(profile.id)) continue;
      const bucket = groups.get(profile.provider) || [];
      bucket.push(profile);
      groups.set(profile.provider, bucket);
    }
    return Array.from(groups.entries())
      .map(([providerId, items]) => ({
        provider: providerId,
        label: providerLabel(providerId, providerOptions),
        items: [...items].sort(sortProviderProfiles),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [orphanProviderProfiles, providerOptions, providerProfiles]);
  const openAiHasApiKeyCredential = useMemo(
    () => providerCredentials.some((credential) => credential.provider === 'openai' && String(credential.authMode || '').trim().toLowerCase() === 'api_key'),
    [providerCredentials],
  );

  const profileOrderById = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of runtimeProfileGroups) {
      group.items.forEach((profile, index) => {
        map.set(profile.id, index + 1);
      });
    }
    return map;
  }, [runtimeProfileGroups]);

  const defaultProfileIdByProvider = useMemo(() => {
    const map = new Map<ProviderId, string>();
    for (const group of runtimeProfileGroups) {
      if (group.items[0]?.id) {
        map.set(group.provider, group.items[0].id);
      }
    }
    return map;
  }, [runtimeProfileGroups]);

  const activeProfileIdByProvider = useMemo(() => {
    const map = new Map<ProviderId, string>();
    for (const group of runtimeProfileGroups) {
      const active = group.items.find((item) => item.enabled && item.health !== 'cooldown') || null;
      if (active?.id) {
        map.set(group.provider, active.id);
      }
    }
    return map;
  }, [runtimeProfileGroups]);

  const credentialLabelById = useMemo(() => {
    return new Map(providerCredentials.map((item) => [item.id, item.label]));
  }, [providerCredentials]);

  const runtimeAvailabilityByProvider = useMemo(() => {
    return new Map(runtimeAvailability.map((item) => [item.provider, item]));
  }, [runtimeAvailability]);

  const providerCards = useMemo<ProviderCardState[]>(() => {
    return providerOptions.map((option) => {
      const credentials = providerCredentials.filter((item) => item.provider === option.id);
      const profiles = runtimeProfileGroups.find((group) => group.provider === option.id)?.items || [];
      const profile = profiles.find((item) => item.enabled && item.health !== 'cooldown') || profiles[0] || null;
      const credential = profile?.credential_id
        ? credentials.find((item) => item.id === profile.credential_id) || credentials[0] || null
        : credentials[0] || null;
      const availability = runtimeAvailabilityByProvider.get(option.id) || null;
      const errorMessage = String(profile?.last_error || '').trim()
        || (profile && availability?.status === 'attention' ? String(availability.detail || '').trim() : '')
        || null;
      return {
        provider: option.id,
        label: option.label,
        credential,
        profile,
        availability,
        order: profile ? profileOrderById.get(profile.id) || null : null,
        isDefaultProfile: profile ? defaultProfileIdByProvider.get(option.id) === profile.id : false,
        isActiveProfile: profile ? activeProfileIdByProvider.get(option.id) === profile.id : false,
        enabled: Boolean(profile?.enabled),
        errorMessage,
      };
    });
  }, [
    activeProfileIdByProvider,
    defaultProfileIdByProvider,
    profileOrderById,
    providerCredentials,
    providerOptions,
    runtimeAvailabilityByProvider,
    runtimeProfileGroups,
  ]);
  const hasProviderCardError = useMemo(
    () => providerCards.some((card) => Boolean(String(card.errorMessage || '').trim())),
    [providerCards],
  );
  const readyProviderCard = useMemo(
    () => providerCards.find((card) => card.enabled && !String(card.errorMessage || '').trim()) || null,
    [providerCards],
  );

  const connectMode = mode === 'connect';

  useEffect(() => {
    if (!providerLoading) {
      setProviderDetailsOpen({});
    }
  }, [providerLoading]);

  const setProviderActionBusy = useCallback((id: string, action: string | null) => {
    setProviderBusy((prev) => {
      const next = { ...prev };
      if (!action) delete next[id];
      else next[id] = action;
      return next;
    });
  }, []);

  const resetProviderForm = useCallback((nextProvider: ProviderId = 'anthropic', nextAuthMode = 'local_cli') => {
    setProviderForm({
      provider: nextProvider,
      label: defaultProviderLabel(nextProvider, nextAuthMode),
      authMode: nextAuthMode,
      secret: '',
      projectId: '',
      location: 'us-central1',
      model: defaultProviderModel(nextProvider, nextAuthMode, providerOptions),
      enableRuntime: true,
    });
  }, [providerOptions]);

  const openOpenAiApiKeyForm = useCallback(() => {
    resetProviderForm('openai', 'api_key');
    setProviderForm((prev) => ({
      ...prev,
      provider: 'openai',
      authMode: 'api_key',
      label: defaultProviderLabel('openai', 'api_key'),
      model: defaultProviderModel('openai', 'api_key', providerOptions),
      secret: '',
    }));
    setShowProviderForm(true);
  }, [providerOptions, resetProviderForm]);

  const openGeminiApiKeyForm = useCallback(() => {
    resetProviderForm('gemini', 'api_key');
    setProviderForm((prev) => ({
      ...prev,
      provider: 'gemini',
      authMode: 'api_key',
      label: defaultProviderLabel('gemini', 'api_key'),
      model: defaultProviderModel('gemini', 'api_key', providerOptions),
      secret: '',
    }));
    setShowProviderForm(true);
  }, [providerOptions, resetProviderForm]);

  const openVertexCredentialsForm = useCallback(() => {
    resetProviderForm('vertex', 'access_token');
    setProviderForm((prev) => ({
      ...prev,
      provider: 'vertex',
      authMode: 'access_token',
      label: defaultProviderLabel('vertex', 'access_token'),
      model: defaultProviderModel('vertex', 'access_token', providerOptions),
      secret: '',
      projectId: '',
      location: 'us-central1',
    }));
    setShowProviderForm(true);
  }, [providerOptions, resetProviderForm]);

  const loadProviderAccounts = useCallback(async () => {
    setProviderLoading(true);
    setProviderError('');
    setProviderNotice('');
    try {
      const [providersRes, modelAliasesRes, credentialsRes, profilesRes, runtimeAvailabilityRes] = await Promise.all([
        controlPlaneFetch('/api/control-plane/providers'),
        controlPlaneFetch('/api/control-plane/providers/model-aliases'),
        controlPlaneFetch(`/api/control-plane/credentials?workspace_id=${encodeURIComponent(workspaceId)}`),
        controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(workspaceId)}`),
        controlPlaneFetch(`/api/control-plane/providers/runtime-availability?workspace_id=${encodeURIComponent(workspaceId)}`),
      ]);

      const providersRaw = await providersRes.text().catch(() => '');
      const modelAliasesRaw = await modelAliasesRes.text().catch(() => '');
      const credentialsRaw = await credentialsRes.text().catch(() => '');
      const profilesRaw = await profilesRes.text().catch(() => '');
      const runtimeAvailabilityRaw = await runtimeAvailabilityRes.text().catch(() => '');
      const providersBody = providersRaw ? JSON.parse(providersRaw) : {};
      const modelAliasesBody = modelAliasesRaw ? JSON.parse(modelAliasesRaw) : {};
      const credentialsBody = credentialsRaw ? JSON.parse(credentialsRaw) : {};
      const profilesBody = profilesRaw ? JSON.parse(profilesRaw) : {};
      const runtimeAvailabilityBody = runtimeAvailabilityRaw ? JSON.parse(runtimeAvailabilityRaw) : {};
      const nextModelAliases = modelAliasesRes.ok
        ? parseModelAliasCatalog(Array.isArray(modelAliasesBody?.models) ? modelAliasesBody.models : [])
        : [];
      const aliasCatalog = nextModelAliases.length > 0 ? nextModelAliases : DEFAULT_MODEL_ALIAS_OPTIONS;

      if (!providersRes.ok) {
        throw new Error(String(providersBody?.detail || providersBody?.message || 'Failed to load provider catalog.'));
      }
      if (!credentialsRes.ok) {
        throw new Error(String(credentialsBody?.detail || credentialsBody?.message || 'Failed to load saved AI accounts.'));
      }
      if (!profilesRes.ok) {
        throw new Error(String(profilesBody?.detail || profilesBody?.message || 'Failed to load provider profiles.'));
      }
      if (nextModelAliases.length > 0) {
        setModelAliases(nextModelAliases);
      }

      const providerItems: unknown[] = Array.isArray(providersBody?.providers) ? providersBody.providers : [];
      const normalizedProviders = providerItems
        .map((item: unknown): ProviderOption | null => {
          if (!item || typeof item !== 'object') return null;
          const value = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; auth_modes?: unknown; default_auth_mode?: unknown; note?: unknown };
          const id = knownProviderId(value.id);
          if (!id) return null;
          const fallback = DEFAULT_PROVIDER_OPTIONS.find((entry) => entry.id === id);
          const authModes = Array.isArray(value.auth_modes)
            ? value.auth_modes
                .filter((mode): mode is { id?: unknown; label?: unknown; secret_required?: unknown } => Boolean(mode) && typeof mode === 'object')
                .map((mode) => ({
                  id: typeof mode.id === 'string' ? mode.id : 'api_key',
                  label: typeof mode.label === 'string' && mode.label.trim() ? mode.label.trim() : String(mode.id || 'API Key'),
                  secretRequired: Boolean(mode.secret_required),
                }))
            : fallback?.authModes || [];
          return {
            id,
            label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : fallback?.label || id,
            defaultModel: (() => {
              const rawDefaultModel = typeof value.default_model === 'string' && value.default_model.trim()
                ? value.default_model.trim()
                : fallback?.defaultModel || DEFAULT_PROVIDER_MODELS[id]?.[0] || '';
              return resolveModelAlias(id, rawDefaultModel, aliasCatalog) || rawDefaultModel;
            })(),
            auth: Array.isArray(value.auth)
              ? value.auth.filter((entry): entry is string => typeof entry === 'string')
              : fallback?.auth || ['api_key'],
            defaultAuthMode: typeof value.default_auth_mode === 'string' && value.default_auth_mode.trim()
              ? value.default_auth_mode.trim()
              : fallback?.defaultAuthMode || fallback?.auth?.[0] || 'api_key',
            authModes,
            note: typeof value.note === 'string' && value.note.trim() ? value.note.trim() : fallback?.note,
          };
        })
        .filter((item: ProviderOption | null): item is ProviderOption => item !== null);
      if (normalizedProviders.length > 0) {
        setProviderOptions(normalizedProviders);
      }

      const credentialItems: unknown[] = Array.isArray(credentialsBody?.items) ? credentialsBody.items : [];
      const normalizedCredentials = credentialItems
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): ProviderCredentialRow | null => {
          const normalizedProvider = knownProviderId(item.provider);
          if (!normalizedProvider) return null;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            label: typeof item.label === 'string' ? item.label : 'AI Account',
            provider: normalizedProvider,
            metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {},
            authMode: item.metadata && typeof item.metadata === 'object' && typeof (item.metadata as Record<string, unknown>).auth_mode === 'string'
              ? String((item.metadata as Record<string, unknown>).auth_mode)
              : undefined,
            created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
          };
        })
        .filter((item: ProviderCredentialRow | null): item is ProviderCredentialRow => item !== null && item.id.length > 0);
      setProviderCredentials(normalizedCredentials);

      const profileItems: unknown[] = Array.isArray(profilesBody?.items) ? profilesBody.items : [];
      const normalizedProfiles = profileItems
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item): ProviderProfileRow | null => {
          const normalizedProvider = knownProviderId(item.provider);
          if (!normalizedProvider) return null;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            provider: normalizedProvider,
            label: typeof item.label === 'string' ? item.label : 'Runtime profile',
            credential_id: typeof item.credential_id === 'string' ? item.credential_id : null,
            auth_mode: typeof item.auth_mode === 'string' ? item.auth_mode : null,
            workspace_id: typeof item.workspace_id === 'string' ? item.workspace_id : null,
            priority: typeof item.priority === 'number' ? item.priority : 100,
            enabled: item.enabled !== false,
            model: typeof item.model === 'string'
              ? resolveModelAlias(normalizedProvider, item.model, aliasCatalog) || item.model
              : null,
            health: typeof item.health === 'string' ? item.health : null,
            cooldown_until: typeof item.cooldown_until === 'string' ? item.cooldown_until : null,
            last_error: typeof item.last_error === 'string' ? item.last_error : null,
            last_used_at: typeof item.last_used_at === 'string' ? item.last_used_at : null,
            last_success_at: typeof item.last_success_at === 'string' ? item.last_success_at : null,
            last_failure_at: typeof item.last_failure_at === 'string' ? item.last_failure_at : null,
            success_count: typeof item.success_count === 'number' ? item.success_count : 0,
            failure_count: typeof item.failure_count === 'number' ? item.failure_count : 0,
            created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
          };
        })
        .filter((item: ProviderProfileRow | null): item is ProviderProfileRow => item !== null && item.id.length > 0)
        .sort((left: ProviderProfileRow, right: ProviderProfileRow) => {
          const providerCompare = left.provider.localeCompare(right.provider);
          if (providerCompare !== 0) return providerCompare;
          return (left.priority || 100) - (right.priority || 100);
        });
      setProviderProfiles(normalizedProfiles);

      const summary = profilesBody?.summary && typeof profilesBody.summary === 'object'
        ? profilesBody.summary as Record<string, unknown>
        : {};
      setProviderHealth({
        healthy: typeof summary.healthy === 'number' ? summary.healthy : 0,
        cooldown: typeof summary.cooldown === 'number' ? summary.cooldown : 0,
        disabled: typeof summary.disabled === 'number' ? summary.disabled : 0,
        total: typeof summary.total === 'number' ? summary.total : normalizedProfiles.length,
      });

      const availabilityItems = runtimeAvailabilityRes.ok && Array.isArray(runtimeAvailabilityBody?.items)
        ? runtimeAvailabilityBody.items
            .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((item: Record<string, unknown>): RuntimeAvailabilityItem | null => {
              const provider = knownProviderId(item.provider);
              if (!provider) return null;
              return {
                provider,
                label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : providerLabel(provider, normalizedProviders.length > 0 ? normalizedProviders : providerOptions),
                ready: item.ready === true,
                status: item.status === 'attention' ? 'attention' : 'ready',
                source: typeof item.source === 'string' ? item.source : '',
                source_label: typeof item.source_label === 'string' ? item.source_label : 'Runtime account',
                detail: typeof item.detail === 'string' ? item.detail : '',
                profile_count: typeof item.profile_count === 'number' ? item.profile_count : 0,
              };
            })
            .filter((item: RuntimeAvailabilityItem | null): item is RuntimeAvailabilityItem => item !== null)
        : [];
      setRuntimeAvailability(availabilityItems);
    } catch (error) {
      setProviderError(normalizeProvidersError(error instanceof Error ? error.message : 'Failed to load saved AI accounts.'));
    } finally {
      setProviderLoading(false);
    }
  }, [controlPlaneFetch, workspaceId]);

  const loadLocalOpenAiAuth = useCallback(async () => {
    if (!connectMode) return;
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/openai/local-auth/status');
      const body = await res.json().catch(() => null) as LocalOpenAiAuthStatus | null;
      if (res.ok && body) {
        setLocalOpenAiAuth(body);
        return;
      }
      setLocalOpenAiAuth(null);
    } catch {
      setLocalOpenAiAuth(null);
    }
  }, [connectMode, controlPlaneFetch]);

  useEffect(() => {
    void loadProviderAccounts();
  }, [loadProviderAccounts]);

  useEffect(() => {
    void loadLocalOpenAiAuth();
  }, [loadLocalOpenAiAuth]);

  useEffect(() => {
    const availableAuthMode = selectedProviderAuthModes.find((item) => item.id === providerForm.authMode)?.id
      || selectedProviderOption.defaultAuthMode
      || selectedProviderAuthModes[0]?.id
      || 'api_key';
    if (availableAuthMode !== providerForm.authMode) {
      setProviderForm((prev) => ({
        ...prev,
        authMode: availableAuthMode,
        label: prev.label === defaultProviderLabel(prev.provider, prev.authMode)
          ? defaultProviderLabel(prev.provider, availableAuthMode)
          : prev.label,
        model: defaultProviderModel(prev.provider, availableAuthMode, providerOptions),
      }));
    }
  }, [providerForm.authMode, providerForm.provider, providerOptions, selectedProviderAuthModes, selectedProviderOption.defaultAuthMode]);

  useEffect(() => {
    if (!showProviderForm || typeof document === 'undefined') return;
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [showProviderForm]);

  const refreshClaudeAuthStatus = useCallback(async (silent = false) => {
    if (!silent) setProviderBusy((prev) => ({ ...prev, 'claude-auth': 'status' }));
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/anthropic/local-cli/status');
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Could not read Claude auth status.'));
      }
      setClaudeAuthStatus(body as ClaudeAuthStatus);
    } catch (error) {
      setClaudeAuthStatus({
        ok: false,
        available: false,
        loggedIn: false,
        message: error instanceof Error ? error.message : 'Could not read Claude auth status.',
      });
    } finally {
      if (!silent) {
        setProviderBusy((prev) => {
          const next = { ...prev };
          delete next['claude-auth'];
          return next;
        });
      }
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    if (!showProviderForm || !usesClaudeLocalCli) return;
    void refreshClaudeAuthStatus(true);
  }, [refreshClaudeAuthStatus, showProviderForm, usesClaudeLocalCli]);

  const upsertRuntimeProfileForCredential = useCallback(async (
    credential: ProviderCredentialRow,
    existingProfile?: ProviderProfileRow | null,
    enabled = true,
    preferredModel?: string,
  ) => {
    const authMode = String(
      credential.authMode || providerOptionFor(credential.provider, providerOptions).defaultAuthMode || '',
    ).trim() || 'api_key';
    const payload = {
      id: existingProfile?.id || undefined,
      provider: credential.provider,
      label: existingProfile?.label || credential.label,
      credential_id: credential.id,
      auth_mode: authMode,
      workspace_id: workspaceId,
      priority: existingProfile?.priority || 100,
      enabled,
      model: preferredModel || existingProfile?.model || defaultProviderModel(credential.provider, authMode, providerOptions),
    };
    const res = await controlPlaneFetch('/api/control-plane/providers/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => '');
    const body = raw ? JSON.parse(raw) : {};
    if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to save runtime profile.'));
  }, [controlPlaneFetch, providerOptions, workspaceId]);

  const handleSaveProviderCredential = useCallback(async () => {
    const authMode = providerForm.authMode || selectedProviderOption.defaultAuthMode || selectedProviderAuthModes[0]?.id || 'api_key';
    const authConfig = selectedProviderAuthModes.find((item) => item.id === authMode);
    const needsSecret = authConfig?.secretRequired !== false;
    if (usesClaudeLocalCli && claudeAuthStatus && claudeAuthStatus.loggedIn === false) {
      setProviderError('Claude is not signed in on this machine yet. Use Sign in to Claude first, then refresh status.');
      return;
    }
    if (!providerForm.label.trim()) {
      setProviderError('Account label is required.');
      return;
    }
    if (needsSecret && !providerForm.secret.trim()) {
      setProviderError(authMode === 'access_token' ? 'Access token is required.' : 'Secret is required.');
      return;
    }
    if (providerForm.provider === 'vertex' && !providerForm.projectId.trim()) {
      setProviderError('Vertex project ID is required.');
      return;
    }

    setProviderActionBusy('provider-create', 'save');
    setProviderError('');
    setProviderNotice('');
    setLastConnectedAccountLabel('');
    try {
      const credentials = buildProviderCredentialPayload(providerForm);
      const res = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
        body: JSON.stringify({
          label: providerForm.label.trim(),
          provider: providerForm.provider,
          workspace_id: workspaceId,
          mode: 'byok',
          credentials,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to save AI account.'));

      const credentialId = typeof body?.id === 'string' ? body.id : '';
      const savedCredential: ProviderCredentialRow = {
        id: credentialId,
        label: providerForm.label.trim(),
        provider: providerForm.provider,
        authMode,
        metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {},
      };
      if (providerForm.enableRuntime && credentialId) {
        await upsertRuntimeProfileForCredential(
          savedCredential,
          null,
          true,
          providerForm.model.trim() || defaultProviderModel(providerForm.provider, authMode, providerOptions),
        );
      }
      resetProviderForm(providerForm.provider, authMode);
      setShowProviderForm(false);
      await loadProviderAccounts();
      setLastConnectedAccountLabel(providerForm.label.trim());
      setProviderNotice(
        connectMode
          ? `${providerLabel(providerForm.provider, providerOptions)} connected and ready.`
          : providerForm.enableRuntime
            ? 'AI account saved and enabled for runtime.'
            : 'AI account saved to the encrypted vault.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save AI account.';
      setProviderError(usesClaudeLocalCli ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy('provider-create', null);
    }
  }, [
    controlPlaneFetch,
    loadProviderAccounts,
    providerForm,
    providerOptions,
    resetProviderForm,
    selectedProviderAuthModes,
    selectedProviderOption.defaultAuthMode,
    setProviderActionBusy,
    upsertRuntimeProfileForCredential,
    workspaceId,
    usesClaudeLocalCli,
    claudeAuthStatus,
    connectMode,
  ]);

  const handleTestProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'test');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credential.id)}/test?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'AI account test failed.'));
      const preview = Array.isArray(body?.models_preview)
        ? body.models_preview.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      const previewAliases = mapModelOptionsToAliases(credential.provider, preview, effectiveModelAliases);
      setProviderNotice(
        previewAliases.length > 0
          ? `${body?.message || 'Connection verified.'} Models: ${previewAliases.slice(0, 3).join(', ')}`
          : String(body?.message || 'Connection verified.'),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI account test failed.';
      setProviderError(credential.provider === 'anthropic' && credential.authMode === 'local_cli' ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, effectiveModelAliases, setProviderActionBusy, workspaceId]);

  const handleToggleProviderProfile = useCallback(async (credential: ProviderCredentialRow, existingProfile?: ProviderProfileRow | null) => {
    const action = existingProfile?.enabled ? 'disable-runtime' : 'enable-runtime';
    setProviderActionBusy(credential.id, action);
    setProviderError('');
    setProviderNotice('');
    try {
      if (existingProfile?.enabled) {
        const res = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(existingProfile.id)}/disable`, {
          method: 'POST',
        });
        const raw = await res.text().catch(() => '');
        const body = raw ? JSON.parse(raw) : {};
        if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to disable runtime profile.'));
      } else {
        await upsertRuntimeProfileForCredential(credential, existingProfile || null, true);
      }
      await loadProviderAccounts();
      setProviderNotice(existingProfile?.enabled ? 'Runtime profile disabled.' : 'Runtime profile enabled.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to update runtime profile.');
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, setProviderActionBusy, upsertRuntimeProfileForCredential]);

  const handlePromoteProviderProfile = useCallback(async (profile: ProviderProfileRow) => {
    const siblings = runtimeProfileGroups.find((group) => group.provider === profile.provider)?.items || [];
    if (siblings.length === 0) return;

    setProviderActionBusy(profile.id, 'make-default');
    setProviderError('');
    setProviderNotice('');
    try {
      const reordered = [profile, ...siblings.filter((item) => item.id !== profile.id)];
      for (let index = 0; index < reordered.length; index += 1) {
        const item = reordered[index];
        const res = await controlPlaneFetch('/api/control-plane/providers/profiles', {
          method: 'POST',
          body: JSON.stringify({
            id: item.id,
            provider: item.provider,
            label: item.label,
            credential_id: item.credential_id || undefined,
            auth_mode: item.auth_mode || undefined,
            workspace_id: item.workspace_id || workspaceId,
            priority: index * 100,
            enabled: item.enabled,
            model: item.model || undefined,
          }),
        });
        const raw = await res.text().catch(() => '');
        const body = raw ? JSON.parse(raw) : {};
        if (!res.ok) {
          throw new Error(String(body?.detail || body?.message || 'Failed to reorder runtime profiles.'));
        }
      }
      await loadProviderAccounts();
      setProviderNotice(`${providerLabel(profile.provider, providerOptions)} default updated. Runs will try ${profile.label} first.`);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to update default runtime profile.');
    } finally {
      setProviderActionBusy(profile.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, providerOptions, runtimeProfileGroups, setProviderActionBusy, workspaceId]);

  const handleDeleteProviderProfile = useCallback(async (profile: ProviderProfileRow) => {
    setProviderActionBusy(profile.id, 'remove-profile');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove runtime profile.'));
      await loadProviderAccounts();
      setProviderNotice('Runtime profile removed.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to remove runtime profile.');
    } finally {
      setProviderActionBusy(profile.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, setProviderActionBusy]);

  const handleRemoveProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'remove');
    setProviderError('');
    setProviderNotice('');
    try {
      const linkedProfiles = providerProfilesByCredential.get(credential.id) || [];
      for (const profile of linkedProfiles) {
        const deleteRes = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(profile.id)}`, {
          method: 'DELETE',
        });
        const deleteRaw = await deleteRes.text().catch(() => '');
        const deleteBody = deleteRaw ? JSON.parse(deleteRaw) : {};
        if (!deleteRes.ok) {
          throw new Error(String(deleteBody?.detail || deleteBody?.message || 'Failed to remove linked runtime profile.'));
        }
      }

      const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credential.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to remove AI account.'));
      await loadProviderAccounts();
      setProviderNotice('AI account removed.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to remove AI account.');
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [controlPlaneFetch, loadProviderAccounts, providerProfilesByCredential, setProviderActionBusy, workspaceId]);

  const handleClaudeAuthLogin = useCallback(async () => {
    setProviderActionBusy('claude-auth', 'login');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/anthropic/local-cli/login', {
        method: 'POST',
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to start Claude login.'));
      }
      setProviderNotice(String(body?.message || 'Claude login started. Complete it, then refresh status.'));
      window.setTimeout(() => {
        void refreshClaudeAuthStatus(true);
      }, 1500);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to start Claude login.');
    } finally {
      setProviderActionBusy('claude-auth', null);
    }
  }, [controlPlaneFetch, refreshClaudeAuthStatus, setProviderActionBusy]);

  const handleImportLocalOpenAiAuth = useCallback(async () => {
    setProviderActionBusy('openai-local-import', 'import');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/providers/openai/local-auth/import', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          enable_runtime: true,
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to import OpenAI / Codex session.'));
      }
      await Promise.all([loadProviderAccounts(), loadLocalOpenAiAuth()]);
      setLastConnectedAccountLabel('OpenAI / Codex on this Mac');
      setProviderNotice(String(body?.message || 'OpenAI / Codex session imported from this Mac.'));
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to import OpenAI / Codex session.');
    } finally {
      setProviderActionBusy('openai-local-import', null);
    }
  }, [controlPlaneFetch, loadLocalOpenAiAuth, loadProviderAccounts, setProviderActionBusy, workspaceId]);

  const removeImportedOpenAiCredentials = useCallback(async (sources: string[]) => {
    const sourceSet = new Set(sources.map((item) => item.trim().toLowerCase()).filter(Boolean));
    if (sourceSet.size === 0) return;

    const importedCredentials = providerCredentials.filter((credential) => {
      if (credential.provider !== 'openai') return false;
      const importSource = String(credential.metadata?.import_source || '').trim().toLowerCase();
      return sourceSet.has(importSource);
    });

    for (const credential of importedCredentials) {
      const linkedProfiles = providerProfilesByCredential.get(credential.id) || [];
      for (const profile of linkedProfiles) {
        const profileRes = await controlPlaneFetch(`/api/control-plane/providers/profiles/${encodeURIComponent(profile.id)}`, {
          method: 'DELETE',
        });
        const profileRaw = await profileRes.text().catch(() => '');
        const profileBody = profileRaw ? JSON.parse(profileRaw) : {};
        if (!profileRes.ok) {
          throw new Error(String(profileBody?.detail || profileBody?.message || 'Failed to remove an existing OpenAI runtime profile.'));
        }
      }
      const credentialRes = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credential.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
      const credentialRaw = await credentialRes.text().catch(() => '');
      const credentialBody = credentialRaw ? JSON.parse(credentialRaw) : {};
      if (!credentialRes.ok) {
        throw new Error(String(credentialBody?.detail || credentialBody?.message || 'Failed to remove an existing OpenAI account.'));
      }
    }
  }, [controlPlaneFetch, providerCredentials, providerProfilesByCredential, workspaceId]);

  const handleOpenAiCodexOauthSignIn = useCallback(async () => {
    if (!openAiDesktopBridge?.openaiCodexOauthLogin) {
      return;
    }

    setProviderActionBusy('openai-codex-oauth', 'login');
    setProviderError('');
    setProviderNotice('');
    setLastConnectedAccountLabel('');

    try {
      const result = await openAiDesktopBridge.openaiCodexOauthLogin();
      const accessToken = String(result?.access_token || '').trim();
      const refreshToken = String(result?.refresh_token || '').trim();
      const accountId = String(result?.account_id || '').trim();
      const email = String(result?.email || '').trim();
      const profileName = String(result?.profile_name || '').trim();
      const expiresAt = Number(result?.expires_at || 0);

      if (!accessToken || !refreshToken || !accountId || !Number.isFinite(expiresAt) || expiresAt <= 0) {
        throw new Error('ChatGPT sign-in did not return a complete OAuth session.');
      }

      await removeImportedOpenAiCredentials(['openai_codex_oauth', 'codex_auth_file']);

      const label = openAiCodexCredentialLabel(result);
      const res = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
        body: JSON.stringify({
          label,
          provider: 'openai',
          workspace_id: workspaceId,
          mode: 'byok',
          metadata: {
            auth_mode: 'oauth_token',
            import_source: 'openai_codex_oauth',
            source_label: 'ChatGPT OAuth',
            account_id: accountId,
            ...(email ? { email } : {}),
            ...(profileName ? { profile_name: profileName } : {}),
            expires_at: expiresAt,
          },
          skip_validation: true,
          credentials: {
            oauth_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            account_id: accountId,
            ...(email ? { email } : {}),
            ...(profileName ? { profile_name: profileName } : {}),
            auth_mode: 'oauth_token',
          },
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to save ChatGPT OAuth account.'));
      }

      const credentialId = typeof body?.id === 'string' ? body.id : '';
      const credential: ProviderCredentialRow = {
        id: credentialId,
        label,
        provider: 'openai',
        authMode: 'oauth_token',
        metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {},
      };
      if (credentialId) {
        await upsertRuntimeProfileForCredential(
          credential,
          null,
          true,
          defaultProviderModel('openai', 'oauth_token', providerOptions),
        );
      }

      await loadProviderAccounts();
      setLastConnectedAccountLabel(label);
      setProviderNotice('ChatGPT / Codex connected and ready.');
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : 'Failed to complete ChatGPT sign-in.');
    } finally {
      setProviderActionBusy('openai-codex-oauth', null);
    }
  }, [
    controlPlaneFetch,
    loadProviderAccounts,
    openAiDesktopBridge,
    providerOptions,
    removeImportedOpenAiCredentials,
    setProviderActionBusy,
    upsertRuntimeProfileForCredential,
    workspaceId,
  ]);

  return (
    <>
      <section style={{ display: 'grid', gap: 16, overflow: 'visible' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 3 }}>
            <div className="orion-panel-title">{connectMode ? 'Connect a provider' : 'AI accounts'}</div>
            <div className="orion-panel-copy">
              {connectMode
                ? 'Choose one provider and connect it. Use the details toggle only when you need account metadata or alternate setup paths.'
                : 'Connect direct provider accounts here, then decide which one the runtime should use by default.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="orion-btn orion-btn-ghost" style={{ minHeight: 38, paddingInline: 12 }} onClick={() => void loadProviderAccounts()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            {!connectMode ? (
              <button
                className="orion-btn orion-btn-primary"
                style={{ minHeight: 38, paddingInline: 14 }}
                onClick={() => {
                  resetProviderForm(providerForm.provider, providerForm.authMode);
                  setShowProviderForm(true);
                }}
              >
                <Plus size={14} />
                Add AI account
              </button>
            ) : null}
          </div>
        </div>

        {!connectMode ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="orion-chip">{providerCredentials.length} saved</span>
            <span className="orion-chip">{providerHealth.total} runtime profiles</span>
            {providerHealth.healthy ? <span className="orion-chip">{providerHealth.healthy} healthy</span> : null}
            {providerHealth.cooldown ? <span className="orion-chip">{providerHealth.cooldown} cooling down</span> : null}
            {providerHealth.disabled ? <span className="orion-chip">{providerHealth.disabled} disabled</span> : null}
          </div>
        ) : null}

        {providerError ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--error-border)',
              background: 'var(--error-bg)',
              color: 'var(--error-fg)',
              padding: '9px 12px',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {providerError}
          </div>
        ) : null}

        {providerNotice && !hasProviderCardError ? (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--success-border)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '9px 12px',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {providerNotice}
          </div>
        ) : null}

        {connectMode && hasProviderCardError ? (
          <div
            style={{
              display: 'grid',
              gap: 8,
              borderRadius: 12,
              border: '1px solid var(--error-border)',
              background: 'var(--error-bg)',
              color: 'var(--error-fg)',
              padding: '11px 13px',
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                AI provider needs attention
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                Fix the provider error below before using chat.
              </div>
            </div>
          </div>
        ) : null}

        {connectMode && providerCredentials.length > 0 && readyProviderCard && !hasProviderCardError ? (
          <div
            style={{
              display: 'grid',
              gap: 8,
              borderRadius: 12,
              border: '1px solid var(--success-border)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '11px 13px',
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {lastConnectedAccountLabel ? `${lastConnectedAccountLabel} connected` : `${readyProviderCard.label} connected`}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                Return to chat and continue. You can manage provider order later from Integrations if you need to.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="orion-btn orion-btn-primary"
                style={{ minHeight: 36, paddingInline: 14 }}
                onClick={() => router.push(returnTo)}
              >
                Start chatting
              </button>
            </div>
          </div>
        ) : null}

        {providerLoading ? (
          <section className="orion-empty" style={{ minHeight: 180 }}>
            <div className="orion-empty-title">Loading AI accounts</div>
            <div className="orion-empty-copy">Loading connected accounts and runtime availability.</div>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 12, overflow: 'visible' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                alignItems: 'stretch',
                overflow: 'visible',
              }}
            >
              {providerCards.map((card) => {
                const option = providerOptionFor(card.provider, providerOptions);
                const defaultAuthMode = option.defaultAuthMode || getProviderAuthModes(option)[0]?.id || 'api_key';
                const busyAction = card.credential ? providerBusy[card.credential.id] || '' : '';
                const profileBusyAction = card.profile ? providerBusy[card.profile.id] || '' : '';
                const accent = providerAccentStyles(card.provider);
                const detailsOpen = Boolean(providerDetailsOpen[card.provider]);
                const runtimeModelLabel = String(card.profile?.model || '').trim();
                const catalogDefaultModel = String(option.defaultModel || '').trim();
                const topCardError = summarizeProviderCardError(card.errorMessage);
                const hasActiveError = Boolean(topCardError);
                const openAiNeedsApiKey = card.provider === 'openai' && !openAiHasApiKeyCredential;
                const showOpenAiApiKeyRecovery = card.provider === 'openai' && (openAiNeedsApiKey || hasActiveError);
                const showGeminiApiKeyAction = card.provider === 'gemini';
                const showVertexCredentialsAction = card.provider === 'vertex';
                const visibleActionBusy = connectMode
                  ? openAiNeedsApiKey
                    ? false
                    : hasActiveError
                    ? busyAction === 'test'
                    : card.provider === 'openai' && !card.credential && localOpenAiAuth?.importable
                      ? providerBusy['openai-local-import'] === 'import'
                      : busyAction === 'enable-runtime'
                  : busyAction === 'test';
                const visibleBadgeLabel = hasActiveError ? 'Error' : card.enabled ? 'Enabled' : 'Disabled';
                const visibleBadgeStyle = hasActiveError
                  ? { color: 'var(--error-fg)', border: '1px solid var(--error-border)', background: 'var(--error-bg)' }
                  : card.enabled
                    ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
                    : { color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', background: 'var(--bg-element)' };
                const visibleActionLabel = connectMode
                  ? openAiNeedsApiKey
                    ? 'Add API key'
                    : hasActiveError
                    ? card.credential
                      ? 'Retest'
                      : 'Reconnect'
                    : card.enabled
                      ? 'Use account'
                      : card.provider === 'openai' && !card.credential && localOpenAiAuth?.importable
                        ? 'Use this Mac'
                        : card.credential
                          ? 'Enable'
                          : 'Connect'
                  : card.credential
                    ? 'Test'
                    : 'Add account';

                return (
                  <article
                    key={card.provider}
                    style={{
                      display: 'grid',
                      gap: 10,
                      overflow: 'visible',
                      height: '100%',
                      borderRadius: 0,
                      border: '1px solid var(--border-subtle)',
                      borderLeft: `4px solid ${accent.border}`,
                      background: accent.tint,
                      padding: '14px',
                    }}
                  >
                    {topCardError ? (
                      <div
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--error-border)',
                          background: 'var(--error-bg)',
                          color: 'var(--error-fg)',
                          padding: '8px 10px',
                          fontSize: 11.5,
                          lineHeight: 1.45,
                        }}
                      >
                        {topCardError}
                      </div>
                    ) : null}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{card.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {runtimeModelLabel
                            ? `Runtime model: ${runtimeModelLabel}`
                            : catalogDefaultModel
                              ? `Catalog default: ${catalogDefaultModel}`
                              : 'No runtime model selected'}
                        </div>
                      </div>
                      <span
                        className="orion-chip"
                        style={visibleBadgeStyle}
                      >
                        {visibleBadgeLabel}
                      </span>
                    </div>
                    <button
                      className="orion-btn orion-btn-primary"
                      style={{ minHeight: 34, paddingInline: 14, width: 'fit-content' }}
                      onClick={() => {
                        if (connectMode) {
                          if (openAiNeedsApiKey) {
                            openOpenAiApiKeyForm();
                            return;
                          }
                          if (hasActiveError) {
                            if (card.credential) {
                              void handleTestProviderCredential(card.credential);
                              return;
                            }
                            resetProviderForm(card.provider, defaultAuthMode);
                            setShowProviderForm(true);
                            return;
                          }
                          if (card.enabled) {
                            router.push(returnTo);
                            return;
                          }
                          if (card.provider === 'openai' && !card.credential && localOpenAiAuth?.importable) {
                            void handleImportLocalOpenAiAuth();
                            return;
                          }
                          if (card.credential) {
                            void handleToggleProviderProfile(card.credential, card.profile);
                            return;
                          }
                          resetProviderForm(card.provider, defaultAuthMode);
                          setShowProviderForm(true);
                          return;
                        }
                        if (card.credential) {
                          void handleTestProviderCredential(card.credential);
                          return;
                        }
                        resetProviderForm(card.provider, defaultAuthMode);
                        setShowProviderForm(true);
                      }}
                      disabled={visibleActionBusy}
                    >
                      {visibleActionBusy ? (connectMode ? 'Working…' : 'Testing…') : visibleActionLabel}
                    </button>
                    {card.provider === 'openai' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {showOpenAiApiKeyRecovery && visibleActionLabel !== 'Add API key' ? (
                          <button
                            type="button"
                            className="orion-btn orion-btn-primary"
                            style={{ minHeight: 30, paddingInline: 10 }}
                            onClick={openOpenAiApiKeyForm}
                          >
                            Add API key
                          </button>
                        ) : null}
                          <button
                            type="button"
                            className="orion-btn orion-btn-ghost"
                            style={secondaryProviderActionButtonStyle}
                            disabled={!openAiDesktopSignInAvailable || providerBusy['openai-codex-oauth'] === 'login'}
                            title={openAiDesktopSignInAvailable ? undefined : 'Desktop app required'}
                            onClick={() => void handleOpenAiCodexOauthSignIn()}
                        >
                          {providerBusy['openai-codex-oauth'] === 'login' ? 'Opening ChatGPT…' : 'Sign in with ChatGPT'}
                        </button>
                          <button
                            type="button"
                            className="orion-btn orion-btn-ghost"
                            style={secondaryProviderActionButtonStyle}
                            disabled={!localOpenAiAuth?.importable || providerBusy['openai-local-import'] === 'import'}
                            onClick={() => void handleImportLocalOpenAiAuth()}
                          >
                          {providerBusy['openai-local-import'] === 'import' ? 'Importing…' : 'Import local session'}
                        </button>
                      </div>
                    ) : null}
                    {connectMode && card.provider === 'anthropic' && !card.credential ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="orion-btn orion-btn-ghost"
                          style={secondaryProviderActionButtonStyle}
                          disabled={providerBusy['claude-auth'] === 'login'}
                          onClick={() => void handleClaudeAuthLogin()}
                        >
                          {providerBusy['claude-auth'] === 'login' ? 'Signing in…' : 'Sign in to Claude'}
                        </button>
                        <button
                          type="button"
                          className="orion-btn orion-btn-ghost"
                          style={secondaryProviderActionButtonStyle}
                          disabled={providerBusy['claude-auth'] === 'status'}
                          onClick={() => void refreshClaudeAuthStatus()}
                        >
                          {providerBusy['claude-auth'] === 'status' ? 'Refreshing…' : 'Refresh Claude status'}
                        </button>
                      </div>
                    ) : null}
                    {showGeminiApiKeyAction ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="orion-btn orion-btn-ghost"
                          style={secondaryProviderActionButtonStyle}
                          onClick={openGeminiApiKeyForm}
                        >
                          Add API key
                        </button>
                      </div>
                    ) : null}
                    {showVertexCredentialsAction ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="orion-btn orion-btn-ghost"
                          style={secondaryProviderActionButtonStyle}
                          onClick={openVertexCredentialsForm}
                        >
                          Add credentials
                        </button>
                      </div>
                    ) : null}
                    {!connectMode && card.credential ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 30, paddingInline: 10 }}
                          onClick={() => void handleToggleProviderProfile(card.credential!, card.profile)}
                          disabled={Boolean(busyAction)}
                        >
                          {card.profile?.enabled ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                          {busyAction === 'disable-runtime'
                            ? 'Disabling…'
                            : busyAction === 'enable-runtime'
                              ? 'Enabling…'
                              : card.profile?.enabled
                                ? 'Disable runtime'
                                : card.profile
                                  ? 'Enable runtime'
                                  : 'Use in runtime'}
                        </button>
                        {card.profile && !card.isDefaultProfile ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 30, paddingInline: 10 }}
                            onClick={() => void handlePromoteProviderProfile(card.profile!)}
                            disabled={profileBusyAction === 'make-default'}
                          >
                            {profileBusyAction === 'make-default' ? 'Setting default…' : 'Make default'}
                          </button>
                        ) : null}
                        {card.profile ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 30, paddingInline: 10 }}
                            onClick={() => void handleDeleteProviderProfile(card.profile!)}
                            disabled={profileBusyAction === 'remove-profile'}
                          >
                            <X size={13} />
                            {profileBusyAction === 'remove-profile' ? 'Removing profile…' : 'Remove profile'}
                          </button>
                        ) : null}
                        <button
                          className="orion-btn orion-btn-danger"
                          style={{ minHeight: 30, paddingInline: 10 }}
                          onClick={() => void handleRemoveProviderCredential(card.credential!)}
                          disabled={busyAction === 'remove'}
                        >
                          <Trash2 size={13} />
                          {busyAction === 'remove' ? 'Removing…' : 'Remove account'}
                        </button>
                      </div>
                    ) : null}
                    <section
                      style={{
                        display: 'grid',
                        alignContent: 'start',
                        gap: 10,
                        borderRadius: 12,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-element)',
                        padding: '10px 12px',
                      }}
                    >
                      <button
                        type="button"
                        className="orion-btn orion-btn-ghost"
                        style={{
                          minHeight: 28,
                          justifyContent: 'space-between',
                          paddingInline: 0,
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'transparent',
                        }}
                        onClick={() => {
                          setProviderDetailsOpen((prev) => ({
                            ...prev,
                            [card.provider]: !prev[card.provider],
                          }));
                        }}
                      >
                        <span>{detailsOpen ? 'Hide details' : 'Details'}</span>
                        <ChevronDown
                          size={14}
                          style={{
                            transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 160ms ease',
                          }}
                        />
                      </button>
                      <div
                        style={{
                          display: detailsOpen ? 'grid' : 'none',
                          gap: 8,
                          alignContent: 'start',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                            Account: {card.credential?.label || 'Not connected'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                            Auth: {card.credential ? providerAuthModeLabel(card.provider, card.credential.authMode, providerOptions) : providerSetupGuidance(card.provider, defaultAuthMode, option)}
                          </div>
                          {runtimeModelLabel ? (
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              Runtime model: {runtimeModelLabel}
                            </div>
                          ) : null}
                          {typeof card.order === 'number' ? (
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              Order: #{card.order}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </article>
                );
              })}
            </div>

            {!connectMode && runtimeProfileGroups.length > 0 ? (
              <section style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Runtime profile order
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    Runs try the first ready profile in each provider group. Reorder profiles to change the default and fallback order.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {runtimeProfileGroups.map((group) => (
                    <div key={group.provider} style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{group.label}</div>
                        <span className="orion-chip">{group.items.length} profiles</span>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {group.items.map((profile, index) => {
                          const linkedCredentialLabel = profile.credential_id ? credentialLabelById.get(profile.credential_id) || profile.credential_id : null;
                          const isDefaultProfile = index === 0;
                          const isActiveProfile = activeProfileIdByProvider.get(group.provider) === profile.id;
                          const busyAction = providerBusy[profile.id] || '';
                          return (
                            <div
                              key={profile.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) auto',
                                gap: 10,
                                alignItems: 'center',
                                borderRadius: 12,
                                border: '1px solid var(--border-subtle)',
                                background: 'var(--bg-element)',
                                padding: '10px 12px',
                              }}
                            >
                              <div style={{ display: 'grid', gap: 5, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    #{index + 1} {profile.label}
                                  </div>
                                  {isDefaultProfile ? <span className="orion-chip">Default</span> : null}
                                  {isActiveProfile ? <span className="orion-chip">Active now</span> : null}
                                  <span className="orion-chip" style={profileTone(profile)}>
                                    {profileStatusLabel(profile, mode)}
                                  </span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                  {linkedCredentialLabel ? `${linkedCredentialLabel} • ` : ''}
                                  {providerAuthModeLabel(profile.provider, profile.auth_mode || undefined, providerOptions)}
                                  {profile.model ? ` • ${profile.model}` : ''}
                                  {typeof profile.priority === 'number' ? ` • priority ${profile.priority}` : ''}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {!isDefaultProfile ? (
                                  <button
                                    className="orion-btn orion-btn-ghost"
                                    style={{ minHeight: 32, paddingInline: 10 }}
                                    onClick={() => void handlePromoteProviderProfile(profile)}
                                    disabled={busyAction === 'make-default'}
                                  >
                                    {busyAction === 'make-default' ? 'Setting default…' : 'Make default'}
                                  </button>
                                ) : null}
                                <button
                                  className="orion-btn orion-btn-ghost"
                                  style={{ minHeight: 32, paddingInline: 10 }}
                                  onClick={() => void handleDeleteProviderProfile(profile)}
                                  disabled={busyAction === 'remove-profile'}
                                >
                                  <Trash2 size={13} />
                                  {busyAction === 'remove-profile' ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {!connectMode && orphanProviderProfiles.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  borderRadius: 16,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-element)',
                  padding: 14,
                }}
              >
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                    Runtime-only profiles
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    These profiles no longer point at a saved vault account. Remove them if they are stale.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {orphanProviderProfiles.map((profile) => (
                    <div
                      key={profile.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                        borderRadius: 12,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        padding: '10px 12px',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{profile.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {providerLabel(profile.provider, providerOptions)} • {providerAuthModeLabel(profile.provider, profile.auth_mode || undefined, providerOptions)}
                        </div>
                      </div>
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 32, paddingInline: 10 }}
                        onClick={() => void handleDeleteProviderProfile(profile)}
                        disabled={providerBusy[profile.id] === 'remove-profile'}
                      >
                        <Trash2 size={13} />
                        {providerBusy[profile.id] === 'remove-profile' ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {showProviderForm ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'var(--overlay-scrim)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={() => setShowProviderForm(false)}
        >
          <div
            className="orion-panel"
            style={{
              width: connectMode ? 'min(820px, calc(100vw - 48px))' : 'min(1120px, calc(100vw - 48px))',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'auto',
              display: 'grid',
              gap: 22,
              padding: 28,
              borderRadius: 28,
              boxShadow: 'var(--shadow-card)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {connectMode ? 'Connect provider' : 'Add AI account'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {connectMode
                    ? 'Choose a direct provider, add the credential you already control, and start using it right away.'
                    : 'Connect a direct provider account, store it in the encrypted vault, then optionally enable it for runtime use immediately.'}
                </div>
              </div>
              <button
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 42, minWidth: 42, paddingInline: 12 }}
                onClick={() => setShowProviderForm(false)}
                aria-label="Close add account dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 16,
                borderRadius: 20,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-element)',
                padding: 22,
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  Account setup
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {connectMode
                    ? 'Choose a provider, pick the sign-in method you already use, and confirm the default model.'
                    : 'Choose the provider, choose the auth method, and confirm the default model.'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Provider</span>
                  <select
                    className="input"
                    value={providerForm.provider}
                    onChange={(event) => {
                      const nextProvider = knownProviderId(event.target.value) || 'anthropic';
                      const nextOption = providerOptionFor(nextProvider, providerOptions);
                      const nextAuthMode = nextOption.defaultAuthMode || getProviderAuthModes(nextOption)[0]?.id || 'api_key';
                      setProviderForm((prev) => ({
                        ...prev,
                        provider: nextProvider,
                        authMode: nextAuthMode,
                        label: defaultProviderLabel(nextProvider, nextAuthMode),
                        model: defaultProviderModel(nextProvider, nextAuthMode, providerOptions),
                        secret: '',
                        projectId: '',
                        location: nextProvider === 'vertex' ? 'us-central1' : prev.location,
                      }));
                    }}
                  >
                    {providerOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Auth method</span>
                  <select
                    className="input"
                    value={providerForm.authMode}
                    onChange={(event) => {
                      const nextAuthMode = event.target.value;
                      setProviderForm((prev) => ({
                        ...prev,
                        authMode: nextAuthMode,
                        label: defaultProviderLabel(prev.provider, nextAuthMode),
                        model: defaultProviderModel(prev.provider, nextAuthMode, providerOptions),
                        secret: '',
                      }));
                    }}
                  >
                    {selectedProviderAuthModes.map((mode) => (
                      <option key={mode.id} value={mode.id}>{mode.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Label</span>
                  <input
                    className="input"
                    value={providerForm.label}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, label: event.target.value }))}
                    placeholder={defaultProviderLabel(providerForm.provider, providerForm.authMode)}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Runtime model</span>
                  <select
                    className="input"
                    value={providerForm.model}
                    onChange={(event) => {
                      const nextAlias = event.target.value;
                      const nextAliasOption = effectiveModelAliases.find((item) => item.alias === nextAlias) || null;
                      if (!nextAliasOption) {
                        setProviderForm((prev) => ({ ...prev, model: nextAlias }));
                        return;
                      }
                      if (nextAliasOption.provider !== providerForm.provider) {
                        const nextProvider = nextAliasOption.provider;
                        const nextOption = providerOptionFor(nextProvider, providerOptions);
                        const nextAuthMode = nextOption.defaultAuthMode || getProviderAuthModes(nextOption)[0]?.id || 'api_key';
                        setProviderForm((prev) => ({
                          ...prev,
                          provider: nextProvider,
                          authMode: nextAuthMode,
                          label: prev.label === defaultProviderLabel(prev.provider, prev.authMode)
                            ? defaultProviderLabel(nextProvider, nextAuthMode)
                            : prev.label,
                          model: nextAlias,
                          secret: '',
                          projectId: '',
                          location: nextProvider === 'vertex' ? 'us-central1' : prev.location,
                        }));
                        return;
                      }
                      setProviderForm((prev) => ({ ...prev, model: nextAlias }));
                    }}
                  >
                    {groupedModelAliases.map((group) => (
                      <optgroup key={group.provider} label={group.label}>
                        {group.items.map((item) => (
                          <option key={item.alias} value={item.alias}>{item.alias}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {providerForm.provider === 'vertex' ? (
                  <>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Project ID</span>
                      <input
                        className="input"
                        value={providerForm.projectId}
                        onChange={(event) => setProviderForm((prev) => ({ ...prev, projectId: event.target.value }))}
                        placeholder="my-gcp-project"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Region</span>
                      <input
                        className="input"
                        value={providerForm.location}
                        onChange={(event) => setProviderForm((prev) => ({ ...prev, location: event.target.value }))}
                        placeholder="us-central1"
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 6,
                  borderRadius: 16,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  Connection guidance
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {providerSetupGuidance(providerForm.provider, providerForm.authMode, selectedProviderOption)}
                </div>
              </div>

              {selectedProviderAuthModes.find((item) => item.id === providerForm.authMode)?.secretRequired === false ? (
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    borderRadius: 14,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                      Claude login
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      No API key is needed. This account uses the local Claude subscription already signed into the `claude` CLI on this machine.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="orion-chip" style={claudeAuthTone(Boolean(claudeAuthStatus?.loggedIn))}>
                      {claudeAuthStatus?.loggedIn ? 'Signed in' : 'Not signed in'}
                    </span>
                    {claudeAuthStatus?.authMethod ? <span className="orion-chip">Method {claudeAuthStatus.authMethod}</span> : null}
                    {claudeAuthStatus?.apiProvider ? <span className="orion-chip">Provider {claudeAuthStatus.apiProvider}</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: claudeAuthStatus?.loggedIn ? 'var(--success-fg)' : 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {claudeAuthStatus?.message || 'Check Claude login status before saving this account.'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 36, paddingInline: 14 }}
                      onClick={() => void refreshClaudeAuthStatus()}
                      disabled={providerBusy['claude-auth'] === 'status'}
                    >
                      <RefreshCw size={13} />
                      {providerBusy['claude-auth'] === 'status' ? 'Checking…' : 'Check login'}
                    </button>
                    <button
                      className="orion-btn orion-btn-primary"
                      style={{ minHeight: 36, paddingInline: 14 }}
                      onClick={() => void handleClaudeAuthLogin()}
                      disabled={providerBusy['claude-auth'] === 'login'}
                    >
                      <Plus size={13} />
                      {providerBusy['claude-auth'] === 'login' ? 'Starting…' : 'Sign in to Claude'}
                    </button>
                  </div>
                </div>
              ) : (
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {providerForm.provider === 'vertex' ? 'Access token' : providerForm.provider === 'openai' ? 'API key or token' : 'Secret'}
                  </span>
                  <input
                    className="input"
                    type="password"
                    value={providerForm.secret}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, secret: event.target.value }))}
                    placeholder={
                      providerForm.provider === 'openai'
                        ? 'sk-...'
                        : providerForm.provider === 'anthropic'
                          ? 'sk-ant-...'
                          : providerForm.provider === 'gemini'
                            ? 'AIza...'
                            : 'Access token'
                    }
                  />
                </label>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={providerForm.enableRuntime}
                  onChange={(event) => setProviderForm((prev) => ({ ...prev, enableRuntime: event.target.checked }))}
                />
                Enable this account for runtime immediately
              </label>
            </div>

            {providerError ? (
              <div
                style={{
                  borderRadius: 14,
                  border: '1px solid var(--warning-border)',
                  background: 'var(--warning-bg)',
                  color: 'var(--warning-fg)',
                  padding: '10px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {providerError}
              </div>
            ) : null}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 18,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {connectMode
                  ? 'Connect a provider here, then return to chat.'
                  : 'Save the account here, then continue managing runtime order from Integrations.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 40, paddingInline: 16 }}
                  onClick={() => setShowProviderForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="orion-btn orion-btn-primary"
                  style={{ minHeight: 40, paddingInline: 16 }}
                  onClick={() => void handleSaveProviderCredential()}
                  disabled={providerBusy['provider-create'] === 'save'}
                >
                  <Plus size={14} />
                  {providerBusy['provider-create'] === 'save'
                    ? (connectMode ? 'Connecting…' : 'Saving…')
                    : (connectMode ? 'Connect provider' : 'Save account')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
