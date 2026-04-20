'use client';

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { FormField, FormInput, FormSelect } from '@/lib/ui/form-controls';
import { AppButton, AppNotice, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { WorkstationSageToolsPane } from '@/lib/workspace/workstation-sage-tools-pane';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { requestWorkspaceJson } from '@/lib/workspace/workspace-json-request';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type {
  ProviderCatalogModelRecord,
  ProviderCatalogRecord,
  ProviderProfileRecord,
  VaultCredentialRecord,
} from '@/lib/workspace/workstation-client';

type IntegrationStatus = 'connected' | 'not_connected';

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

type ProviderCardRecord = {
  kind: 'provider';
  id: string;
  label: string;
  image: string;
  status: IntegrationStatus;
  provider: ProviderSnapshot;
  credential: VaultCredentialRecord | null;
  profile: ProviderProfileRecord | null;
  connected: boolean;
  connectedViaRuntime: boolean;
  keyTail: string | null;
};

type ConnectorCardDefinition = {
  id: string;
  label: string;
  image: string;
  connectorIds?: string[];
  provider?: 'telegram' | 'whatsapp';
  capabilityTags: string[];
};

type ConnectorCardRecord = {
  kind: 'connector';
  id: string;
  label: string;
  image: string;
  status: IntegrationStatus;
  connected: boolean;
  credential: VaultCredentialRecord | null;
  definition: ConnectorCardDefinition;
};

type ChannelLinkRecord = {
  provider?: string | null;
  status?: string | null;
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

const PROVIDER_IMAGE_BY_ID: Record<string, string> = {
  openai: '/integrations/openai.png',
  anthropic: '/integrations/anthropic.png',
  gemini: '/integrations/gemini.jpg',
  mistral: '/integrations/mistral.png',
  deepseek: '/integrations/deepseek.jpg',
  qwen: '/integrations/qwen.png',
  ollama: '/integrations/ollama.png',
};

const CONNECTOR_DEFINITIONS: ConnectorCardDefinition[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    image: '/integrations/telegram.png',
    connectorIds: ['telegram_bot'],
    provider: 'telegram',
    capabilityTags: ['Messages', 'Replies'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    image: '/integrations/whatsapp.png',
    connectorIds: ['whatsapp_twilio'],
    provider: 'whatsapp',
    capabilityTags: ['Messages', 'Autopilot'],
  },
  {
    id: 'gmail',
    label: 'Gmail',
    image: '/integrations/gmail.png',
    connectorIds: ['google_workspace'],
    capabilityTags: ['Send email', 'Read inbox'],
  },
  {
    id: 'google_calendar',
    label: 'Google Calendar',
    image: '/integrations/microsoft365.png',
    connectorIds: ['google_workspace'],
    capabilityTags: ['Calendar', 'Events'],
  },
  {
    id: 'slack',
    label: 'Slack',
    image: '/integrations/slack.png',
    connectorIds: ['slack'],
    capabilityTags: ['Channels', 'DMs'],
  },
  {
    id: 'github',
    label: 'GitHub',
    image: '/integrations/github.png',
    connectorIds: ['github'],
    capabilityTags: ['Issues', 'Pull requests'],
  },
  {
    id: 'notion',
    label: 'Notion',
    image: '/integrations/notion.png',
    connectorIds: ['notion'],
    capabilityTags: ['Pages', 'Search'],
  },
  {
    id: 'microsoft_365',
    label: 'Microsoft 365',
    image: '/integrations/microsoft365.png',
    connectorIds: ['microsoft_365'],
    capabilityTags: ['Mail', 'Calendar'],
  },
  {
    id: 'webhook',
    label: 'Webhook',
    image: '/integrations/webhook.png',
    connectorIds: ['webhook'],
    capabilityTags: ['HTTP', 'Automation'],
  },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(max-width: 820px)');
    const sync = () => {
      setColumns(mediaQuery.matches ? 2 : 4);
    };
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => {
      mediaQuery.removeEventListener('change', sync);
    };
  }, []);

  return columns;
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

function normalizeChannelLinks(payload: unknown): ChannelLinkRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.links)
    ? record.links.filter((item): item is ChannelLinkRecord => Boolean(item) && typeof item === 'object')
    : [];
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

function isRuntimeConnected(provider: ProviderSnapshot): boolean {
  return provider.usable || provider.active;
}

function maskKeyTail(credential: VaultCredentialRecord | null): string | null {
  if (!credential || typeof credential.metadata !== 'object' || !credential.metadata) {
    return null;
  }
  return readOptionalString((credential.metadata as Record<string, unknown>).credential_last4);
}

function BrandLogo({
  id,
  label,
  src,
  failedLogos,
  onError,
}: {
  id: string;
  label: string;
  src: string;
  failedLogos: Set<string>;
  onError: (id: string) => void;
}) {
  const failed = failedLogos.has(id);
  if (failed || !src) {
    return (
      <span className="sage-integration-brand sage-integration-brand--fallback" aria-hidden="true">
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="sage-integration-brand">
      <img
        src={src}
        alt={label}
        width={40}
        height={40}
        className="sage-integration-brand__image"
        style={{ objectFit: 'contain', borderRadius: '8px' }}
        onError={() => onError(id)}
      />
    </span>
  );
}

export function WorkstationSageConnectorsPane({
  showProviders = true,
  showTools = true,
  connectorIds,
}: {
  showProviders?: boolean;
  showTools?: boolean;
  connectorIds?: string[];
} = {}) {
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const gridColumns = useResponsiveColumns();
  const [providers, setProviders] = useState<ProviderSnapshot[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfileRecord[]>([]);
  const [credentials, setCredentials] = useState<VaultCredentialRecord[]>([]);
  const [connectorVault, setConnectorVault] = useState<VaultCredentialRecord[]>([]);
  const [channelLinks, setChannelLinks] = useState<ChannelLinkRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [providerDraftKeys, setProviderDraftKeys] = useState<Record<string, string>>({});
  const [providerDraftModels, setProviderDraftModels] = useState<Record<string, string>>({});
  const [connectorMemoryEnabled, setConnectorMemoryEnabled] = useState<Record<string, boolean>>({});
  const [providerModelOverrides, setProviderModelOverrides] = useState<Record<string, ProviderCatalogModelRecord[]>>({});
  const [failedLogos, setFailedLogos] = useState<Set<string>>(() => new Set());
  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const [catalogResult, profileResult, credentialResult, connectorResult, channelResult] = await Promise.allSettled([
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      services.client.listVaultCredentials(),
      services.client.listConnectorsVault(),
      requestWorkspaceJson<Record<string, unknown>>(
        services,
        `/api/channel-pairing/links?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}&include_revoked=true`,
      ),
    ]);

    const catalogPayload = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
    const normalizedProviders = normalizeProviderCatalog(catalogPayload);
    setProviders(normalizedProviders.length > 0 ? normalizedProviders : fallbackProviderCatalog());
    setProfiles(profileResult.status === 'fulfilled' ? normalizeProviderProfiles(profileResult.value) : []);
    setCredentials(credentialResult.status === 'fulfilled' ? normalizeVaultCredentials(credentialResult.value) : []);
    setConnectorVault(connectorResult.status === 'fulfilled' ? normalizeVaultCredentials(connectorResult.value) : []);
    setChannelLinks(channelResult.status === 'fulfilled' ? normalizeChannelLinks(channelResult.value) : []);

    if (catalogResult.status === 'rejected') {
      throw catalogResult.reason;
    }
  }, [bootstrap.workspace.id, services.client]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void loadState()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Integrations are unavailable right now.');
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
  }, [loadState]);

  const localCompanionOnline = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target) => target.id === 'local_companion' && target.online),
    [bootstrap.runtime.runtimeTargets],
  );

  useEffect(() => {
    let cancelled = false;
    if (!localCompanionOnline) {
      setProviderModelOverrides((current) => (current.ollama ? { ...current, ollama: [] } : current));
      return undefined;
    }
    void services.client.listProviderModels({ providerId: 'ollama' })
      .then((payload: Record<string, unknown>) => {
        if (cancelled) {
          return;
        }
        setProviderModelOverrides((current) => ({
          ...current,
          ollama: normalizeProviderModels(payload),
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
    return () => {
      cancelled = true;
    };
  }, [localCompanionOnline, services.client]);

  const providerCards = useMemo<ProviderCardRecord[]>(() => providers.map((provider) => {
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
    const runtimeConnected = isRuntimeConnected(resolvedProvider);
    const connectedViaRuntime = runtimeConnected && !credential && !secretlessConnected;
    const connected = Boolean(credential) || secretlessConnected || runtimeConnected;
    return {
      kind: 'provider',
      id: resolvedProvider.id,
      label: resolvedProvider.label,
      image: PROVIDER_IMAGE_BY_ID[resolvedProvider.id] ?? '',
      status: connected ? 'connected' : 'not_connected',
      provider: resolvedProvider,
      credential,
      profile,
      connected,
      connectedViaRuntime,
      keyTail: maskKeyTail(credential),
    };
  }), [credentials, profiles, providerModelOverrides, providers]);

  const connectorCards = useMemo<ConnectorCardRecord[]>(() => {
    const latestConnectorById = new Map<string, VaultCredentialRecord>();
    sortCredentials(connectorVault).forEach((item) => {
      const connectorId = readString(item.connector).toLowerCase();
      if (connectorId && !latestConnectorById.has(connectorId)) {
        latestConnectorById.set(connectorId, item);
      }
    });
    const activeChannelProviders = new Set(
      channelLinks
        .filter((item) => readString(item.status, 'active').toLowerCase() === 'active')
        .map((item) => readString(item.provider).toLowerCase())
        .filter(Boolean),
    );

    return CONNECTOR_DEFINITIONS.flatMap((definition) => {
      if (Array.isArray(connectorIds) && connectorIds.length > 0 && !connectorIds.includes(definition.id)) {
        return [];
      }
      const connectorCredential = (definition.connectorIds ?? [])
        .map((connectorId) => latestConnectorById.get(connectorId))
        .find((item): item is VaultCredentialRecord => Boolean(item)) ?? null;
      const connectedByProvider = definition.provider ? activeChannelProviders.has(definition.provider) : false;
      const connected = connectedByProvider || Boolean(connectorCredential);
      return [{
        kind: 'connector',
        id: definition.id,
        label: definition.label,
        image: definition.image,
        status: connected ? 'connected' : 'not_connected',
        connected,
        credential: connectorCredential,
        definition,
      }];
    });
  }, [channelLinks, connectorIds, connectorVault]);

  useEffect(() => {
    setProviderDraftModels((current) => {
      const next = { ...current };
      providerCards.forEach((card) => {
        const defaultModel = readOptionalString(card.profile?.model) ?? card.provider.defaultModel;
        if (!next[card.id] && defaultModel) {
          next[card.id] = defaultModel;
        }
      });
      return next;
    });
  }, [providerCards]);

  useEffect(() => {
    setConnectorMemoryEnabled((current) => {
      const next = { ...current };
      connectorCards.forEach((card) => {
        if (card.connected && typeof next[card.id] !== 'boolean') {
          next[card.id] = true;
        }
      });
      return next;
    });
  }, [connectorCards]);

  async function refreshAfterMutation(successMessage: string): Promise<void> {
    await loadState();
    setStatus(successMessage);
    setError(null);
  }

  function markLogoFailed(id: string) {
    setFailedLogos((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  async function handleProviderSave(record: ProviderCardRecord): Promise<void> {
    const draftApiKey = (providerDraftKeys[record.id] ?? '').trim();
    if (providerRequiresKey(record.provider.id) && !draftApiKey) {
      setError('API key is required before Sage can connect this provider.');
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: record.provider.id,
        apiKey: draftApiKey || null,
        model: readOptionalString(providerDraftModels[record.id]) ?? record.provider.defaultModel,
      });
      await refreshAfterMutation(`${record.label} is now connected.`);
      setProviderDraftKeys((current) => ({ ...current, [record.id]: '' }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider connection failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleProviderModelChange(record: ProviderCardRecord, model: string) {
    setProviderDraftModels((current) => ({ ...current, [record.id]: model }));
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertProviderProfile({
        id: readOptionalString(record.profile?.id),
        provider: record.provider.id,
        label: readString(record.profile?.label, `Sage ${record.label}`),
        credentialId: readOptionalString(record.profile?.credential_id) ?? readOptionalString(record.credential?.id),
        authMode: readOptionalString(record.profile?.auth_mode),
        priority: Number(record.profile?.priority ?? 0),
        enabled: record.profile?.enabled !== false,
        model,
      });
      await refreshAfterMutation(`${record.label} model updated.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider model update failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleProviderDisconnect(record: ProviderCardRecord): Promise<void> {
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.deleteWorkspaceProviderCredential({ provider: record.provider.id });
      await refreshAfterMutation(`${record.label} disconnected.`);
      setExpandedCardId(null);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Provider disconnect failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleConnectorDisconnect(record: ConnectorCardRecord): Promise<void> {
    if (!record.credential?.id) {
      setStatus(`${record.label} is not managed from this panel yet.`);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.deleteConnectorVaultCredential({ credentialId: record.credential.id });
      await refreshAfterMutation(`${record.label} disconnected.`);
      setExpandedCardId(null);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Connector disconnect failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  function handleBlockedToolAction(toolKey: string) {
    if (toolKey === 'gmail') {
      setExpandedCardId('gmail');
      return;
    }
    if (toolKey === 'calendar') {
      setExpandedCardId('google_calendar');
    }
  }

  function renderProviderCard(record: ProviderCardRecord) {
    const isExpanded = expandedCardId === record.id;
    return (
      <button
        key={record.id}
        type="button"
        className={joinClassNames('sage-unified-card', isExpanded && 'sage-unified-card--selected')}
        onClick={() => {
          setExpandedCardId(isExpanded ? null : record.id);
        }}
      >
        <BrandLogo
          id={record.id}
          label={record.label}
          src={record.image}
          failedLogos={failedLogos}
          onError={markLogoFailed}
        />
        <strong className="sage-unified-card__title">{record.label}</strong>
        <span className={joinClassNames('sage-unified-card__status', record.status === 'connected' && 'sage-unified-card__status--connected')}>
          {record.status === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {record.status === 'connected' ? 'Connected' : 'Not connected'}
        </span>
      </button>
    );
  }

  function renderConnectorCard(record: ConnectorCardRecord) {
    const isExpanded = expandedCardId === record.id;
    return (
      <button
        key={record.id}
        type="button"
        className={joinClassNames('sage-unified-card', isExpanded && 'sage-unified-card--selected')}
        onClick={() => {
          setExpandedCardId(isExpanded ? null : record.id);
        }}
      >
        <BrandLogo
          id={record.id}
          label={record.label}
          src={record.image}
          failedLogos={failedLogos}
          onError={markLogoFailed}
        />
        <strong className="sage-unified-card__title">{record.label}</strong>
        <span className={joinClassNames('sage-unified-card__status', record.status === 'connected' && 'sage-unified-card__status--connected')}>
          {record.status === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {record.status === 'connected' ? 'Connected' : 'Not connected'}
        </span>
      </button>
    );
  }

  function renderProviderExpand(record: ProviderCardRecord) {
    const busy = busyCardId === record.id;
    const currentModel = providerDraftModels[record.id] ?? readOptionalString(record.profile?.model) ?? record.provider.defaultModel ?? '';
    const modelOptions = record.provider.models
      .map((model) => ({
        value: readString(model.id),
        label: readString(model.label, readString(model.id)),
      }))
      .filter((option) => option.value);

    return (
      <div className="sage-unified-expand">
        <div className="sage-unified-expand__header">
          <strong className="sage-unified-expand__title">{record.label}</strong>
          <button
            type="button"
            className="sage-unified-expand__close"
            onClick={() => setExpandedCardId(null)}
            aria-label={`Close ${record.label}`}
          >
            <X size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
        {record.status === 'connected' ? (
          <>
            <div className="sage-unified-expand__text">
              {record.connectedViaRuntime
                ? `Connected via runtime · ${record.provider.stateDetail ?? 'Managed by the runtime environment.'}`
                : `Connected · ${record.keyTail ? `••••${record.keyTail}` : providerRequiresKey(record.provider.id) ? 'Saved key hidden' : 'No API key required'}`}
            </div>
            {record.provider.id === 'ollama' && !localCompanionOnline ? (
              <div className="sage-unified-expand__text">
                Connect local device to use Ollama
              </div>
            ) : null}
            {modelOptions.length > 0 ? (
              <FormField label="Default model">
                <FormSelect
                  value={currentModel}
                  onChange={(event) => {
                    void handleProviderModelChange(record, event.currentTarget.value);
                  }}
                >
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
            ) : null}
            {record.connectedViaRuntime ? null : (
              <div className="sage-unified-expand__actions">
                <AppButton
                  type="button"
                  tone="ghost"
                  disabled={busy}
                  onClick={() => {
                    void handleProviderDisconnect(record);
                  }}
                >
                  Disconnect
                </AppButton>
              </div>
            )}
          </>
        ) : (
          <>
            {providerRequiresKey(record.provider.id) ? (
              <FormField label="API key">
                <FormInput
                  type="text"
                  value={providerDraftKeys[record.id] ?? ''}
                  placeholder="sk-..."
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  onChange={(event) => {
                    setProviderDraftKeys((current) => ({ ...current, [record.id]: event.currentTarget.value }));
                  }}
                />
              </FormField>
            ) : (
              <div className="sage-unified-expand__text">
                {localCompanionOnline
                  ? 'Connected local device can expose available Ollama models from this machine.'
                  : 'Connect local device to use Ollama'}
              </div>
            )}
            <div className="sage-unified-expand__actions">
              <AppButton
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleProviderSave(record);
                }}
              >
                {busy ? 'Saving…' : 'Save'}
              </AppButton>
              <button
                type="button"
                className="sage-unified-expand__link"
                onClick={() => setExpandedCardId(null)}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderProviderSkeletons() {
    const rows = chunkItems(fallbackProviderCatalog(), gridColumns);
    return (
      <section className="sage-unified-section">
        <p className="sage-unified-section__label">AI Providers</p>
        {rows.map((row, rowIndex) => (
          <div
            key={`AI Providers-skeleton-${rowIndex}`}
            className={joinClassNames('sage-unified-grid', gridColumns === 2 ? 'sage-unified-grid--2' : 'sage-unified-grid--4')}
          >
            {row.map((provider) => (
              <div key={provider.id} className="sage-unified-card" aria-hidden="true">
                <SkeletonBlock height="40px" width="40px" />
                <SkeletonBlock height="16px" width="70%" />
                <SkeletonBlock height="12px" width="54%" />
              </div>
            ))}
          </div>
        ))}
      </section>
    );
  }

  function renderConnectorExpand(record: ConnectorCardRecord) {
    if (record.id === 'telegram') {
      return (
        <div className="sage-unified-expand sage-unified-expand--embed">
          <div className="sage-unified-expand__header">
            <strong className="sage-unified-expand__title">Telegram</strong>
            <button
              type="button"
              className="sage-unified-expand__close"
              onClick={() => setExpandedCardId(null)}
              aria-label="Close Telegram"
            >
              <X size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
          <WorkspaceChannelPairingSurface featureId="integrations" />
        </div>
      );
    }

    return (
      <div className="sage-unified-expand">
        <div className="sage-unified-expand__header">
          <strong className="sage-unified-expand__title">{record.label}</strong>
          <button
            type="button"
            className="sage-unified-expand__close"
            onClick={() => setExpandedCardId(null)}
            aria-label={`Close ${record.label}`}
          >
            <X size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
        {record.connected ? (
          <>
            <div className="sage-unified-expand__tag-row">
              {record.definition.capabilityTags.map((tag) => (
                <span key={tag} className="sage-unified-expand__tag">{tag}</span>
              ))}
            </div>
            <div className="sage-unified-expand__toggle-row">
              <span className="sage-unified-expand__text">Memory</span>
              <button
                type="button"
                className={joinClassNames(
                  'sage-tool-toggle',
                  connectorMemoryEnabled[record.id] !== false && 'sage-tool-toggle--enabled',
                )}
                onClick={() => {
                  setConnectorMemoryEnabled((current) => ({ ...current, [record.id]: !current[record.id] }));
                }}
                aria-pressed={connectorMemoryEnabled[record.id] !== false}
              >
                <span className="sage-tool-toggle__thumb" />
              </button>
            </div>
            <div className="sage-unified-expand__actions">
              <AppButton
                type="button"
                tone="ghost"
                disabled={busyCardId === record.id}
                onClick={() => {
                  void handleConnectorDisconnect(record);
                }}
              >
                Disconnect
              </AppButton>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  function renderSection<T extends ProviderCardRecord | ConnectorCardRecord>(
    label: string,
    items: T[],
    renderCard: (item: T) => ReactNode,
    renderExpand: (item: T) => ReactNode,
  ) {
    const rows = chunkItems(items, gridColumns);
    return (
      <section className="sage-unified-section">
        <p className="sage-unified-section__label">{label}</p>
        {rows.map((row, rowIndex) => {
          const expandedRecord = row.find((item) => item.id === expandedCardId) ?? null;
          return (
            <Fragment key={`${label}-${rowIndex}`}>
              <div className={joinClassNames('sage-unified-grid', gridColumns === 2 ? 'sage-unified-grid--2' : 'sage-unified-grid--4')}>
                {row.map((item) => renderCard(item))}
              </div>
              {expandedRecord ? renderExpand(expandedRecord) : null}
            </Fragment>
          );
        })}
      </section>
    );
  }

  return (
    <div className="sage-settings-panel sage-settings-panel--connectors">
      {status ? <AppNotice tone="success">{status}</AppNotice> : null}
      {error ? <AppNotice tone="warning">{error}</AppNotice> : null}

      <div className="sage-unified-page">
        {showProviders ? (
          isLoading
            ? renderProviderSkeletons()
            : renderSection(
              'AI Providers',
              providerCards.length > 0 ? providerCards : fallbackProviderCatalog().map((provider) => ({
                kind: 'provider' as const,
                id: provider.id,
                label: provider.label,
                image: PROVIDER_IMAGE_BY_ID[provider.id] ?? '',
                status: 'not_connected' as const,
                provider,
                credential: null,
                profile: null,
                connected: false,
                connectedViaRuntime: false,
                keyTail: null,
              })),
              renderProviderCard,
              renderProviderExpand,
            )
        ) : null}
        {showTools ? (
          <section className="sage-unified-section">
            <p className="sage-unified-section__label">Tools</p>
            <WorkstationSageToolsPane onBlockedRequirementAction={handleBlockedToolAction} />
          </section>
        ) : null}
        {isLoading ? (
          <div className="sage-settings-empty">
            Loading connectors…
          </div>
        ) : renderSection('Connectors', connectorCards, renderConnectorCard, renderConnectorExpand)}
      </div>
    </div>
  );
}
