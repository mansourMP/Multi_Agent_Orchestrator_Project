'use client';

import { Fragment, type ClipboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { FormField, FormInput, FormSelect } from '@/lib/ui/form-controls';
import { MotionSlidePanel } from '@/lib/ui/motion';
import { AppButton, AppNotice, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { WorkstationSageToolsPane } from '@/lib/workspace/workstation-sage-tools-pane';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { emitWorkstationProviderChanged } from '@/lib/workspace/workstation-provider-events';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type {
  ProviderCatalogModelRecord,
  ProviderCatalogRecord,
  ProviderProfileRecord,
  VaultCredentialRecord,
} from '@/lib/workspace/workstation-client';

type IntegrationStatus = 'connected' | 'not_connected';

type ProviderAuthModeSnapshot = {
  id: string;
  label: string;
  secretRequired: boolean;
};

type ProviderSnapshot = {
  id: string;
  label: string;
  state: string;
  usable: boolean;
  active: boolean;
  hidden: boolean;
  sageVisible: boolean;
  studioVisible: boolean;
  localOnly: boolean;
  defaultModel: string | null;
  defaultAuthMode: string | null;
  authModes: ProviderAuthModeSnapshot[];
  providerScopes: string[];
  activeSource: string | null;
  credentialPlane: string | null;
  credentialPlaneLabel: string | null;
  credentialOwnerKind: string | null;
  workspaceConnected: boolean;
  hostedSageAiPolicy: string | null;
  stateDetail: string | null;
  modelsSyncedAt: string | null;
  modelsError: string | null;
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
  keyTail: string | null;
};

type HostedSageAiSnapshot = {
  allowed: boolean;
  planAllowsHostedAi: boolean;
  policy: string;
  reason: string | null;
  message: string | null;
  monthlyCapUsd: number;
  monthlyCostUsd: number;
  monthlyRemainingUsd: number;
};

type ProviderPickerSection = {
  id: 'byok' | 'hosted';
  label: string;
  items: ProviderCardRecord[];
};

type ConnectorCardDefinition = {
  id: string;
  label: string;
  image: string;
  connectorIds?: string[];
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

type GatewayRegistrationRecord = Record<string, unknown> & {
  gateway_id?: string | null;
  display_name?: string | null;
  status?: string | null;
  connection_status?: string | null;
  device_trust_state?: string | null;
  last_seen_at?: string | null;
};

type GatewayDoctorPayload = Record<string, unknown> & {
  status?: string | null;
  browser?: Record<string, unknown> | null;
  browser_attach?: Record<string, unknown> | null;
};

type PersonalChannelStateRecord = Record<string, unknown> & {
  status?: string | null;
  qr_code?: string | null;
  login_hint?: string | null;
  linked_name?: string | null;
  linked_jid?: string | null;
  linked_phone?: string | null;
  linked_username?: string | null;
  connected_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PersonalChannelViewPayload = Record<string, unknown> & {
  state?: PersonalChannelStateRecord | null;
};

type PersonalCardStatusTone = 'neutral' | 'connected' | 'warning' | 'danger';

type PersonalCardRecord = {
  id: 'device' | 'browser' | 'telegram_personal' | 'whatsapp_personal';
  label: string;
  image: string;
  detail: string;
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  summary: string;
  nextStep: string | null;
};

type SageConnectorsPaneCache = {
  providers: ProviderSnapshot[];
  profiles: ProviderProfileRecord[];
  credentials: VaultCredentialRecord[];
  connectorVault: VaultCredentialRecord[];
  gateways: GatewayRegistrationRecord[];
  selectedGatewayId: string | null;
  doctor: GatewayDoctorPayload | null;
  whatsappPersonal: PersonalChannelViewPayload | null;
  telegramPersonal: PersonalChannelViewPayload | null;
  hostedSageAi: HostedSageAiSnapshot;
};

const sageConnectorsPaneCache = new Map<string, SageConnectorsPaneCache>();

const DEFAULT_HOSTED_SAGE_AI: HostedSageAiSnapshot = {
  allowed: false,
  planAllowsHostedAi: false,
  policy: 'disabled',
  reason: 'policy_disabled',
  message: 'Empyralis-hosted AI is not included in this workspace plan.',
  monthlyCapUsd: 0,
  monthlyCostUsd: 0,
  monthlyRemainingUsd: 0,
};

const FALLBACK_PROVIDER_IDS = [
  'openai',
  'openai-codex',
  'anthropic',
  'gemini',
  'vertex',
  'deepseek',
  'mistral',
  'qwen',
  'ollama',
] as const;

const FALLBACK_PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  vertex: 'Google Vertex AI',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  qwen: 'Qwen',
  ollama: 'Ollama',
};

const PROVIDER_IMAGE_BY_ID: Record<string, string> = {
  openai: '/integrations/openai.png',
  'openai-codex': '/integrations/openai.png',
  anthropic: '/integrations/anthropic.png',
  gemini: '/integrations/gemini.jpg',
  vertex: '/integrations/gemini.jpg',
  mistral: '/integrations/mistral.png',
  deepseek: '/integrations/deepseek.jpg',
  qwen: '/integrations/qwen.png',
  ollama: '/integrations/ollama.png',
};

const CONNECTOR_DEFINITIONS: ConnectorCardDefinition[] = [
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

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => readString(item))
    .filter(Boolean);
}

function normalizeProviderAuthModes(value: unknown): ProviderAuthModeSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = readString(record.id).toLowerCase();
    if (!id) {
      return [];
    }
    return [{
      id,
      label: readString(record.label, id),
      secretRequired: record.secret_required !== false,
    }];
  });
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
    if (!id || readString(provider.kind).toLowerCase() !== 'provider') {
      return [];
    }
    const hidden = provider.hidden === true;
    const sageVisible = provider.sage_visible !== false;
    if (hidden || !sageVisible) {
      return [];
    }
    return [{
      id,
      label: readString(provider.label, id),
      state: readString(provider.state, 'unknown'),
      usable: provider.usable === true,
      active: provider.active === true,
      hidden,
      sageVisible,
      studioVisible: provider.studio_visible === true,
      localOnly: provider.local_only === true,
      defaultModel: readOptionalString(provider.default_model),
      defaultAuthMode: readOptionalString(provider.default_auth_mode),
      authModes: normalizeProviderAuthModes(provider.auth_modes),
      providerScopes: readStringList(provider.provider_scopes),
      activeSource: readOptionalString(provider.runtime_active_source) ?? readOptionalString(provider.connection_active_source),
      credentialPlane: readOptionalString(provider.credential_plane),
      credentialPlaneLabel: readOptionalString(provider.credential_plane_label),
      credentialOwnerKind: readOptionalString(provider.credential_owner_kind),
      workspaceConnected: provider.workspace_connected === true,
      hostedSageAiPolicy: readOptionalString(provider.hosted_sage_ai_policy),
      stateDetail: readOptionalString(provider.runtime_state_detail) ?? readOptionalString(provider.connection_state_detail),
      modelsSyncedAt: readOptionalString(provider.models_synced_at),
      modelsError: readOptionalString(provider.models_error),
      models: Array.isArray(provider.models)
        ? provider.models.filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
        : [],
    }];
  });
}

function normalizeHostedSageAi(payload: unknown): HostedSageAiSnapshot {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const hosted = record.hosted_sage_ai && typeof record.hosted_sage_ai === 'object'
    ? record.hosted_sage_ai as Record<string, unknown>
    : {};
  if (!hosted || Object.keys(hosted).length === 0) {
    return DEFAULT_HOSTED_SAGE_AI;
  }
  return {
    allowed: hosted.allowed === true,
    planAllowsHostedAi: hosted.plan_allows_hosted_ai === true,
    policy: readString(hosted.policy, DEFAULT_HOSTED_SAGE_AI.policy),
    reason: readOptionalString(hosted.reason),
    message: readOptionalString(hosted.message),
    monthlyCapUsd: readNumber(hosted.monthly_cap_usd, 0),
    monthlyCostUsd: readNumber(hosted.monthly_cost_usd, 0),
    monthlyRemainingUsd: readNumber(hosted.monthly_remaining_usd, 0),
  };
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 2 : 0,
  }).format(value);
}

function describeHostedSageAi(hostedSageAi: HostedSageAiSnapshot, hostedProviderCard: ProviderCardRecord | null): string {
  if (hostedSageAi.allowed && hostedProviderCard) {
    return `Ready with ${formatUsd(hostedSageAi.monthlyRemainingUsd)} remaining this month.`;
  }
  if (hostedSageAi.allowed) {
    return 'Credits are enabled, but Empyralis hosted runtime is not configured yet.';
  }
  if (hostedSageAi.message) {
    return hostedSageAi.message;
  }
  if (hostedSageAi.reason === 'owner_approval_required') {
    return 'Hosted credits need workspace owner approval before use.';
  }
  if (hostedSageAi.reason === 'cap_reached') {
    return 'Hosted credits are at the monthly cap for this workspace.';
  }
  return 'Hosted credits are not active for this workspace.';
}

function fallbackProviderCatalog(): ProviderSnapshot[] {
  return FALLBACK_PROVIDER_IDS.map((id) => ({
    id,
    label: FALLBACK_PROVIDER_LABELS[id] ?? id,
    state: 'unknown',
    usable: false,
    active: false,
    hidden: false,
    sageVisible: true,
    studioVisible: id !== 'openai-codex' && id !== 'ollama',
    localOnly: id === 'ollama',
    defaultModel: null,
    defaultAuthMode: id === 'openai-codex' ? 'oauth_token' : id === 'ollama' ? 'none' : 'api_key',
    authModes: [],
    providerScopes: [],
    activeSource: null,
    credentialPlane: null,
    credentialPlaneLabel: null,
    credentialOwnerKind: null,
    workspaceConnected: false,
    hostedSageAiPolicy: null,
    stateDetail: null,
    modelsSyncedAt: null,
    modelsError: null,
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

function profileMetadataRecord(profile: ProviderProfileRecord | null | undefined): Record<string, unknown> {
  return profile && typeof profile.metadata === 'object' && profile.metadata
    ? profile.metadata as Record<string, unknown>
    : {};
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

function providerAuthModeConfig(provider: ProviderSnapshot, profile: ProviderProfileRecord | null = null): ProviderAuthModeSnapshot | null {
  const activeMode = readString(profile?.auth_mode || provider.defaultAuthMode).toLowerCase();
  if (activeMode) {
    const match = provider.authModes.find((item) => item.id === activeMode);
    if (match) {
      return match;
    }
  }
  return provider.authModes[0] ?? null;
}

function providerRequiresSecret(provider: ProviderSnapshot, profile: ProviderProfileRecord | null = null): boolean {
  const mode = providerAuthModeConfig(provider, profile);
  if (mode) {
    return mode.secretRequired;
  }
  const authMode = readString(profile?.auth_mode || provider.defaultAuthMode).toLowerCase();
  return authMode !== 'none' && authMode !== 'local_cli';
}

function providerCredentialLabel(provider: ProviderSnapshot, profile: ProviderProfileRecord | null = null): string {
  const mode = providerAuthModeConfig(provider, profile);
  if (mode?.label) {
    return mode.label;
  }
  return providerRequiresSecret(provider, profile) ? 'Credential' : 'No credential required';
}

function providerCredentialPlaceholder(provider: ProviderSnapshot): string {
  const authMode = readString(provider.defaultAuthMode).toLowerCase();
  if (authMode === 'oauth_token' || authMode === 'access_token') {
    return 'token-...';
  }
  if (authMode === 'none' || authMode === 'local_cli') {
    return '';
  }
  return 'sk-...';
}

function providerNeedsGateway(providerId: string): boolean {
  return providerId === 'ollama' || providerId === 'openai-codex';
}

function providerPickerStatusLabel(record: ProviderCardRecord, localCompanionOnline: boolean): string {
  if (providerNeedsGateway(record.provider.id) && !localCompanionOnline) {
    return 'Requires local gateway';
  }
  return record.connected ? 'Connected' : 'Not configured';
}

function providerPickerConnected(record: ProviderCardRecord, localCompanionOnline: boolean): boolean {
  if (providerNeedsGateway(record.provider.id) && !localCompanionOnline) {
    return false;
  }
  return record.connected;
}

function providerActiveModelLabel(record: ProviderCardRecord | null): string {
  if (!record) {
    return 'No model selected';
  }
  return readString(record.profile?.model)
    || readString(record.provider.defaultModel)
    || readString(record.provider.models[0]?.label)
    || readString(record.provider.models[0]?.id)
    || 'No model selected';
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
        onError={() => onError(id)}
      />
    </span>
  );
}

function describeProviderCard(record: ProviderCardRecord, localCompanionOnline: boolean): string {
  const modelCount = record.provider.models.length;
  const authMode = readString(record.profile?.auth_mode).replace(/_/g, ' ');
  if (record.provider.id === 'ollama' && !localCompanionOnline) {
    return 'Unavailable — requires local gateway';
  }
  if (record.connected) {
    if (record.provider.defaultModel) {
      return record.provider.defaultModel;
    }
    if (modelCount > 0) {
      return `${modelCount} model${modelCount === 1 ? '' : 's'} ready`;
    }
    if (authMode) {
      return authMode;
    }
    if (record.provider.stateDetail) {
      return record.provider.stateDetail;
    }
    return 'Ready';
  }
  if (record.provider.id === 'ollama') {
    return localCompanionOnline ? 'Browse local models' : 'Needs local device';
  }
  if (record.provider.modelsError) {
    return 'Needs model refresh';
  }
  return providerRequiresSecret(record.provider, record.profile)
    ? `Add ${providerCredentialLabel(record.provider, record.profile).toLowerCase()}`
    : 'Connect to continue';
}

function providerRouteBadge(record: ProviderCardRecord): { label: string; tone: 'neutral' | 'hosted' | 'local' } | null {
  const providerId = readString(record.provider.id).toLowerCase();
  const credentialPlane = readString(record.provider.credentialPlane).toLowerCase();
  const defaultAuthMode = readString(record.provider.defaultAuthMode).toLowerCase();
  const activeSource = readString(record.provider.activeSource).toLowerCase();

  if (providerId === 'openai-codex' || defaultAuthMode === 'oauth_token' || activeSource.includes('cli')) {
    return { label: 'CLI', tone: 'local' };
  }
  if (providerId === 'ollama' || record.provider.localOnly || credentialPlane === 'local_runtime') {
    return { label: 'Local', tone: 'local' };
  }
  if (
    credentialPlane === 'platform_runtime'
    || record.provider.hostedSageAiPolicy === 'allowed'
    || activeSource.includes('platform')
    || activeSource.includes('hosted')
  ) {
    return { label: 'Via Empyralis', tone: 'hosted' };
  }
  if (
    credentialPlane === 'workspace_connection'
    || record.provider.workspaceConnected
    || Boolean(record.credential)
    || Boolean(readString(record.profile?.credential_id))
  ) {
    return { label: 'BYOK', tone: 'neutral' };
  }
  return null;
}

function providerStatusPresentation(
  record: ProviderCardRecord,
  localCompanionOnline: boolean,
): { label: string; className: string | null; showDot: boolean } {
  if (record.provider.id === 'ollama' && !localCompanionOnline) {
    return {
      label: 'Unavailable',
      className: 'sage-unified-card__status--warning',
      showDot: false,
    };
  }
  if (record.status === 'connected') {
    return {
      label: 'Connected',
      className: 'sage-unified-card__status--connected',
      showDot: true,
    };
  }
  return {
    label: 'Not connected',
    className: null,
    showDot: false,
  };
}

function describeConnectorCard(record: ConnectorCardRecord): string {
  if (record.connected) {
    return record.definition.capabilityTags.slice(0, 2).join(' · ') || 'Ready';
  }
  return record.definition.capabilityTags.slice(0, 2).join(' · ') || 'Connect to continue';
}

function summarizeGatewayState(gateway: GatewayRegistrationRecord | null, doctor: GatewayDoctorPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  if (!gateway) {
    return {
      statusLabel: 'Needs Gateway',
      statusTone: 'warning',
      detail: 'Pair this device so Sage can use your personal channels and browser.',
      summary: 'Sage needs one paired local gateway before it can act as you from this device.',
      nextStep: 'Open Gateway and pair this device.',
    };
  }
  const connectionStatus = readString(gateway.connection_status || gateway.status).toLowerCase();
  const doctorStatus = readString(doctor?.status).toLowerCase();
  if (connectionStatus === 'online' && ['healthy', 'pass', 'connected'].includes(doctorStatus)) {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'This device is paired and online for Sage.',
      summary: 'Gateway is online and ready for personal channels, browser access, and local approvals.',
      nextStep: null,
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: 'This device is paired, but the gateway is offline or degraded.',
    summary: 'Open Gateway to reconnect the local runtime and clear device health issues.',
    nextStep: 'Open Gateway to reconnect or inspect health.',
  };
}

function summarizeBrowserState(gateway: GatewayRegistrationRecord | null, doctor: GatewayDoctorPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  if (!gateway) {
    return {
      statusLabel: 'Needs Gateway',
      statusTone: 'warning',
      detail: 'Pair this device before Sage can use your browser.',
      summary: 'Signed-in sites, localhost pages, and your real browser session stay behind the gateway.',
      nextStep: 'Open Gateway and pair this device first.',
    };
  }
  const gatewayOnline = readString(gateway.connection_status || gateway.status).toLowerCase() === 'online';
  if (!gatewayOnline) {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'danger',
      detail: 'This device is paired, but Gateway is offline.',
      summary: 'Localhost pages, signed-in sites, and private browser sessions only work while the paired gateway is online.',
      nextStep: 'Open Gateway to reconnect this device first.',
    };
  }
  const browserRecord = doctor && typeof doctor.browser === 'object' ? doctor.browser as Record<string, unknown> : {};
  const browserAttachRecord = doctor && typeof doctor.browser_attach === 'object'
    ? doctor.browser_attach as Record<string, unknown>
    : {};
  const activeCount = Number(browserRecord.active_count ?? 0);
  const attachCount = Number(browserAttachRecord.count ?? 0);
  const attachedCount = Number(browserAttachRecord.attached_count ?? 0);
  const pendingAttachCount = Number(browserAttachRecord.pending_count ?? 0);
  const attachApprovalRequiredCount = Number(browserAttachRecord.approval_required_count ?? 0);
  const attachFailedCount = Number(browserAttachRecord.failed_count ?? 0);
  const status = readString(browserRecord.status).toLowerCase();
  const attachStatus = readString(browserAttachRecord.status).toLowerCase();
  if (attachApprovalRequiredCount > 0) {
    return {
      statusLabel: 'Approval needed',
      statusTone: 'warning',
      detail: 'Signed-in browser attach is waiting for approval.',
      summary: 'Public web search can stay in cloud, but your private browser sessions stay on this device and need Gateway approval first.',
      nextStep: 'Open Gateway to review browser approvals.',
    };
  }
  if (attachedCount > 0 && attachStatus === 'pass') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'Your signed-in browser is attached through Gateway.',
      summary: readString(
        browserAttachRecord.summary,
        'Gateway is ready to use your existing signed-in browser session on this device.',
      ),
      nextStep: 'Open Gateway to inspect browser sessions or interrupt attach.',
    };
  }
  if (attachFailedCount > 0 || attachStatus === 'fail') {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'danger',
      detail: readString(browserAttachRecord.summary, 'Existing-session browser attach failed.'),
      summary: 'Gateway could not attach to your signed-in browser session. Localhost and private sites stay unavailable until attach recovers.',
      nextStep: 'Open Gateway to retry browser attach or inspect the failure.',
    };
  }
  if (attachCount > 0 && pendingAttachCount > 0) {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'warning',
      detail: readString(browserAttachRecord.summary, 'Existing-session browser attach is configured but not ready yet.'),
      summary: 'Gateway knows about your browser attach flow, but it still needs a reachable local browser session before Sage can use it.',
      nextStep: 'Open Gateway to finish browser attach.',
    };
  }
  if (activeCount > 0 && status === 'pass') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'Gateway has a governed browser session ready.',
      summary: `${readString(browserRecord.summary, 'Browser access is ready on this device.')} Localhost pages and private sessions still stay behind Gateway.`,
      nextStep: 'Open Gateway to review governed browser sessions.',
    };
  }
  if (activeCount === 0 && status === 'pass') {
    return {
      statusLabel: 'Not connected',
      statusTone: 'neutral',
      detail: 'No browser session is active yet.',
      summary: 'Gateway is online and ready. Use Gateway when you want Sage to browse localhost, signed-in sites, or any other private browser state from this device.',
      nextStep: 'Open Gateway to start or attach a browser session.',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: status === 'warn' ? 'warning' : 'danger',
    detail: readString(browserRecord.summary, 'Browser access needs attention.'),
    summary: 'Browser session health, localhost access, and signed-in session approvals all stay in Gateway.',
    nextStep: 'Open Gateway to resolve browser session state.',
  };
}

function summarizeWhatsappPersonalState(gateway: GatewayRegistrationRecord | null, payload: PersonalChannelViewPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  if (!gateway) {
    return {
      statusLabel: 'Needs Gateway',
      statusTone: 'warning',
      detail: 'Pair this device before Sage can use your WhatsApp.',
      summary: 'Personal WhatsApp stays on your device and routes through the paired gateway.',
      nextStep: 'Open Gateway and pair this device first.',
    };
  }
  const state = payload?.state && typeof payload.state === 'object' ? payload.state : null;
  const status = readString(state?.status).toLowerCase();
  const metadata = state?.metadata && typeof state.metadata === 'object' ? state.metadata as Record<string, unknown> : {};
  const linkedLabel = readString(state?.linked_name || state?.linked_jid, '');
  if (!state || !status || status === 'idle' || status === 'disconnected') {
    return {
      statusLabel: 'Not connected',
      statusTone: 'neutral',
      detail: 'Your WhatsApp is not linked yet.',
      summary: 'Open Gateway to finish the personal WhatsApp login flow for Sage.',
      nextStep: 'Open Gateway to start WhatsApp login.',
    };
  }
  if (status === 'connected') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: linkedLabel ? `${linkedLabel} is linked on this device.` : 'Your WhatsApp is linked on this device.',
      summary: 'Sage can reply through your personal WhatsApp from the paired gateway.',
      nextStep: null,
    };
  }
  if (['qr_required', 'pairing_code_required', 'code_required', 'login_required'].includes(status) || Boolean(state?.qr_code) || Boolean(state?.login_hint) || Boolean(metadata.pairing_code)) {
    return {
      statusLabel: 'Waiting for QR/login',
      statusTone: 'warning',
      detail: 'WhatsApp is waiting for a QR scan or pairing code step.',
      summary: 'Finish the personal WhatsApp login flow in Gateway.',
      nextStep: 'Open Gateway to complete QR or pairing code login.',
    };
  }
  if (['connecting', 'reconnecting', 'resuming'].includes(status)) {
    return {
      statusLabel: 'Reconnecting',
      statusTone: 'warning',
      detail: 'WhatsApp is reconnecting on the gateway.',
      summary: 'Sage will use your WhatsApp again after the gateway session recovers.',
      nextStep: 'Open Gateway if reconnect does not recover.',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: `Your WhatsApp is ${status.replace(/_/g, ' ')}.`,
    summary: 'Open Gateway to inspect the personal WhatsApp session on this device.',
    nextStep: 'Open Gateway to inspect WhatsApp state.',
  };
}

function summarizeTelegramPersonalState(gateway: GatewayRegistrationRecord | null, payload: PersonalChannelViewPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  if (!gateway) {
    return {
      statusLabel: 'Needs Gateway',
      statusTone: 'warning',
      detail: 'Pair this device before Sage can use your Telegram.',
      summary: 'Personal Telegram stays on your device and routes through the paired gateway.',
      nextStep: 'Open Gateway and pair this device first.',
    };
  }
  const state = payload?.state && typeof payload.state === 'object' ? payload.state : null;
  const status = readString(state?.status).toLowerCase();
  const linkedLabel = readString(state?.linked_name || state?.linked_username || state?.linked_phone, '');
  if (!state || !status || status === 'idle' || status === 'disconnected') {
    return {
      statusLabel: 'Not connected',
      statusTone: 'neutral',
      detail: 'Your Telegram is not linked yet.',
      summary: 'Open Gateway to finish the personal Telegram login flow for Sage.',
      nextStep: 'Open Gateway to start Telegram login.',
    };
  }
  if (status === 'connected') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: linkedLabel ? `${linkedLabel} is linked on this device.` : 'Your Telegram is linked on this device.',
      summary: 'Sage can reply through your personal Telegram from the paired gateway.',
      nextStep: null,
    };
  }
  if (['code_required', 'password_required', 'login_required'].includes(status) || Boolean(state?.login_hint)) {
    return {
      statusLabel: 'Waiting for QR/login',
      statusTone: 'warning',
      detail: 'Telegram is waiting for a login code or confirmation.',
      summary: 'Finish the personal Telegram login flow in Gateway.',
      nextStep: 'Open Gateway to complete Telegram login.',
    };
  }
  if (['connecting', 'reconnecting', 'resuming'].includes(status)) {
    return {
      statusLabel: 'Reconnecting',
      statusTone: 'warning',
      detail: 'Telegram is reconnecting on the gateway.',
      summary: 'Sage will use your Telegram again after the gateway session recovers.',
      nextStep: 'Open Gateway if reconnect does not recover.',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: `Your Telegram is ${status.replace(/_/g, ' ')}.`,
    summary: 'Open Gateway to inspect the personal Telegram session on this device.',
    nextStep: 'Open Gateway to inspect Telegram state.',
  };
}

export function WorkstationSageConnectorsPane({
  showProviders = true,
  showTools = true,
  connectorIds,
  className,
}: {
  showProviders?: boolean;
  showTools?: boolean;
  connectorIds?: string[];
  className?: string;
} = {}) {
  const { bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const gridColumns = useResponsiveColumns();
  const cacheKey = bootstrap.workspace.id;
  const cachedState = sageConnectorsPaneCache.get(cacheKey) ?? null;
  const workspaceId = bootstrap.workspace.id;
  const [providers, setProviders] = useState<ProviderSnapshot[]>(() => cachedState?.providers ?? []);
  const [profiles, setProfiles] = useState<ProviderProfileRecord[]>(() => cachedState?.profiles ?? []);
  const [credentials, setCredentials] = useState<VaultCredentialRecord[]>(() => cachedState?.credentials ?? []);
  const [connectorVault, setConnectorVault] = useState<VaultCredentialRecord[]>(() => cachedState?.connectorVault ?? []);
  const [gateways, setGateways] = useState<GatewayRegistrationRecord[]>(() => cachedState?.gateways ?? []);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(() => cachedState?.selectedGatewayId ?? null);
  const [doctor, setDoctor] = useState<GatewayDoctorPayload | null>(() => cachedState?.doctor ?? null);
  const [whatsappPersonal, setWhatsappPersonal] = useState<PersonalChannelViewPayload | null>(() => cachedState?.whatsappPersonal ?? null);
  const [telegramPersonal, setTelegramPersonal] = useState<PersonalChannelViewPayload | null>(() => cachedState?.telegramPersonal ?? null);
  const [hostedSageAi, setHostedSageAi] = useState<HostedSageAiSnapshot>(() => cachedState?.hostedSageAi ?? DEFAULT_HOSTED_SAGE_AI);
  const [isLoading, setIsLoading] = useState(() => cachedState === null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [providerDraftKeys, setProviderDraftKeys] = useState<Record<string, string>>({});
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [providerPickerDraftId, setProviderPickerDraftId] = useState<string | null>(null);
  const [connectorMemoryEnabled, setConnectorMemoryEnabled] = useState<Record<string, boolean>>({});
  const [providerModelOverrides, setProviderModelOverrides] = useState<Record<string, ProviderCatalogModelRecord[]>>({});
  const [failedLogos, setFailedLogos] = useState<Set<string>>(() => new Set());
  const [busyCardId, setBusyCardId] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const [catalogResult, profileResult, credentialResult, connectorResult, gatewayResult] = await Promise.allSettled([
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      services.client.listVaultCredentials(),
      services.client.listConnectorsVault(),
      (async () => {
        const registrationsPayload = await services.client.requestJson<Record<string, unknown>>({
          path: `/api/gateway/registrations?workspace_id=${encodeURIComponent(workspaceId)}`,
          allowStatuses: [404],
        });
        const registrationItems = Array.isArray(registrationsPayload?.items)
          ? registrationsPayload.items.filter((item): item is GatewayRegistrationRecord => Boolean(item) && typeof item === 'object')
          : [];
        const selectedGateway = registrationItems.find((item) =>
          readString(item.connection_status || item.status).toLowerCase() === 'online',
        ) ?? registrationItems[0] ?? null;
        const gatewayId = readString(selectedGateway?.gateway_id, '') || null;
        if (!gatewayId) {
          return {
            gateways: registrationItems,
            selectedGatewayId: null,
            doctor: null,
            whatsappPersonal: null,
            telegramPersonal: null,
          };
        }
        const [doctorPayload, whatsappPayload, telegramPayload] = await Promise.all([
          services.client.requestJson<GatewayDoctorPayload>({
            path: `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor`,
            allowStatuses: [403, 404],
          }),
          services.client.requestJson<PersonalChannelViewPayload>({
            path: `/api/personal-channels/whatsapp/gateways/${encodeURIComponent(gatewayId)}`,
            allowStatuses: [403, 404],
          }),
          services.client.requestJson<PersonalChannelViewPayload>({
            path: `/api/personal-channels/telegram/gateways/${encodeURIComponent(gatewayId)}`,
            allowStatuses: [403, 404],
          }),
        ]);
        return {
          gateways: registrationItems,
          selectedGatewayId: gatewayId,
          doctor: doctorPayload,
          whatsappPersonal: whatsappPayload,
          telegramPersonal: telegramPayload,
        };
      })(),
    ]);

    const catalogPayload = catalogResult.status === 'fulfilled' ? catalogResult.value : null;
    const gatewayPayload = gatewayResult.status === 'fulfilled' ? gatewayResult.value : {
      gateways: [],
      selectedGatewayId: null,
      doctor: null,
      whatsappPersonal: null,
      telegramPersonal: null,
    };
    const normalizedProviders = normalizeProviderCatalog(catalogPayload);
    const nextState: SageConnectorsPaneCache = {
      providers: normalizedProviders.length > 0 ? normalizedProviders : fallbackProviderCatalog(),
      profiles: profileResult.status === 'fulfilled' ? normalizeProviderProfiles(profileResult.value) : [],
      credentials: credentialResult.status === 'fulfilled' ? normalizeVaultCredentials(credentialResult.value) : [],
      connectorVault: connectorResult.status === 'fulfilled' ? normalizeVaultCredentials(connectorResult.value) : [],
      gateways: gatewayPayload.gateways,
      selectedGatewayId: gatewayPayload.selectedGatewayId,
      doctor: gatewayPayload.doctor,
      whatsappPersonal: gatewayPayload.whatsappPersonal,
      telegramPersonal: gatewayPayload.telegramPersonal,
      hostedSageAi: normalizeHostedSageAi(catalogPayload),
    };
    sageConnectorsPaneCache.set(cacheKey, nextState);
    setProviders(nextState.providers);
    setProfiles(nextState.profiles);
    setCredentials(nextState.credentials);
    setConnectorVault(nextState.connectorVault);
    setGateways(nextState.gateways);
    setSelectedGatewayId(nextState.selectedGatewayId);
    setDoctor(nextState.doctor);
    setWhatsappPersonal(nextState.whatsappPersonal);
    setTelegramPersonal(nextState.telegramPersonal);
    setHostedSageAi(nextState.hostedSageAi);

    if (catalogResult.status === 'rejected') {
      throw catalogResult.reason;
    }
  }, [cacheKey, services.client, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(sageConnectorsPaneCache.get(cacheKey) === null);
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
  }, [cacheKey, loadState]);

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
    const connected = resolvedProvider.id === 'ollama'
      ? localCompanionOnline && (Boolean(credential) || secretlessConnected || resolvedProvider.models.length > 0)
      : Boolean(credential) || secretlessConnected;
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
      keyTail: maskKeyTail(credential),
    };
  }), [credentials, localCompanionOnline, profiles, providerModelOverrides, providers]);

  const hostedProviderCard = useMemo(
    () => providerCards.find((record) =>
      hostedSageAi.allowed && (
        record.provider.hostedSageAiPolicy === 'enabled_with_cap'
        || record.provider.hostedSageAiPolicy === 'allowed'
        || readString(record.provider.credentialPlane).toLowerCase() === 'platform_runtime'
      )
      || providerRouteBadge(record)?.label === 'Via Empyralis') ?? null,
    [hostedSageAi.allowed, providerCards],
  );

  const explicitSelectedProfile = useMemo(
    () => sortProfiles(profiles).find((profile) =>
      readString(profileMetadataRecord(profile).chat_model_selection).toLowerCase() === 'explicit'
      && profile.enabled !== false) ?? null,
    [profiles],
  );

  const activeProviderCard = useMemo(() => {
    const explicitProviderId = readString(explicitSelectedProfile?.provider).toLowerCase();
    if (explicitProviderId) {
      return providerCards.find((record) => record.provider.id === explicitProviderId) ?? null;
    }
    return providerCards.find((record) => record.provider.active)
      ?? hostedProviderCard
      ?? providerCards.find((record) => providerPickerConnected(record, localCompanionOnline))
      ?? null;
  }, [explicitSelectedProfile, hostedProviderCard, localCompanionOnline, providerCards]);

  const providerPickerSections = useMemo<ProviderPickerSection[]>(() => {
    const orderedByokIds = ['anthropic', 'openai', 'gemini', 'deepseek', 'mistral', 'qwen', 'vertex', 'ollama', 'openai-codex'];
    const byokItems = orderedByokIds
      .map((providerId) => providerCards.find((record) => record.provider.id === providerId) ?? null)
      .filter((record): record is ProviderCardRecord => Boolean(record));
    const sections: ProviderPickerSection[] = [];
    if (hostedProviderCard || hostedSageAi.planAllowsHostedAi) {
      sections.push({
        id: 'hosted',
        label: 'Use Empyralis credits',
        items: hostedProviderCard ? [hostedProviderCard] : [],
      });
    }
    sections.push({
      id: 'byok',
      label: 'Use your own API key',
      items: byokItems,
    });
    return sections;
  }, [hostedProviderCard, hostedSageAi.planAllowsHostedAi, providerCards]);

  const selectedGateway = useMemo(
    () => gateways.find((gateway) => readString(gateway.gateway_id, '') === readString(selectedGatewayId, '')) ?? null,
    [gateways, selectedGatewayId],
  );

  const personalCards = useMemo<PersonalCardRecord[]>(() => {
    const device = summarizeGatewayState(selectedGateway, doctor);
    const browser = summarizeBrowserState(selectedGateway, doctor);
    const telegram = summarizeTelegramPersonalState(selectedGateway, telegramPersonal);
    const whatsapp = summarizeWhatsappPersonalState(selectedGateway, whatsappPersonal);
    return [
      { id: 'device', label: 'This device', image: '', ...device },
      { id: 'browser', label: 'Use my browser', image: '', ...browser },
      { id: 'telegram_personal', label: 'Your Telegram', image: '/integrations/telegram.png', ...telegram },
      { id: 'whatsapp_personal', label: 'Your WhatsApp', image: '/integrations/whatsapp.png', ...whatsapp },
    ];
  }, [doctor, selectedGateway, telegramPersonal, whatsappPersonal]);

  const connectorCards = useMemo<ConnectorCardRecord[]>(() => {
    const latestConnectorById = new Map<string, VaultCredentialRecord>();
    sortCredentials(connectorVault).forEach((item) => {
      const connectorId = readString(item.connector).toLowerCase();
      if (connectorId && !latestConnectorById.has(connectorId)) {
        latestConnectorById.set(connectorId, item);
      }
    });

    return CONNECTOR_DEFINITIONS.flatMap((definition) => {
      if (Array.isArray(connectorIds) && connectorIds.length > 0 && !connectorIds.includes(definition.id)) {
        return [];
      }
      const connectorCredential = (definition.connectorIds ?? [])
        .map((connectorId) => latestConnectorById.get(connectorId))
        .find((item): item is VaultCredentialRecord => Boolean(item)) ?? null;
      const connected = Boolean(connectorCredential);
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
  }, [connectorIds, connectorVault]);

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
    if (providerRequiresSecret(record.provider, record.profile) && !draftApiKey) {
      setError(`${providerCredentialLabel(record.provider, record.profile)} is required before Sage can connect this provider.`);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: record.provider.id,
        apiKey: draftApiKey || null,
        model: null,
      });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId: record.provider.id,
        action: 'saved',
      });
      await refreshAfterMutation(`${record.label} is now connected.`);
      setProviderDraftKeys((current) => ({ ...current, [record.id]: '' }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider connection failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function setActiveProvider(record: ProviderCardRecord, { hosted = false }: { hosted?: boolean } = {}): Promise<void> {
    const activeModel = providerActiveModelLabel(record);
    const nextProfiles = sortProfiles(profiles).filter((profile) => {
      const providerId = readString(profile.provider).toLowerCase();
      return providerId && providerCards.some((card) => card.provider.id === providerId);
    });
    const targetProviderId = record.provider.id;
    const targetProfile = nextProfiles.find((profile) => readString(profile.provider).toLowerCase() === targetProviderId) ?? null;
    const profilesToWrite = new Map<string, ProviderProfileRecord | null>();
    nextProfiles.forEach((profile) => {
      profilesToWrite.set(readString(profile.provider).toLowerCase(), profile);
    });
    profilesToWrite.set(targetProviderId, targetProfile);

    await Promise.all([...profilesToWrite.entries()].map(([providerId, profile]) => {
      const metadata = {
        ...profileMetadataRecord(profile),
        chat_model_selection: providerId === targetProviderId ? 'explicit' : 'default',
      };
      return services.client.upsertProviderProfile({
        id: readString(profile?.id) || null,
        provider: providerId,
        label: readString(profile?.label) || `Sage ${record.provider.label}`,
        credentialId: readString(profile?.credential_id) || readString(record.credential?.id) || null,
        authMode: readString(profile?.auth_mode) || readString(record.provider.defaultAuthMode) || null,
        priority: Number(profile?.priority ?? (providerId === targetProviderId ? 10 : 100)),
        enabled: profile?.enabled !== false,
        model: providerId === targetProviderId
          ? (activeModel || null)
          : readString(profile?.model) || null,
        metadata,
      });
    }));

    emitWorkstationProviderChanged({
      workspaceId: services.scope.workspaceId,
      providerId: record.provider.id,
      action: 'saved',
    });
    await refreshAfterMutation(
      hosted
        ? 'Empyralis default model is now active.'
        : `${record.label} is now active.`,
    );
  }

  async function handleProviderSelect(record: ProviderCardRecord, { hosted = false }: { hosted?: boolean } = {}) {
    if (providerNeedsGateway(record.provider.id) && !localCompanionOnline) {
      setError(`${record.label} requires the local gateway before it can be selected.`);
      return;
    }
    if (!hosted && !providerPickerConnected(record, localCompanionOnline) && providerRequiresSecret(record.provider, record.profile)) {
      setProviderPickerDraftId(record.id);
      setStatus(null);
      setError(null);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      if (!providerPickerConnected(record, localCompanionOnline) && !providerRequiresSecret(record.provider, record.profile)) {
        await handleProviderSave(record);
      }
      await setActiveProvider(record, { hosted });
      setProviderPickerDraftId(null);
      setProviderPickerOpen(false);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : 'Could not select this provider.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleProviderConnectAndSelect(record: ProviderCardRecord) {
    const draftApiKey = (providerDraftKeys[record.id] ?? '').trim();
    if (!draftApiKey) {
      setError(`${providerCredentialLabel(record.provider, record.profile)} is required before Sage can connect this provider.`);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: record.provider.id,
        apiKey: draftApiKey,
        model: null,
      });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId: record.provider.id,
        action: 'saved',
      });
      await loadState();
      setProviderDraftKeys((current) => ({ ...current, [record.id]: '' }));
      await setActiveProvider(record);
      setProviderPickerDraftId(null);
      setProviderPickerOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Provider connection failed.');
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
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId: record.provider.id,
        action: 'deleted',
      });
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

  function handleProviderKeyPaste(providerId: string, event: ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData('text');
    if (!pastedText) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setProviderDraftKeys((current) => ({ ...current, [providerId]: pastedText }));
  }

  function openGatewaySurface() {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.assign(`/w/${encodeURIComponent(workspaceId)}/gateway`);
  }

  function openBillingSettings() {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.assign(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`);
  }

  function renderProviderCard(record: ProviderCardRecord) {
    const isExpanded = expandedCardId === record.id;
    const badge = providerRouteBadge(record);
    const status = providerStatusPresentation(record, localCompanionOnline);
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
        <div className="sage-unified-card__title-row">
          <strong className="sage-unified-card__title">{record.label}</strong>
          {badge ? (
            <span
              className={joinClassNames(
                'sage-unified-card__badge',
                badge.tone === 'hosted' && 'sage-unified-card__badge--hosted',
                badge.tone === 'local' && 'sage-unified-card__badge--local',
              )}
            >
              {badge.label}
            </span>
          ) : null}
        </div>
        <span className="sage-unified-card__detail">{describeProviderCard(record, localCompanionOnline)}</span>
        <span className={joinClassNames('sage-unified-card__status', status.className)}>
          {status.showDot ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {status.label}
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
        <span className="sage-unified-card__detail">{describeConnectorCard(record)}</span>
        <span className={joinClassNames('sage-unified-card__status', record.status === 'connected' && 'sage-unified-card__status--connected')}>
          {record.status === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {record.status === 'connected' ? 'Connected' : 'Not connected'}
        </span>
      </button>
    );
  }

  function personalStatusClassName(record: PersonalCardRecord): string | null {
    if (record.statusTone === 'connected') {
      return 'sage-unified-card__status--connected';
    }
    if (record.statusTone === 'warning') {
      return 'sage-unified-card__status--warning';
    }
    if (record.statusTone === 'danger') {
      return 'sage-unified-card__status--danger';
    }
    return null;
  }

  function renderPersonalCard(record: PersonalCardRecord) {
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
        <span className="sage-unified-card__detail">{record.detail}</span>
        <span className={joinClassNames('sage-unified-card__status', personalStatusClassName(record))}>
          {record.statusTone === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {record.statusLabel}
        </span>
      </button>
    );
  }

  function renderProviderExpand(record: ProviderCardRecord) {
    const busy = busyCardId === record.id;
    return (
      <MotionSlidePanel className="sage-unified-expand">
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
              {`Connected · ${record.keyTail ? `••••${record.keyTail}` : providerRequiresSecret(record.provider, record.profile) ? 'Saved credential hidden' : 'No credential required'}`}
            </div>
            {record.provider.id === 'ollama' && !localCompanionOnline ? (
              <div className="sage-unified-expand__text">
                Connect local device to use Ollama
              </div>
            ) : null}
            {record.provider.modelsError ? (
              <div className="sage-unified-expand__text">
                {record.provider.modelsError}
              </div>
            ) : null}
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
          </>
        ) : (
          <>
            {providerRequiresSecret(record.provider, record.profile) ? (
              <FormField label={providerCredentialLabel(record.provider, record.profile)}>
                <FormInput
                  type="text"
                  value={providerDraftKeys[record.id] ?? ''}
                  placeholder={providerCredentialPlaceholder(record.provider)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  onPasteCapture={(event) => {
                    handleProviderKeyPaste(record.id, event);
                  }}
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
      </MotionSlidePanel>
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

  function renderPersonalExpand(record: PersonalCardRecord) {
    return (
      <MotionSlidePanel className="sage-unified-expand">
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
        <div className="sage-unified-expand__text">{record.summary}</div>
        {record.nextStep ? (
          <div className="sage-unified-expand__text">{record.nextStep}</div>
        ) : null}
        <div className="sage-unified-expand__actions">
          <AppButton
            type="button"
            onClick={openGatewaySurface}
          >
            {record.statusLabel === 'Needs Gateway'
              ? 'Pair this device'
              : record.id === 'browser'
                ? 'Open browser sessions'
                : 'Open Gateway'}
          </AppButton>
          <button
            type="button"
            className="sage-unified-expand__link"
            onClick={() => setExpandedCardId(null)}
          >
            Close
          </button>
        </div>
      </MotionSlidePanel>
    );
  }

  function renderConnectorExpand(record: ConnectorCardRecord) {

    return (
      <MotionSlidePanel className="sage-unified-expand">
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
      </MotionSlidePanel>
    );
  }

  function renderSection<T extends { id: string }>(
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

  function renderProviderPickerRow(record: ProviderCardRecord, sectionId: ProviderPickerSection['id']) {
    const pickerConnected = sectionId === 'hosted'
      ? hostedSageAi.allowed
      : providerPickerConnected(record, localCompanionOnline);
    const isActive = activeProviderCard?.id === record.id;
    const requiresSecret = providerRequiresSecret(record.provider, record.profile);
    const showInlineKey = providerPickerDraftId === record.id && !pickerConnected && requiresSecret;
    const busy = busyCardId === record.id;
    const displayLabel = sectionId === 'hosted' ? 'Empyralis default model' : record.label;
    const detailLabel = sectionId === 'hosted'
      ? describeHostedSageAi(hostedSageAi, record)
      : providerPickerStatusLabel(record, localCompanionOnline);
    return (
      <div key={`${sectionId}:${record.id}`} className="sage-provider-picker__item">
        <button
          type="button"
          className={joinClassNames('sage-provider-picker__row', isActive && 'sage-provider-picker__row--active')}
          onClick={() => {
            void handleProviderSelect(record, { hosted: sectionId === 'hosted' });
          }}
        >
          <BrandLogo
            id={record.id}
            label={displayLabel}
            src={record.image}
            failedLogos={failedLogos}
            onError={markLogoFailed}
          />
          <div className="sage-provider-picker__copy">
            <span className="sage-provider-picker__name">{displayLabel}</span>
            <span className="sage-provider-picker__detail">{detailLabel}</span>
          </div>
          <span className={joinClassNames('sage-provider-picker__status-dot', pickerConnected && 'sage-provider-picker__status-dot--connected')} aria-hidden="true" />
          {isActive ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
        </button>
        {showInlineKey ? (
          <div className="sage-provider-picker__inline-key">
            <FormField label={providerCredentialLabel(record.provider, record.profile)}>
              <FormInput
                type="text"
                value={providerDraftKeys[record.id] ?? ''}
                placeholder={providerCredentialPlaceholder(record.provider)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                onPasteCapture={(event) => {
                  handleProviderKeyPaste(record.id, event);
                }}
                onChange={(event) => {
                  setProviderDraftKeys((current) => ({ ...current, [record.id]: event.currentTarget.value }));
                }}
              />
            </FormField>
            <div className="sage-provider-picker__inline-actions">
              <AppButton
                type="button"
                disabled={busy}
                onClick={() => {
                  void handleProviderConnectAndSelect(record);
                }}
              >
                {busy ? 'Saving…' : 'Save'}
              </AppButton>
              <button
                type="button"
                className="sage-unified-expand__link"
                onClick={() => {
                  setProviderPickerDraftId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={joinClassNames('sage-settings-panel sage-settings-panel--connectors', className)}>
      {status ? <AppNotice tone="success">{status}</AppNotice> : null}
      {error ? <AppNotice tone="warning">Integrations could not refresh. Try again when ready.</AppNotice> : null}

      <div className="sage-unified-page">
        {isLoading ? (
          <section className="sage-unified-section">
            <p className="sage-unified-section__label">Personal</p>
            <div className={joinClassNames('sage-unified-grid', gridColumns === 2 ? 'sage-unified-grid--2' : 'sage-unified-grid--4')}>
              {Array.from({ length: gridColumns }).map((_, index) => (
                <div key={`personal-skeleton-${index}`} className="sage-unified-card" aria-hidden="true">
                  <SkeletonBlock height="40px" width="40px" />
                  <SkeletonBlock height="16px" width="70%" />
                  <SkeletonBlock height="12px" width="54%" />
                </div>
              ))}
            </div>
          </section>
        ) : renderSection('Personal', personalCards, renderPersonalCard, renderPersonalExpand)}
        {showProviders ? (
          isLoading ? renderProviderSkeletons() : (
            <section className="sage-unified-section">
              <p className="sage-unified-section__label">AI Providers</p>
              <div className="sage-hosted-credits">
                <div className="sage-hosted-credits__copy">
                  <strong className="sage-hosted-credits__title">Empyralis credits</strong>
                  <span className="sage-hosted-credits__meta">
                    {describeHostedSageAi(hostedSageAi, hostedProviderCard)}
                  </span>
                </div>
                <div className="sage-hosted-credits__actions">
                  {hostedProviderCard ? (
                    <AppButton
                      type="button"
                      tone="secondary"
                      disabled={!hostedSageAi.allowed || busyCardId === hostedProviderCard.id}
                      onClick={() => {
                        void handleProviderSelect(hostedProviderCard, { hosted: true });
                      }}
                    >
                      Use credits
                    </AppButton>
                  ) : null}
                  <AppButton
                    type="button"
                    tone="ghost"
                    onClick={openBillingSettings}
                  >
                    Manage credits
                  </AppButton>
                </div>
              </div>
              <div className="sage-provider-active">
                <div className="sage-provider-active__row">
                  {activeProviderCard ? (
                    <>
                      <BrandLogo
                        id={activeProviderCard.id}
                        label={activeProviderCard === hostedProviderCard && !explicitSelectedProfile ? 'Empyralis default model' : activeProviderCard.label}
                        src={activeProviderCard.image}
                        failedLogos={failedLogos}
                        onError={markLogoFailed}
                      />
                      <div className="sage-provider-active__copy">
                        <strong className="sage-provider-active__name">
                          {activeProviderCard === hostedProviderCard && !explicitSelectedProfile ? 'Empyralis default model' : activeProviderCard.label}
                        </strong>
                        <span className="sage-provider-active__model">{providerActiveModelLabel(activeProviderCard)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="sage-provider-active__copy">
                      <strong className="sage-provider-active__name">No provider active</strong>
                      <span className="sage-provider-active__model">Choose a provider to start chatting.</span>
                    </div>
                  )}
                  <AppButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      setProviderPickerOpen(true);
                      setProviderPickerDraftId(null);
                    }}
                  >
                    Change
                  </AppButton>
                </div>
              </div>
            </section>
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
            Loading apps and accounts…
          </div>
        ) : renderSection('Apps & Accounts', connectorCards, renderConnectorCard, renderConnectorExpand)}
      </div>

      <CommandSheet
        open={providerPickerOpen}
        title="Choose provider"
        description="Use Empyralis credits by default, or connect your own API key for direct provider billing."
        onClose={() => {
          setProviderPickerOpen(false);
          setProviderPickerDraftId(null);
        }}
      >
        <div className="sage-provider-picker">
          {providerPickerSections.map((section) => (
            <section key={section.id} className="sage-provider-picker__section">
              <h3 className="sage-provider-picker__section-label">{section.label}</h3>
              <div className="sage-provider-picker__list">
                {section.items.length > 0 ? (
                  section.items.map((record) => renderProviderPickerRow(record, section.id))
                ) : section.id === 'hosted' ? (
                  <div className="sage-provider-picker__empty">
                    <span>{describeHostedSageAi(hostedSageAi, null)}</span>
                    <button type="button" onClick={openBillingSettings}>
                      Manage credits
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </CommandSheet>
    </div>
  );
}
