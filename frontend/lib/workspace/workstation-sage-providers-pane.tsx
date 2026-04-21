'use client';

import { type ClipboardEvent, useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice, joinClassNames } from '@/lib/ui/primitives';
import { FormField, FormInput } from '@/lib/ui/form-controls';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { emitWorkstationProviderChanged } from '@/lib/workspace/workstation-provider-events';
import {
  type ProviderCatalogModelRecord,
  type ProviderCatalogRecord,
  type ProviderProfileRecord,
  type VaultCredentialRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type ProviderSnapshot = {
  id: string;
  label: string;
  state: string;
  usable: boolean;
  active: boolean;
  defaultModel: string | null;
  activeSource: string | null;
  stateDetail: string | null;
  models: ProviderCatalogModelRecord[];
};

type ProviderConnectionSnapshot = {
  provider: ProviderSnapshot;
  credential: VaultCredentialRecord | null;
  profile: ProviderProfileRecord | null;
  connected: boolean;
  keyTail: string | null;
};

const SUPPORTED_PROVIDER_IDS = [
  'openai',
  'anthropic',
  'gemini',
] as const;

const FALLBACK_PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeProviderCatalog(payload: unknown): ProviderSnapshot[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const providers = Array.isArray(record.providers)
    ? record.providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];

  return providers.flatMap((provider) => {
    const id = readString(provider.id).toLowerCase();
    if (!id || !SUPPORTED_PROVIDER_IDS.includes(id as typeof SUPPORTED_PROVIDER_IDS[number])) {
      return [];
    }
    return [{
      id,
      label: readString(provider.label, id),
      state: readString(provider.state, 'unknown'),
      usable: provider.usable === true,
      active: provider.active === true,
      defaultModel: readOptionalString(provider.default_model),
      activeSource: readOptionalString(provider.active_source),
      stateDetail: readOptionalString(provider.state_detail),
      models: Array.isArray(provider.models)
        ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
        : [],
    }];
  });
}

function fallbackProviderCatalog(): ProviderSnapshot[] {
  return SUPPORTED_PROVIDER_IDS.map((id) => ({
    id,
    label: FALLBACK_PROVIDER_LABELS[id] ?? id,
    state: 'unknown',
    usable: false,
    active: false,
    defaultModel: null,
    activeSource: null,
    stateDetail: null,
    models: [],
  }));
}

function normalizeProviderProfiles(payload: unknown): ProviderProfileRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is ProviderProfileRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeVaultCredentials(payload: unknown): VaultCredentialRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is VaultCredentialRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function sortProfiles(profiles: ProviderProfileRecord[]): ProviderProfileRecord[] {
  return [...profiles].sort((left, right) => {
    const leftPriority = Number(left.priority ?? 100);
    const rightPriority = Number(right.priority ?? 100);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return readString(left.id).localeCompare(readString(right.id));
  });
}

function sortCredentials(credentials: VaultCredentialRecord[]): VaultCredentialRecord[] {
  return [...credentials].sort((left, right) =>
    readString(right.updated_at ?? right.created_at).localeCompare(readString(left.updated_at ?? left.created_at)));
}

function isSecretlessConnection(providerId: string, profile: ProviderProfileRecord | null): boolean {
  const authMode = readString(profile?.auth_mode).toLowerCase();
  if (authMode === 'local_cli' || authMode === 'none') {
    return true;
  }
  if (providerId === 'ollama' && readString(profile?.health).toLowerCase() !== 'disabled') {
    return true;
  }
  return false;
}

function providerRequiresKey(providerId: string): boolean {
  return providerId !== 'ollama';
}

function maskKeyTail(credential: VaultCredentialRecord | null): string | null {
  if (!credential || typeof credential.metadata !== 'object' || !credential.metadata) {
    return null;
  }
  return readOptionalString((credential.metadata as Record<string, unknown>).credential_last4);
}

function normalizeProviderModels(payload: unknown): ProviderCatalogModelRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const models = Array.isArray(record.models) ? record.models : [];
  return models
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((id) => ({
      id,
      label: id,
      provider: 'ollama',
    }));
}

export function WorkstationSageProvidersPane() {
  const services = useWorkspaceServices();
  const [providers, setProviders] = useState<ProviderSnapshot[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfileRecord[]>([]);
  const [credentials, setCredentials] = useState<VaultCredentialRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'connect' | 'manage' | 'rotate'>('connect');
  const [draftApiKey, setDraftApiKey] = useState('');
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [providerModelOverrides, setProviderModelOverrides] = useState<Record<string, ProviderCatalogModelRecord[]>>({});

  async function loadProviders(): Promise<void> {
    const [catalogResult, profileResult, credentialResult] = await Promise.allSettled([
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      services.client.listVaultCredentials(),
    ]);
    const catalogPayload = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
    const profilePayload = profileResult.status === 'fulfilled' ? profileResult.value : { items: [] };
    const credentialPayload = credentialResult.status === 'fulfilled' ? credentialResult.value : { items: [] };
    const normalizedProviders = normalizeProviderCatalog(catalogPayload);
    setProviders(normalizedProviders.length > 0 ? normalizedProviders : fallbackProviderCatalog());
    setProfiles(normalizeProviderProfiles(profilePayload));
    setCredentials(normalizeVaultCredentials(credentialPayload));
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadProviders()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Sage provider settings are unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  useEffect(() => {
    let cancelled = false;
    void services.client.listRuntimeTargets()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        const items = Array.isArray(record.items) ? record.items : [];
        const localOnline = items.some((item) => {
          const target = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          return readString(target.id).toLowerCase() === 'local_companion' && Boolean(target.online);
        });
        if (!localOnline) {
          setProviderModelOverrides((current) => (current.ollama ? { ...current, ollama: [] } : current));
          return;
        }
        void services.client.listProviderModels({ providerId: 'ollama' })
          .then((modelsPayload: Record<string, unknown>) => {
            if (cancelled) {
              return;
            }
            setProviderModelOverrides((current) => ({
              ...current,
              ollama: normalizeProviderModels(modelsPayload),
            }));
          })
          .catch(() => {
            if (cancelled) {
              return;
            }
            setProviderModelOverrides((current) => ({
              ...current,
              ollama: [],
            }));
          });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const providerRows = useMemo<ProviderConnectionSnapshot[]>(() => providers.map((provider) => {
    const resolvedProvider = provider.id === 'ollama'
      ? { ...provider, models: providerModelOverrides.ollama ?? [] }
      : providerModelOverrides[provider.id]?.length
        ? { ...provider, models: providerModelOverrides[provider.id] }
        : provider;
    const providerProfiles = sortProfiles(
      profiles.filter((item) => readString(item.provider).toLowerCase() === resolvedProvider.id),
    );
    const providerCredentials = sortCredentials(
      credentials.filter((item) => readString(item.provider).toLowerCase() === resolvedProvider.id),
    );
    const profile = providerProfiles[0] ?? null;
    const credential = providerCredentials[0] ?? null;
    const secretlessConnected = isSecretlessConnection(resolvedProvider.id, profile);
    const connected = Boolean(credential) || secretlessConnected;
    return {
      provider: resolvedProvider,
      credential,
      profile,
      connected,
      keyTail: maskKeyTail(credential),
    };
  }), [credentials, profiles, providerModelOverrides, providers]);

  async function handleSave(providerId: string): Promise<void> {
    const trimmedKey = draftApiKey.trim();
    if (providerRequiresKey(providerId) && !trimmedKey) {
      setError('API key is required before Sage can connect this provider.');
      return;
    }
    setSavingProviderId(providerId);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: providerId,
        apiKey: trimmedKey || null,
        model: null,
      });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId,
        action: 'saved',
      });
      await loadProviders();
      setStatus(`${providerRows.find((item) => item.provider.id === providerId)?.provider.label ?? 'Provider'} is now connected to Sage.`);
      setExpandedProviderId(providerId);
      setEditorMode('manage');
      setDraftApiKey('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider connection failed.');
    } finally {
      setSavingProviderId(null);
    }
  }

  async function handleDisconnect(providerId: string): Promise<void> {
    setSavingProviderId(providerId);
    setError(null);
    setStatus(null);
    try {
      await services.client.deleteWorkspaceProviderCredential({ provider: providerId });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId,
        action: 'deleted',
      });
      await loadProviders();
      setExpandedProviderId(null);
      setEditorMode('connect');
      setStatus(`${providerRows.find((item) => item.provider.id === providerId)?.provider.label ?? 'Provider'} was disconnected from Sage.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Provider disconnect failed.');
    } finally {
      setSavingProviderId(null);
    }
  }

  function handleApiKeyPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setDraftApiKey(pastedText);
  }

  return (
    <div className="sage-settings-panel">
      {status ? <AppNotice tone="success">{status}</AppNotice> : null}
      {error ? <AppNotice tone="warning">{error}</AppNotice> : null}

      <div className="sage-provider-list" role="list">
        {providerRows.map((item) => {
          const { provider, credential, profile, connected, keyTail } = item;
          const isExpanded = expandedProviderId === provider.id;
          const isSaving = savingProviderId === provider.id;
          return (
            <article key={provider.id} className="sage-provider-row" role="listitem">
              <div className="sage-provider-row__summary">
                <div className="sage-provider-row__identity">
                  <span className="sage-provider-row__logo" aria-hidden="true">
                    {provider.label.charAt(0).toUpperCase()}
                  </span>
                  <div className="sage-provider-row__copy">
                    <strong className="sage-provider-row__title">{provider.label}</strong>
                    <div className="sage-provider-row__meta">
                      <span className={joinClassNames(
                        'sage-provider-row__status',
                        connected && 'sage-provider-row__status--connected',
                      )}
                      >
                        {connected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="sage-provider-row__actions">
                  {!connected ? (
                    <AppButton
                      type="button"
                      tone="secondary"
                      onClick={() => {
                        setExpandedProviderId(provider.id);
                        setEditorMode('connect');
                        setDraftApiKey('');
                      }}
                    >
                      Connect
                    </AppButton>
                  ) : (
                    <AppButton
                      type="button"
                      tone="secondary"
                      onClick={() => {
                        setExpandedProviderId(provider.id);
                        setEditorMode('manage');
                        setDraftApiKey('');
                      }}
                    >
                      Manage
                    </AppButton>
                  )}
                </div>
              </div>

              {isExpanded ? (
                <div className="sage-provider-row__detail">
                  {editorMode === 'manage' ? (
                    <div className="sage-provider-row__manage">
                      <div className="sage-provider-row__manage-copy">
                        <p className="sage-provider-row__manage-label">Current key</p>
                        <p className="sage-provider-row__manage-value">
                          {keyTail
                            ? `••••${keyTail}`
                            : providerRequiresKey(provider.id)
                              ? 'Saved key hidden'
                              : 'No API key required'}
                        </p>
                      </div>
                      <div className="sage-provider-row__manage-actions">
                        <AppButton
                          type="button"
                          tone="secondary"
                          onClick={() => {
                            setEditorMode('rotate');
                            setDraftApiKey('');
                          }}
                        >
                          Rotate key
                        </AppButton>
                        <AppButton
                          type="button"
                          tone="ghost"
                          disabled={isSaving}
                          onClick={() => {
                            void handleDisconnect(provider.id);
                          }}
                        >
                          Disconnect
                        </AppButton>
                      </div>
                    </div>
                  ) : (
                    <div className="sage-provider-row__form">
                      <FormField
                        label={editorMode === 'rotate' ? 'New API key' : 'API key'}
                        hint={providerRequiresKey(provider.id)
                          ? 'The key stays masked and is only used for this workspace.'
                          : 'Ollama runs locally and does not require a key. You can leave this blank.'}
                      >
                        <FormInput
                          type="text"
                          value={draftApiKey}
                          placeholder={providerRequiresKey(provider.id) ? 'sk-...' : 'Optional token'}
                          autoComplete="off"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          data-1p-ignore="true"
                          data-lpignore="true"
                          onPasteCapture={handleApiKeyPaste}
                          onChange={(event) => {
                            setDraftApiKey(event.currentTarget.value);
                          }}
                        />
                      </FormField>
                      <div className="sage-provider-row__form-actions">
                        <AppButton
                          type="button"
                          disabled={isSaving}
                          onClick={() => {
                            void handleSave(provider.id);
                          }}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </AppButton>
                        <AppButton
                          type="button"
                          tone="ghost"
                          disabled={isSaving}
                          onClick={() => {
                            setDraftApiKey('');
                            if (connected) {
                              setEditorMode('manage');
                            } else {
                              setExpandedProviderId(null);
                            }
                          }}
                        >
                          Cancel
                        </AppButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}

        {!isLoading && providerRows.length === 0 ? (
          fallbackProviderCatalog().map((provider) => (
            <article key={provider.id} className="sage-provider-row" role="listitem" aria-hidden="true">
              <div className="sage-provider-row__summary">
                <div className="sage-provider-row__identity">
                  <span className="sage-provider-row__logo" aria-hidden="true">
                    {provider.label.charAt(0).toUpperCase()}
                  </span>
                  <div className="sage-provider-row__copy">
                    <strong className="sage-provider-row__title">{provider.label}</strong>
                    <div className="sage-provider-row__meta">
                      <span className="sage-provider-row__status">Not connected</span>
                    </div>
                  </div>
                </div>
                <div className="sage-provider-row__actions">
                  <AppButton type="button" tone="secondary" disabled>Connect</AppButton>
                </div>
              </div>
            </article>
          ))
        ) : null}
        {isLoading ? (
          fallbackProviderCatalog().map((provider) => (
            <article key={provider.id} className="sage-provider-row" role="listitem" aria-hidden="true">
              <div className="sage-provider-row__summary">
                <div className="sage-provider-row__identity">
                  <SkeletonBlock height="2.5rem" width="2.5rem" />
                  <div className="sage-provider-row__copy">
                    <SkeletonBlock height="1rem" width="8rem" />
                    <SkeletonBlock height="0.875rem" width="6rem" />
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : null}
      </div>
    </div>
  );
}
