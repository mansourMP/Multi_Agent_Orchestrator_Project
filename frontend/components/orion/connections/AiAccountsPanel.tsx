'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_MODELS,
  type ProviderId,
} from '@/app/page.catalog';
import { ProviderLogoMark } from '@/components/orion/connections/ConnectionMarks';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type ProviderCredentialRow = {
  id: string;
  label: string;
  provider: ProviderId;
  rawProvider?: string;
  metadata?: Record<string, unknown>;
  authMode?: string;
  created_at?: string;
  updated_at?: string;
};

type ProviderProfileRow = {
  id: string;
  provider: ProviderId;
  rawProvider?: string;
  label: string;
  credential_id?: string | null;
  auth_mode?: string | null;
  workspace_id?: string | null;
  priority?: number;
  enabled: boolean;
  model?: string | null;
};

type ProviderHealthState = Partial<Record<ProviderId, string>>;

type ProviderFormState = {
  secret: string;
  orgId: string;
  projectId: string;
  location: string;
  baseUrl: string;
};

type AiAccountsPanelProps = {
  workspaceId: string;
  mode?: 'manage' | 'connect';
  returnTo?: string;
};

const VISIBLE_PROVIDER_IDS: ProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'vertex',
  'deepseek',
  'mistral',
  'qwen',
  'ollama',
];

const MASKED_SECRET = '••••••••••••';

const PROVIDER_DESCRIPTIONS: Record<ProviderId, string> = {
  openai: 'Direct OpenAI access for chat, code, and general-purpose tasks.',
  anthropic: 'Direct Claude access through Anthropic’s API.',
  gemini: 'Google Gemini API access for general-purpose generation.',
  vertex: 'Vertex AI access with a project and region-scoped credential.',
  deepseek: 'DeepSeek via its OpenAI-compatible API.',
  mistral: 'Direct Mistral API access.',
  qwen: 'Use your DashScope API key from console.aliyun.com.',
  ollama: 'Connect a local Ollama endpoint running on this machine.',
  'openai-codex': '',
  claude_code_cli: '',
};

const EMPTY_FORM: ProviderFormState = {
  secret: '',
  orgId: '',
  projectId: '',
  location: 'us-central1',
  baseUrl: 'http://localhost:11434',
};

function isVisibleProvider(value: unknown): value is ProviderId {
  return VISIBLE_PROVIDER_IDS.includes(value as ProviderId);
}

function knownProviderId(value?: unknown): ProviderId | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'openai-codex' || normalized === 'claude_code_cli') return null;
  return isVisibleProvider(normalized) ? normalized : null;
}

function providerLabel(provider: ProviderId): string {
  return DEFAULT_PROVIDER_LABELS[provider] || provider;
}

function defaultProviderModel(provider: ProviderId): string {
  return DEFAULT_PROVIDER_MODELS[provider]?.[0] || '';
}

function normalizeOllamaBaseUrl(value?: string | null): string {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) return 'http://localhost:11434';
  return normalized.endsWith('/v1') ? normalized.slice(0, -3) : normalized;
}

function normalizeOllamaPayloadBaseUrl(value: string): string {
  const normalized = normalizeOllamaBaseUrl(value);
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

function pickLatestCredential(items: ProviderCredentialRow[]): ProviderCredentialRow | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((left, right) => {
    const leftTs = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTs = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTs - leftTs;
  });
  return sorted[0] || null;
}

function pickPrimaryProfile(items: ProviderProfileRow[]): ProviderProfileRow | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((left, right) => {
    const leftPriority = typeof left.priority === 'number' ? left.priority : 100;
    const rightPriority = typeof right.priority === 'number' ? right.priority : 100;
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
  return sorted[0] || null;
}

export default function AiAccountsPanel({ workspaceId }: AiAccountsPanelProps) {
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentialRow[]>([]);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfileRow[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthState>({});
  const [healthUnavailable, setHealthUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null);
  const [formState, setFormState] = useState<Record<ProviderId, ProviderFormState>>(() => {
    return Object.fromEntries(VISIBLE_PROVIDER_IDS.map((provider) => [provider, { ...EMPTY_FORM }])) as Record<ProviderId, ProviderFormState>;
  });
  const [savingProvider, setSavingProvider] = useState<ProviderId | null>(null);
  const [rowBusy, setRowBusy] = useState<Partial<Record<ProviderId, 'test'>>>({});

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

  const loadHealthSnapshot = useCallback(async (): Promise<{ statuses: ProviderHealthState; unavailable: boolean }> => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 3000) : null;
    try {
      const res = await controlPlaneFetch(
        `/api/control-plane/providers/health-check?workspace_id=${encodeURIComponent(workspaceId)}`,
        controller ? { signal: controller.signal } : undefined,
      );
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok || !body || typeof body !== 'object' || Array.isArray(body)) {
        return { statuses: {}, unavailable: true };
      }
      const statuses: ProviderHealthState = {};
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        const provider = knownProviderId(key);
        if (!provider || typeof value !== 'string') continue;
        statuses[provider] = value;
      }
      return { statuses, unavailable: false };
    } catch {
      return { statuses: {}, unavailable: true };
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }, [controlPlaneFetch, workspaceId]);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [credentialsRes, profilesRes, healthSnapshot] = await Promise.all([
        controlPlaneFetch(`/api/control-plane/credentials?workspace_id=${encodeURIComponent(workspaceId)}`),
        controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(workspaceId)}`),
        loadHealthSnapshot(),
      ]);

      const credentialsRaw = await credentialsRes.text().catch(() => '');
      const profilesRaw = await profilesRes.text().catch(() => '');
      const credentialsBody = credentialsRaw ? JSON.parse(credentialsRaw) : {};
      const profilesBody = profilesRaw ? JSON.parse(profilesRaw) : {};

      if (!credentialsRes.ok) {
        throw new Error(String(credentialsBody?.detail || credentialsBody?.message || 'Failed to load provider credentials.'));
      }
      if (!profilesRes.ok) {
        throw new Error(String(profilesBody?.detail || profilesBody?.message || 'Failed to load provider profiles.'));
      }

      const credentialItems = Array.isArray(credentialsBody?.items) ? credentialsBody.items : [];
      const normalizedCredentials = credentialItems
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item: Record<string, unknown>): ProviderCredentialRow | null => {
          const provider = knownProviderId(item.provider);
          if (!provider) return null;
          const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
          return {
            id: typeof item.id === 'string' ? item.id : '',
            label: typeof item.label === 'string' ? item.label : providerLabel(provider),
            provider,
            rawProvider: typeof item.provider === 'string' ? item.provider : provider,
            metadata,
            authMode: typeof metadata.auth_mode === 'string' ? metadata.auth_mode : undefined,
            created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
            updated_at: typeof item.updated_at === 'string' ? item.updated_at : undefined,
          };
        })
        .filter((item: ProviderCredentialRow | null): item is ProviderCredentialRow => Boolean(item?.id));

      const profileItems = Array.isArray(profilesBody?.items) ? profilesBody.items : [];
      const normalizedProfiles = profileItems
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item: Record<string, unknown>): ProviderProfileRow | null => {
          const provider = knownProviderId(item.provider);
          if (!provider) return null;
          return {
            id: typeof item.id === 'string' ? item.id : '',
            provider,
            rawProvider: typeof item.provider === 'string' ? item.provider : provider,
            label: typeof item.label === 'string' ? item.label : providerLabel(provider),
            credential_id: typeof item.credential_id === 'string' ? item.credential_id : null,
            auth_mode: typeof item.auth_mode === 'string' ? item.auth_mode : null,
            workspace_id: typeof item.workspace_id === 'string' ? item.workspace_id : null,
            priority: typeof item.priority === 'number' ? item.priority : 100,
            enabled: item.enabled !== false,
            model: typeof item.model === 'string' ? item.model : null,
          };
        })
        .filter((item: ProviderProfileRow | null): item is ProviderProfileRow => Boolean(item?.id));

      setProviderCredentials(normalizedCredentials);
      setProviderProfiles(normalizedProfiles);
      setProviderHealth(healthSnapshot.statuses);
      setHealthUnavailable(healthSnapshot.unavailable);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load AI providers.');
    } finally {
      setLoading(false);
    }
  }, [controlPlaneFetch, loadHealthSnapshot, workspaceId]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const providerState = useMemo(() => {
    return Object.fromEntries(
      VISIBLE_PROVIDER_IDS.map((provider) => {
        const credentials = providerCredentials.filter((item) => item.provider === provider);
        const profiles = providerProfiles.filter((item) => item.provider === provider);
        const credential = pickLatestCredential(credentials);
        const profile = pickPrimaryProfile(profiles);
        return [provider, { credential, profile }];
      }),
    ) as Record<ProviderId, { credential: ProviderCredentialRow | null; profile: ProviderProfileRow | null }>;
  }, [providerCredentials, providerProfiles]);

  const openForm = useCallback((provider: ProviderId) => {
    const existing = providerState[provider]?.credential;
    setExpandedProvider((current) => (current === provider ? null : provider));
    setFormState((current) => ({
      ...current,
      [provider]: {
        secret: existing ? MASKED_SECRET : '',
        orgId: String(existing?.metadata?.org_id || '').trim(),
        projectId: String(existing?.metadata?.project_id || '').trim(),
        location: String(existing?.metadata?.location || 'us-central1').trim() || 'us-central1',
        baseUrl: normalizeOllamaBaseUrl(String(existing?.metadata?.base_url || 'http://localhost:11434')),
      },
    }));
    setError('');
    setNotice('');
  }, [providerState]);

  const updateFormField = useCallback((provider: ProviderId, field: keyof ProviderFormState, value: string) => {
    setFormState((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        [field]: value,
      },
    }));
  }, []);

  const saveProvider = useCallback(async (provider: ProviderId) => {
    const currentForm = formState[provider];
    const existingCredential = providerState[provider]?.credential;
    const existingProfile = providerState[provider]?.profile;
    const secretChanged = currentForm.secret.trim() !== '' && currentForm.secret !== MASKED_SECRET;
    const currentOrgId = String(existingCredential?.metadata?.org_id || '').trim();
    const currentProjectId = String(existingCredential?.metadata?.project_id || '').trim();
    const currentLocation = String(existingCredential?.metadata?.location || 'us-central1').trim() || 'us-central1';
    const currentBaseUrl = normalizeOllamaBaseUrl(String(existingCredential?.metadata?.base_url || 'http://localhost:11434'));

    if (provider === 'ollama') {
      if (!currentForm.baseUrl.trim()) {
        setError('Base URL is required for Ollama.');
        return;
      }
    } else if (!existingCredential && !secretChanged) {
      setError(provider === 'vertex' ? 'Credential is required for Vertex.' : 'API key is required.');
      return;
    }

    if (provider === 'openai' && existingCredential && !secretChanged && currentForm.orgId.trim() !== currentOrgId) {
      setError('Re-enter the OpenAI API key to update the organization ID.');
      return;
    }
    if (provider === 'vertex' && existingCredential && !secretChanged && (
      currentForm.projectId.trim() !== currentProjectId
      || (currentForm.location.trim() || 'us-central1') !== currentLocation
    )) {
      setError('Re-enter the Vertex credential to update the project or location.');
      return;
    }

    if (provider === 'vertex' && !currentForm.projectId.trim()) {
      setError('Project ID is required for Vertex.');
      return;
    }

    if (existingCredential && !secretChanged) {
      if (provider === 'ollama' && currentForm.baseUrl.trim() === currentBaseUrl) {
        setExpandedProvider(null);
        setNotice('No changes to save.');
        return;
      }
      if (provider !== 'ollama') {
        setExpandedProvider(null);
        setNotice('No changes to save.');
        return;
      }
    }

    setSavingProvider(provider);
    setError('');
    setNotice('');
    try {
      let credentialsPayload: Record<string, unknown>;
      let authMode = 'api_key';

      if (provider === 'openai') {
        credentialsPayload = {
          api_key: currentForm.secret.trim(),
          auth_mode: 'api_key',
          ...(currentForm.orgId.trim() ? { org_id: currentForm.orgId.trim() } : {}),
        };
      } else if (provider === 'vertex') {
        authMode = 'access_token';
        credentialsPayload = {
          access_token: currentForm.secret.trim(),
          project_id: currentForm.projectId.trim(),
          location: currentForm.location.trim() || 'us-central1',
          auth_mode: 'access_token',
        };
      } else if (provider === 'ollama') {
        authMode = 'none';
        credentialsPayload = {
          auth_mode: 'none',
          base_url: normalizeOllamaPayloadBaseUrl(currentForm.baseUrl),
        };
      } else {
        credentialsPayload = {
          api_key: currentForm.secret.trim(),
          auth_mode: 'api_key',
        };
      }

      const saveRes = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
        body: JSON.stringify({
          label: existingCredential?.label || providerLabel(provider),
          provider,
          workspace_id: workspaceId,
          mode: 'byok',
          credentials: credentialsPayload,
        }),
      });
      const saveRaw = await saveRes.text().catch(() => '');
      const saveBody = saveRaw ? JSON.parse(saveRaw) : {};
      if (!saveRes.ok) {
        throw new Error(String(saveBody?.detail || saveBody?.message || 'Failed to save provider credential.'));
      }

      const nextCredentialId = String(saveBody?.id || '').trim();
      if (!nextCredentialId) {
        throw new Error('Provider credential saved without an ID.');
      }

      const profilePayload = {
        id: existingProfile?.id || undefined,
        provider: existingCredential?.rawProvider || provider,
        label: existingProfile?.label || providerLabel(provider),
        credential_id: nextCredentialId,
        auth_mode: existingProfile?.auth_mode || authMode,
        workspace_id: existingProfile?.workspace_id || workspaceId,
        priority: existingProfile?.priority || 100,
        enabled: true,
        model: existingProfile?.model || defaultProviderModel(provider),
      };

      const profileRes = await controlPlaneFetch('/api/control-plane/providers/profiles', {
        method: 'POST',
        body: JSON.stringify(profilePayload),
      });
      const profileRaw = await profileRes.text().catch(() => '');
      const profileBody = profileRaw ? JSON.parse(profileRaw) : {};
      if (!profileRes.ok) {
        throw new Error(String(profileBody?.detail || profileBody?.message || 'Failed to save provider runtime profile.'));
      }

      if (existingCredential && existingCredential.id !== nextCredentialId) {
        await controlPlaneFetch(
          `/api/control-plane/credentials/${encodeURIComponent(existingCredential.id)}?workspace_id=${encodeURIComponent(workspaceId)}`,
          { method: 'DELETE' },
        );
      }

      setExpandedProvider(null);
      setFormState((current) => ({
        ...current,
        [provider]: {
          ...EMPTY_FORM,
          location: 'us-central1',
          baseUrl: 'http://localhost:11434',
        },
      }));
      await loadProviders();
      setNotice(`${providerLabel(provider)} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save provider.');
    } finally {
      setSavingProvider(null);
    }
  }, [controlPlaneFetch, formState, loadProviders, providerState, workspaceId]);

  const statusForProvider = useCallback((provider: ProviderId) => {
    const configured = Boolean(providerState[provider]?.credential);
    const health = providerHealth[provider];
    if (!configured) {
      return { className: 'is-idle', text: 'Not connected' };
    }
    if (health === 'ok') {
      return { className: 'is-connected', text: 'Connected' };
    }
    if (typeof health === 'string' && health.startsWith('failed:')) {
      const text = health.replace(/^failed:\s*/i, '').trim() || 'Connection failed';
      return { className: 'is-error', text: text.length > 36 ? `${text.slice(0, 36).trimEnd()}…` : text };
    }
    if (healthUnavailable) {
      return { className: 'is-idle', text: 'Status unavailable' };
    }
    return { className: 'is-idle', text: 'Connected' };
  }, [healthUnavailable, providerHealth, providerState]);

  if (loading) {
    return (
      <div className="orion-integrations-list">
        <div className="orion-integration-row">
          <div className="orion-integration-row-main">
            <div className="orion-integration-row-name">Loading providers…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="orion-provider-list">
      {error ? <div className="orion-integrations-feedback is-error">{error}</div> : null}
      {notice ? <div className="orion-integrations-feedback is-success">{notice}</div> : null}

      <div className="orion-integrations-list">
        {VISIBLE_PROVIDER_IDS.map((provider, index) => {
          const providerStatus = statusForProvider(provider);
          const existingCredential = providerState[provider]?.credential;
          const currentForm = formState[provider];
          const expanded = expandedProvider === provider;
          const saving = savingProvider === provider;
          const busy = rowBusy[provider] === 'test';

          return (
            <div key={provider}>
              <div className={`orion-integration-row${index === VISIBLE_PROVIDER_IDS.length - 1 && !expanded ? ' is-last' : ''}`}>
                <div className="orion-integration-row-main">
                  <ProviderLogoMark provider={provider} size={20} />
                  <div className="orion-integration-row-title-wrap">
                    <div className="orion-integration-row-name">{providerLabel(provider)}</div>
                    <div className="orion-integration-row-description">{PROVIDER_DESCRIPTIONS[provider]}</div>
                  </div>
                </div>
                <div className="orion-integration-row-actions">
                  <span className={`orion-integration-status ${providerStatus.className}`}>
                    <span className="orion-integration-status-dot" />
                    <span className="orion-integration-status-text">{providerStatus.text}</span>
                  </span>
                  <button
                    type="button"
                    className="orion-btn orion-btn-secondary orion-integration-action"
                    onClick={() => openForm(provider)}
                    disabled={saving || busy}
                  >
                    {existingCredential ? 'Configure' : 'Connect'}
                  </button>
                </div>
              </div>

              {expanded ? (
                <div className={`orion-integration-form${index === VISIBLE_PROVIDER_IDS.length - 1 ? ' is-last' : ''}`}>
                  {provider === 'qwen' ? (
                    <div className="orion-integration-form-note">Use your DashScope API key from console.aliyun.com.</div>
                  ) : null}
                  <div className="orion-integration-form-grid">
                    {provider !== 'ollama' ? (
                      <label className="orion-integration-field">
                        <span className="orion-integration-field-label">
                          {provider === 'vertex' ? 'Access token' : 'API key'}
                        </span>
                        <input
                          className="input"
                          type="password"
                          value={currentForm.secret}
                          onChange={(event) => updateFormField(provider, 'secret', event.target.value)}
                          placeholder={provider === 'anthropic' ? 'sk-ant-...' : provider === 'gemini' ? 'AIza...' : 'Enter secret'}
                        />
                      </label>
                    ) : null}

                    {provider === 'openai' ? (
                      <label className="orion-integration-field">
                        <span className="orion-integration-field-label">Organization ID (optional)</span>
                        <input
                          className="input"
                          value={currentForm.orgId}
                          onChange={(event) => updateFormField(provider, 'orgId', event.target.value)}
                          placeholder="org_..."
                        />
                      </label>
                    ) : null}

                    {provider === 'vertex' ? (
                      <>
                        <label className="orion-integration-field">
                          <span className="orion-integration-field-label">Project ID</span>
                          <input
                            className="input"
                            value={currentForm.projectId}
                            onChange={(event) => updateFormField(provider, 'projectId', event.target.value)}
                            placeholder="my-project"
                          />
                        </label>
                        <label className="orion-integration-field">
                          <span className="orion-integration-field-label">Location</span>
                          <input
                            className="input"
                            value={currentForm.location}
                            onChange={(event) => updateFormField(provider, 'location', event.target.value)}
                            placeholder="us-central1"
                          />
                        </label>
                      </>
                    ) : null}

                    {provider === 'ollama' ? (
                      <label className="orion-integration-field">
                        <span className="orion-integration-field-label">Base URL</span>
                        <input
                          className="input"
                          value={currentForm.baseUrl}
                          onChange={(event) => updateFormField(provider, 'baseUrl', event.target.value)}
                          placeholder="http://localhost:11434"
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="orion-integration-form-actions">
                    <button
                      type="button"
                      className="orion-btn orion-btn-ghost orion-integration-action"
                      onClick={() => setExpandedProvider(null)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="orion-btn orion-btn-primary orion-integration-action"
                      onClick={() => void saveProvider(provider)}
                      disabled={saving}
                    >
                      {saving ? <LoaderCircle size={14} className="orion-spin" /> : null}
                      Save
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
