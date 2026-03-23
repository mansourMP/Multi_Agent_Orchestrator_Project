'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  getProviderAuthModes,
  isProviderId,
  type ProviderId,
  type ProviderOption,
} from '@/app/page.catalog';

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
  apiUrl: string;
  workspaceId: string;
  runtimeApiKey: string;
};

type ClaudeAuthStatus = {
  ok?: boolean;
  available?: boolean;
  loggedIn?: boolean;
  authMethod?: string;
  apiProvider?: string;
  message?: string;
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
    return 'Runtime is offline. Start Empyralis services to manage saved AI accounts.';
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
  if (resolved === 'api_key') return 'API Key';
  if (resolved === 'access_token') return 'Access Token';
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
  return {
    api_key: token,
    access_token: token,
    oauth_token: token,
    auth_mode: state.authMode || 'api_key',
  };
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

function profileStatusLabel(profile: ProviderProfileRow | null): string {
  if (!profile) return 'Vault only';
  if (profile.health === 'cooldown') return 'Cooldown';
  return profile.enabled ? 'Enabled for runtime' : 'Disabled';
}

function claudeAuthTone(loggedIn: boolean): CSSProperties {
  return loggedIn
    ? { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' }
    : { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
}

function normalizeClaudeCliError(message: string): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (lowered.includes('not logged in') || lowered.includes('/login')) {
    return 'Claude is not signed in on this machine yet. Use Sign in to Claude in the add-account dialog, then refresh status.';
  }
  return normalized;
}

export default function AiAccountsPanel({ apiUrl, workspaceId, runtimeApiKey }: AiAccountsPanelProps) {
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(DEFAULT_PROVIDER_OPTIONS);
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentialRow[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRow[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderProfilesHealth>({ healthy: 0, cooldown: 0, disabled: 0, total: 0 });
  const [providerLoading, setProviderLoading] = useState(true);
  const [providerError, setProviderError] = useState('');
  const [providerNotice, setProviderNotice] = useState('');
  const [providerBusy, setProviderBusy] = useState<Record<string, string>>({});
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderAccountFormState>(DEFAULT_PROVIDER_FORM);
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<ClaudeAuthStatus | null>(null);

  const buildHeaders = useCallback((withJson: boolean): HeadersInit => {
    const headers = new Headers();
    if (withJson) headers.set('Content-Type', 'application/json');
    if (runtimeApiKey) headers.set('X-API-Key', runtimeApiKey);
    return headers;
  }, [runtimeApiKey]);

  const selectedProviderOption = useMemo(
    () => providerOptionFor(providerForm.provider, providerOptions),
    [providerForm.provider, providerOptions],
  );
  const selectedProviderAuthModes = useMemo(
    () => getProviderAuthModes(selectedProviderOption),
    [selectedProviderOption],
  );
  const usesClaudeLocalCli = providerForm.provider === 'anthropic' && providerForm.authMode === 'local_cli';

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

  const loadProviderAccounts = useCallback(async () => {
    if (!runtimeApiKey) {
      setProviderError('Runtime key is missing. Open Setup and enter the same runtime key used by the local stack.');
      setProviderNotice('');
      setProviderCredentials([]);
      setProviderProfiles([]);
      setProviderHealth({ healthy: 0, cooldown: 0, disabled: 0, total: 0 });
      setProviderLoading(false);
      return;
    }

    setProviderLoading(true);
    setProviderError('');
    setProviderNotice('');
    try {
      const [providersRes, credentialsRes, profilesRes] = await Promise.all([
        fetch(`${apiUrl}/providers`, { headers: buildHeaders(false) }),
        fetch(`${apiUrl}/credentials/vault?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: buildHeaders(false) }),
        fetch(`${apiUrl}/providers/profiles/health?workspace_id=${encodeURIComponent(workspaceId)}`, { headers: buildHeaders(false) }),
      ]);

      const providersRaw = await providersRes.text().catch(() => '');
      const credentialsRaw = await credentialsRes.text().catch(() => '');
      const profilesRaw = await profilesRes.text().catch(() => '');
      const providersBody = providersRaw ? JSON.parse(providersRaw) : {};
      const credentialsBody = credentialsRaw ? JSON.parse(credentialsRaw) : {};
      const profilesBody = profilesRaw ? JSON.parse(profilesRaw) : {};

      if (!providersRes.ok) {
        throw new Error(String(providersBody?.detail || providersBody?.message || 'Failed to load provider catalog.'));
      }
      if (!credentialsRes.ok) {
        throw new Error(String(credentialsBody?.detail || credentialsBody?.message || 'Failed to load saved AI accounts.'));
      }
      if (!profilesRes.ok) {
        throw new Error(String(profilesBody?.detail || profilesBody?.message || 'Failed to load provider profiles.'));
      }

      const providerItems: unknown[] = Array.isArray(providersBody?.providers) ? providersBody.providers : [];
      const normalizedProviders = providerItems
        .map((item: unknown): ProviderOption | null => {
          if (!item || typeof item !== 'object') return null;
          const value = item as { id?: unknown; label?: unknown; default_model?: unknown; auth?: unknown; auth_modes?: unknown; default_auth_mode?: unknown };
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
            defaultModel: typeof value.default_model === 'string' && value.default_model.trim()
              ? value.default_model.trim()
              : fallback?.defaultModel || DEFAULT_PROVIDER_MODELS[id]?.[0] || '',
            auth: Array.isArray(value.auth)
              ? value.auth.filter((entry): entry is string => typeof entry === 'string')
              : fallback?.auth || ['api_key'],
            defaultAuthMode: typeof value.default_auth_mode === 'string' && value.default_auth_mode.trim()
              ? value.default_auth_mode.trim()
              : fallback?.defaultAuthMode || fallback?.auth?.[0] || 'api_key',
            authModes,
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
            model: typeof item.model === 'string' ? item.model : null,
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
    } catch (error) {
      setProviderError(normalizeProvidersError(error instanceof Error ? error.message : 'Failed to load saved AI accounts.'));
    } finally {
      setProviderLoading(false);
    }
  }, [apiUrl, buildHeaders, runtimeApiKey, workspaceId]);

  useEffect(() => {
    void loadProviderAccounts();
  }, [loadProviderAccounts]);

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
      const res = await fetch(`${apiUrl}/providers/anthropic/local-cli/status`, {
        headers: buildHeaders(false),
      });
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
  }, [apiUrl, buildHeaders]);

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
    const res = await fetch(`${apiUrl}/providers/profiles`, {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => '');
    const body = raw ? JSON.parse(raw) : {};
    if (!res.ok) throw new Error(String(body?.detail || body?.message || 'Failed to save runtime profile.'));
  }, [apiUrl, buildHeaders, providerOptions, workspaceId]);

  const handleSaveProviderCredential = useCallback(async () => {
    if (!runtimeApiKey) {
      setProviderError('Runtime key is missing. Open Setup first and use the same runtime key as the local stack.');
      return;
    }
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
    try {
      const credentials = buildProviderCredentialPayload(providerForm);
      const res = await fetch(`${apiUrl}/credentials/vault`, {
        method: 'POST',
        headers: buildHeaders(true),
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
      setProviderNotice(providerForm.enableRuntime ? 'AI account saved and enabled for runtime.' : 'AI account saved to the encrypted vault.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save AI account.';
      setProviderError(usesClaudeLocalCli ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy('provider-create', null);
    }
  }, [
    apiUrl,
    buildHeaders,
    loadProviderAccounts,
    providerForm,
    providerOptions,
    resetProviderForm,
    runtimeApiKey,
    selectedProviderAuthModes,
    selectedProviderOption.defaultAuthMode,
    setProviderActionBusy,
    upsertRuntimeProfileForCredential,
    workspaceId,
    usesClaudeLocalCli,
    claudeAuthStatus,
  ]);

  const handleTestProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'test');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await fetch(`${apiUrl}/credentials/vault/${encodeURIComponent(credential.id)}/test?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'POST',
        headers: buildHeaders(false),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) throw new Error(String(body?.detail || body?.message || 'AI account test failed.'));
      const preview = Array.isArray(body?.models_preview)
        ? body.models_preview.filter((item: unknown): item is string => typeof item === 'string')
        : [];
      setProviderNotice(
        preview.length > 0
          ? `${body?.message || 'Connection verified.'} Models: ${preview.slice(0, 3).join(', ')}`
          : String(body?.message || 'Connection verified.'),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI account test failed.';
      setProviderError(credential.provider === 'anthropic' && credential.authMode === 'local_cli' ? normalizeClaudeCliError(message) : message);
    } finally {
      setProviderActionBusy(credential.id, null);
    }
  }, [apiUrl, buildHeaders, setProviderActionBusy, workspaceId]);

  const handleToggleProviderProfile = useCallback(async (credential: ProviderCredentialRow, existingProfile?: ProviderProfileRow | null) => {
    const action = existingProfile?.enabled ? 'disable-runtime' : 'enable-runtime';
    setProviderActionBusy(credential.id, action);
    setProviderError('');
    setProviderNotice('');
    try {
      if (existingProfile?.enabled) {
        const res = await fetch(`${apiUrl}/providers/profiles/${encodeURIComponent(existingProfile.id)}/disable`, {
          method: 'POST',
          headers: buildHeaders(false),
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
  }, [apiUrl, buildHeaders, loadProviderAccounts, setProviderActionBusy, upsertRuntimeProfileForCredential]);

  const handleDeleteProviderProfile = useCallback(async (profile: ProviderProfileRow) => {
    setProviderActionBusy(profile.id, 'remove-profile');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await fetch(`${apiUrl}/providers/profiles/${encodeURIComponent(profile.id)}`, {
        method: 'DELETE',
        headers: buildHeaders(false),
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
  }, [apiUrl, buildHeaders, loadProviderAccounts, setProviderActionBusy]);

  const handleRemoveProviderCredential = useCallback(async (credential: ProviderCredentialRow) => {
    setProviderActionBusy(credential.id, 'remove');
    setProviderError('');
    setProviderNotice('');
    try {
      const linkedProfiles = providerProfilesByCredential.get(credential.id) || [];
      for (const profile of linkedProfiles) {
        const deleteRes = await fetch(`${apiUrl}/providers/profiles/${encodeURIComponent(profile.id)}`, {
          method: 'DELETE',
          headers: buildHeaders(false),
        });
        const deleteRaw = await deleteRes.text().catch(() => '');
        const deleteBody = deleteRaw ? JSON.parse(deleteRaw) : {};
        if (!deleteRes.ok) {
          throw new Error(String(deleteBody?.detail || deleteBody?.message || 'Failed to remove linked runtime profile.'));
        }
      }

      const res = await fetch(`${apiUrl}/credentials/vault/${encodeURIComponent(credential.id)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
        headers: buildHeaders(false),
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
  }, [apiUrl, buildHeaders, loadProviderAccounts, providerProfilesByCredential, setProviderActionBusy, workspaceId]);

  const handleClaudeAuthLogin = useCallback(async () => {
    setProviderActionBusy('claude-auth', 'login');
    setProviderError('');
    setProviderNotice('');
    try {
      const res = await fetch(`${apiUrl}/providers/anthropic/local-cli/login`, {
        method: 'POST',
        headers: buildHeaders(false),
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
  }, [apiUrl, buildHeaders, refreshClaudeAuthStatus, setProviderActionBusy]);

  return (
    <>
      <section className="orion-panel muted" style={{ display: 'grid', gap: 12, padding: '14px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 3 }}>
            <div className="orion-panel-title">AI accounts</div>
            <div className="orion-panel-copy">
              Store provider logins here, then decide which saved account is enabled for runtime use.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="orion-btn orion-btn-ghost" style={{ minHeight: 38, paddingInline: 12 }} onClick={() => void loadProviderAccounts()}>
              <RefreshCw size={14} />
              Refresh
            </button>
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
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="orion-chip">{providerCredentials.length} saved</span>
          <span className="orion-chip">{providerHealth.total} runtime profiles</span>
          {providerHealth.healthy ? <span className="orion-chip">{providerHealth.healthy} healthy</span> : null}
          {providerHealth.cooldown ? <span className="orion-chip">{providerHealth.cooldown} cooling down</span> : null}
          {providerHealth.disabled ? <span className="orion-chip">{providerHealth.disabled} disabled</span> : null}
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

        {providerNotice ? (
          <div
            style={{
              borderRadius: 14,
              border: '1px solid var(--success-border)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '10px 12px',
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            {providerNotice}
          </div>
        ) : null}

        {providerLoading ? (
          <section className="orion-empty" style={{ minHeight: 180 }}>
            <div className="orion-empty-title">Loading AI accounts</div>
            <div className="orion-empty-copy">Reading saved provider credentials and runtime profiles from the local state directory.</div>
          </section>
        ) : providerCredentials.length === 0 && orphanProviderProfiles.length === 0 ? (
          <section className="orion-empty" style={{ minHeight: 180 }}>
            <div className="orion-empty-title">No AI accounts yet</div>
            <div className="orion-empty-copy" style={{ marginBottom: 16 }}>
              Save OpenAI, Anthropic, Gemini, or Vertex here so runs and workflows can reuse them cleanly.
            </div>
            <button
              className="orion-btn orion-btn-primary"
              onClick={() => {
                resetProviderForm();
                setShowProviderForm(true);
              }}
            >
              <Plus size={14} />
              Add AI account
            </button>
          </section>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {providerCredentials.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {providerCredentials.map((credential) => {
                  const linkedProfiles = providerProfilesByCredential.get(credential.id) || [];
                  const primaryProfile = linkedProfiles.find((item) => item.enabled || item.health === 'cooldown') || linkedProfiles[0] || null;
                  const busyAction = providerBusy[credential.id] || '';
                  return (
                    <article
                      key={credential.id}
                      style={{
                        display: 'grid',
                        gap: 10,
                        borderRadius: 16,
                        border: '1px solid var(--border-subtle)',
                        background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-element) 84%, transparent 16%), var(--bg-surface))',
                        padding: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{credential.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {providerAccountContextLine(credential)}
                          </div>
                        </div>
                        <span className="orion-chip" style={profileTone(primaryProfile)}>
                          {profileStatusLabel(primaryProfile)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="orion-chip">{providerLabel(credential.provider, providerOptions)}</span>
                        <span className="orion-chip">{providerAuthModeLabel(credential.provider, credential.authMode, providerOptions)}</span>
                        {primaryProfile?.model ? <span className="orion-chip">Model {primaryProfile.model}</span> : null}
                      </div>

                      {primaryProfile ? (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {primaryProfile.last_error
                            ? primaryProfile.last_error
                            : primaryProfile.last_success_at
                              ? `Last success ${formatDate(primaryProfile.last_success_at)}`
                              : primaryProfile.health === 'cooldown'
                                ? `Cooling down until ${formatDate(primaryProfile.cooldown_until)}`
                                : 'Runtime profile is ready for runs.'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          Saved in vault only. Enable runtime when you want this account available to runs.
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 34, paddingInline: 12 }}
                          onClick={() => void handleTestProviderCredential(credential)}
                          disabled={Boolean(busyAction)}
                        >
                          <ShieldCheck size={13} />
                          {busyAction === 'test' ? 'Testing…' : 'Test'}
                        </button>
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 34, paddingInline: 12 }}
                          onClick={() => void handleToggleProviderProfile(credential, primaryProfile)}
                          disabled={Boolean(busyAction)}
                        >
                          {primaryProfile?.enabled ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                          {busyAction === 'disable-runtime'
                            ? 'Disabling…'
                            : busyAction === 'enable-runtime'
                              ? 'Enabling…'
                              : primaryProfile?.enabled
                                ? 'Disable runtime'
                                : primaryProfile
                                  ? 'Enable runtime'
                                  : 'Use in runtime'}
                        </button>
                        {primaryProfile ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 34, paddingInline: 12 }}
                            onClick={() => void handleDeleteProviderProfile(primaryProfile)}
                            disabled={Boolean(busyAction)}
                          >
                            <X size={13} />
                            {providerBusy[primaryProfile.id] === 'remove-profile' ? 'Removing profile…' : 'Remove profile'}
                          </button>
                        ) : null}
                        <button
                          className="orion-btn orion-btn-danger"
                          style={{ minHeight: 34, paddingInline: 12 }}
                          onClick={() => void handleRemoveProviderCredential(credential)}
                          disabled={Boolean(busyAction)}
                        >
                          <Trash2 size={13} />
                          {busyAction === 'remove' ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {orphanProviderProfiles.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  borderRadius: 16,
                  border: '1px solid var(--border-subtle)',
                  background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
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
            background: 'rgba(12, 10, 18, 0.18)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={() => setShowProviderForm(false)}
        >
          <div
            className="orion-panel"
            style={{
              width: 'min(1120px, calc(100vw - 48px))',
              maxHeight: 'calc(100vh - 48px)',
              overflow: 'auto',
              display: 'grid',
              gap: 22,
              padding: 28,
              borderRadius: 28,
              boxShadow: '0 24px 80px rgba(10, 8, 18, 0.18)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Add AI account</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Save the login in the encrypted vault, then optionally enable it as a runtime profile immediately.
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
                background: 'color-mix(in srgb, var(--bg-element) 82%, transparent 18%)',
                padding: 22,
              }}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  Account setup
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Pick the provider, choose the auth method, and confirm the runtime model.
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
                  <input
                    className="input"
                    value={providerForm.model}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, model: event.target.value }))}
                    placeholder={defaultProviderModel(providerForm.provider, providerForm.authMode, providerOptions)}
                  />
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
                One centered account flow, then back to the Connections page.
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
                  {providerBusy['provider-create'] === 'save' ? 'Saving…' : 'Save account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
