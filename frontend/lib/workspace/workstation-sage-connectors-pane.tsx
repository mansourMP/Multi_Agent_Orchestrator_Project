'use client';

import { type ClipboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, X } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { FormField, FormInput, FormSelect } from '@/lib/ui/form-controls';
import { MotionSlidePanel } from '@/lib/ui/motion';
import { AppButton, AppNotice, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { WorkstationSageToolsPane } from '@/lib/workspace/workstation-sage-tools-pane';
import { WorkstationSplitWorkbench } from '@/lib/workspace/workstation-split-workbench';
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
  creditsPerUsd: number;
  monthlyCreditCap: number;
  monthlyCreditsUsed: number;
  monthlyCreditsRemaining: number;
};

type ProviderPickerSection = {
  id: 'byok' | 'hosted' | 'local';
  label: string;
  items: ProviderCardRecord[];
};

type AiProviderSummary = {
  activeLabel: string;
  activeDetail: string;
  creditsLabel: string;
  creditsDetail: string;
  backupLabel: string;
  backupDetail: string;
  configLabel: string;
  configDetail: string;
};

type ConnectorCardDefinition = {
  id: string;
  label: string;
  image: string;
  connectorIds?: string[];
  capabilityTags: string[];
  summary: string;
  setupHint: string;
  surfaceScope: 'all' | 'studio_only';
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
  personal_channels?: {
    status?: string | null;
    summary?: string | null;
    count?: number | null;
    connected_count?: number | null;
    running_count?: number | null;
    items?: Array<Record<string, unknown>>;
  } | null;
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
  recent_messages?: Array<Record<string, unknown>>;
};

type PersonalChannelSurfaceRecord = Record<string, unknown> & {
  channel_key?: string | null;
  label?: string | null;
  provider?: string | null;
  stage?: string | null;
  status?: string | null;
  status_label?: string | null;
  live_capable?: boolean | null;
  connected?: boolean | null;
  running?: boolean | null;
  connected_identity?: string | null;
  detail?: string | null;
  next_step?: string | null;
};

type PersonalChannelSurfacesPayload = Record<string, unknown> & {
  items?: PersonalChannelSurfaceRecord[];
};

type PersonalCardStatusTone = 'neutral' | 'connected' | 'warning' | 'danger';
type PersonalCommunicationChannel = 'telegram' | 'whatsapp';

type PersonalCardRecord = {
  id:
    | 'device'
    | 'browser'
    | 'telegram_personal'
    | 'whatsapp_personal'
    | 'signal_personal'
    | 'imessage_personal'
    | 'wechat_personal';
  label: string;
  image: string;
  detail: string;
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  summary: string;
  nextStep: string | null;
  connectedIdentity?: string | null;
  lastActivityLabel?: string | null;
  ownershipLabel?: string | null;
  channel?: PersonalCommunicationChannel | null;
};

type PersonalChannelDraft = {
  phoneNumber: string;
  apiId: string;
  apiHash: string;
  loginCode: string;
  password: string;
  recipient: string;
  text: string;
};

type McpToolRecord = Record<string, unknown> & {
  name?: string | null;
  label?: string | null;
  description?: string | null;
  action_class?: string | null;
  risk_level?: string | null;
  requires_approval?: boolean | null;
  approved?: boolean | null;
  enabled?: boolean | null;
};

type McpServerRecord = Record<string, unknown> & {
  id?: string | null;
  label?: string | null;
  endpoint?: string | null;
  enabled?: boolean | null;
  tool_count?: number | null;
  tools?: McpToolRecord[];
  last_synced_at?: string | null;
};

type McpServerDraft = {
  serverId: string;
  label: string;
  endpoint: string;
};

type ExternalIntegrationCardRecord = {
  id: string;
  label: string;
  image: string;
  detail: string;
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  summary: string;
  nextStep: string | null;
  actionLabel?: string | null;
  secondaryActionLabel?: string | null;
  actionTarget?: 'gateway' | 'computer' | 'ai' | 'close';
  channel?: PersonalCommunicationChannel | null;
};

type IntegrationWorkbenchCategoryId = 'ai' | 'apps' | 'channels' | 'computers' | 'knowledge' | 'skills' | 'developer';

type IntegrationWorkbenchGroup = {
  id: IntegrationWorkbenchCategoryId;
  label: string;
  description: string;
  detail: string;
  countLabel: string;
  statusTone: PersonalCardStatusTone;
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
  personalChannelSurfaces: PersonalChannelSurfaceRecord[];
  hostedSageAi: HostedSageAiSnapshot;
  mcpServers: McpServerRecord[];
};

const sageConnectorsPaneCache = new Map<string, SageConnectorsPaneCache>();

const DEFAULT_HOSTED_SAGE_AI: HostedSageAiSnapshot = {
  allowed: false,
  planAllowsHostedAi: false,
  policy: 'disabled',
  reason: 'policy_disabled',
  message: 'Credits are not active yet. Add credits or connect your own AI account.',
  monthlyCapUsd: 0,
  monthlyCostUsd: 0,
  monthlyRemainingUsd: 0,
  creditsPerUsd: 1000,
  monthlyCreditCap: 0,
  monthlyCreditsUsed: 0,
  monthlyCreditsRemaining: 0,
};

const DEFAULT_MCP_SERVER_DRAFT: McpServerDraft = {
  serverId: '',
  label: '',
  endpoint: '',
};

const SAMPLE_PROVIDER_IDS = [
  'deepseek',
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
  'groq',
  'xai',
  'ollama_cloud',
  'openai-codex',
  'vertex',
  'azure_openai',
  'bedrock',
  'mistral',
  'qwen',
  'custom_openai_compatible',
  'ollama',
] as const;

const SAMPLE_PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  xai: 'xAI',
  gemini: 'Google Gemini',
  vertex: 'Google Vertex AI',
  azure_openai: 'Azure OpenAI',
  bedrock: 'Amazon Bedrock',
  deepseek: 'DeepSeek',
  ollama_cloud: 'Ollama Cloud',
  mistral: 'Mistral',
  qwen: 'Qwen',
  custom_openai_compatible: 'Custom OpenAI-compatible',
  ollama: 'Ollama',
};

const PROVIDER_IMAGE_BY_ID: Record<string, string> = {
  openai: '/integrations/openai.png',
  'openai-codex': '/integrations/openai.png',
  anthropic: '/integrations/anthropic.png',
  gemini: '/integrations/gemini.jpg',
  vertex: '/integrations/gemini.jpg',
  openrouter: '/integrations/webhook.png',
  groq: '/integrations/webhook.png',
  xai: '/integrations/webhook.png',
  azure_openai: '/integrations/openai.png',
  bedrock: '/integrations/webhook.png',
  mistral: '/integrations/mistral.png',
  deepseek: '/integrations/deepseek.jpg',
  ollama_cloud: '/integrations/ollama.png',
  qwen: '/integrations/qwen.png',
  custom_openai_compatible: '/integrations/webhook.png',
  ollama: '/integrations/ollama.png',
};

const CONNECTOR_DEFINITIONS: ConnectorCardDefinition[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    image: '/integrations/gmail.png',
    connectorIds: ['google_workspace'],
    capabilityTags: ['Send email', 'Read inbox'],
    summary: 'Use one Google sign-in when Sage should work with Gmail and Google Calendar.',
    setupHint: 'Connect Google Workspace to unlock Gmail and Calendar in one place.',
    surfaceScope: 'all',
  },
  {
    id: 'google_calendar',
    label: 'Google Calendar',
    image: '/integrations/microsoft365.png',
    connectorIds: ['google_workspace'],
    capabilityTags: ['Calendar', 'Events'],
    summary: 'Use Google Calendar when Sage should schedule, review, or update events for you.',
    setupHint: 'Connect Google Workspace first, then Sage can use your Google Calendar.',
    surfaceScope: 'all',
  },
  {
    id: 'email',
    label: 'Email',
    image: '',
    connectorIds: ['google_workspace', 'microsoft_365', 'smtp'],
    capabilityTags: ['Inbox', 'Send email'],
    summary: 'Email is where Sage can reach people across Gmail, Outlook, or a custom mailbox.',
    setupHint: 'Connect Gmail or Microsoft 365 for the easiest setup. Use a custom mailbox only when needed.',
    surfaceScope: 'all',
  },
  {
    id: 'telegram_bot',
    label: 'Telegram Bot',
    image: '/integrations/telegram.png',
    connectorIds: ['telegram_bot'],
    capabilityTags: ['Customer chat', 'Bot replies'],
    summary: 'Telegram bot deployments live in the Studio/business lane. They are separate from your personal Telegram on Connected Computer.',
    setupHint: 'Connect a Telegram bot in Studio when deployed specialists need a cloud-managed channel.',
    surfaceScope: 'studio_only',
  },
  {
    id: 'whatsapp_twilio',
    label: 'WhatsApp Business',
    image: '/integrations/whatsapp.png',
    connectorIds: ['whatsapp_twilio'],
    capabilityTags: ['Customer inbox', 'Business sends'],
    summary: 'Business WhatsApp stays in the Studio connector lane with provider-managed credentials and customer-facing delivery.',
    setupHint: 'Connect Twilio WhatsApp in Studio when deployed specialists need a reliable business channel.',
    surfaceScope: 'studio_only',
  },
  {
    id: 'slack',
    label: 'Slack',
    image: '/integrations/slack.png',
    connectorIds: ['slack'],
    capabilityTags: ['Channels', 'DMs'],
    summary: 'Use Slack when Sage should work in team channels and direct messages.',
    setupHint: 'Connect Slack to let Sage read and send messages in your workspace.',
    surfaceScope: 'all',
  },
  {
    id: 'discord_bot',
    label: 'Discord',
    image: '',
    connectorIds: ['discord_bot'],
    capabilityTags: ['Servers', 'DMs'],
    summary: 'Discord is a future communication integration. Keep it planned until the personal-agent core and channel safety are hardened.',
    setupHint: 'Prioritize Telegram, WhatsApp, and Signal first. Add Discord when there is real demand.',
    surfaceScope: 'all',
  },
  {
    id: 'github',
    label: 'GitHub',
    image: '/integrations/github.png',
    connectorIds: ['github'],
    capabilityTags: ['Issues', 'Pull requests'],
    summary: 'GitHub gives Sage repo, issue, and pull-request context.',
    setupHint: 'Connect GitHub when Sage should read or act on repositories and pull requests.',
    surfaceScope: 'all',
  },
  {
    id: 'notion',
    label: 'Notion',
    image: '/integrations/notion.png',
    connectorIds: ['notion'],
    capabilityTags: ['Pages', 'Search'],
    summary: 'Use Notion when Sage should search notes, docs, and workspace pages.',
    setupHint: 'Connect Notion to make workspace pages available to Sage.',
    surfaceScope: 'all',
  },
  {
    id: 'linear',
    label: 'Linear',
    image: '',
    connectorIds: ['linear'],
    capabilityTags: ['Issues', 'Projects'],
    summary: 'Linear lets Sage read, create, and update issue work when connected.',
    setupHint: 'Connect Linear when Sage should help with product and engineering task flow.',
    surfaceScope: 'all',
  },
  {
    id: 'drive',
    label: 'Drive',
    image: '/integrations/gmail.png',
    connectorIds: ['google_workspace'],
    capabilityTags: ['Files', 'Search'],
    summary: 'Google Drive gives Sage permissioned workspace files and documents when connected through Google Workspace.',
    setupHint: 'Connect Google Workspace first, then expose Drive files through the knowledge lane.',
    surfaceScope: 'all',
  },
  {
    id: 'uploads',
    label: 'Uploads',
    image: '',
    connectorIds: ['uploads'],
    capabilityTags: ['Files', 'Knowledge'],
    summary: 'Uploads are local workspace knowledge files Sage can use without a third-party account.',
    setupHint: 'Upload files from chat or the knowledge surface when this lane is enabled.',
    surfaceScope: 'all',
  },
  {
    id: 'websites',
    label: 'Websites',
    image: '',
    connectorIds: ['websites'],
    capabilityTags: ['Web', 'Retrieval'],
    summary: 'Websites let Sage use approved public pages or domains as knowledge sources.',
    setupHint: 'Add websites when Sage needs stable product docs, support docs, or public references.',
    surfaceScope: 'all',
  },
  {
    id: 'microsoft_365',
    label: 'Microsoft 365',
    image: '/integrations/microsoft365.png',
    connectorIds: ['microsoft_365'],
    capabilityTags: ['Mail', 'Calendar'],
    summary: 'Microsoft 365 lets Sage work with Outlook mail and calendar in one connection.',
    setupHint: 'Connect Microsoft 365 when your email and calendar live in Outlook.',
    surfaceScope: 'all',
  },
  {
    id: 'webhook',
    label: 'Webhook',
    image: '/integrations/webhook.png',
    connectorIds: ['webhook'],
    capabilityTags: ['App action', 'Automation'],
    summary: 'App actions let Sage notify or start work in another system without a full app connection.',
    setupHint: 'Add an app action when you need lightweight automation.',
    surfaceScope: 'all',
  },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readInteger(value: unknown, fallback = 0): number {
  const parsed = readNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
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
  const monthlyCapUsd = readNumber(hosted.monthly_cap_usd, 0);
  const monthlyCostUsd = readNumber(hosted.monthly_cost_usd, 0);
  const monthlyRemainingUsd = readNumber(hosted.monthly_remaining_usd, 0);
  const creditsPerUsd = readInteger(hosted.credits_per_usd, 1000);
  return {
    allowed: hosted.allowed === true,
    planAllowsHostedAi: hosted.plan_allows_hosted_ai === true,
    policy: readString(hosted.policy, DEFAULT_HOSTED_SAGE_AI.policy),
    reason: readOptionalString(hosted.reason),
    message: readOptionalString(hosted.message),
    monthlyCapUsd,
    monthlyCostUsd,
    monthlyRemainingUsd,
    creditsPerUsd,
    monthlyCreditCap: readInteger(hosted.monthly_credit_cap, monthlyCapUsd * creditsPerUsd),
    monthlyCreditsUsed: readInteger(hosted.monthly_credits_used, monthlyCostUsd * creditsPerUsd),
    monthlyCreditsRemaining: readInteger(hosted.monthly_credits_remaining, monthlyRemainingUsd * creditsPerUsd),
  };
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function formatRelativeTimestamp(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'No activity yet';
  }
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) {
    return token;
  }
  const deltaMs = Date.now() - parsed;
  const future = deltaMs < 0;
  const deltaMinutes = Math.round(Math.abs(deltaMs) / 60000);
  if (deltaMinutes < 1) {
    return future ? 'In under a minute' : 'Just now';
  }
  if (deltaMinutes < 60) {
    return future ? `In ${deltaMinutes} min` : `${deltaMinutes} min ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return future ? `In ${deltaHours} hr` : `${deltaHours} hr ago`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return future ? `In ${deltaDays} day${deltaDays === 1 ? '' : 's'}` : `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
}

function latestPersonalChannelActivity(gateway: GatewayRegistrationRecord | null, payload: PersonalChannelViewPayload | null): string {
  const state = payload?.state && typeof payload.state === 'object' ? payload.state : null;
  const recentMessages = Array.isArray(payload?.recent_messages) ? payload.recent_messages : [];
  const latestMessage = recentMessages
    .map((item) => readString(item.created_at || item.ts || item.timestamp))
    .filter(Boolean)
    .sort((left, right) => right.localeCompare(left))[0];
  return formatRelativeTimestamp(latestMessage || state?.connected_at || gateway?.last_seen_at);
}

function defaultPersonalChannelDraft(channel: PersonalCommunicationChannel): PersonalChannelDraft {
  return {
    phoneNumber: '',
    apiId: '',
    apiHash: '',
    loginCode: '',
    password: '',
    recipient: '',
    text: channel === 'telegram'
      ? 'Empyralis Telegram test from Connected Computer.'
      : 'Empyralis WhatsApp test from Connected Computer.',
  };
}

function describeHostedSageAi(hostedSageAi: HostedSageAiSnapshot, hostedProviderCard: ProviderCardRecord | null): string {
  if (hostedSageAi.allowed && hostedProviderCard) {
    return `${hostedAiTierLabel(hostedProviderCard)} · Empyralis credits · ${formatCredits(hostedSageAi.monthlyCreditsRemaining)} / ${formatCredits(hostedSageAi.monthlyCreditCap)} credits left`;
  }
  if (hostedSageAi.allowed) {
    return `${formatCredits(hostedSageAi.monthlyCreditsRemaining)} / ${formatCredits(hostedSageAi.monthlyCreditCap)} credits left · hosted runtime not configured`;
  }
  if (hostedSageAi.reason === 'owner_approval_required') {
    return 'Credits need workspace owner approval before use.';
  }
  if (hostedSageAi.reason === 'cap_reached') {
    return '0 credits left this month. Add credits or connect your own AI account.';
  }
  if (hostedSageAi.monthlyCreditCap > 0) {
    return `${formatCredits(Math.max(0, hostedSageAi.monthlyCreditsRemaining))} / ${formatCredits(hostedSageAi.monthlyCreditCap)} credits left`;
  }
  return 'Credits are not active yet. Add credits or connect your own AI account.';
}

function hostedCreditUsageLabel(hostedSageAi: HostedSageAiSnapshot): string {
  if (hostedSageAi.monthlyCreditCap <= 0) {
    return 'No credit cap configured';
  }
  return `${formatCredits(hostedSageAi.monthlyCreditsRemaining)} / ${formatCredits(hostedSageAi.monthlyCreditCap)} credits left`;
}

function hostedProviderDetailLabel(hostedSageAi: HostedSageAiSnapshot, hostedProviderCard: ProviderCardRecord): string {
  return `${hostedAiTierLabel(hostedProviderCard)} · Empyralis credits · ${hostedCreditUsageLabel(hostedSageAi)}`;
}

function fallbackProviderCatalog(): ProviderSnapshot[] {
  return SAMPLE_PROVIDER_IDS.map((id) => ({
    id,
    label: SAMPLE_PROVIDER_LABELS[id] ?? id,
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

function normalizeMcpServers(payload: unknown): McpServerRecord[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Array.isArray(record.items)
    ? record.items.filter((item): item is McpServerRecord => Boolean(item) && typeof item === 'object')
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

function compactNavInitials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  }
  return label.trim().slice(0, 2).toUpperCase();
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
  return providerRequiresSecret(provider, profile) ? 'Connection detail' : 'No connection detail required';
}

function providerCredentialPlaceholder(provider: ProviderSnapshot): string {
  const authMode = readString(provider.defaultAuthMode).toLowerCase();
  if (authMode === 'none' || authMode === 'local_cli') {
    return '';
  }
  return 'Paste connection detail';
}

function providerNeedsBaseUrl(provider: ProviderSnapshot): boolean {
  return provider.id === 'custom_openai_compatible' || provider.id === 'azure_openai';
}

function providerBaseUrlLabel(provider: ProviderSnapshot): string {
  return provider.id === 'azure_openai' ? 'Azure endpoint or compatible base URL' : 'Base URL';
}

function providerBaseUrlPlaceholder(provider: ProviderSnapshot): string {
  return provider.id === 'azure_openai'
    ? 'https://your-resource.openai.azure.com/openai/v1'
    : 'https://api.example.com/v1';
}

function providerNeedsGateway(providerId: string): boolean {
  return providerId === 'ollama' || providerId === 'openai-codex';
}

function providerIsLocalOnly(record: ProviderCardRecord | null): boolean {
  if (!record) {
    return false;
  }
  return record.provider.localOnly === true || providerNeedsGateway(record.provider.id);
}

function providerPickerStatusLabel(record: ProviderCardRecord, localCompanionOnline: boolean): string {
  if (providerNeedsGateway(record.provider.id) && !localCompanionOnline) {
    return 'Connect the selected computer';
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
  const selectedModel = readString(record.profile?.model);
  const credentialPlane = readString(record.provider.credentialPlane).toLowerCase();
  const activeSource = readString(record.provider.activeSource).toLowerCase();
  const hostedEmpyralis = credentialPlane === 'platform_runtime'
    || record.provider.hostedSageAiPolicy === 'allowed'
    || record.provider.hostedSageAiPolicy === 'enabled_with_cap'
    || activeSource.includes('platform')
    || activeSource.includes('hosted');
  if (hostedEmpyralis) {
    const tierToken = selectedModel.toLowerCase();
    if (tierToken === 'light') {
      return 'Light';
    }
    if (tierToken === 'pro') {
      return 'Pro';
    }
    if (tierToken === 'max') {
      return 'Max';
    }
  }
  return selectedModel
    || readString(record.provider.defaultModel)
    || readString(record.provider.models[0]?.label)
    || readString(record.provider.models[0]?.id)
    || 'No model selected';
}

function hostedAiTierLabel(record: ProviderCardRecord | null): string {
  const metadata = profileMetadataRecord(record?.profile ?? null);
  const explicitTier = readString(metadata.chat_model_tier || metadata.public_tier || metadata.model_tier).toLowerCase();
  const selectedModel = readString(record?.profile?.model || record?.provider.defaultModel).toLowerCase();
  if (explicitTier === 'light' || selectedModel === 'light' || selectedModel.includes('flash')) {
    return 'Light AI';
  }
  if (explicitTier === 'max' || selectedModel === 'max' || selectedModel.includes('reasoner')) {
    return 'Max AI';
  }
  return 'Pro AI';
}

function providerPathLabel(record: ProviderCardRecord): string {
  const providerId = readString(record.provider.id).toLowerCase();
  const credentialPlane = readString(record.provider.credentialPlane).toLowerCase();
  const defaultAuthMode = readString(record.provider.defaultAuthMode).toLowerCase();
  const activeSource = readString(record.provider.activeSource).toLowerCase();

  if (providerId === 'ollama') {
    return 'Connected Computer';
  }
  if (providerId === 'openai-codex' || activeSource.includes('cli') || defaultAuthMode === 'oauth_token') {
    return 'Connected Computer';
  }
  if (providerId === 'ollama_cloud') {
    return 'Ollama Cloud';
  }
  if (
    credentialPlane === 'platform_runtime'
    || record.provider.hostedSageAiPolicy === 'allowed'
    || record.provider.hostedSageAiPolicy === 'enabled_with_cap'
    || activeSource.includes('platform')
    || activeSource.includes('hosted')
  ) {
    return 'Empyralis credits';
  }
  if (
    credentialPlane === 'workspace_connection'
    || record.provider.workspaceConnected
    || Boolean(record.credential)
    || Boolean(readString(record.profile?.credential_id))
  ) {
    return 'Your AI account';
  }
  if (record.provider.localOnly === true || credentialPlane === 'local_runtime') {
    return 'Connected Computer';
  }
  return record.label;
}

function providerAvailabilityLabel(record: ProviderCardRecord | null, localCompanionOnline: boolean): string {
  if (!record) {
    return 'Not available';
  }
  if (providerPickerConnected(record, localCompanionOnline) || record.provider.usable) {
    return 'available';
  }
  return 'configurable';
}

function providerActiveSummaryLabel(
  activeProviderCard: ProviderCardRecord | null,
  hostedProviderCard: ProviderCardRecord | null,
  explicitSelectedProfile: ProviderProfileRecord | null,
): string {
  if (!activeProviderCard) {
    return 'No AI model active';
  }
  if (activeProviderCard === hostedProviderCard && !explicitSelectedProfile) {
    return `${hostedAiTierLabel(activeProviderCard)} through Empyralis credits`;
  }
  return `${activeProviderCard.label} through ${providerPathLabel(activeProviderCard)}`;
}

function providerActiveSummaryDetail(
  activeProviderCard: ProviderCardRecord | null,
  hostedProviderCard: ProviderCardRecord | null,
  explicitSelectedProfile: ProviderProfileRecord | null,
  hostedSageAi: HostedSageAiSnapshot,
): string {
  if (!activeProviderCard) {
    return 'Choose an AI model before Sage can answer with hosted or connected models.';
  }
  if (activeProviderCard === hostedProviderCard && !explicitSelectedProfile) {
    return hostedProviderDetailLabel(hostedSageAi, activeProviderCard);
  }
  return `${providerActiveModelLabel(activeProviderCard)} · ${providerPathLabel(activeProviderCard)}`;
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
  const pathLabel = providerPathLabel(record);
  const modelLabel = providerActiveModelLabel(record);
  const authMode = readString(record.profile?.auth_mode).replace(/_/g, ' ');
  if (record.provider.id === 'ollama' && !localCompanionOnline) {
    return `${pathLabel} · Connect the selected computer first`;
  }
  if (record.connected) {
    if (modelLabel && modelLabel !== 'No model selected') {
      return `${pathLabel} · ${modelLabel}`;
    }
    if (modelCount > 0) {
      return `${pathLabel} · ${modelCount} model${modelCount === 1 ? '' : 's'} ready`;
    }
    if (authMode) {
      return `${pathLabel} · ${authMode}`;
    }
    if (record.provider.stateDetail) {
      return `${pathLabel} · ${record.provider.stateDetail}`;
    }
    return `${pathLabel} · Ready`;
  }
  if (record.provider.id === 'ollama') {
    return localCompanionOnline ? `${pathLabel} · Browse local models` : `${pathLabel} · Needs the selected computer`;
  }
  if (record.provider.modelsError) {
    return `${pathLabel} · Needs model refresh`;
  }
  return providerRequiresSecret(record.provider, record.profile)
    ? `${pathLabel} · Add ${providerCredentialLabel(record.provider, record.profile).toLowerCase()}`
    : `${pathLabel} · Connect to continue`;
}

function providerRouteBadge(record: ProviderCardRecord): { label: string; tone: 'neutral' | 'hosted' | 'local' } | null {
  const providerId = readString(record.provider.id).toLowerCase();
  const credentialPlane = readString(record.provider.credentialPlane).toLowerCase();
  const defaultAuthMode = readString(record.provider.defaultAuthMode).toLowerCase();
  const activeSource = readString(record.provider.activeSource).toLowerCase();

  if (providerId === 'openai-codex' || defaultAuthMode === 'oauth_token' || activeSource.includes('cli')) {
    return { label: 'The selected computer', tone: 'local' };
  }
  if (providerId === 'ollama' || record.provider.localOnly || credentialPlane === 'local_runtime') {
    return { label: 'The selected computer', tone: 'local' };
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
    return { label: 'Your account', tone: 'neutral' };
  }
  return null;
}

function providerStatusPresentation(
  record: ProviderCardRecord,
  localCompanionOnline: boolean,
): { label: string; className: string | null; showDot: boolean } {
  const pathLabel = providerPathLabel(record);
  if (record.provider.id === 'ollama' && !localCompanionOnline) {
    return {
      label: 'Offline',
      className: 'sage-unified-card__status--warning',
      showDot: false,
    };
  }
  if (record.status === 'connected') {
    if (pathLabel === 'Empyralis credits') {
      return {
        label: 'Credits ready',
        className: 'sage-unified-card__status--connected',
        showDot: true,
      };
    }
    if (pathLabel === 'Your AI account' || pathLabel === 'Ollama Cloud') {
      return {
        label: 'Account ready',
        className: 'sage-unified-card__status--connected',
        showDot: true,
      };
    }
    if (pathLabel.startsWith('Connected Computer')) {
      return {
        label: 'Ready on the selected computer',
        className: 'sage-unified-card__status--connected',
        showDot: true,
      };
    }
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
    return `${record.label} is ready when you ask Sage to use it.`;
  }
  return record.definition.setupHint;
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
      statusLabel: 'Connect computer',
      statusTone: 'warning',
      detail: 'Connect a computer so Sage can use your browser and personal apps when you ask.',
      summary: 'Connected Computer keeps browser, files, and personal apps on the selected computer until you approve use.',
      nextStep: 'Open computer setup and connect the selected computer.',
    };
  }
  const connectionStatus = readString(gateway.connection_status || gateway.status).toLowerCase();
  const doctorStatus = readString(doctor?.status).toLowerCase();
  if (connectionStatus === 'online' && ['healthy', 'pass', 'connected'].includes(doctorStatus)) {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'Connected Computer is connected and ready.',
      summary: 'Sage can use the selected computer for browser and personal apps when you ask and approve it.',
      nextStep: null,
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: 'Connected Computer needs attention before Sage can use it.',
    summary: 'Reconnect the selected computer to restore browser and personal app access.',
    nextStep: 'Open computer setup to reconnect.',
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
      statusLabel: 'Connect computer',
      statusTone: 'warning',
      detail: 'Connect a computer before Sage can use your browser.',
      summary: 'Your signed-in browser stays on the selected computer and only runs when you ask.',
      nextStep: 'Connect a computer first.',
    };
  }
  const gatewayOnline = readString(gateway.connection_status || gateway.status).toLowerCase() === 'online';
  if (!gatewayOnline) {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'danger',
      detail: 'Connected Computer needs attention before browser use is available.',
      summary: 'Signed-in sites stay unavailable until the selected computer reconnects.',
      nextStep: 'Open computer setup to reconnect first.',
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
      detail: 'Your browser is waiting for approval.',
      summary: 'Sage needs approval before using signed-in browser pages on Connected Computer.',
      nextStep: 'Open computer setup to review browser approvals.',
    };
  }
  if (attachedCount > 0 && attachStatus === 'pass') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'Your signed-in browser is ready on the selected computer.',
      summary: readString(
        browserAttachRecord.summary,
        'Sage is ready to use your existing signed-in browser session on the selected computer.',
      ),
      nextStep: 'Open computer setup to review browser access.',
    };
  }
  if (attachFailedCount > 0 || attachStatus === 'fail') {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'danger',
      detail: readString(browserAttachRecord.summary, 'Your browser connection failed.'),
      summary: 'Sage could not reach your signed-in browser session. Private sites stay unavailable until it recovers.',
      nextStep: 'Open computer setup to retry browser access.',
    };
  }
  if (attachCount > 0 && pendingAttachCount > 0) {
    return {
      statusLabel: 'Needs attention',
      statusTone: 'warning',
      detail: readString(browserAttachRecord.summary, 'Your browser is not ready yet.'),
      summary: 'Sage still needs a reachable browser session on the selected computer before it can use private sites.',
      nextStep: 'Open computer setup to finish browser access.',
    };
  }
  if (activeCount > 0 && status === 'pass') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: 'Your browser is ready on the selected computer.',
      summary: `${readString(browserRecord.summary, 'Browser access is ready on the selected computer.')} Signed-in pages stay on Connected Computer.`,
      nextStep: 'Open computer setup to review browser access.',
    };
  }
  if (activeCount === 0 && status === 'pass') {
    return {
      statusLabel: 'Not connected',
      statusTone: 'neutral',
      detail: 'No browser session is active yet.',
      summary: 'Connected Computer is online. Start browser access only when you want Sage to use signed-in pages.',
      nextStep: 'Open computer setup to start browser access.',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: status === 'warn' ? 'warning' : 'danger',
    detail: readString(browserRecord.summary, 'Browser access needs attention.'),
    summary: 'Browser approvals stay on Connected Computer.',
    nextStep: 'Open computer setup to resolve browser access.',
  };
}

function summarizeWhatsappPersonalState(gateway: GatewayRegistrationRecord | null, payload: PersonalChannelViewPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
  connectedIdentity: string | null;
  lastActivityLabel: string;
  ownershipLabel: string;
  channel: PersonalCommunicationChannel;
} {
  const ownershipSummary = 'Stays on Connected Computer. This is your personal WhatsApp, not a business account.';
  const lastActivityLabel = latestPersonalChannelActivity(gateway, payload);
  if (!gateway) {
    return {
      statusLabel: 'Connect computer',
      statusTone: 'warning',
      detail: 'Connect a computer before Sage can use your WhatsApp.',
      summary: ownershipSummary,
      nextStep: 'Connect a computer first, then connect WhatsApp here.',
      connectedIdentity: null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'whatsapp',
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
      summary: ownershipSummary,
      nextStep: 'Use setup or reconnect from this card.',
      connectedIdentity: null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'whatsapp',
    };
  }
  if (status === 'connected') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: linkedLabel ? `${linkedLabel} is linked on Connected Computer.` : 'Your WhatsApp is linked on Connected Computer.',
      summary: `${ownershipSummary} Sage can reply through your personal WhatsApp when you ask.`,
      nextStep: null,
      connectedIdentity: linkedLabel || 'Linked WhatsApp account',
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'whatsapp',
    };
  }
  if (['qr_required', 'pairing_code_required', 'code_required', 'login_required'].includes(status) || Boolean(state?.qr_code) || Boolean(state?.login_hint) || Boolean(metadata.pairing_code)) {
    return {
      statusLabel: 'Waiting for QR/login',
      statusTone: 'warning',
      detail: 'WhatsApp is waiting for a QR scan or pairing code step.',
      summary: ownershipSummary,
      nextStep: 'Complete the QR or pairing-code step from this app card.',
      connectedIdentity: linkedLabel || null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'whatsapp',
    };
  }
  if (['connecting', 'reconnecting', 'resuming'].includes(status)) {
    return {
      statusLabel: 'Reconnecting',
      statusTone: 'warning',
      detail: 'WhatsApp is reconnecting on Connected Computer.',
      summary: ownershipSummary,
      nextStep: 'Reconnect from this card if it does not recover.',
      connectedIdentity: linkedLabel || null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'whatsapp',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: `Your WhatsApp is ${status.replace(/_/g, ' ')}.`,
    summary: ownershipSummary,
    nextStep: 'Reconnect from this card or review recent activity.',
    connectedIdentity: linkedLabel || null,
    lastActivityLabel,
    ownershipLabel: ownershipSummary,
    channel: 'whatsapp',
  };
}

function summarizeTelegramPersonalState(gateway: GatewayRegistrationRecord | null, payload: PersonalChannelViewPayload | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
  connectedIdentity: string | null;
  lastActivityLabel: string;
  ownershipLabel: string;
  channel: PersonalCommunicationChannel;
} {
  const ownershipSummary = 'Stays on Connected Computer. This is your personal Telegram.';
  const lastActivityLabel = latestPersonalChannelActivity(gateway, payload);
  if (!gateway) {
    return {
      statusLabel: 'Connect computer',
      statusTone: 'warning',
      detail: 'Connect a computer before Sage can use your Telegram.',
      summary: ownershipSummary,
      nextStep: 'Connect a computer first, then connect Telegram here.',
      connectedIdentity: null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'telegram',
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
      summary: ownershipSummary,
      nextStep: 'Use setup or reconnect from this card.',
      connectedIdentity: null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'telegram',
    };
  }
  if (status === 'connected') {
    return {
      statusLabel: 'Connected',
      statusTone: 'connected',
      detail: linkedLabel ? `${linkedLabel} is linked on Connected Computer.` : 'Your Telegram is linked on Connected Computer.',
      summary: `${ownershipSummary} Sage can reply through your personal Telegram when you ask.`,
      nextStep: null,
      connectedIdentity: linkedLabel || 'Linked Telegram account',
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'telegram',
    };
  }
  if (['code_required', 'password_required', 'login_required'].includes(status) || Boolean(state?.login_hint)) {
    return {
      statusLabel: 'Waiting for QR/login',
      statusTone: 'warning',
      detail: 'Telegram is waiting for a login code or confirmation.',
      summary: ownershipSummary,
      nextStep: 'Complete Telegram login from this app card.',
      connectedIdentity: linkedLabel || null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'telegram',
    };
  }
  if (['connecting', 'reconnecting', 'resuming'].includes(status)) {
    return {
      statusLabel: 'Reconnecting',
      statusTone: 'warning',
      detail: 'Telegram is reconnecting on Connected Computer.',
      summary: ownershipSummary,
      nextStep: 'Reconnect from this card if it does not recover.',
      connectedIdentity: linkedLabel || null,
      lastActivityLabel,
      ownershipLabel: ownershipSummary,
      channel: 'telegram',
    };
  }
  return {
    statusLabel: 'Needs attention',
    statusTone: 'danger',
    detail: `Your Telegram is ${status.replace(/_/g, ' ')}.`,
    summary: ownershipSummary,
    nextStep: 'Reconnect from this card or review recent activity.',
    connectedIdentity: linkedLabel || null,
    lastActivityLabel,
    ownershipLabel: ownershipSummary,
    channel: 'telegram',
  };
}

function summarizePersonalSurfaceState(
  surface: PersonalChannelSurfaceRecord | null | undefined,
  fallback: {
    statusLabel: string;
    statusTone: PersonalCardStatusTone;
    detail: string;
    summary: string;
    nextStep: string | null;
  },
): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  if (!surface) {
    return fallback;
  }
  const status = readString(surface.status).toLowerCase();
  const label = readString(surface.label, 'This channel');
  const connected = surface.connected === true;
  const liveCapable = surface.live_capable === true;
  const detail = readString(surface.detail)
    || (connected
      ? `${label} is connected on Agent Computer.`
      : `${label} is ${status ? status.replace(/_/g, ' ') : 'available'} on Agent Computer.`);
  return {
    statusLabel: readString(surface.status_label)
      || (connected ? 'Connected' : liveCapable ? 'Available' : fallback.statusLabel),
    statusTone: connected ? 'connected' : status.includes('error') || status.includes('blocked') ? 'danger' : status.includes('connecting') ? 'warning' : 'neutral',
    detail,
    summary: liveCapable
      ? `${label} is an Agent Computer personal channel. It is separate from Studio business/customer channels.`
      : `${label} is listed as an Agent Computer channel, but setup and send stay disabled until its local adapter is ready.`,
    nextStep: readOptionalString(surface.next_step) ?? fallback.nextStep,
  };
}

function summarizePlannedSignalPersonalState(surface?: PersonalChannelSurfaceRecord | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  return summarizePersonalSurfaceState(surface, {
    statusLabel: 'Bridge required',
    statusTone: 'neutral',
    detail: 'Signal runs through Agent Computer.',
    summary: 'Signal is a Sage personal channel. It needs a local bridge on the selected Agent Computer and stays separate from Studio business channels.',
    nextStep: 'Connect an Agent Computer with a Signal bridge to enable Sage messaging.',
  });
}

function summarizePlannedIMessagePersonalState(surface?: PersonalChannelSurfaceRecord | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  return summarizePersonalSurfaceState(surface, {
    statusLabel: 'Mac bridge required',
    statusTone: 'neutral',
    detail: 'iMessage runs through a Mac Agent Computer.',
    summary: 'iMessage is a Sage personal channel. It needs a local Mac bridge and stays separate from Studio business channels.',
    nextStep: 'Connect a Mac Agent Computer with an iMessage bridge to enable Sage messaging.',
  });
}

function summarizeWeChatPersonalState(surface?: PersonalChannelSurfaceRecord | null): {
  statusLabel: string;
  statusTone: PersonalCardStatusTone;
  detail: string;
  summary: string;
  nextStep: string | null;
} {
  return summarizePersonalSurfaceState(surface, {
    statusLabel: 'Bridge required',
    statusTone: 'neutral',
    detail: 'WeChat personal runs through Agent Computer.',
    summary: 'WeChat is a Sage personal channel. It needs a local bridge on the selected Agent Computer and stays separate from Studio business channels.',
    nextStep: 'Connect an Agent Computer with a WeChat bridge to enable Sage messaging.',
  });
}

export function WorkstationSageConnectorsPane({
  showProviders = true,
  showTools = true,
  connectorIds,
  className,
  surface = 'sage',
}: {
  showProviders?: boolean;
  showTools?: boolean;
  connectorIds?: string[];
  className?: string;
  surface?: 'sage' | 'studio';
} = {}) {
  const { bootstrap, routeManifest } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [personalChannelSurfaces, setPersonalChannelSurfaces] = useState<PersonalChannelSurfaceRecord[]>(() => cachedState?.personalChannelSurfaces ?? []);
  const [hostedSageAi, setHostedSageAi] = useState<HostedSageAiSnapshot>(() => cachedState?.hostedSageAi ?? DEFAULT_HOSTED_SAGE_AI);
  const [mcpServers, setMcpServers] = useState<McpServerRecord[]>(() => cachedState?.mcpServers ?? []);
  const [isLoading, setIsLoading] = useState(() => cachedState === null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<IntegrationWorkbenchCategoryId>(() => showProviders ? 'ai' : 'channels');
  const [providerDraftKeys, setProviderDraftKeys] = useState<Record<string, string>>({});
  const [providerDraftBaseUrls, setProviderDraftBaseUrls] = useState<Record<string, string>>({});
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [computerConnectOpen, setComputerConnectOpen] = useState(false);
  const [providerPickerDraftId, setProviderPickerDraftId] = useState<string | null>(null);
  const [connectorMemoryEnabled, setConnectorMemoryEnabled] = useState<Record<string, boolean>>({});
  const [providerModelOverrides, setProviderModelOverrides] = useState<Record<string, ProviderCatalogModelRecord[]>>({});
  const [failedLogos, setFailedLogos] = useState<Set<string>>(() => new Set());
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [mcpServerDraft, setMcpServerDraft] = useState<McpServerDraft>(DEFAULT_MCP_SERVER_DRAFT);
  const [configChannelId, setConfigChannelId] = useState<PersonalCommunicationChannel | null>(null);
  const [channelDrafts, setChannelDrafts] = useState<Record<PersonalCommunicationChannel, PersonalChannelDraft>>({
    telegram: defaultPersonalChannelDraft('telegram'),
    whatsapp: defaultPersonalChannelDraft('whatsapp'),
  });

  const loadState = useCallback(async () => {
    const [catalogResult, profileResult, credentialResult, connectorResult, mcpResult, gatewayResult] = await Promise.allSettled([
      services.client.listProviderCatalog(),
      services.client.listProviderProfiles(),
      services.client.listVaultCredentials(),
      services.client.listConnectorsVault(),
      services.client.listMcpServers(),
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
            personalChannelSurfaces: [],
          };
        }
        const [doctorPayload, whatsappPayload, telegramPayload, channelSurfacesPayload] = await Promise.all([
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
          services.client.requestJson<PersonalChannelSurfacesPayload>({
            path: `/api/personal-channels/gateways/${encodeURIComponent(gatewayId)}/channels`,
            allowStatuses: [403, 404],
          }),
        ]);
        return {
          gateways: registrationItems,
          selectedGatewayId: gatewayId,
          doctor: doctorPayload,
          whatsappPersonal: whatsappPayload,
          telegramPersonal: telegramPayload,
          personalChannelSurfaces: Array.isArray(channelSurfacesPayload?.items)
            ? channelSurfacesPayload.items.filter((item): item is PersonalChannelSurfaceRecord => Boolean(item) && typeof item === 'object')
            : [],
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
      personalChannelSurfaces: [],
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
      personalChannelSurfaces: gatewayPayload.personalChannelSurfaces,
      hostedSageAi: normalizeHostedSageAi(catalogPayload),
      mcpServers: mcpResult.status === 'fulfilled' ? normalizeMcpServers(mcpResult.value) : [],
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
    setPersonalChannelSurfaces(nextState.personalChannelSurfaces);
    setHostedSageAi(nextState.hostedSageAi);
    setMcpServers(nextState.mcpServers);

    if (catalogResult.status === 'rejected') {
      throw catalogResult.reason instanceof Error
        ? catalogResult.reason
        : new Error('Provider catalog is unavailable right now.');
    }
  }, [cacheKey, services.client, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(sageConnectorsPaneCache.get(cacheKey) === null);
    setError(null);
    void loadState()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Connections are unavailable right now.');
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
    } satisfies ProviderCardRecord;
  }), [credentials, localCompanionOnline, profiles, providerModelOverrides, providers]);

  const hostedProviderCard = useMemo(() => {
    const isHostedEligible = (record: ProviderCardRecord): boolean => (
      hostedSageAi.allowed && (
        record.provider.hostedSageAiPolicy === 'enabled_with_cap'
        || record.provider.hostedSageAiPolicy === 'allowed'
        || readString(record.provider.credentialPlane).toLowerCase() === 'platform_runtime'
      )
    ) || providerRouteBadge(record)?.label === 'Via Empyralis';
    const hostedEligibleCards = providerCards.filter(isHostedEligible);
    if (hostedEligibleCards.length === 0) {
      return null;
    }
    const launchHostedPriority = ['deepseek', 'gemini', 'openai'];
    for (const providerId of launchHostedPriority) {
      const preferred = hostedEligibleCards.find((record) => record.provider.id === providerId);
      if (preferred) {
        return preferred;
      }
    }
    return hostedEligibleCards[0] ?? null;
  }, [hostedSageAi.allowed, providerCards]);

  const explicitSelectedProfile = useMemo(
    () => sortProfiles(profiles).find((profile) =>
      readString(profileMetadataRecord(profile).chat_model_selection).toLowerCase() === 'explicit'
      && profile.enabled !== false) ?? null,
    [profiles],
  );

  const activeProviderCard = useMemo(() => {
    const explicitProviderId = readString(explicitSelectedProfile?.provider).toLowerCase();
    if (explicitProviderId) {
      const explicitCard = providerCards.find((record) => record.provider.id === explicitProviderId) ?? null;
      if (explicitCard && (!providerIsLocalOnly(explicitCard) || providerPickerConnected(explicitCard, localCompanionOnline))) {
        return explicitCard;
      }
    }
    return hostedProviderCard
      ?? providerCards.find((record) => record.provider.active && (!providerIsLocalOnly(record) || providerPickerConnected(record, localCompanionOnline)))
      ?? providerCards.find((record) => providerPickerConnected(record, localCompanionOnline) && !providerIsLocalOnly(record))
      ?? null;
  }, [explicitSelectedProfile, hostedProviderCard, localCompanionOnline, providerCards]);

  const backupProviderCard = useMemo(() => {
    const backupPriority = ['gemini', 'openai', 'anthropic'];
    for (const providerId of backupPriority) {
      const card = providerCards.find((record) => record.provider.id === providerId) ?? null;
      if (card) {
        return card;
      }
    }
    return null;
  }, [providerCards]);

  const aiProviderSummary = useMemo<AiProviderSummary>(() => {
    const backupName = backupProviderCard?.provider.id === 'gemini' ? 'Gemini' : backupProviderCard?.label ?? 'Backup model';
    const backupAvailability = providerAvailabilityLabel(backupProviderCard, localCompanionOnline);
    const creditsLabel = hostedSageAi.monthlyCreditCap > 0
      ? `${formatCredits(hostedSageAi.monthlyCreditsRemaining)} remaining`
      : hostedSageAi.allowed
        ? 'Available'
        : 'Not active';
    return {
      activeLabel: providerActiveSummaryLabel(activeProviderCard, hostedProviderCard, explicitSelectedProfile),
      activeDetail: providerActiveSummaryDetail(activeProviderCard, hostedProviderCard, explicitSelectedProfile, hostedSageAi),
      creditsLabel,
      creditsDetail: hostedSageAi.monthlyCreditCap > 0 ? hostedCreditUsageLabel(hostedSageAi) : describeHostedSageAi(hostedSageAi, hostedProviderCard),
      backupLabel: backupProviderCard ? `${backupName} ${backupAvailability}` : 'No backup configured',
      backupDetail: backupProviderCard
        ? `${backupProviderCard.label} stays available as ${providerPathLabel(backupProviderCard)}.`
        : 'Connect Gemini, OpenAI, or Anthropic when you want a backup hosted provider.',
      configLabel: 'Provider configuration',
      configDetail: 'Connect another AI account or use a model on Connected Computer.',
    };
  }, [activeProviderCard, backupProviderCard, explicitSelectedProfile, hostedProviderCard, hostedSageAi, localCompanionOnline]);

  const providerPickerSections = useMemo<ProviderPickerSection[]>(() => {
    const orderedByokIds = ['deepseek', 'gemini', 'openai', 'anthropic', 'ollama_cloud'];
    const byokItems = orderedByokIds
      .map((providerId) => providerCards.find((record) => record.provider.id === providerId) ?? null)
      .filter((record): record is ProviderCardRecord => Boolean(record));
    const localItems = ['ollama']
      .map((providerId) => providerCards.find((record) => record.provider.id === providerId) ?? null)
      .filter((record): record is ProviderCardRecord => Boolean(record));
    const sections: ProviderPickerSection[] = [];
    if (hostedProviderCard || hostedSageAi.planAllowsHostedAi) {
      sections.push({
        id: 'hosted',
        label: 'Empyralis credits',
        items: hostedProviderCard ? [hostedProviderCard] : [],
      });
    }
    sections.push({
      id: 'byok',
      label: 'Your AI accounts',
      items: byokItems,
    });
    if (localItems.length > 0) {
      sections.push({
        id: 'local',
        label: 'Connected Computer',
        items: localItems,
      });
    }
    return sections;
  }, [hostedProviderCard, hostedSageAi.planAllowsHostedAi, providerCards]);

  const selectedGateway = useMemo(
    () => gateways.find((gateway) => readString(gateway.gateway_id, '') === readString(selectedGatewayId, '')) ?? null,
    [gateways, selectedGatewayId],
  );
  const showPersonalSurface = surface === 'sage';
  const personalChannelSurfaceByKey = useMemo(() => {
    const byKey = new Map<string, PersonalChannelSurfaceRecord>();
    personalChannelSurfaces.forEach((item) => {
      const key = readString(item.channel_key).toLowerCase();
      if (key) {
        byKey.set(key, item);
      }
    });
    return byKey;
  }, [personalChannelSurfaces]);

  const personalCards = useMemo<PersonalCardRecord[]>(() => {
    const device = summarizeGatewayState(selectedGateway, doctor);
    const browser = summarizeBrowserState(selectedGateway, doctor);
    const telegram = summarizeTelegramPersonalState(selectedGateway, telegramPersonal);
    const whatsapp = summarizeWhatsappPersonalState(selectedGateway, whatsappPersonal);
    const signal = summarizePlannedSignalPersonalState(personalChannelSurfaceByKey.get('signal_personal'));
    const imessage = summarizePlannedIMessagePersonalState(personalChannelSurfaceByKey.get('imessage_personal'));
    const wechat = summarizeWeChatPersonalState(personalChannelSurfaceByKey.get('wechat_personal'));
    return [
      { id: 'device', label: 'Connected Computer', image: '', ...device },
      { id: 'browser', label: 'Use my browser', image: '', ...browser },
      { id: 'telegram_personal', label: 'Your Telegram', image: '/integrations/telegram.png', ...telegram },
      { id: 'whatsapp_personal', label: 'Your WhatsApp', image: '/integrations/whatsapp.png', ...whatsapp },
      { id: 'signal_personal', label: 'Signal', image: '', ...signal },
      { id: 'imessage_personal', label: 'iMessage', image: '', ...imessage },
      { id: 'wechat_personal', label: 'WeChat', image: '', ...wechat },
    ];
  }, [doctor, personalChannelSurfaceByKey, selectedGateway, telegramPersonal, whatsappPersonal]);

  const communicationPersonalCards = useMemo(
    () => personalCards.filter((card) =>
      card.id === 'telegram_personal'
      || card.id === 'whatsapp_personal'
      || card.id === 'signal_personal'
      || card.id === 'imessage_personal'
      || card.id === 'wechat_personal',
    ),
    [personalCards],
  );

  const thisComputerCards = useMemo<ExternalIntegrationCardRecord[]>(() => {
    const device = personalCards.find((card) => card.id === 'device');
    const cards: ExternalIntegrationCardRecord[] = [];
    if (device) {
      cards.push({
        ...device,
        id: 'computer_gateway',
        label: 'Connected Computer',
        detail: device.statusTone === 'connected'
          ? 'Connected. Sage can use browser, files, apps, channels, and local AI from the selected computer when you ask.'
          : 'Connect once. The selected computer gives Sage full local capability when you ask.',
        summary: device.statusTone === 'connected'
          ? 'Connected Computer is the local power layer for Sage. Capabilities stay on the selected computer and remain approval-gated where needed.'
          : 'No capability picking here. Connect a computer and Sage gets the local power layer by default.',
        nextStep: device.statusTone === 'connected'
          ? 'Connected. Manage or revoke it only when needed.'
          : 'Connect the selected computer to enable browser, files, personal apps, channels, and local models.',
        actionLabel: device.statusTone === 'connected' ? 'Manage computer' : 'Connect a computer',
        actionTarget: 'computer',
      });
    }
    return cards;
  }, [personalCards]);

  const connectorCards = useMemo<ConnectorCardRecord[]>(() => {
    const latestConnectorById = new Map<string, VaultCredentialRecord>();
    sortCredentials(connectorVault).forEach((item) => {
      const connectorId = readString(item.connector).toLowerCase();
      if (connectorId && !latestConnectorById.has(connectorId)) {
        latestConnectorById.set(connectorId, item);
      }
    });

    return CONNECTOR_DEFINITIONS.flatMap((definition) => {
      if (surface === 'sage' && definition.surfaceScope === 'studio_only') {
        return [];
      }
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
  }, [connectorIds, connectorVault, surface]);

  function connectorStatusTone(record: ConnectorCardRecord): PersonalCardStatusTone {
    return record.connected ? 'connected' : 'neutral';
  }

  function connectorActionLabel(record: ConnectorCardRecord): string {
    if (record.connected) {
      return 'Done';
    }
    return 'Keep planned';
  }

  function connectorAsExternalCard(record: ConnectorCardRecord): ExternalIntegrationCardRecord {
    return {
      id: `connector_${record.id}`,
      label: record.label,
      image: record.image,
      detail: describeConnectorCard(record),
      statusLabel: record.connected ? 'Connected' : 'Not connected',
      statusTone: connectorStatusTone(record),
      summary: record.definition.summary,
      nextStep: record.connected ? null : record.definition.setupHint,
      actionLabel: connectorActionLabel(record),
      actionTarget: 'close',
    };
  }

  function personalAsExternalCard(record: PersonalCardRecord): ExternalIntegrationCardRecord {
    return {
      id: record.id,
      label: record.label,
      image: record.image,
      detail: record.detail,
      statusLabel: record.statusLabel,
      statusTone: record.statusTone,
      summary: record.summary,
      nextStep: record.nextStep,
      actionLabel: record.channel ? 'Setup details' : record.statusTone === 'connected' ? 'Review connection' : 'Set up',
      secondaryActionLabel: record.channel ? 'Connected Computer settings' : null,
      actionTarget: 'gateway',
      channel: record.channel ?? null,
    };
  }

  const knowledgeConnectorCards = useMemo(
    () => connectorCards.filter((card) =>
      card.id === 'drive'
      || card.id === 'notion'
      || card.id === 'uploads'
      || card.id === 'websites'
      || card.id === 'github',
    ),
    [connectorCards],
  );

  const knowledgeCards = useMemo<ExternalIntegrationCardRecord[]>(
    () => knowledgeConnectorCards.map(connectorAsExternalCard),
    [knowledgeConnectorCards],
  );

  const appCards = useMemo<ExternalIntegrationCardRecord[]>(
    () => connectorCards
      .filter((card) =>
        card.id === 'gmail'
        || card.id === 'google_calendar'
        || card.id === 'microsoft_365'
        || card.id === 'github'
        || card.id === 'linear'
        || card.id === 'notion'
        || card.id === 'webhook',
      )
      .map(connectorAsExternalCard),
    [connectorCards],
  );

  const channelCards = useMemo<ExternalIntegrationCardRecord[]>(
    () => [
      ...communicationPersonalCards.map(personalAsExternalCard),
      ...connectorCards
        .filter((card) =>
          card.id === 'email'
          || card.id === 'slack'
          || card.id === 'discord_bot'
          || card.id === 'telegram_bot'
          || card.id === 'whatsapp_twilio',
        )
        .map(connectorAsExternalCard),
    ],
    [communicationPersonalCards, connectorCards],
  );

  const integrationGroups = useMemo<IntegrationWorkbenchGroup[]>(() => {
    const groups: IntegrationWorkbenchGroup[] = [];
    if (showProviders) {
      groups.push({
        id: 'ai',
        label: 'AI Accounts',
        description: 'Empyralis credits and user-owned AI accounts.',
        detail: aiProviderSummary.activeLabel,
        countLabel: activeProviderCard ? 'Active' : 'Setup',
        statusTone: activeProviderCard ? 'connected' : 'warning',
      });
    }

    if (appCards.length > 0) {
      groups.push({
        id: 'apps',
        label: 'Connected Apps',
        description: 'Work systems Sage can read or act inside.',
        detail: 'Gmail, calendar, workspace apps, GitHub, Notion, and webhooks.',
        countLabel: `${appCards.length}`,
        statusTone: appCards.some((card) => card.statusTone === 'connected') ? 'connected' : 'neutral',
      });
    }
    if (channelCards.length > 0) {
      groups.push({
        id: 'channels',
        label: showPersonalSurface ? 'Personal Messaging' : 'Business Channels',
        description: showPersonalSurface ? 'Places you can talk to Sage.' : 'Places customers can talk to an agent.',
        detail: surface === 'sage'
          ? 'Telegram, WhatsApp, Signal, iMessage, and WeChat through Agent Computer.'
          : 'Customer-facing message channels.',
        countLabel: `${channelCards.length}`,
        statusTone: channelCards.some((card) => card.statusTone === 'connected') ? 'connected' : 'neutral',
      });
    }
    if (showPersonalSurface && thisComputerCards.length > 0) {
      groups.push({
        id: 'computers',
        label: 'Agent Computer',
        description: 'Optional computer power.',
        detail: 'Computer control, phone app, and remote setup.',
        countLabel: thisComputerCards.some((card) => card.statusTone === 'connected') ? 'Online' : 'Setup',
        statusTone: thisComputerCards.some((card) => card.statusTone === 'connected') ? 'connected' : 'warning',
      });
    }
    if (knowledgeCards.length > 0) {
      groups.push({
        id: 'knowledge',
        label: 'Knowledge',
        description: 'Approved sources Sage can read.',
        detail: 'Drive, Notion, uploads, websites, and repos.',
        countLabel: `${knowledgeCards.length}`,
        statusTone: knowledgeCards.some((card) => card.statusTone === 'connected') ? 'connected' : 'neutral',
      });
    }
    if (showTools) {
      groups.push({
        id: 'skills',
        label: 'Skills',
        description: 'Installable Skill.md packages.',
        detail: 'Built-in, local, open-source, and marketplace packages.',
        countLabel: 'Governed',
        statusTone: 'neutral',
      });
    }
    groups.push({
      id: 'developer',
      label: 'Extensions',
      description: 'Plugin-style adapters and custom tools.',
      detail: 'MCP servers, custom APIs, and future adapter packs.',
      countLabel: mcpServers.length > 0 ? `${mcpServers.length}` : 'Custom',
      statusTone: mcpServers.some((server) => server.enabled !== false) ? 'connected' : 'neutral',
    });
    return groups;
  }, [
    activeProviderCard,
    aiProviderSummary.activeLabel,
    appCards,
    channelCards,
    knowledgeCards,
    localCompanionOnline,
    mcpServers,
    providerCards,
    showPersonalSurface,
    showProviders,
    showTools,
    surface,
    thisComputerCards,
  ]);

  const selectedIntegrationGroup = useMemo(
    () => integrationGroups.find((group) => group.id === selectedIntegrationId) ?? integrationGroups[0] ?? null,
    [integrationGroups, selectedIntegrationId],
  );

  const requestedIntegrationId = useMemo<IntegrationWorkbenchCategoryId | null>(() => {
    const token = readString(searchParams.get('section') ?? searchParams.get('connection')).toLowerCase();
    return token === 'ai'
      || token === 'apps'
      || token === 'channels'
      || token === 'computers'
      || token === 'knowledge'
      || token === 'skills'
      || token === 'developer'
      ? token
      : null;
  }, [searchParams]);

  useEffect(() => {
    if (integrationGroups.length === 0) {
      return;
    }
    if (requestedIntegrationId && integrationGroups.some((group) => group.id === requestedIntegrationId)) {
      setSelectedIntegrationId(requestedIntegrationId);
      return;
    }
    if (!integrationGroups.some((group) => group.id === selectedIntegrationId)) {
      setSelectedIntegrationId(integrationGroups[0].id);
    }
  }, [integrationGroups, requestedIntegrationId, selectedIntegrationId]);

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

  async function handleMcpServerSave() {
    const serverId = readString(mcpServerDraft.serverId);
    const endpoint = readString(mcpServerDraft.endpoint);
    if (!serverId || !endpoint) {
      setError('MCP server needs an ID and endpoint.');
      return;
    }
    setBusyCardId('mcp:save');
    try {
      await services.client.saveMcpServer({
        serverId,
        label: readString(mcpServerDraft.label) || serverId,
        endpoint,
        discoverTools: true,
      });
      setMcpServerDraft(DEFAULT_MCP_SERVER_DRAFT);
      await refreshAfterMutation('MCP server saved. Review and approve discovered tools before Sage can use them.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'MCP server could not be saved.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleMcpServerRefresh(server: McpServerRecord) {
    const serverId = readString(server.id);
    if (!serverId) {
      return;
    }
    setBusyCardId(`mcp:${serverId}:refresh`);
    try {
      await services.client.refreshMcpServer({ serverId });
      await refreshAfterMutation('MCP tools refreshed. New tools stay hidden until approved.');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'MCP server could not refresh.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleMcpToolApprove(server: McpServerRecord, tool: McpToolRecord) {
    const serverId = readString(server.id);
    const toolName = readString(tool.name);
    if (!serverId || !toolName) {
      return;
    }
    setBusyCardId(`mcp:${serverId}:${toolName}:approve`);
    try {
      await services.client.approveMcpTool({ serverId, toolName });
      await refreshAfterMutation(`${readString(tool.label, toolName)} approved for Sage.`);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'MCP tool could not be approved.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleMcpServerDelete(server: McpServerRecord) {
    const serverId = readString(server.id);
    if (!serverId) {
      return;
    }
    const confirmed = window.confirm(`Remove MCP server ${readString(server.label, serverId)} from this workspace?`);
    if (!confirmed) {
      return;
    }
    setBusyCardId(`mcp:${serverId}:delete`);
    try {
      await services.client.deleteMcpServer({ serverId });
      await refreshAfterMutation('MCP server removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'MCP server could not be removed.');
    } finally {
      setBusyCardId(null);
    }
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
    const draftBaseUrl = (providerDraftBaseUrls[record.id] ?? '').trim();
    if (providerRequiresSecret(record.provider, record.profile) && !draftApiKey) {
      setError(`${providerCredentialLabel(record.provider, record.profile)} is required before Sage can connect this provider.`);
      return;
    }
    if (providerNeedsBaseUrl(record.provider) && !draftBaseUrl) {
      setError(`${providerBaseUrlLabel(record.provider)} is required before Sage can fetch models for this provider.`);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: record.provider.id,
        apiKey: draftApiKey || null,
        baseUrl: draftBaseUrl || null,
        model: null,
      });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId: record.provider.id,
        action: 'saved',
      });
      await refreshAfterMutation(`${record.label} is now connected.`);
      setProviderDraftKeys((current) => ({ ...current, [record.id]: '' }));
      setProviderDraftBaseUrls((current) => ({ ...current, [record.id]: '' }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'AI model connection failed.');
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
      setError(`${record.label} requires a connected local computer before it can be selected.`);
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
      setError(selectionError instanceof Error ? selectionError.message : 'Could not select this AI model.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handleProviderConnectAndSelect(record: ProviderCardRecord) {
    const draftApiKey = (providerDraftKeys[record.id] ?? '').trim();
    const draftBaseUrl = (providerDraftBaseUrls[record.id] ?? '').trim();
    if (!draftApiKey) {
      setError(`${providerCredentialLabel(record.provider, record.profile)} is required before Sage can connect this provider.`);
      return;
    }
    if (providerNeedsBaseUrl(record.provider) && !draftBaseUrl) {
      setError(`${providerBaseUrlLabel(record.provider)} is required before Sage can fetch models for this provider.`);
      return;
    }
    setBusyCardId(record.id);
    setError(null);
    setStatus(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: record.provider.id,
        apiKey: draftApiKey,
        baseUrl: draftBaseUrl || null,
        model: null,
      });
      emitWorkstationProviderChanged({
        workspaceId: services.scope.workspaceId,
        providerId: record.provider.id,
        action: 'saved',
      });
      await loadState();
      setProviderDraftKeys((current) => ({ ...current, [record.id]: '' }));
      setProviderDraftBaseUrls((current) => ({ ...current, [record.id]: '' }));
      await setActiveProvider(record);
      setProviderPickerDraftId(null);
      setProviderPickerOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'AI model connection failed.');
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
      setError(disconnectError instanceof Error ? disconnectError.message : 'AI model disconnect failed.');
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
      setError(disconnectError instanceof Error ? disconnectError.message : 'Connected app disconnect failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  function updateChannelDraft(channel: PersonalCommunicationChannel, patch: Partial<PersonalChannelDraft>) {
    setChannelDrafts((current) => ({
      ...current,
      [channel]: {
        ...current[channel],
        ...patch,
      },
    }));
  }

  async function handlePersonalChannelSetup(channel: PersonalCommunicationChannel): Promise<void> {
    if (!selectedGatewayId) {
      setError('Connect the selected computer before setting up a personal channel.');
      return;
    }
    const draft = channelDrafts[channel];
    const payload: Record<string, unknown> = {};
    if (channel === 'whatsapp') {
      if (!draft.phoneNumber.trim()) {
        setError('Enter the WhatsApp phone number before requesting pairing.');
        return;
      }
      payload.phone_number = draft.phoneNumber.trim();
    } else {
      const apiId = Number.parseInt(draft.apiId.trim(), 10);
      if (Number.isFinite(apiId)) {
        payload.api_id = apiId;
      }
      if (draft.apiHash.trim()) {
        payload.api_hash = draft.apiHash.trim();
      }
      if (draft.phoneNumber.trim()) {
        payload.phone_number = draft.phoneNumber.trim();
      }
      if (draft.loginCode.trim()) {
        payload.login_code = draft.loginCode.trim();
      }
      if (draft.password.trim()) {
        payload.password = draft.password.trim();
      }
      if (Object.keys(payload).length === 0) {
        setError('Enter Telegram API details, phone number, or login code before requesting setup.');
        return;
      }
    }
    setBusyCardId(`${channel}_personal`);
    setError(null);
    setStatus(null);
    try {
      await services.client.requestJson<Record<string, unknown>>({
        path: `/api/personal-channels/${channel}/gateways/${encodeURIComponent(selectedGatewayId)}/setup`,
        init: {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      });
      await refreshAfterMutation(
        channel === 'telegram'
          ? 'Telegram setup requested on Connected Computer.'
          : 'WhatsApp pairing requested on Connected Computer.',
      );
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Personal Channels setup failed.');
    } finally {
      setBusyCardId(null);
    }
  }

  async function handlePersonalChannelTest(channel: PersonalCommunicationChannel): Promise<void> {
    if (!selectedGatewayId) {
      setError('Connect the selected computer before sending a personal channel test.');
      return;
    }
    const draft = channelDrafts[channel];
    if (!draft.recipient.trim() || !draft.text.trim()) {
      setError(`Enter a ${channel === 'telegram' ? 'Telegram recipient' : 'WhatsApp recipient'} and test message first.`);
      return;
    }
    setBusyCardId(`${channel}_personal:test`);
    setError(null);
    setStatus(null);
    try {
      await services.client.requestJson<Record<string, unknown>>({
        path: `/api/personal-channels/${channel}/gateways/${encodeURIComponent(selectedGatewayId)}/messages`,
        init: {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            remote_jid: draft.recipient.trim(),
            text: draft.text.trim(),
            idempotency_key: `integrations-${channel}-${Date.now().toString(36)}`,
          }),
        },
      });
      await refreshAfterMutation(
        channel === 'telegram'
          ? 'Telegram test sent through Connected Computer.'
          : 'WhatsApp test sent through Connected Computer.',
      );
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Personal Channels test failed.');
    } finally {
      setBusyCardId(null);
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
    router.push(routeManifest.routeIndex.gateway?.href ?? `/w/${encodeURIComponent(workspaceId)}/gateway`);
  }

  function openComputerConnectSheet() {
    setExpandedCardId(null);
    setComputerConnectOpen(true);
  }

  function openWorkspaceRoute(routeId: 'gateway' | 'channels' | 'gatewayActivity' | 'gatewayApprovals') {
    const fallbackPath = routeId === 'gateway'
      ? 'gateway'
      : routeId === 'channels'
        ? 'channels'
        : routeId === 'gatewayActivity'
          ? 'gateway-activity'
          : 'gateway-approvals';
    router.push(routeManifest.routeIndex[routeId]?.href ?? `/w/${encodeURIComponent(workspaceId)}/${fallbackPath}`);
  }

  function openBillingSettings() {
    router.push(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`);
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

  function providerApiDisplayLabel(record: ProviderCardRecord): string {
    switch (record.provider.id) {
      case 'deepseek':
        return 'DeepSeek API';
      case 'gemini':
        return 'Google Gemini API';
      case 'openai':
        return 'OpenAI API';
      case 'anthropic':
        return 'Anthropic API';
      case 'ollama_cloud':
        return 'Ollama Cloud API';
      case 'ollama':
        return 'Ollama on Connected Computer';
      default:
        return `${record.label} API`;
    }
  }

  function renderAiProviderChoiceCard(record: ProviderCardRecord, section: ProviderPickerSection) {
    if (section.id === 'hosted') {
      return null;
    }
    const needsGateway = providerNeedsGateway(record.provider.id) && !localCompanionOnline;
    const isActive = activeProviderCard?.id === record.id;
    const connected = providerPickerConnected(record, localCompanionOnline);
    const requiresSecret = providerRequiresSecret(record.provider, record.profile);
    const modelLabel = providerActiveModelLabel(record);
    const statusLabel = isActive
      ? 'Active'
      : connected
        ? 'Connected'
        : needsGateway
          ? 'Connect computer'
          : requiresSecret
            ? 'Add API key'
            : 'Available';
    const actionLabel = isActive ? 'Selected' : connected ? 'Use' : requiresSecret ? 'Add key' : 'Use';
    const detail = connected
      ? `${modelLabel} · ${providerPathLabel(record)}`
      : needsGateway
        ? 'Connect a computer before using this provider.'
        : requiresSecret
          ? 'Add an API key to use this provider.'
          : providerPathLabel(record);
    return (
      <button
        key={`${section.id}-${record.id}`}
        type="button"
        className={joinClassNames(
          'sage-ai-provider-card',
          isActive && 'sage-ai-provider-card--active',
        )}
        disabled={busyCardId === record.id}
        onClick={() => {
          if (!connected && requiresSecret) {
            setProviderPickerOpen(true);
            setProviderPickerDraftId(record.id);
            setStatus(null);
            setError(null);
            return;
          }
          void handleProviderSelect(record, { hosted: false });
        }}
      >
        <BrandLogo
          id={record.id}
          label={record.label}
          src={record.image}
          failedLogos={failedLogos}
          onError={markLogoFailed}
        />
        <span className="sage-ai-provider-card__copy">
          <span className="sage-ai-provider-card__topline">
            <strong className="sage-ai-provider-card__name">{providerApiDisplayLabel(record)}</strong>
          </span>
          <span className="sage-ai-provider-card__detail">{detail}</span>
        </span>
        <span className={joinClassNames('sage-ai-provider-card__status', connected && 'sage-ai-provider-card__status--connected')}>
          <span
            className={joinClassNames(
              'sage-ai-provider-card__dot',
              connected && 'sage-ai-provider-card__dot--connected',
            )}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
        <span className="sage-ai-provider-card__action">{actionLabel}</span>
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

  function personalStatusClassName(record: { statusTone: PersonalCardStatusTone }): string | null {
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
        {record.channel ? (
          <span className="sage-unified-card__detail">
            {`Identity: ${record.connectedIdentity || 'Not linked'} · Last activity: ${record.lastActivityLabel || 'No activity yet'}`}
          </span>
        ) : null}
        <span className={joinClassNames('sage-unified-card__status', personalStatusClassName(record))}>
          {record.statusTone === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
          {record.statusLabel}
        </span>
      </button>
    );
  }

  function renderExternalCard(record: ExternalIntegrationCardRecord) {
    const isExpanded = expandedCardId === record.id;
    return (
      <button
        key={record.id}
        type="button"
        className={joinClassNames('sage-unified-card', isExpanded && 'sage-unified-card--selected')}
        onClick={() => {
          if (record.actionTarget === 'computer') {
            openComputerConnectSheet();
            return;
          }
          if (record.actionTarget === 'ai') {
            setProviderPickerOpen(true);
            setProviderPickerDraftId(null);
            return;
          }
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

  function renderProviderExpand(record: ProviderCardRecord, options: { showClose?: boolean } = {}) {
    const busy = busyCardId === record.id;
    const showClose = options.showClose !== false;
    return (
      <MotionSlidePanel className="sage-unified-expand">
        <div className="sage-unified-expand__header">
          <strong className="sage-unified-expand__title">{record.label}</strong>
          {showClose ? (
            <button
              type="button"
              className="sage-unified-expand__close"
              onClick={() => setExpandedCardId(null)}
              aria-label={`Close ${record.label}`}
            >
              <X size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {record.status === 'connected' ? (
          <>
            <div className="sage-unified-expand__text">
              {`Connected. ${record.keyTail ? `Saved sign-in ends in ${record.keyTail}` : providerRequiresSecret(record.provider, record.profile) ? 'Saved sign-in details are hidden.' : 'No sign-in details required.'}`}
            </div>
            {record.provider.id === 'ollama' && !localCompanionOnline ? (
              <div className="sage-unified-expand__text">
                Connect a computer to use Ollama.
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
                    const value = event.currentTarget.value;
                    setProviderDraftKeys((current) => ({ ...current, [record.id]: value }));
                  }}
                />
              </FormField>
            ) : (
              <div className="sage-unified-expand__text">
                {localCompanionOnline
                  ? 'Connected Computer can use available Ollama models from the selected computer.'
                  : 'Connect a computer to use Ollama.'}
              </div>
            )}
            {providerNeedsBaseUrl(record.provider) ? (
              <FormField label={providerBaseUrlLabel(record.provider)}>
                <FormInput
                  type="url"
                  value={providerDraftBaseUrls[record.id] ?? ''}
                  placeholder={providerBaseUrlPlaceholder(record.provider)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setProviderDraftBaseUrls((current) => ({ ...current, [record.id]: value }));
                  }}
                />
              </FormField>
            ) : null}
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
              {showClose ? (
                <button
                  type="button"
                  className="sage-unified-expand__link"
                  onClick={() => setExpandedCardId(null)}
                >
                  Cancel
                </button>
              ) : null}
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
        <p className="sage-unified-section__label">AI Models</p>
        {rows.map((row, rowIndex) => (
          <div
            key={`AI Models-skeleton-${rowIndex}`}
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

  function renderPersonalChannelConfig(
    channel: PersonalCommunicationChannel,
    channelDraft: PersonalChannelDraft,
    channelBusy: boolean,
  ) {
    return (
      <div className="sage-unified-expand__config app-stack-3">
        <div className="sage-unified-expand__text">
          Setup details are only for login, pairing, and controlled test messages.
        </div>
        {channel === 'whatsapp' ? (
          <>
            <FormField label="WhatsApp phone number" hint="Used only by Connected Computer for pairing.">
              <FormInput
                value={channelDraft.phoneNumber}
                placeholder="8618657105303"
                onChange={(event) => updateChannelDraft('whatsapp', { phoneNumber: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="Recipient" hint="Phone number or chat identifier for the controlled test.">
              <FormInput
                value={channelDraft.recipient}
                placeholder="8618657105303"
                onChange={(event) => updateChannelDraft('whatsapp', { recipient: event.currentTarget.value })}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Telegram app ID" hint="Used only for controlled Telegram setup on Connected Computer.">
              <FormInput
                value={channelDraft.apiId}
                placeholder="123456"
                onChange={(event) => updateChannelDraft('telegram', { apiId: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="Telegram app secret">
              <FormInput
                value={channelDraft.apiHash}
                placeholder="Telegram app secret"
                onChange={(event) => updateChannelDraft('telegram', { apiHash: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="Phone number" hint="Used by Telegram login on Connected Computer.">
              <FormInput
                value={channelDraft.phoneNumber}
                placeholder="+8618657105303"
                onChange={(event) => updateChannelDraft('telegram', { phoneNumber: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="Login code" hint="Enter only when Telegram asks for a code.">
              <FormInput
                value={channelDraft.loginCode}
                onChange={(event) => updateChannelDraft('telegram', { loginCode: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="2FA password" hint="Optional. Required only for Telegram accounts with 2FA enabled.">
              <FormInput
                type="password"
                value={channelDraft.password}
                onChange={(event) => updateChannelDraft('telegram', { password: event.currentTarget.value })}
              />
            </FormField>
            <FormField label="Recipient" hint="Telegram user, chat, or channel for the controlled test.">
              <FormInput
                value={channelDraft.recipient}
                placeholder="123456789"
                onChange={(event) => updateChannelDraft('telegram', { recipient: event.currentTarget.value })}
              />
            </FormField>
          </>
        )}
        <FormField label="Test message" hint="Sends from Connected Computer as a controlled test.">
          <FormInput
            value={channelDraft.text}
            onChange={(event) => updateChannelDraft(channel, { text: event.currentTarget.value })}
          />
        </FormField>
        <div className="sage-unified-expand__actions">
          <AppButton
            type="button"
            disabled={channelBusy}
            onClick={() => {
              void handlePersonalChannelSetup(channel);
            }}
          >
            {channelBusy && busyCardId === `${channel}_personal` ? 'Requesting…' : 'Request setup'}
          </AppButton>
          <AppButton
            type="button"
            tone="secondary"
            disabled={channelBusy}
            onClick={() => {
              void handlePersonalChannelTest(channel);
            }}
          >
            {channelBusy && busyCardId === `${channel}_personal:test` ? 'Sending…' : 'Send test'}
          </AppButton>
        </div>
      </div>
    );
  }

  function renderPersonalExpand(record: PersonalCardRecord) {
    const showChannelActions = record.id === 'telegram_personal' || record.id === 'whatsapp_personal';
    const bridgeChannel = record.id === 'signal_personal'
      || record.id === 'imessage_personal'
      || record.id === 'wechat_personal';
    const channel = record.channel ?? null;
    const channelDraft = channel ? channelDrafts[channel] : null;
    const channelBusy = channel ? busyCardId === `${channel}_personal` || busyCardId === `${channel}_personal:test` : false;
    const configOpen = channel ? configChannelId === channel : false;
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
        {showChannelActions ? (
          <>
            <div className="sage-unified-expand__text">
              {`${record.statusLabel} · ${record.connectedIdentity || 'Not linked'} · ${record.lastActivityLabel || 'No activity yet'}`}
            </div>
            <div className="sage-unified-expand__tag-row">
              <span className="sage-unified-expand__tag">Runs on Connected Computer</span>
              <span className="sage-unified-expand__tag">Personal Channels</span>
              {record.id === 'whatsapp_personal' ? (
                <span className="sage-unified-expand__tag">Not a business account</span>
              ) : null}
            </div>
          </>
        ) : null}
        {record.nextStep ? (
          <div className="sage-unified-expand__text">{record.nextStep}</div>
        ) : null}
        <div className="sage-unified-expand__actions">
          {showChannelActions && channel ? (
            <AppButton
              type="button"
              disabled={channelBusy}
              onClick={() => {
                setConfigChannelId(configOpen ? null : channel);
              }}
            >
              Setup details
            </AppButton>
          ) : (
            <AppButton
              type="button"
              onClick={() => {
                openGatewaySurface();
              }}
            >
              {bridgeChannel
                ? 'Open computer setup'
                : record.statusLabel === 'Connect computer'
                ? 'Connect a computer'
                : record.id === 'browser'
                  ? 'Open browser sessions'
                  : 'Open computer setup'}
            </AppButton>
          )}
          {record.id === 'device' || showChannelActions ? (
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => {
                openWorkspaceRoute('gateway');
              }}
            >
              {showChannelActions ? 'Connected Computer settings' : 'Revoke access'}
            </AppButton>
          ) : null}
          <button
            type="button"
            className="sage-unified-expand__link"
            onClick={() => setExpandedCardId(null)}
          >
            Close
          </button>
        </div>
        {showChannelActions && channel && channelDraft && configOpen ? renderPersonalChannelConfig(channel, channelDraft, channelBusy) : null}
      </MotionSlidePanel>
    );
  }

  function renderExternalExpand(record: ExternalIntegrationCardRecord, options: { showClose?: boolean } = {}) {
    const channel = record.channel ?? null;
    const channelDraft = channel ? channelDrafts[channel] : null;
    const channelBusy = channel ? busyCardId === `${channel}_personal` || busyCardId === `${channel}_personal:test` : false;
    const configOpen = channel ? configChannelId === channel : false;
    const showClose = options.showClose !== false;
    return (
      <MotionSlidePanel className="sage-unified-expand">
        <div className="sage-unified-expand__header">
          <strong className="sage-unified-expand__title">{record.label}</strong>
          {showClose ? (
            <button
              type="button"
              className="sage-unified-expand__close"
              onClick={() => setExpandedCardId(null)}
              aria-label={`Close ${record.label}`}
            >
              <X size={14} strokeWidth={1.9} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="sage-unified-expand__text">{record.summary}</div>
        {record.nextStep ? <div className="sage-unified-expand__text">{record.nextStep}</div> : null}
        <div className="sage-unified-expand__actions">
          {record.actionLabel ? (
            <AppButton
              type="button"
              onClick={() => {
                if (channel) {
                  setConfigChannelId(configOpen ? null : channel);
                  return;
                }
                if (record.actionTarget === 'computer') {
                  openComputerConnectSheet();
                  return;
                }
                if (record.actionTarget === 'ai' || record.id === 'local_models') {
                  setProviderPickerOpen(true);
                  setProviderPickerDraftId(null);
                  return;
                }
                if (record.actionTarget === 'close') {
                  setExpandedCardId(null);
                  return;
                }
                openGatewaySurface();
              }}
            >
              {record.actionLabel}
            </AppButton>
          ) : null}
          {record.secondaryActionLabel ? (
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => {
                openWorkspaceRoute('gateway');
              }}
            >
              {record.secondaryActionLabel}
            </AppButton>
          ) : null}
          {showClose ? (
            <button
              type="button"
              className="sage-unified-expand__link"
              onClick={() => setExpandedCardId(null)}
            >
              Close
            </button>
          ) : null}
        </div>
        {channel && channelDraft && configOpen ? renderPersonalChannelConfig(channel, channelDraft, channelBusy) : null}
      </MotionSlidePanel>
    );
  }

  function renderComputerConnectSheet() {
    const connected = selectedGateway !== null && readString(selectedGateway.connection_status || selectedGateway.status).toLowerCase() === 'online';
    const trustState = readString(selectedGateway?.device_trust_state, connected ? 'verified' : 'not connected');
    const lastSeen = selectedGateway ? formatRelativeTimestamp(selectedGateway.last_seen_at) : 'Not connected';
    const statusLabel = connected ? 'Online and ready' : 'Not connected';
    return (
      <CommandSheet
        open={computerConnectOpen}
        title="Connect Agent Computer"
        description="Choose a computer source for Sage. Cloud remains the default when no computer is connected."
        className="sage-computer-connect-modal"
        onClose={() => setComputerConnectOpen(false)}
        actions={(
          <>
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => setComputerConnectOpen(false)}
            >
              Not now
            </AppButton>
            <AppButton
              type="button"
              onClick={openGatewaySurface}
            >
              {connected ? 'Manage computer' : 'Connect a computer'}
            </AppButton>
          </>
        )}
      >
        <div className="sage-computer-connect">
          <div className="sage-computer-connect__hero sage-computer-connect__hero--compact">
            <div className="sage-computer-connect__copy">
              <span className={joinClassNames('sage-computer-connect__status', connected && 'sage-computer-connect__status--online')}>
                {statusLabel}
              </span>
              <strong>Agent Computer source.</strong>
              <p>
                This Device and Dedicated Computer use the same gateway pairing path. Server/VPS and Cloud Computer stay
                visible as separate sources so users understand where Sage is running work.
              </p>
            </div>
          </div>
          <div className="sage-computer-connect__capabilities" aria-label="Included local capabilities">
            {['Browser', 'Files', 'Shell', 'Screenshots', 'Personal apps', 'Messaging bridges', 'Local AI'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="sage-computer-connect__state">
            <div>
              <span>Status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div>
              <span>Trust</span>
              <strong>{trustState.replace(/_/g, ' ')}</strong>
            </div>
            <div>
              <span>Last seen</span>
              <strong>{lastSeen}</strong>
            </div>
          </div>
          <details className="sage-computer-connect__config">
            <summary>Connection details</summary>
            <p>Connection details are only for reconnecting, revoking, or debugging the selected computer. Normal users should only need the connect button.</p>
          </details>
        </div>
      </CommandSheet>
    );
  }

  function renderConnectorConfigDetails(record: ConnectorCardRecord) {
    return (
      <details className="sage-unified-expand__config-disclosure">
        <summary className="sage-unified-expand__config-summary">Connection details</summary>
        <div className="sage-unified-expand__text">
          App actions Sage can use after you connect this integration.
        </div>
        <div className="sage-unified-expand__tag-row">
          {record.definition.capabilityTags.map((tag) => (
            <span key={tag} className="sage-unified-expand__tag">{tag}</span>
          ))}
        </div>
      </details>
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
        {record.definition.surfaceScope === 'studio_only' ? (
          <div className="sage-unified-expand__text">
            This connector belongs to the business channel lane. Personal messaging stays in Personal Messaging through Agent Computer.
          </div>
        ) : null}
        {record.connected ? (
          <>
            <div className="sage-unified-expand__text">{record.definition.summary}</div>
            {renderConnectorConfigDetails(record)}
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
        ) : (
          <>
            <div className="sage-unified-expand__text">{record.definition.summary}</div>
            <div className="sage-unified-expand__text">{record.definition.setupHint}</div>
            {renderConnectorConfigDetails(record)}
            <div className="sage-unified-expand__actions">
              <button
                type="button"
                className="sage-unified-expand__link"
                onClick={() => setExpandedCardId(null)}
              >
                Close
              </button>
            </div>
          </>
        )}
      </MotionSlidePanel>
    );
  }

  function renderProviderPickerRow(record: ProviderCardRecord, sectionId: ProviderPickerSection['id']) {
    const isHostedSection = sectionId === 'hosted';
    const isLocalSection = sectionId === 'local';
    const pickerConnected = sectionId === 'hosted'
      ? hostedSageAi.allowed
      : providerPickerConnected(record, localCompanionOnline);
    const isActive = activeProviderCard?.id === record.id && (!isHostedSection || !explicitSelectedProfile);
    const requiresSecret = providerRequiresSecret(record.provider, record.profile);
    const showInlineKey = !isHostedSection && providerPickerDraftId === record.id && !pickerConnected && requiresSecret;
    const busy = busyCardId === record.id;
    const displayLabel = sectionId === 'hosted'
      ? hostedAiTierLabel(record)
      : record.provider.id === 'ollama_cloud'
        ? 'Ollama Cloud'
        : record.provider.id === 'ollama'
          ? 'Ollama on Connected Computer'
          : record.label;
    const detailLabel = sectionId === 'hosted'
      ? hostedProviderDetailLabel(hostedSageAi, record)
      : isLocalSection
        ? (localCompanionOnline ? 'Connected Computer · Uses the Ollama models available here' : 'Connected Computer · Connect the selected computer first')
      : record.provider.id === 'ollama_cloud'
        ? `${providerPickerStatusLabel(record, localCompanionOnline)} · Ollama Cloud`
        : `${providerPickerStatusLabel(record, localCompanionOnline)} · ${providerPathLabel(record)}`;
    return (
      <div key={`${sectionId}:${record.id}`} className={joinClassNames('sage-provider-picker__item', isHostedSection && 'sage-provider-picker__item--hosted')}>
        <button
          type="button"
          className={joinClassNames('sage-provider-picker__row', isHostedSection && 'sage-provider-picker__row--hosted', isActive && 'sage-provider-picker__row--active')}
          disabled={isHostedSection && !hostedSageAi.allowed}
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
          {isHostedSection ? (
            <span className="sage-provider-picker__pill">Use credits</span>
          ) : null}
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
                  const value = event.currentTarget.value;
                  setProviderDraftKeys((current) => ({ ...current, [record.id]: value }));
                }}
              />
            </FormField>
            {providerNeedsBaseUrl(record.provider) ? (
              <FormField label={providerBaseUrlLabel(record.provider)}>
                <FormInput
                  type="url"
                  value={providerDraftBaseUrls[record.id] ?? ''}
                  placeholder={providerBaseUrlPlaceholder(record.provider)}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setProviderDraftBaseUrls((current) => ({ ...current, [record.id]: value }));
                  }}
                />
              </FormField>
            ) : null}
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

  function renderAiOverview() {
    if (isLoading) {
      return renderProviderSkeletons();
    }
    const creditMax = Math.max(1, hostedSageAi.monthlyCreditCap);
    const creditValue = Math.max(0, Math.min(creditMax, hostedSageAi.monthlyCreditsRemaining));
    const creditPercent = Math.round((creditValue / creditMax) * 100);
    const activeConnected = activeProviderCard
      ? activeProviderCard === hostedProviderCard && !explicitSelectedProfile
        ? hostedSageAi.allowed
        : providerPickerConnected(activeProviderCard, localCompanionOnline)
      : false;
    const configurableSections = providerPickerSections.filter((section) => section.id !== 'hosted');
    return (
      <section className="sage-unified-section">
        <p className="sage-unified-section__label">AI</p>
        <p className="sage-unified-section__description">Choose the model source Sage uses. Credits stay separate from API accounts.</p>
        <div className="sage-ai-provider-panel">
          <div className="sage-ai-credit-card">
            <div className="sage-ai-credit-card__header">
              <span>
                <span className="sage-ai-credit-card__eyebrow">Empyralis credits</span>
                <strong>{aiProviderSummary.creditsLabel}</strong>
              </span>
              <span className={joinClassNames('sage-ai-provider-card__status', hostedSageAi.allowed && 'sage-ai-provider-card__status--connected')}>
                <span
                  className={joinClassNames(
                    'sage-ai-provider-card__dot',
                    hostedSageAi.allowed && 'sage-ai-provider-card__dot--connected',
                  )}
                  aria-hidden="true"
                />
                {hostedSageAi.allowed ? 'Available' : 'Needs setup'}
              </span>
            </div>
            <progress className="sage-ai-credit-card__meter" value={creditValue} max={creditMax}>
              {creditPercent}%
            </progress>
            <div className="sage-ai-credit-card__footer">
              <span>{aiProviderSummary.creditsDetail}</span>
              <AppButton type="button" tone="ghost" onClick={openBillingSettings}>
                Manage credits
              </AppButton>
            </div>
          </div>

          <div className="sage-ai-current-model">
            <div className="sage-ai-current-model__identity">
              {activeProviderCard ? (
                <BrandLogo
                  id={activeProviderCard.id}
                  label={activeProviderCard === hostedProviderCard && !explicitSelectedProfile ? 'Empyralis credits' : activeProviderCard.label}
                  src={activeProviderCard.image}
                  failedLogos={failedLogos}
                  onError={markLogoFailed}
                />
              ) : null}
              <span>
                <span className="sage-ai-credit-card__eyebrow">Current model</span>
                <strong>{aiProviderSummary.activeLabel}</strong>
                <small>{aiProviderSummary.activeDetail}</small>
              </span>
            </div>
            <span className={joinClassNames('sage-ai-provider-card__status', activeConnected && 'sage-ai-provider-card__status--connected')}>
              <span
                className={joinClassNames(
                  'sage-ai-provider-card__dot',
                  activeConnected && 'sage-ai-provider-card__dot--connected',
                )}
                aria-hidden="true"
              />
              {activeConnected ? 'Connected' : 'Needs setup'}
            </span>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setProviderPickerOpen(true);
                setProviderPickerDraftId(null);
              }}
            >
              Change model
            </AppButton>
          </div>

          <details className="sage-progressive-disclosure" open={Boolean(explicitSelectedProfile)}>
            <summary>
              <span>
                <strong>Use your own AI account</strong>
                <small>Provider and local-model setup stays here when you need it.</small>
              </span>
            </summary>
            <div className="sage-ai-provider-sections">
              {configurableSections.map((section) => (
                <section key={section.id} className="sage-ai-provider-section">
                  <div className="sage-ai-provider-section__header">
                    <strong>{section.id === 'local' ? 'Models on Agent Computer' : 'AI APIs'}</strong>
                    <span>{section.items.length} option{section.items.length === 1 ? '' : 's'}</span>
                  </div>
                  {section.items.length > 0 ? (
                    <div className="sage-ai-provider-grid">
                      {section.items.map((record) => renderAiProviderChoiceCard(record, section))}
                    </div>
                  ) : (
                    <div className="sage-integrations-detail-card">
                      <strong>{section.label}</strong>
                      <span>No provider is available in this section yet.</span>
                    </div>
                  )}
                </section>
              ))}
            </div>
          </details>
        </div>
      </section>
    );
  }

  function renderExternalCollection(
    label: string,
    description: string,
    cards: ExternalIntegrationCardRecord[],
    emptyMessage: string,
  ) {
    const expandedCard = cards.find((card) => card.id === expandedCardId) ?? null;
    return (
      <section className="sage-unified-section">
        <p className="sage-unified-section__label">{label}</p>
        <p className="sage-unified-section__description">{description}</p>
        {cards.length > 0 ? (
          <>
            <div className="sage-unified-grid sage-unified-grid--4">
              {cards.map(renderExternalCard)}
            </div>
            {expandedCard ? renderExternalExpand(expandedCard) : null}
          </>
        ) : (
          <div className="sage-integrations-detail-card">
            <strong>{label}</strong>
            <span>{emptyMessage}</span>
          </div>
        )}
      </section>
    );
  }

  function renderAgentComputerConnections() {
    const device = personalCards.find((card) => card.id === 'device');
    const connected = device?.statusTone === 'connected';
    const statusTone = device?.statusTone ?? 'warning';
    const statusClass = personalStatusClassName({ statusTone });
    const personalDoctor = doctor?.personal_channels && typeof doctor.personal_channels === 'object'
      ? doctor.personal_channels
      : null;
    const personalDoctorStatus = readString(personalDoctor?.status, 'warn').toLowerCase();
    const personalDoctorTone: PersonalCardStatusTone = personalDoctorStatus === 'pass' || personalDoctorStatus === 'healthy'
      ? 'connected'
      : personalDoctorStatus === 'fail' || personalDoctorStatus === 'blocked'
        ? 'danger'
        : 'warning';
    const personalDoctorCount = readInteger(personalDoctor?.count, communicationPersonalCards.length);
    const personalDoctorConnectedCount = readInteger(personalDoctor?.connected_count, communicationPersonalCards.filter((card) => card.statusTone === 'connected').length);
    return (
      <section className="sage-unified-section sage-agent-computer">
        <p className="sage-unified-section__label">Agent Computer</p>
        <p className="sage-unified-section__description">
          Sage runs in Cloud by default. Connect a computer only when Sage needs local browser, files, apps, shell,
          screenshots, or local AI.
        </p>
        <div className="sage-agent-computer__panel">
          <div className="sage-agent-computer__setting">
            <div className="sage-agent-computer__copy">
              <strong>Computer</strong>
              <span>This computer, a Mac mini, or a server uses the same connection setup. Keep the choice inside setup.</span>
            </div>
            <span className={joinClassNames('sage-unified-card__status', statusClass)}>
              {connected ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
              {device?.statusLabel ?? 'Not connected'}
            </span>
            <AppButton type="button" onClick={openComputerConnectSheet}>
              {connected ? 'Manage' : 'Connect'}
            </AppButton>
          </div>
          <div className="sage-agent-computer__setting">
            <div className="sage-agent-computer__copy">
              <strong>Personal messaging doctor</strong>
              <span>{readString(personalDoctor?.summary, 'Telegram, WhatsApp, Signal, iMessage, and WeChat readiness appears here after Agent Computer reports health.')}</span>
            </div>
            <span className={joinClassNames('sage-unified-card__status', personalStatusClassName({ statusTone: personalDoctorTone }))}>
              {personalDoctorTone === 'connected' ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
              {personalDoctorConnectedCount}/{personalDoctorCount} connected
            </span>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setSelectedIntegrationId('channels');
                setExpandedCardId(null);
              }}
            >
              Review
            </AppButton>
          </div>
          <div className="sage-agent-computer__setting">
            <div className="sage-agent-computer__copy">
              <strong>Phone app</strong>
              <span>Use mobile for chat, notifications, and approvals. It is not a separate computer runtime.</span>
            </div>
            <span className="sage-unified-card__status sage-unified-card__status--connected">Built in</span>
          </div>
          <details className="sage-agent-computer__advanced">
            <summary>Remote and SSH options</summary>
            <p>
              Cloud Computer and Server/VPS stay behind the computer setup flow, like Codex keeps SSH and remote device
              details inside Connections settings.
            </p>
            <AppButton type="button" tone="ghost" onClick={() => openWorkspaceRoute('gateway')}>
              Open computer settings
            </AppButton>
          </details>
        </div>
      </section>
    );
  }

  function renderIntegrationSidebar() {
    if (isLoading && integrationGroups.length === 0) {
      return (
        <div className="sage-integrations-nav">
          <div className="sage-integrations-nav__group">
            <span className="sage-integrations-nav__group-label">Loading</span>
            <div className="sage-integrations-nav__placeholder">Loading apps and accounts…</div>
          </div>
        </div>
      );
    }
    return (
      <div className="sage-integrations-nav">
        {integrationGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={joinClassNames(
              'sage-integrations-nav__bucket',
              selectedIntegrationGroup?.id === group.id && 'sage-integrations-nav__bucket--active',
            )}
            aria-selected={selectedIntegrationGroup?.id === group.id}
            onClick={() => {
              setSelectedIntegrationId(group.id);
              setExpandedCardId(null);
            }}
          >
            <span className="sage-integrations-nav__icon" aria-hidden="true">
              {compactNavInitials(group.label)}
            </span>
            <span className="sage-integrations-nav__bucket-copy">
              <span className="sage-integrations-nav__label">{group.label}</span>
              <span className="sage-integrations-nav__detail">{group.detail}</span>
            </span>
            <span className={joinClassNames('sage-integrations-nav__status', `sage-integrations-nav__status--${group.statusTone}`)}>
              {group.countLabel}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function renderSelectedIntegrationDetail() {
    if (error) {
      return <AppNotice tone="warning">Connections could not refresh. Try again when ready.</AppNotice>;
    }
    if (!selectedIntegrationGroup) {
      return (
        <div className="sage-settings-empty">
          No connections available.
        </div>
      );
    }
    switch (selectedIntegrationGroup.id) {
      case 'ai':
        return renderAiOverview();
      case 'apps':
        return renderExternalCollection(
          'Apps',
          'Connect work apps here. Individual apps stay in the main pane, not in the sidebar.',
          appCards,
          'No app connectors are available for this surface yet.',
        );
      case 'channels':
        return renderExternalCollection(
          'Channels',
          surface === 'sage'
            ? 'Personal channels stay on Connected Computer. Business/customer channels stay separate.'
            : 'Studio channels are customer-facing and separate from Sage personal channels.',
          channelCards,
          'No channel connectors are available for this surface yet.',
        );
      case 'computers':
        return renderAgentComputerConnections();
      case 'knowledge':
        return renderExternalCollection(
          'Knowledge',
          'Approved sources Sage can read when you ask.',
          knowledgeCards,
          'No knowledge sources are available yet.',
        );
      case 'skills':
        return (
          <section className="sage-unified-section">
            <p className="sage-unified-section__label">Skills</p>
            <p className="sage-unified-section__description">
              Installable Skill.md packages for reusable Sage procedures. Each package carries its own setup and safety
              requirements.
            </p>
            <WorkstationSageToolsPane />
          </section>
        );
      case 'developer':
      default:
        return (
          <section className="sage-unified-section">
            <p className="sage-unified-section__label">Developer tools</p>
            <p className="sage-unified-section__description">Custom APIs, tool servers, and webhooks stay collapsed until a technical user needs them.</p>
            <div className="sage-integrations-detail-card">
              <strong>MCP servers, custom APIs, and webhooks</strong>
              <span>Use this lane for developer-owned connections that should not be mixed with everyday apps and channels. MCP tools stay unavailable until reviewed here.</span>
            </div>
            <div className="sage-unified-expand">
              <div className="sage-unified-expand__header">
                <strong className="sage-unified-expand__title">Add MCP server</strong>
              </div>
              <FormField label="Server ID">
                <FormInput
                  value={mcpServerDraft.serverId}
                  placeholder="inventory-feed"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    const serverId = event.currentTarget.value;
                    setMcpServerDraft((current) => ({ ...current, serverId }));
                  }}
                />
              </FormField>
              <FormField label="Label">
                <FormInput
                  value={mcpServerDraft.label}
                  placeholder="Inventory Feed"
                  onChange={(event) => {
                    const label = event.currentTarget.value;
                    setMcpServerDraft((current) => ({ ...current, label }));
                  }}
                />
              </FormField>
              <FormField label="Endpoint">
                <FormInput
                  type="url"
                  value={mcpServerDraft.endpoint}
                  placeholder="https://example.com/mcp"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    const endpoint = event.currentTarget.value;
                    setMcpServerDraft((current) => ({ ...current, endpoint }));
                  }}
                />
              </FormField>
              <div className="sage-unified-expand__actions">
                <AppButton
                  type="button"
                  disabled={busyCardId === 'mcp:save'}
                  onClick={() => {
                    void handleMcpServerSave();
                  }}
                >
                  {busyCardId === 'mcp:save' ? 'Saving...' : 'Save and discover tools'}
                </AppButton>
              </div>
            </div>
            {mcpServers.length > 0 ? (
              <div className="sage-ai-provider-sections">
                {mcpServers.map((server) => {
                  const serverId = readString(server.id);
                  const serverTools = Array.isArray(server.tools) ? server.tools : [];
                  return (
                    <section key={serverId || readString(server.endpoint)} className="sage-ai-provider-section">
                      <div className="sage-ai-provider-section__header">
                        <strong>{readString(server.label, serverId || 'MCP server')}</strong>
                        <span>{server.enabled === false ? 'Disabled' : `${serverTools.length} tool${serverTools.length === 1 ? '' : 's'}`}</span>
                      </div>
                      <div className="sage-integrations-detail-card">
                        <strong>{readString(server.endpoint, 'No endpoint recorded')}</strong>
                        <span>
                          {server.last_synced_at ? `Last synced ${readString(server.last_synced_at)}` : 'Refresh to discover current tools.'}
                        </span>
                        <div className="sage-unified-expand__actions">
                          <AppButton
                            type="button"
                            tone="secondary"
                            disabled={busyCardId === `mcp:${serverId}:refresh`}
                            onClick={() => {
                              void handleMcpServerRefresh(server);
                            }}
                          >
                            {busyCardId === `mcp:${serverId}:refresh` ? 'Refreshing...' : 'Refresh tools'}
                          </AppButton>
                          <AppButton
                            type="button"
                            tone="ghost"
                            disabled={busyCardId === `mcp:${serverId}:delete`}
                            onClick={() => {
                              void handleMcpServerDelete(server);
                            }}
                          >
                            {busyCardId === `mcp:${serverId}:delete` ? 'Removing...' : 'Remove'}
                          </AppButton>
                        </div>
                      </div>
                      {serverTools.length > 0 ? (
                        <div className="sage-unified-grid sage-unified-grid--4">
                          {serverTools.map((tool) => {
                            const toolName = readString(tool.name);
                            const approved = tool.approved !== false;
                            const approveKey = `mcp:${serverId}:${toolName}:approve`;
                            return (
                              <article key={toolName || readString(tool.label)} className="sage-unified-card">
                                <span className="sage-unified-card__label">{readString(tool.label, toolName || 'MCP tool')}</span>
                                <span className="sage-unified-card__detail">
                                  {readString(tool.description, 'No description provided.')}
                                </span>
                                <span className={joinClassNames('sage-unified-card__status', approved && 'sage-unified-card__status--connected')}>
                                  {approved ? 'Approved' : 'Needs review'}
                                </span>
                                <span className="sage-unified-card__detail">
                                  {[readString(tool.action_class, 'read'), readString(tool.risk_level, 'low'), tool.requires_approval ? 'needs approval' : 'policy bound'].join(' · ')}
                                </span>
                                {!approved ? (
                                  <AppButton
                                    type="button"
                                    tone="secondary"
                                    disabled={busyCardId === approveKey}
                                    onClick={() => {
                                      void handleMcpToolApprove(server, tool);
                                    }}
                                  >
                                    {busyCardId === approveKey ? 'Approving...' : 'Approve tool'}
                                  </AppButton>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="sage-integrations-detail-card">
                          <strong>No tools discovered yet</strong>
                          <span>Refresh the server or check its MCP endpoint.</span>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="sage-integrations-detail-card">
                <strong>No MCP servers connected</strong>
                <span>Add a server to make custom tools visible for approval.</span>
              </div>
            )}
          </section>
        );
    }
  }

  return (
    <div className={joinClassNames('sage-settings-panel sage-settings-panel--connectors', className)} data-workstation-surface="integrations">
      {status ? <AppNotice tone="success">{status}</AppNotice> : null}
      <WorkstationSplitWorkbench
        ariaLabel="Connections"
        className="sage-integrations-workbench"
        resizableSidebar
        sidebarResizeStorageKey={`empyralis:connections-sidebar-width:${workspaceId}`}
        sidebarDefaultWidth={330}
        sidebarMinWidth={96}
        sidebarMaxWidth={420}
        sidebar={renderIntegrationSidebar()}
      >
        {renderSelectedIntegrationDetail()}
      </WorkstationSplitWorkbench>

      {renderComputerConnectSheet()}

      <CommandSheet
        open={providerPickerOpen}
        title="Choose AI model"
        description="Use Empyralis credits by default, or connect your own AI account."
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
