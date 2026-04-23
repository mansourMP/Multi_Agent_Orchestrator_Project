'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, X } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import {
  DataBadge,
  DataTable,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSelect,
  FormTextarea,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ModalSection } from '@/lib/ui/modal';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import type {
  DeployedAgentAnalyticsRecord,
  DeployedAgentConversationDetail,
  DeployedAgentConversationRecord,
  DeployedAgentMemoryRecord,
  DeployedAgentRecord,
  DeployedAgentTelegramReadinessRecord,
  ProviderCatalogModelRecord,
  ProviderCatalogRecord,
} from '@/lib/workspace/workstation-client';
import { WorkstationDeployedAgentAnalyticsPane } from '@/lib/workspace/workstation-deployed-agent-analytics-pane';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type WizardMode = 'create' | 'edit';
type WizardStepId = 'setup' | 'connect' | 'deploy';
type StudioSubview = 'agents' | 'inbox' | 'deploy';
type SpecialistOverlayTabId = 'overview' | 'tools' | 'memory' | 'connectors' | 'analytics';

type WizardState = {
  name: string;
  avatar: string;
  persona: string;
  systemPrompt: string;
  knowledgeSourceText: string;
  telegramEnabled: boolean;
  telegramConnectorId: string;
  telegramEndpointKey: string;
  providerId: string;
  modelId: string;
  runtimeTarget: string;
  billingPlan: string;
  selectedToolIds: string[];
  memoryEnabled: boolean;
  contextBudgetPreset: string;
  retentionPreset: string;
  healthSafetyEnabled: boolean;
  healthSafetyAssistantName: string;
  pausedMessage: string;
  welcomeIntro: string;
  welcomeCoreValue: string;
  publicStartCtaLabel: string;
  publicStartCtaUrl: string;
  escalationPreset: string;
  handoffMode: string;
  ownerNotificationDestination: string;
  dailyMessageLimit: string;
  monthlyCostCapUsd: string;
  upgradeCtaUrl: string;
  upgradeCtaLabel: string;
};

type AgentOperationalMetrics = {
  conversationCount: number;
  conversationCountLabel: string;
  latestActivityAt: string | null;
  latestActivityLabel: string;
  unresolvedEscalations: number;
  unresolvedEscalationsLabel: string;
  latestChannel: string | null;
};

type AgentAnalyticsSnapshot = {
  activeUsersLast30d: number;
  messageVolumeDay: number;
  messageVolumeWeek: number;
  messageVolumeMonth: number;
  latestMessageAt: string | null;
  escalationTotalSessions: number;
  escalationSessionCount: number;
  escalationRatePercent: number;
  outcomes: Array<[string, number]>;
  topOutcome: string | null;
  currentBurnUsd: number | null;
  costCapUsd: number | null;
  percentUsed: number | null;
  usageMonth: string | null;
};

type StudioPaneCache = {
  providerCatalog: ProviderCatalogSnapshot[];
  agents: DeployedAgentRecord[];
  connectorVaultIds: string[];
  agentMetricsById: Record<string, AgentOperationalMetrics>;
  agentAnalyticsById: Record<string, AgentAnalyticsSnapshot>;
};

type DetailConfigDraft = Pick<
  WizardState,
  'selectedToolIds' | 'memoryEnabled' | 'contextBudgetPreset' | 'retentionPreset'
>;

const studioPaneCache = new Map<string, StudioPaneCache>();

function updateStudioPaneCache(workspaceId: string, partial: Partial<StudioPaneCache>) {
  const current = studioPaneCache.get(workspaceId);
  studioPaneCache.set(workspaceId, {
    providerCatalog: current?.providerCatalog ?? [],
    agents: current?.agents ?? [],
    connectorVaultIds: current?.connectorVaultIds ?? [],
    agentMetricsById: current?.agentMetricsById ?? {},
    agentAnalyticsById: current?.agentAnalyticsById ?? {},
    ...partial,
  });
}

type ProviderCatalogModelSnapshot = {
  id: string;
  label: string;
  contextWindowTokens: number | null;
  inputCostPer1kUsd: number | null;
  outputCostPer1kUsd: number | null;
  supportsTools: boolean;
  supportsReasoning: boolean;
  localSelfHostedCompatible: boolean;
  capabilityLabels: string[];
};

type ProviderCatalogSnapshot = {
  id: string;
  label: string;
  state: string;
  defaultModel: string | null;
  privacyPosture: string | null;
  jurisdiction: string | null;
  residency: string | null;
  localSelfHostedCompatible: boolean;
  capabilityLabels: string[];
  models: ProviderCatalogModelSnapshot[];
};

type TelegramReadinessIssue = {
  code: string;
  message: string;
  guidance: string | null;
  severity: string;
};

type TelegramConnectorOption = {
  id: string;
  label: string;
  endpointKey: string | null;
  botUsername: string | null;
  webhookPath: string | null;
  webhookUrl: string | null;
  profileStatus: string | null;
  profileIssue: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

type TelegramReadinessSnapshot = {
  readyForLive: boolean;
  status: string;
  nextAction: string | null;
  blockers: TelegramReadinessIssue[];
  warnings: TelegramReadinessIssue[];
  connectors: TelegramConnectorOption[];
  configuredBinding: Record<string, unknown>;
  webhook: Record<string, unknown>;
  autopilot: Record<string, unknown>;
};

type ConversationFilters = {
  channel: string;
  escalationState: string;
  outcome: string;
};

type TimelineEntry = Record<string, unknown> & {
  id?: string | null;
  kind?: string | null;
  ts?: string | null;
  summary?: string | null;
  text?: string | null;
  status?: string | null;
  direction?: string | null;
  run_id?: string | null;
  thread_id?: string | null;
  tool_name?: string | null;
  approval_id?: string | null;
  resolution?: string | null;
  action?: string | null;
};

const DEPLOYED_AGENT_WIZARD_STEPS: Array<{
  id: WizardStepId;
  label: string;
  description: string;
}> = [
  {
    id: 'setup',
    label: 'Setup',
    description: 'Set the specialist name, persona, and core behavior in one step.',
  },
  {
    id: 'connect',
    label: 'Connect',
    description: 'Bind to one Telegram connector and validate readiness.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    description: 'Choose provider and model, then save or launch when ready.',
  },
];

const STUDIO_TOOL_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'web_search',
    label: 'Web search',
    description: 'Search public websites for current facts and references.',
  },
  {
    id: 'http_request',
    label: 'HTTP request',
    description: 'Call approved APIs and webhooks for structured lookups.',
  },
  {
    id: 'gmail_send',
    label: 'Send email',
    description: 'Draft or send Gmail replies from a connected workspace mailbox.',
  },
  {
    id: 'calendar_write',
    label: 'Calendar write',
    description: 'Create or update calendar events for scheduling workflows.',
  },
];

const CONTEXT_PRESET_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'compact',
    label: 'Compact',
    description: 'Faster, lower cost',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended',
  },
  {
    id: 'deep',
    label: 'Deep',
    description: 'More context, higher cost',
  },
];

const SPECIALIST_OVERLAY_TABS: Array<{
  id: SpecialistOverlayTabId;
  label: string;
}> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tools', label: 'Tools' },
  { id: 'memory', label: 'Memory' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'analytics', label: 'Analytics' },
];

const SPECIALIST_CONNECTOR_CARDS: ReadonlyArray<{
  id: string;
  label: string;
  image: string;
  connectorIds?: string[];
  capabilityTags: string[];
}> = [
  {
    id: 'telegram',
    label: 'Telegram',
    image: '/integrations/telegram.png',
    capabilityTags: ['Messages', 'Replies'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    image: '/integrations/whatsapp.png',
    connectorIds: ['whatsapp_twilio'],
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
    id: 'calendar',
    label: 'Calendar',
    image: '/integrations/microsoft365.png',
    connectorIds: ['google_workspace', 'microsoft_365'],
    capabilityTags: ['Calendar', 'Events'],
  },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readIntegerString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  return readString(value);
}

function readPositiveDecimalString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(value);
  }
  return readString(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatCompactCount(value: unknown): string {
  const amount = readNumber(value);
  if (amount === null) {
    return 'n/a';
  }
  return new Intl.NumberFormat(undefined, {
    notation: amount >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(amount);
}

function readItems<T extends Record<string, unknown>>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is T => Boolean(item) && typeof item === 'object')
    : [];
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'n/a';
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatRelativeTime(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'No recent activity';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 'No recent activity';
  }
  const diffMinutes = Math.round((Date.now() - parsed) / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return `${Math.max(1, Math.abs(diffMinutes))}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${Math.max(1, Math.abs(diffHours))}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return `${Math.max(1, Math.abs(diffDays))}d ago`;
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (Math.abs(diffWeeks) < 5) {
    return `${Math.max(1, Math.abs(diffWeeks))}w ago`;
  }
  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return `${Math.max(1, Math.abs(diffMonths))}mo ago`;
  }
  return `${Math.max(1, Math.round(diffDays / 365))}y ago`;
}

function formatUsd(value: unknown): string {
  const amount = readNumber(value);
  if (amount === null) {
    return 'n/a';
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatUsdPer1k(value: unknown): string {
  const amount = readNumber(value);
  if (amount === null) {
    return 'n/a';
  }
  if (amount === 0) {
    return '$0 / 1K';
  }
  const digits = amount < 0.001 ? 6 : amount < 0.01 ? 4 : 3;
  return `$${amount.toFixed(digits)} / 1K`;
}

function formatContextWindow(value: unknown): string {
  const amount = readNumber(value);
  if (amount === null || amount <= 0) {
    return 'n/a';
  }
  return `${new Intl.NumberFormat().format(amount)} tokens`;
}

function deploymentStateLabel(value: unknown): string {
  return humanizeToken(readString(value), 'Draft');
}

function rosterStatusTone(value: unknown): 'live' | 'warning' | 'danger' {
  const token = readString(value).toLowerCase();
  if (token === 'live') {
    return 'live';
  }
  if (token === 'error' || token === 'failed' || token === 'blocked') {
    return 'danger';
  }
  return 'warning';
}

function escalationTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const token = readString(value).toLowerCase();
  if (token === 'clear' || token === 'completed') {
    return 'success';
  }
  if (token === 'approval_requested' || token === 'escalated') {
    return 'warning';
  }
  if (token === 'attention_required') {
    return 'danger';
  }
  return 'neutral';
}

function outcomeTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const token = readString(value).toLowerCase();
  if (token === 'completed' || token === 'resolved') {
    return 'success';
  }
  if (token === 'pending' || token === 'open') {
    return 'warning';
  }
  if (token === 'failed' || token === 'error') {
    return 'danger';
  }
  return 'neutral';
}

function humanizeToken(value: unknown, fallback = 'Unknown'): string {
  const token = readString(value);
  if (!token) {
    return fallback;
  }
  return token
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function listEnabledChannels(channels: unknown): string[] {
  const record = readRecord(channels);
  return Object.entries(record)
    .filter(([, config]) => readRecord(config).enabled === true)
    .map(([channelKey]) => humanizeToken(channelKey, channelKey));
}

function serializeKnowledgeSources(knowledgeSources: unknown): string {
  if (!Array.isArray(knowledgeSources)) {
    return '';
  }
  return knowledgeSources
    .map((source) => {
      const record = readRecord(source);
      return readString(record.uri ?? record.id ?? record.label);
    })
    .filter(Boolean)
    .join('\n');
}

function parseKnowledgeSources(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((uri, index) => ({
      id: `source-${index + 1}`,
      uri,
      label: uri,
    }));
}

function normalizeLabelList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function normalizeToolIds(value: unknown): string[] {
  const allowed = new Set<string>(STUDIO_TOOL_OPTIONS.map((item) => item.id));
  return normalizeLabelList(value)
    .map((item) => item.toLowerCase())
    .filter((item, index, array) => allowed.has(item) && array.indexOf(item) === index);
}

function connectorConnected(connectorIds: string[] | undefined, availableConnectorIds: Set<string>): boolean {
  return (connectorIds ?? []).some((connectorId) => availableConnectorIds.has(connectorId));
}

function toolLabel(toolId: string): string {
  return STUDIO_TOOL_OPTIONS.find((item) => item.id === toolId)?.label ?? humanizeToken(toolId, toolId);
}

function readProviderCatalogItems(payload: unknown): ProviderCatalogRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const providers = (payload as Record<string, unknown>).providers;
  return Array.isArray(providers)
    ? providers.filter((item): item is ProviderCatalogRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeProviderCatalog(payload: unknown): ProviderCatalogSnapshot[] {
  return readProviderCatalogItems(payload)
    .map((provider) => {
      const providerId = readString(provider.id);
      if (!providerId) {
        return null;
      }
      const models = Array.isArray(provider.models)
        ? provider.models
          .filter((item): item is ProviderCatalogModelRecord => Boolean(item) && typeof item === 'object')
          .map((model) => ({
            id: readString(model.id),
            label: readString(model.label, readString(model.id)),
            contextWindowTokens: readNumber(model.context_window_tokens),
            inputCostPer1kUsd: readNumber(model.input_cost_per_1k_usd),
            outputCostPer1kUsd: readNumber(model.output_cost_per_1k_usd),
            supportsTools: model.supports_tools === true,
            supportsReasoning: model.supports_reasoning === true,
            localSelfHostedCompatible: model.local_self_hosted_compatible === true,
            capabilityLabels: normalizeLabelList(model.capability_labels),
          }))
          .filter((item) => item.id)
        : [];
      return {
        id: providerId,
        label: readString(provider.label, humanizeToken(providerId, providerId)),
        state: readString(provider.state, 'unknown'),
        defaultModel: readOptionalString(provider.default_model),
        privacyPosture: readOptionalString(provider.privacy_posture),
        jurisdiction: readOptionalString(provider.jurisdiction),
        residency: readOptionalString(provider.residency),
        localSelfHostedCompatible: provider.local_self_hosted_compatible === true,
        capabilityLabels: normalizeLabelList(provider.capability_labels),
        models,
      } satisfies ProviderCatalogSnapshot;
    })
    .filter((item): item is ProviderCatalogSnapshot => Boolean(item));
}

function normalizeTelegramIssue(value: unknown): TelegramReadinessIssue | null {
  const record = readRecord(value);
  const message = readString(record.message);
  if (!message) {
    return null;
  }
  return {
    code: readString(record.code, 'telegram_issue'),
    message,
    guidance: readOptionalString(record.guidance),
    severity: readString(record.severity, 'warning'),
  };
}

function normalizeTelegramConnector(value: unknown): TelegramConnectorOption | null {
  const record = readRecord(value);
  const id = readString(record.id);
  if (!id) {
    return null;
  }
  return {
    id,
    label: readString(record.label, id),
    endpointKey: readOptionalString(record.endpoint_key),
    botUsername: readOptionalString(record.bot_username),
    webhookPath: readOptionalString(record.webhook_path),
    webhookUrl: readOptionalString(record.webhook_url),
    profileStatus: readOptionalString(record.profile_status),
    profileIssue: readOptionalString(record.profile_issue),
    lastError: readOptionalString(record.last_error),
    lastErrorAt: readOptionalString(record.last_error_at),
  };
}

function normalizeTelegramReadiness(payload: DeployedAgentTelegramReadinessRecord | null | undefined): TelegramReadinessSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const blockers = Array.isArray(payload.blockers)
    ? payload.blockers.map((item) => normalizeTelegramIssue(item)).filter((item): item is TelegramReadinessIssue => Boolean(item))
    : [];
  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.map((item) => normalizeTelegramIssue(item)).filter((item): item is TelegramReadinessIssue => Boolean(item))
    : [];
  const connectors = Array.isArray(payload.connectors)
    ? payload.connectors.map((item) => normalizeTelegramConnector(item)).filter((item): item is TelegramConnectorOption => Boolean(item))
    : [];
  return {
    readyForLive: payload.ready_for_live === true,
    status: readString(payload.status, 'draft'),
    nextAction: readOptionalString(payload.next_action),
    blockers,
    warnings,
    connectors,
    configuredBinding: readRecord(payload.configured_binding),
    webhook: readRecord(payload.webhook),
    autopilot: readRecord(payload.autopilot),
  };
}

function selectedProviderId(agent?: DeployedAgentRecord | null): string {
  const metadata = readRecord(agent?.metadata);
  return readString(agent?.provider ?? metadata.provider);
}

function selectedModelId(agent?: DeployedAgentRecord | null): string {
  const metadata = readRecord(agent?.metadata);
  return readString(agent?.model ?? metadata.model);
}

function providerCatalogById(items: ProviderCatalogSnapshot[]): Record<string, ProviderCatalogSnapshot> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

function formatDeploymentModelSummary(
  agent: DeployedAgentRecord | null | undefined,
  catalogByProvider: Record<string, ProviderCatalogSnapshot>,
): string {
  const providerId = selectedProviderId(agent);
  const modelId = selectedModelId(agent);
  if (!providerId && !modelId) {
    return 'Model not pinned';
  }
  const provider = providerId ? catalogByProvider[providerId] ?? null : null;
  const model = provider?.models.find((item) => item.id === modelId) ?? null;
  const providerLabel = provider?.label ?? humanizeToken(providerId, providerId || 'Provider');
  const modelLabel = model?.label ?? (modelId || 'Default model');
  return `${providerLabel} · ${modelLabel}`;
}

function formatDeploymentModelLabel(
  agent: DeployedAgentRecord | null | undefined,
  catalogByProvider: Record<string, ProviderCatalogSnapshot>,
): string {
  const providerId = selectedProviderId(agent);
  const modelId = selectedModelId(agent);
  if (!providerId && !modelId) {
    return 'Default model';
  }
  const provider = providerId ? catalogByProvider[providerId] ?? null : null;
  const model = provider?.models.find((item) => item.id === modelId) ?? null;
  return model?.label ?? modelId ?? provider?.label ?? humanizeToken(providerId, providerId || 'Model');
}

function applyProviderCatalogDefaults(
  state: WizardState,
  catalog: ProviderCatalogSnapshot[],
): WizardState {
  if (catalog.length === 0) {
    return state;
  }
  const catalogByProvider = providerCatalogById(catalog);
  const providerId = state.providerId && catalogByProvider[state.providerId]
    ? state.providerId
    : catalog[0]?.id || '';
  const provider = catalogByProvider[providerId] ?? null;
  const availableModels = provider?.models ?? [];
  const nextModelId = state.modelId && availableModels.some((item) => item.id === state.modelId)
    ? state.modelId
    : provider?.defaultModel && availableModels.some((item) => item.id === provider.defaultModel)
      ? provider.defaultModel
      : availableModels[0]?.id || '';
  if (providerId === state.providerId && nextModelId === state.modelId) {
    return state;
  }
  return {
    ...state,
    providerId,
    modelId: nextModelId,
  };
}

function buildWizardState(agent?: DeployedAgentRecord | null): WizardState {
  const channels = readRecord(agent?.channels);
  const telegram = readRecord(channels.telegram);
  const config = readRecord(agent?.config);
  const customerPolicy = readRecord(config.customer_policy);
  const memoryPolicy = readRecord(config.memory_policy);
  const safetyPolicy = readRecord(config.safety_policy);
  const commercePolicy = readRecord(config.commerce_policy);
  const escalationPolicy = readRecord(config.escalation_policy);
  const metadata = readRecord(agent?.metadata);
  const selectedToolIds = normalizeToolIds(readRecord(config.tool_policy).enabled_tools ?? metadata.selected_tool_ids);
  return {
    name: readString(agent?.name),
    avatar: readString(agent?.avatar),
    persona: readString(agent?.persona),
    systemPrompt: readString(agent?.system_prompt),
    knowledgeSourceText: serializeKnowledgeSources(agent?.knowledge_sources),
    telegramEnabled: telegram.enabled === true,
    telegramConnectorId: readString(telegram.connector_id ?? telegram.credential_id),
    telegramEndpointKey: readString(telegram.endpoint_key),
    providerId: readString(agent?.provider ?? metadata.provider),
    modelId: readString(agent?.model ?? metadata.model),
    runtimeTarget: readString(agent?.runtime_target, 'cloud'),
    billingPlan: readString(agent?.billing_plan, 'free'),
    selectedToolIds: selectedToolIds.length > 0 ? selectedToolIds : ['web_search'],
    memoryEnabled: agent
      ? memoryPolicy.memory_enabled === true || metadata.memory_enabled === true
      : true,
    contextBudgetPreset: readString(memoryPolicy.context_budget_preset ?? metadata.context_budget_preset, 'balanced'),
    retentionPreset: readString(memoryPolicy.retention_preset ?? metadata.retention_preset, 'standard'),
    healthSafetyEnabled: safetyPolicy.health_safety_enabled === true || metadata.health_safety_enabled === true,
    healthSafetyAssistantName: readString(safetyPolicy.assistant_name ?? metadata.health_safety_assistant_name),
    pausedMessage: readString(customerPolicy.paused_message ?? metadata.paused_message),
    welcomeIntro: readString(customerPolicy.public_intro ?? metadata.public_intro),
    welcomeCoreValue: readString(customerPolicy.public_core_value ?? metadata.public_core_value),
    publicStartCtaLabel: readString(customerPolicy.public_start_cta_label ?? metadata.platform_cta_label),
    publicStartCtaUrl: readString(customerPolicy.public_start_cta_url ?? metadata.platform_cta_url),
    escalationPreset: readString(escalationPolicy.preset ?? metadata.escalation_preset, 'standard'),
    handoffMode: readString(escalationPolicy.handoff_mode ?? metadata.handoff_mode, 'notify_owner'),
    ownerNotificationDestination: readString(
      escalationPolicy.owner_notification_destination ?? metadata.owner_notification_destination,
    ),
    dailyMessageLimit: readIntegerString(customerPolicy.daily_message_limit ?? metadata.daily_message_limit),
    monthlyCostCapUsd: readPositiveDecimalString(
      commercePolicy.monthly_cost_cap_usd ?? metadata.monthly_cost_cap_usd,
    ),
    upgradeCtaUrl: readString(customerPolicy.upgrade_cta_url ?? metadata.upgrade_cta_url),
    upgradeCtaLabel: readString(customerPolicy.upgrade_cta_label ?? metadata.upgrade_cta_label),
  };
}

function truncateExternalUserId(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'unknown';
  }
  return token.length <= 8 ? token : token.slice(0, 8);
}

function buildChannelPayload(state: WizardState): Record<string, unknown> {
  return {
    telegram: {
      enabled: state.telegramEnabled,
      connector_id: state.telegramConnectorId.trim() || undefined,
      credential_id: state.telegramConnectorId.trim() || undefined,
      endpoint_key: state.telegramEndpointKey.trim() || undefined,
    },
    whatsapp: {
      enabled: false,
      availability: 'roadmap',
    },
    instagram: {
      enabled: false,
      availability: 'roadmap',
    },
    web_widget: {
      enabled: false,
      availability: 'roadmap',
    },
  };
}

function buildDeploymentConfig(state: WizardState): Record<string, unknown> {
  const dailyMessageLimit = state.dailyMessageLimit.trim();
  const monthlyCostCapUsd = state.monthlyCostCapUsd.trim();
  return {
    customer_policy: {
      paused_message: state.pausedMessage.trim() || null,
      public_intro: state.welcomeIntro.trim() || null,
      public_core_value: state.welcomeCoreValue.trim() || null,
      public_start_cta_label: state.publicStartCtaLabel.trim() || null,
      public_start_cta_url: state.publicStartCtaUrl.trim() || null,
      daily_message_limit: dailyMessageLimit ? Number(dailyMessageLimit) : null,
      upgrade_cta_url: state.upgradeCtaUrl.trim() || null,
      upgrade_cta_label: state.upgradeCtaLabel.trim() || null,
    },
    memory_policy: {
      memory_enabled: state.memoryEnabled,
      context_budget_preset: state.contextBudgetPreset,
      retention_preset: state.retentionPreset,
    },
    safety_policy: {
      health_safety_enabled: state.healthSafetyEnabled,
      assistant_name: state.healthSafetyAssistantName.trim() || null,
    },
    commerce_policy: {
      monthly_cost_cap_usd: monthlyCostCapUsd ? Number(monthlyCostCapUsd) : null,
    },
    tool_policy: {
      enabled_tools: state.selectedToolIds,
    },
    escalation_policy: {
      preset: state.escalationPreset,
      handoff_mode: state.handoffMode,
      owner_notification_destination: state.ownerNotificationDestination.trim() || null,
    },
  };
}

function buildDetailConfigDraft(agent?: DeployedAgentRecord | null): DetailConfigDraft {
  const state = buildWizardState(agent);
  return {
    selectedToolIds: state.selectedToolIds,
    memoryEnabled: state.memoryEnabled,
    contextBudgetPreset: state.contextBudgetPreset,
    retentionPreset: state.retentionPreset,
  };
}

function readBudgetCycle(agent?: DeployedAgentRecord | null): Record<string, unknown> {
  const metadata = readRecord(agent?.metadata);
  return readRecord(metadata.current_budget_cycle);
}

function ContextPresetControl({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (nextValue: string) => void;
}) {
  return (
    <div className="deployed-agents-context-presets">
      <div className="deployed-agents-context-presets__label">Context window</div>
      <div className="deployed-agents-context-presets__grid" role="tablist" aria-label="Context window presets">
        {CONTEXT_PRESET_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={joinClassNames(
                'deployed-agents-context-presets__button',
                selected && 'deployed-agents-context-presets__button--selected',
              )}
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(option.id)}
            >
              <strong className="deployed-agents-context-presets__title">{option.label}</strong>
              <span className="deployed-agents-context-presets__description">{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function isEscalationOutstanding(value: unknown): boolean {
  const token = readString(value).toLowerCase();
  return token !== '' && !['clear', 'completed', 'resolved', 'approved'].includes(token);
}

function conversationCountLabel(count: number, hasMore = false): string {
  if (count <= 0) {
    return 'No conversations';
  }
  const display = hasMore ? `${count}+` : `${count}`;
  return `${display} conversation${count === 1 && !hasMore ? '' : 's'}`;
}

function unresolvedEscalationLabel(count: number): string {
  if (count <= 0) {
    return 'No open escalations';
  }
  return `${count} unresolved`;
}

function summarizeConversationMetrics(
  items: DeployedAgentConversationRecord[],
  options?: {
    hasMore?: boolean;
  },
): AgentOperationalMetrics {
  const hasMore = options?.hasMore === true;
  const ordered = [...items].sort((left, right) => {
    const leftTs = readString(left.last_message_at);
    const rightTs = readString(right.last_message_at);
    if (leftTs === rightTs) {
      return readString(left.session_id).localeCompare(readString(right.session_id));
    }
    return rightTs.localeCompare(leftTs);
  });
  const latest = ordered[0] ?? null;
  const unresolvedEscalations = items.filter((item) => isEscalationOutstanding(item.escalation_state)).length;
  return {
    conversationCount: items.length,
    conversationCountLabel: conversationCountLabel(items.length, hasMore),
    latestActivityAt: readOptionalString(latest?.last_message_at),
    latestActivityLabel: latest?.last_message_at ? `Latest ${formatTimestamp(latest.last_message_at)}` : 'No recent activity',
    unresolvedEscalations,
    unresolvedEscalationsLabel: unresolvedEscalationLabel(unresolvedEscalations),
    latestChannel: readOptionalString(latest?.channel),
  };
}

function buildMetricsPlaceholder(): AgentOperationalMetrics {
  return {
    conversationCount: 0,
    conversationCountLabel: 'Syncing inbox',
    latestActivityAt: null,
    latestActivityLabel: 'Fetching recent customer activity',
    unresolvedEscalations: 0,
    unresolvedEscalationsLabel: 'Open escalation state pending',
    latestChannel: null,
  };
}

function normalizeAgentAnalytics(payload: DeployedAgentAnalyticsRecord | null | undefined): AgentAnalyticsSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const messageVolume = readRecord(payload.message_volume);
  const escalation = readRecord(payload.escalation);
  const outcomes = readRecord(payload.outcomes);
  const costBurn = readRecord(payload.cost_burn);
  const counts = readRecord(outcomes.counts);
  const normalizedOutcomes = Object.entries(counts)
    .map(([key, value]) => [key, readNumber(value) ?? 0] as [string, number])
    .filter(([, value]) => value > 0)
    .sort((left, right) => {
      if (left[1] === right[1]) {
        return left[0].localeCompare(right[0]);
      }
      return right[1] - left[1];
    });
  return {
    activeUsersLast30d: readNumber(payload.active_users_last_30d) ?? 0,
    messageVolumeDay: readNumber(messageVolume.day) ?? 0,
    messageVolumeWeek: readNumber(messageVolume.week) ?? 0,
    messageVolumeMonth: readNumber(messageVolume.month) ?? 0,
    latestMessageAt: readOptionalString(messageVolume.latest_message_at),
    escalationTotalSessions: readNumber(escalation.total_sessions) ?? 0,
    escalationSessionCount: readNumber(escalation.escalated_sessions) ?? 0,
    escalationRatePercent: readNumber(escalation.rate_percent) ?? 0,
    outcomes: normalizedOutcomes,
    topOutcome: readOptionalString(outcomes.top_outcome),
    currentBurnUsd: readNumber(costBurn.current_burn_usd),
    costCapUsd: readNumber(costBurn.cap_usd),
    percentUsed: readNumber(costBurn.percent_used),
    usageMonth: readOptionalString(costBurn.usage_month),
  };
}

function formatOutcomeSummary(snapshot: AgentAnalyticsSnapshot | null): string {
  if (!snapshot || snapshot.outcomes.length === 0) {
    return 'No outcomes yet';
  }
  return snapshot.outcomes
    .slice(0, 3)
    .map(([key, value]) => `${humanizeToken(key, key)} ${value}`)
    .join(' · ');
}

function matchesConversationFilters(
  conversation: DeployedAgentConversationRecord,
  filters: ConversationFilters,
): boolean {
  const channel = readString(conversation.channel).toLowerCase();
  const escalationState = readString(conversation.escalation_state).toLowerCase();
  const outcome = readString(conversation.outcome).toLowerCase();
  if (filters.channel !== 'all' && channel !== filters.channel) {
    return false;
  }
  if (filters.escalationState !== 'all' && escalationState !== filters.escalationState) {
    return false;
  }
  if (filters.outcome !== 'all' && outcome !== filters.outcome) {
    return false;
  }
  return true;
}

function upsertAgentRecord(items: DeployedAgentRecord[], nextRecord: DeployedAgentRecord): DeployedAgentRecord[] {
  const nextId = readString(nextRecord.id);
  if (!nextId) {
    return items;
  }
  const existingIndex = items.findIndex((item) => readString(item.id) === nextId);
  if (existingIndex === -1) {
    return [nextRecord, ...items];
  }
  const copy = [...items];
  copy[existingIndex] = nextRecord;
  return copy;
}

function conversationCustomerLabel(item: DeployedAgentConversationRecord): string {
  const customer = readRecord(item.customer);
  return readString(customer.label ?? customer.display_name ?? customer.id, 'Unknown customer');
}

function transcriptEntryTitle(entry: TimelineEntry): string {
  const kind = readString(entry.kind).toLowerCase();
  if (kind === 'message') {
    return readString(entry.direction).toLowerCase() === 'inbound' ? 'Customer message' : 'Agent response';
  }
  if (kind === 'tool_call') {
    return 'Tool call';
  }
  if (kind === 'approval') {
    return 'Approval event';
  }
  if (kind === 'escalation') {
    return 'Escalation';
  }
  return humanizeToken(entry.kind, 'Transcript event');
}

function transcriptEntryBody(entry: TimelineEntry): string {
  const kind = readString(entry.kind).toLowerCase();
  if (kind === 'message') {
    return readString(entry.text, 'No message text was logged.');
  }
  if (kind === 'tool_call') {
    return readString(entry.summary ?? entry.tool_name, 'Connector activity was recorded for this conversation.');
  }
  if (kind === 'approval') {
    return readString(entry.summary ?? entry.resolution, 'An approval state change was recorded.');
  }
  if (kind === 'escalation') {
    return readString(entry.summary ?? entry.action, 'This conversation needs team attention.');
  }
  return readString(entry.summary ?? entry.text, 'Conversation event recorded.');
}

function transcriptEntryTone(entry: TimelineEntry): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const kind = readString(entry.kind).toLowerCase();
  if (kind === 'tool_call') {
    return 'accent';
  }
  if (kind === 'approval') {
    return 'warning';
  }
  if (kind === 'escalation') {
    return 'danger';
  }
  if (kind === 'message' && readString(entry.direction).toLowerCase() === 'outbound') {
    return 'success';
  }
  return 'neutral';
}

function summarizeStudioErrorMessage(message: string | null): string | null {
  if (!message) {
    return null;
  }
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  if (
    normalized.length > 220
    || /<!doctype|<html|<script|hydration|react/i.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function DeployedAgentsSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Specialists" title="Loading specialists">
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <div className="app-stack-4">
          <ListDetailPanel eyebrow="Detail" title="Loading specialist details">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="5rem" />
          </ListDetailPanel>
          <ListDetailPanel eyebrow="Conversations" title="Loading inbox">
            <SkeletonBlock height="3rem" />
            <SkeletonBlock height="3rem" />
          </ListDetailPanel>
        </div>
      )}
    />
  );
}

function TranscriptEntryCard({
  entry,
}: {
  entry: TimelineEntry;
}) {
  const runId = readOptionalString(entry.run_id);
  const threadId = readOptionalString(entry.thread_id);
  return (
    <article className="deployed-agents-transcript-card">
      <div className="deployed-agents-transcript-card__header">
        <div className="deployed-agents-transcript-card__copy">
          <strong className="deployed-agents-transcript-card__title">{transcriptEntryTitle(entry)}</strong>
          <span className="deployed-agents-transcript-card__timestamp">
            {formatTimestamp(entry.ts)}
          </span>
        </div>
        <DataBadge tone={transcriptEntryTone(entry)}>
          {humanizeToken(entry.kind, 'Event')}
        </DataBadge>
      </div>
      <div className="deployed-agents-transcript-card__body">
        {transcriptEntryBody(entry)}
      </div>
      {(runId || threadId || readOptionalString(entry.status)) ? (
        <div className="deployed-agents-transcript-card__meta">
          {runId ? <span>Run {runId}</span> : null}
          {threadId ? <span>Thread {threadId}</span> : null}
          {readOptionalString(entry.status) ? <span>{humanizeToken(entry.status, 'Logged')}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export function WorkstationDeployedAgentsPane({
  initialSubview = 'agents',
}: {
  initialSubview?: StudioSubview;
}) {
  const { workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const searchParams = useSearchParams();
  const cachedStudioPane = studioPaneCache.get(workspaceId) ?? null;
  const [currentStudioSubview, setCurrentStudioSubview] = useState<StudioSubview>(initialSubview);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogSnapshot[]>(() => cachedStudioPane?.providerCatalog ?? []);
  const [agents, setAgents] = useState<DeployedAgentRecord[]>(() => cachedStudioPane?.agents ?? []);
  const [connectorVaultIds, setConnectorVaultIds] = useState<Set<string>>(() => new Set(cachedStudioPane?.connectorVaultIds ?? []));
  const [agentMetricsById, setAgentMetricsById] = useState<Record<string, AgentOperationalMetrics>>(() => cachedStudioPane?.agentMetricsById ?? {});
  const [agentAnalyticsById, setAgentAnalyticsById] = useState<Record<string, AgentAnalyticsSnapshot>>(() => cachedStudioPane?.agentAnalyticsById ?? {});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [overlayAgentId, setOverlayAgentId] = useState<string | null>(null);
  const [overlayTab, setOverlayTab] = useState<SpecialistOverlayTabId>('overview');
  const [overlayName, setOverlayName] = useState('');
  const [overlayPersona, setOverlayPersona] = useState('');
  const [overlayMarketplaceListed, setOverlayMarketplaceListed] = useState(false);
  const [overlayMarketplaceCategory, setOverlayMarketplaceCategory] = useState('');
  const [isSavingOverlayOverview, setIsSavingOverlayOverview] = useState(false);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<DeployedAgentRecord | null>(null);
  const [selectedAgentAnalytics, setSelectedAgentAnalytics] = useState<AgentAnalyticsSnapshot | null>(null);
  const [selectedTelegramReadiness, setSelectedTelegramReadiness] = useState<TelegramReadinessSnapshot | null>(null);
  const [conversations, setConversations] = useState<DeployedAgentConversationRecord[]>([]);
  const [agentMemoryById, setAgentMemoryById] = useState<Record<string, DeployedAgentMemoryRecord[]>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<DeployedAgentConversationDetail | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(() => (cachedStudioPane?.agents?.length ?? 0) === 0);
  const [isLoadingProviderCatalog, setIsLoadingProviderCatalog] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isLoadingTelegramReadiness, setIsLoadingTelegramReadiness] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingOverlayMemory, setIsLoadingOverlayMemory] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isTelegramSetupOpen, setIsTelegramSetupOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(() => buildWizardState(null));
  const [isSubmittingWizard, setIsSubmittingWizard] = useState(false);
  const [detailConfigDraft, setDetailConfigDraft] = useState<DetailConfigDraft | null>(null);
  const [isSavingDetailConfig, setIsSavingDetailConfig] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [busyExternalUserId, setBusyExternalUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationFilters, setConversationFilters] = useState<ConversationFilters>({
    channel: 'all',
    escalationState: 'all',
    outcome: 'all',
  });

  const selectedAgent = useMemo(
    () => selectedAgentDetail ?? agents.find((item) => readString(item.id) === selectedAgentId) ?? null,
    [agents, selectedAgentDetail, selectedAgentId],
  );
  const overlayAgent = useMemo(
    () => overlayAgentId === selectedAgentId
      ? selectedAgent
      : agents.find((item) => readString(item.id) === overlayAgentId) ?? null,
    [agents, overlayAgentId, selectedAgent, selectedAgentId],
  );
  const selectedAgentMetrics = useMemo(
    () => (selectedAgentId ? agentMetricsById[selectedAgentId] ?? null : null),
    [agentMetricsById, selectedAgentId],
  );
  const selectedBudgetCycle = useMemo(
    () => readBudgetCycle(selectedAgent),
    [selectedAgent],
  );
  const selectedAnalytics = useMemo(
    () => selectedAgentAnalytics ?? (selectedAgentId ? agentAnalyticsById[selectedAgentId] ?? null : null),
    [agentAnalyticsById, selectedAgentAnalytics, selectedAgentId],
  );
  const providerCatalogIndex = useMemo(
    () => providerCatalogById(providerCatalog),
    [providerCatalog],
  );
  const selectedProviderCatalog = useMemo(
    () => providerCatalogIndex[wizardState.providerId] ?? null,
    [providerCatalogIndex, wizardState.providerId],
  );
  const selectedProviderModelCatalog = useMemo(
    () => selectedProviderCatalog?.models.find((item) => item.id === wizardState.modelId) ?? null,
    [selectedProviderCatalog, wizardState.modelId],
  );
  const selectedWizardConnector = useMemo(
    () => selectedTelegramReadiness?.connectors.find((item) => item.id === wizardState.telegramConnectorId) ?? null,
    [selectedTelegramReadiness, wizardState.telegramConnectorId],
  );
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => matchesConversationFilters(conversation, conversationFilters)),
    [conversationFilters, conversations],
  );
  const selectedConversation = useMemo(
    () => filteredConversations.find((item) => readString(item.session_id) === selectedSessionId) ?? null,
    [filteredConversations, selectedSessionId],
  );
  const channelFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.channel).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const escalationFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.escalation_state).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const outcomeFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.outcome).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const requestedAgentId = useMemo(
    () => String(searchParams.get('agent') || '').trim(),
    [searchParams],
  );

  async function refreshAgentAnalytics(items: DeployedAgentRecord[]) {
    if (items.length === 0) {
      setAgentAnalyticsById({});
      updateStudioPaneCache(workspaceId, { agentAnalyticsById: {} });
      return;
    }
    try {
      const payload = await services.client.listDeployedAgentAnalytics();
      const analyticsItems = readItems<DeployedAgentAnalyticsRecord>(payload);
      const nextEntries = analyticsItems
        .map((item) => {
          const deployedAgentId = readString(item.deployed_agent_id);
          const analytics = normalizeAgentAnalytics(item);
          if (!deployedAgentId || !analytics) {
            return null;
          }
          return [deployedAgentId, analytics] as const;
        })
        .filter((entry): entry is readonly [string, AgentAnalyticsSnapshot] => Boolean(entry));
      setAgentAnalyticsById((current) => {
        const nextValue = {
          ...current,
          ...Object.fromEntries(nextEntries),
        };
        updateStudioPaneCache(workspaceId, { agentAnalyticsById: nextValue });
        return nextValue;
      });
    } catch {
      setAgentAnalyticsById((current) => current);
    }
  }

  async function refreshProviderCatalog() {
    setIsLoadingProviderCatalog(true);
    try {
      const payload = await services.client.listProviderCatalog();
      const nextCatalog = normalizeProviderCatalog(payload);
      updateStudioPaneCache(workspaceId, { providerCatalog: nextCatalog });
      setProviderCatalog(nextCatalog);
    } catch (error) {
      setProviderCatalog([]);
      setErrorMessage(error instanceof Error ? error.message : 'Provider catalog is unavailable.');
    } finally {
      setIsLoadingProviderCatalog(false);
    }
  }

  async function refreshAgents(options: { preserveSelection?: boolean; selectAgentId?: string | null } = {}) {
    setIsLoadingAgents(true);
    setErrorMessage(null);
    try {
      const payload = await services.client.listDeployedAgents();
      const items = readItems<DeployedAgentRecord>(payload);
      setAgents(items);
      void refreshAgentAnalytics(items);
      setAgentMetricsById((current) => {
        const nextValue = {
          ...current,
          ...Object.fromEntries(
            items
              .map((item) => readString(item.id))
              .filter(Boolean)
              .map((agentId) => [agentId, current[agentId] ?? buildMetricsPlaceholder()]),
          ),
        };
        updateStudioPaneCache(workspaceId, { agents: items, agentMetricsById: nextValue });
        return nextValue;
      });
      const explicitSelection = readString(options.selectAgentId);
      if (explicitSelection) {
        setSelectedAgentId(explicitSelection);
      } else if (!options.preserveSelection) {
        setSelectedAgentId(readString(items[0]?.id) || null);
      } else if (selectedAgentId && !items.some((item) => readString(item.id) === selectedAgentId)) {
        setSelectedAgentId(readString(items[0]?.id) || null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Deployed agents could not be loaded.');
    } finally {
      setIsLoadingAgents(false);
    }
  }

  async function loadAgentDetail(agentId: string) {
    setIsLoadingDetail(true);
    try {
      const payload = await services.client.getDeployedAgent({
        deployedAgentId: agentId,
        allowMissing: true,
      });
      setSelectedAgentDetail(payload as DeployedAgentRecord | null);
    } catch (error) {
      setSelectedAgentDetail(null);
      setErrorMessage(error instanceof Error ? error.message : 'Deployment detail is unavailable.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function loadAgentAnalytics(agentId: string) {
    setIsLoadingAnalytics(true);
    try {
      const payload = await services.client.getDeployedAgentAnalytics({
        deployedAgentId: agentId,
        allowMissing: true,
      });
      const analytics = normalizeAgentAnalytics(payload as DeployedAgentAnalyticsRecord | null);
      setSelectedAgentAnalytics(analytics);
      if (analytics) {
        setAgentAnalyticsById((current) => ({
          ...current,
          [agentId]: analytics,
        }));
      }
    } catch (error) {
      setSelectedAgentAnalytics(null);
      setErrorMessage(error instanceof Error ? error.message : 'Deployment analytics are unavailable.');
    } finally {
      setIsLoadingAnalytics(false);
    }
  }

  async function loadTelegramReadiness(agentId?: string | null) {
    setIsLoadingTelegramReadiness(true);
    try {
      const payload = await services.client.getDeployedAgentTelegramReadiness({
        deployedAgentId: agentId || undefined,
        allowMissing: true,
      });
      setSelectedTelegramReadiness(normalizeTelegramReadiness(payload as DeployedAgentTelegramReadinessRecord | null));
    } catch (error) {
      setSelectedTelegramReadiness(null);
      setErrorMessage(error instanceof Error ? error.message : 'Telegram launch readiness is unavailable.');
    } finally {
      setIsLoadingTelegramReadiness(false);
    }
  }

  async function loadConversations(agentId: string) {
    setIsLoadingConversations(true);
    try {
      const payload = await services.client.listDeployedAgentConversations({
        deployedAgentId: agentId,
        limit: 50,
        offset: 0,
      });
      const items = readItems<DeployedAgentConversationRecord>(payload);
      setConversations(items);
      setAgentMetricsById((current) => {
        const nextValue = {
          ...current,
          [agentId]: summarizeConversationMetrics(items, {
            hasMore: readRecord(payload).has_more === true,
          }),
        };
        updateStudioPaneCache(workspaceId, { agentMetricsById: nextValue });
        return nextValue;
      });
      setSelectedSessionId((current) => {
        if (current && items.some((item) => readString(item.session_id) === current)) {
          return current;
        }
        return readString(items[0]?.session_id) || null;
      });
    } catch (error) {
      setConversations([]);
      setSelectedSessionId(null);
      setErrorMessage(error instanceof Error ? error.message : 'Conversation inbox is unavailable.');
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadMemoryEntries(agentId: string) {
    setIsLoadingOverlayMemory(true);
    try {
      const payload = await services.client.listDeployedAgentMemory({
        deployedAgentId: agentId,
        limit: 50,
        offset: 0,
      });
      setAgentMemoryById((current) => ({
        ...current,
        [agentId]: readItems<DeployedAgentMemoryRecord>(payload),
      }));
    } catch (error) {
      setAgentMemoryById((current) => ({
        ...current,
        [agentId]: [],
      }));
      setErrorMessage(error instanceof Error ? error.message : 'Customer memory is unavailable.');
    } finally {
      setIsLoadingOverlayMemory(false);
    }
  }

  async function loadTranscript(agentId: string, sessionId: string) {
    setIsLoadingTranscript(true);
    try {
      const payload = await services.client.getDeployedAgentConversationDetail({
        deployedAgentId: agentId,
        sessionId,
        allowMissing: true,
      });
      setSelectedTranscript(payload as DeployedAgentConversationDetail | null);
    } catch (error) {
      setSelectedTranscript(null);
      setErrorMessage(error instanceof Error ? error.message : 'Transcript detail is unavailable.');
    } finally {
      setIsLoadingTranscript(false);
    }
  }

  useEffect(() => {
    void refreshProviderCatalog();
    void refreshAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services.client]);

  useEffect(() => {
    setCurrentStudioSubview(initialSubview);
  }, [initialSubview]);

  useEffect(() => {
    if (!requestedAgentId) {
      return;
    }
    if (!agents.some((item) => readString(item.id) === requestedAgentId)) {
      return;
    }
    setCurrentStudioSubview('agents');
    setSelectedAgentId(requestedAgentId);
    setOverlayAgentId(requestedAgentId);
  }, [agents, requestedAgentId]);

  useEffect(() => {
    if (!isWizardOpen) {
      return;
    }
    setWizardState((current) => applyProviderCatalogDefaults(current, providerCatalog));
  }, [isWizardOpen, providerCatalog]);

  useEffect(() => {
    const agentId = readString(selectedAgentId);
    if (!agentId) {
      setSelectedAgentDetail(null);
      setSelectedAgentAnalytics(null);
      setSelectedTelegramReadiness(null);
      setConversations([]);
      setConversationFilters({
        channel: 'all',
        escalationState: 'all',
        outcome: 'all',
      });
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      return;
    }
    setSelectedAgentDetail(null);
    setSelectedAgentAnalytics(null);
    setSelectedTelegramReadiness(null);
    setConversations([]);
    setConversationFilters({
      channel: 'all',
      escalationState: 'all',
      outcome: 'all',
    });
    setSelectedSessionId(null);
    setSelectedTranscript(null);
    void Promise.all([
      loadAgentDetail(agentId),
      loadAgentAnalytics(agentId),
      loadTelegramReadiness(agentId),
      loadConversations(agentId),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId]);

  useEffect(() => {
    const agentId = readString(selectedAgentId);
    const sessionId = readString(selectedSessionId);
    if (!agentId || !sessionId) {
      setSelectedTranscript(null);
      return;
    }
    void loadTranscript(agentId, sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, selectedSessionId]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSessionId && filteredConversations.some((item) => readString(item.session_id) === selectedSessionId)) {
      return;
    }
    setSelectedSessionId(readString(filteredConversations[0]?.session_id) || null);
  }, [filteredConversations, selectedSessionId]);

  useEffect(() => {
    const agentId = readString(overlayAgentId);
    if (!agentId || overlayTab !== 'memory') {
      return;
    }
    void loadMemoryEntries(agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayAgentId, overlayTab]);

  useEffect(() => {
    setDetailConfigDraft(buildDetailConfigDraft(selectedAgent));
  }, [selectedAgent]);

  useEffect(() => {
    if (!overlayAgentId) {
      return;
    }
    if (!agents.some((item) => readString(item.id) === overlayAgentId)) {
      setOverlayAgentId(null);
    }
  }, [agents, overlayAgentId]);

  useEffect(() => {
    if (!overlayAgent) {
      setOverlayName('');
      setOverlayPersona('');
      setOverlayMarketplaceListed(false);
      setOverlayMarketplaceCategory('');
      return;
    }
    setOverlayName(readString(overlayAgent.name));
    setOverlayPersona(readString(overlayAgent.persona));
    setOverlayMarketplaceListed(overlayAgent.is_public === true);
    setOverlayMarketplaceCategory(readString(overlayAgent.category));
  }, [overlayAgent]);

  useEffect(() => {
    if (!isWizardOpen || !isTelegramSetupOpen) {
      return;
    }
    const connectors = selectedTelegramReadiness?.connectors ?? [];
    if (connectors.length === 0) {
      return;
    }
    const nextConnector = connectors[0];
    setWizardState((current) => ({
      ...current,
      telegramEnabled: true,
      telegramConnectorId: current.telegramConnectorId.trim() || nextConnector.id,
      telegramEndpointKey: current.telegramEndpointKey.trim() || (nextConnector.endpointKey ?? ''),
    }));
    setIsTelegramSetupOpen(false);
    setStatusMessage(`Connected Telegram bot ${nextConnector.label}.`);
  }, [isTelegramSetupOpen, isWizardOpen, selectedTelegramReadiness]);

  useEffect(() => {
    if (!isWizardOpen || !isTelegramSetupOpen) {
      return;
    }
    const agentId = readString(selectedAgent?.id) || undefined;
    const intervalId = window.setInterval(() => {
      void loadTelegramReadiness(agentId);
    }, 3000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTelegramSetupOpen, isWizardOpen, selectedAgent]);

  useEffect(() => {
    let cancelled = false;
    void services.client.listConnectorsVault()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const connectorIds = new Set(
          readItems<Record<string, unknown>>(payload)
            .map((item) => readString(item.connector).toLowerCase())
            .filter(Boolean),
        );
        setConnectorVaultIds(connectorIds);
        updateStudioPaneCache(workspaceId, { connectorVaultIds: Array.from(connectorIds) });
      })
      .catch(() => {
        if (!cancelled) {
          setConnectorVaultIds(new Set());
          updateStudioPaneCache(workspaceId, { connectorVaultIds: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  function openCreateWizard() {
    setWizardMode('create');
    setWizardStepIndex(0);
    setWizardState(applyProviderCatalogDefaults(buildWizardState(null), providerCatalog));
    setIsTelegramSetupOpen(false);
    setIsWizardOpen(true);
    void loadTelegramReadiness();
  }

  function openEditWizard() {
    setWizardMode('edit');
    setWizardStepIndex(0);
    setWizardState(applyProviderCatalogDefaults(buildWizardState(selectedAgent), providerCatalog));
    setIsTelegramSetupOpen(false);
    setIsWizardOpen(true);
    void loadTelegramReadiness(readString(selectedAgent?.id) || undefined);
  }

  function closeWizard() {
    if (isSubmittingWizard) {
      return;
    }
    setIsWizardOpen(false);
    setIsTelegramSetupOpen(false);
    if (selectedAgentId) {
      void loadTelegramReadiness(selectedAgentId);
    }
  }

  function setWizardField<K extends keyof WizardState>(field: K, value: WizardState[K]) {
    setWizardState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleWizardTool(toolId: string) {
    setWizardState((current) => {
      const selected = current.selectedToolIds.includes(toolId)
        ? current.selectedToolIds.filter((item) => item !== toolId)
        : [...current.selectedToolIds, toolId];
      return {
        ...current,
        selectedToolIds: selected,
      };
    });
  }

  async function persistWizard() {
    const dailyMessageLimit = wizardState.dailyMessageLimit.trim();
    const monthlyCostCapUsd = wizardState.monthlyCostCapUsd.trim();
    if (!wizardState.providerId.trim()) {
      setErrorMessage('Choose a provider before saving this specialist.');
      return;
    }
    if (!wizardState.modelId.trim()) {
      setErrorMessage('Choose a model before saving this specialist.');
      return;
    }
    if (dailyMessageLimit) {
      const parsedLimit = Number(dailyMessageLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        setErrorMessage('Daily message limit must be a whole number greater than zero.');
        return;
      }
      if (!wizardState.upgradeCtaLabel.trim()) {
        setErrorMessage('Add an upgrade CTA label when a daily message limit is enabled.');
        return;
      }
      if (!wizardState.upgradeCtaUrl.trim()) {
        setErrorMessage('Add an upgrade CTA URL when a daily message limit is enabled.');
        return;
      }
    }
    if (monthlyCostCapUsd) {
      const parsedCap = Number(monthlyCostCapUsd);
      if (!Number.isFinite(parsedCap) || parsedCap <= 0) {
        setErrorMessage('Monthly cost cap must be a number greater than zero.');
        return;
      }
    }
    if (wizardState.telegramEnabled && !wizardState.telegramConnectorId.trim()) {
      setErrorMessage('Choose a Telegram connector before saving a live-ready specialist.');
      return;
    }
    const payload = {
      name: wizardState.name.trim(),
      avatar: wizardState.avatar.trim() || null,
      persona: wizardState.persona.trim(),
      systemPrompt: wizardState.systemPrompt.trim(),
      channels: buildChannelPayload(wizardState),
      knowledgeSources: parseKnowledgeSources(wizardState.knowledgeSourceText),
      runtimeTarget: wizardState.runtimeTarget,
      billingPlan: wizardState.billingPlan,
      provider: wizardState.providerId,
      model: wizardState.modelId,
      config: buildDeploymentConfig(wizardState),
    };

    if (!payload.name) {
      setErrorMessage('A specialist needs a public name before it can be saved.');
      return;
    }

    setIsSubmittingWizard(true);
    setErrorMessage(null);
    try {
      if (wizardMode === 'create') {
        const created = await services.client.createDeployedAgent(payload);
        const record = (created ?? {}) as DeployedAgentRecord;
        const createdId = readString(record.id);
        setAgents((current) => upsertAgentRecord(current, record));
        setSelectedAgentDetail(record);
        setSelectedAgentAnalytics(null);
        setSelectedAgentId(createdId || null);
        setStatusMessage(`Created draft specialist ${readString(record.name, payload.name)}.`);
        if (createdId) {
          await Promise.all([
            loadAgentAnalytics(createdId),
            loadTelegramReadiness(createdId),
            loadConversations(createdId),
          ]);
        }
      } else {
        const agentId = readString(selectedAgent?.id);
        if (!agentId) {
          throw new Error('Select a specialist before editing it.');
        }
        const updated = await services.client.updateDeployedAgent({
          deployedAgentId: agentId,
          ...payload,
        });
        const record = (updated ?? {}) as DeployedAgentRecord;
        setAgents((current) => upsertAgentRecord(current, record));
        setSelectedAgentDetail(record);
        await Promise.all([
          refreshAgentAnalytics(upsertAgentRecord(agents, record)),
          loadAgentAnalytics(agentId),
          loadTelegramReadiness(agentId),
        ]);
        setStatusMessage(`Updated ${readString(record.name, 'specialist')} settings.`);
      }
      setIsWizardOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The specialist could not be saved.');
    } finally {
      setIsSubmittingWizard(false);
    }
  }

  async function handleDeploymentAction(action: 'deploy' | 'pause') {
    const agentId = readString(selectedAgent?.id);
    if (!agentId) {
      return;
    }
    if (
      action === 'deploy'
      && !selectedTelegramReadiness
    ) {
      setErrorMessage('Launch checks are still loading. Wait for readiness to finish before going live.');
      return;
    }
    if (
      action === 'deploy'
      && selectedTelegramReadiness
      && selectedTelegramReadiness.readyForLive !== true
    ) {
      const firstBlocker = selectedTelegramReadiness.blockers[0];
      const guidance = firstBlocker?.guidance || selectedTelegramReadiness.nextAction || 'Resolve the Telegram readiness blockers before deploying.';
      setErrorMessage(firstBlocker?.message ? `${firstBlocker.message} ${guidance}` : guidance);
      return;
    }
    setBusyAgentId(agentId);
    setErrorMessage(null);
    try {
      const payload =
        action === 'deploy'
          ? await services.client.deployDeployedAgent({ deployedAgentId: agentId })
          : await services.client.pauseDeployedAgent({ deployedAgentId: agentId });
      const record = (payload ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setStatusMessage(
        action === 'deploy'
          ? `${readString(record.name, 'Specialist')} is now live on its configured channels.`
          : `${readString(record.name, 'Specialist')} is paused and will no longer reply to live customer messages.`,
      );
      await Promise.all([
        refreshAgentAnalytics(upsertAgentRecord(agents, record)),
        loadAgentAnalytics(agentId),
        loadTelegramReadiness(agentId),
      ]);
      if (isWizardOpen && wizardMode === 'edit') {
        setWizardState(applyProviderCatalogDefaults(buildWizardState(record), providerCatalog));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Deployment state could not be updated.');
    } finally {
      setBusyAgentId(null);
    }
  }

  async function saveOverlayOverview() {
    const agentId = readString(overlayAgent?.id);
    if (!agentId) {
      return;
    }
    setIsSavingOverlayOverview(true);
    setErrorMessage(null);
    try {
      const updated = await services.client.updateDeployedAgent({
        deployedAgentId: agentId,
        name: overlayName.trim(),
        persona: overlayPersona.trim(),
        isPublic: overlayMarketplaceListed,
        category: overlayMarketplaceCategory.trim() || null,
      });
      const record = (updated ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setStatusMessage(`Updated ${readString(record.name, 'specialist')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Overview changes could not be saved.');
    } finally {
      setIsSavingOverlayOverview(false);
    }
  }

  async function saveDetailConfig() {
    const agentId = readString(selectedAgent?.id);
    if (!agentId || !detailConfigDraft) {
      return;
    }

    const currentState = buildWizardState(selectedAgent);
    const nextState: WizardState = {
      ...currentState,
      selectedToolIds: detailConfigDraft.selectedToolIds,
      memoryEnabled: detailConfigDraft.memoryEnabled,
      contextBudgetPreset: detailConfigDraft.contextBudgetPreset,
      retentionPreset: detailConfigDraft.retentionPreset,
    };
    const nextConfigPayload = buildDeploymentConfig(nextState);
    const currentConfig = readRecord(selectedAgent?.config);
    const mergedConfig = {
      ...currentConfig,
      memory_policy: {
        ...readRecord(currentConfig.memory_policy),
        ...readRecord(nextConfigPayload.memory_policy),
      },
      tool_policy: {
        ...readRecord(currentConfig.tool_policy),
        ...readRecord(nextConfigPayload.tool_policy),
      },
    };

    setIsSavingDetailConfig(true);
    setErrorMessage(null);
    try {
      const updated = await services.client.updateDeployedAgent({
        deployedAgentId: agentId,
        config: mergedConfig,
      });
      const record = (updated ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setDetailConfigDraft(buildDetailConfigDraft(record));
      setStatusMessage(`Updated ${readString(record.name, 'specialist')} tools and memory settings.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Tools and memory settings could not be saved.');
    } finally {
      setIsSavingDetailConfig(false);
    }
  }

  const activeChannels = listEnabledChannels(selectedAgent?.channels);
  const selectedKnowledgeSources = Array.isArray(selectedAgent?.knowledge_sources)
    ? selectedAgent.knowledge_sources
    : [];
  const knowledgeSourceCount = selectedKnowledgeSources.length;
  const studioTitle = currentStudioSubview === 'agents'
    ? 'Studio · Agents'
    : currentStudioSubview === 'inbox'
      ? 'Studio · Inbox'
      : 'Studio · Deploy';
  const studioSubtitle = currentStudioSubview === 'agents'
    ? 'Specialist roster, readiness, and operational posture.'
    : currentStudioSubview === 'inbox'
      ? 'Customer sessions, escalation pressure, and transcript flow.'
      : 'Launch checks, provider choice, and go-live controls.';
  const showAgentsIndex = currentStudioSubview === 'agents' || currentStudioSubview === 'inbox';
  const showReadinessPanel = currentStudioSubview === 'deploy';
  const showDetailPanel = currentStudioSubview === 'deploy';
  const showInboxPanels = currentStudioSubview === 'inbox';
  const visibleErrorMessage = summarizeStudioErrorMessage(errorMessage);
  const wizardStep = DEPLOYED_AGENT_WIZARD_STEPS[wizardStepIndex];
  const transcriptEntries: TimelineEntry[] = Array.isArray(selectedTranscript?.entries)
    ? (selectedTranscript.entries as TimelineEntry[])
    : [];
  const selectedTranscriptCustomer = readRecord(selectedTranscript?.customer);
  const selectedExternalUserId = readString(selectedTranscriptCustomer.id || readRecord(selectedConversation?.customer).id);
  const selectedExternalUserLabel = readString(
    selectedTranscriptCustomer.label || readRecord(selectedConversation?.customer).label,
    'this customer',
  );
  const selectedAgentChannels = listEnabledChannels(selectedAgent?.channels);
  const selectedAgentMemoryEnabled =
    readRecord(readRecord(selectedAgent?.config).memory_policy).memory_enabled === true
    || readRecord(selectedAgent?.metadata).memory_enabled === true;
  const selectedAgentStatusLabel = deploymentStateLabel(selectedAgent?.deployment_state);
  const selectedAgentChannelLabel = humanizeToken(
    selectedAgentChannels[0] || readString(selectedConversation?.channel || selectedTranscript?.channel).toLowerCase() || 'telegram',
    'Telegram',
  );
  const selectedAgentModelLabel = formatDeploymentModelLabel(selectedAgent, providerCatalogIndex);
  const overlayAgentMetrics = overlayAgentId ? agentMetricsById[overlayAgentId] ?? null : null;
  const overlayChannels = listEnabledChannels(overlayAgent?.channels);
  const overlayTools = overlayAgent
    ? normalizeToolIds(
      readRecord(readRecord(overlayAgent.config).tool_policy).enabled_tools
      ?? readRecord(overlayAgent.metadata).selected_tool_ids,
    )
    : [];
  const overlayMemoryEnabled = overlayAgent
    ? (
      readRecord(readRecord(overlayAgent.config).memory_policy).memory_enabled === true
      || readRecord(overlayAgent.metadata).memory_enabled === true
    )
    : false;
  const overlayMemoryEntries = overlayAgentId
    ? agentMemoryById[overlayAgentId] ?? []
    : [];
  const overlayQualityStars = readNumber(overlayAgent?.quality_stars);
  const overlayCostTier = readString(overlayAgent?.cost_tier);

  async function handleDeleteExternalUserData() {
    const agentId = readString(selectedAgent?.id);
    const externalUserId = readString(selectedExternalUserId);
    const channel = readString(selectedConversation?.channel || selectedTranscript?.channel).toLowerCase();
    if (!agentId || !externalUserId || !channel) {
      return;
    }
    const confirmed = window.confirm(
      `Delete saved conversation data for ${selectedExternalUserLabel} from this specialist? This removes message history, memory summaries, and usage records for that user.`,
    );
    if (!confirmed) {
      return;
    }
    setBusyExternalUserId(externalUserId);
    setErrorMessage(null);
    try {
      await services.client.deleteDeployedAgentExternalUserData({
        deployedAgentId: agentId,
        externalUserId,
        channel,
        sessionId: readString(selectedConversation?.session_id || selectedTranscript?.session_id) || undefined,
      });
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      await Promise.all([
        loadConversations(agentId),
        loadAgentAnalytics(agentId),
        loadMemoryEntries(agentId),
      ]);
      setStatusMessage(`Deleted saved data for ${selectedExternalUserLabel} from ${readString(selectedAgent?.name, 'this specialist')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Customer data could not be deleted.');
    } finally {
      setBusyExternalUserId(null);
    }
  }

  const overlayConnectorCards = overlayAgent ? SPECIALIST_CONNECTOR_CARDS.map((connector) => {
    const telegramBinding = readRecord(selectedTelegramReadiness?.configuredBinding);
    const telegramConnected = connector.id === 'telegram'
      ? Boolean(readString(telegramBinding.connector_id) || readString(telegramBinding.label))
      : false;
    const connected = connector.id === 'telegram'
      ? telegramConnected
      : connectorConnected(connector.connectorIds, connectorVaultIds);
    const statusLabel = connector.id === 'telegram'
      ? (selectedTelegramReadiness?.readyForLive ? 'Connected' : connected ? 'Needs attention' : 'Not connected')
      : connected ? 'Connected' : 'Not connected';
    return {
      ...connector,
      connected,
      statusLabel,
    };
  }) : [];

  return (
    <WorkstationSurfaceRoot surface="deployed-agents">
      <ListDetailShell
        className="app-studio-shell"
        title={studioTitle}
        subtitle={studioSubtitle}
      >
        {statusMessage ? (
          <StateBanner tone="success" title="Specialist updated">
            {statusMessage}
          </StateBanner>
        ) : null}
        {visibleErrorMessage ? (
          <StateBanner
            tone="danger"
            title="Studio is having trouble loading"
            detail="Studio keeps any successfully loaded specialist data visible while retrying failed requests."
          >
            {visibleErrorMessage}
          </StateBanner>
        ) : null}

        {isLoadingAgents ? (
          <DeployedAgentsSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div className="app-stack-4">
                {showAgentsIndex ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--roster"
                    eyebrow="Agents"
                    title="Specialist roster"
                    subtitle={`${agents.length} in this workspace, ready to compare by channel, memory, and recent activity.`}
                    actions={currentStudioSubview === 'agents' ? (
                      <div className="app-inline-actions app-inline-actions--tight">
                        <AppButton
                          type="button"
                          tone="secondary"
                          className="deployed-agents-tabbar__refresh"
                          onClick={() => {
                            void Promise.all([
                              refreshProviderCatalog(),
                              refreshAgents({ preserveSelection: true }),
                            ]);
                          }}
                          aria-label="Refresh studio"
                          title="Refresh studio"
                        >
                          <RefreshCw size={14} strokeWidth={1.9} aria-hidden="true" />
                        </AppButton>
                        <AppButton type="button" onClick={openCreateWizard}>
                          New Specialist
                        </AppButton>
                      </div>
                    ) : undefined}
                  >
                    {agents.length === 0 ? (
                      <EmptyPanel
                        title="No specialists yet"
                        body="Create your first specialist, connect the right channel, and take it live from the same Studio flow."
                        actions={(
                          <AppButton type="button" onClick={openCreateWizard}>
                            New Specialist
                          </AppButton>
                        )}
                      />
                    ) : (
                      <div className="deployed-agents-card-grid">
                        {agents.map((agent, index) => {
                          const agentId = readString(agent.id, `deployed-agent-${index}`);
                          const selected = agentId === selectedAgentId;
                          const agentMetrics = agentMetricsById[agentId] ?? null;
                          const channels = listEnabledChannels(agent.channels);
                          const channelLabel = humanizeToken(channels[0] || 'no_channel', 'No channel');
                          const memoryEnabled =
                            readRecord(readRecord(agent.config).memory_policy).memory_enabled === true
                            || readRecord(agent.metadata).memory_enabled === true;
                          const stateLabel = deploymentStateLabel(agent.deployment_state);
                          const modelLabel = formatDeploymentModelLabel(agent, providerCatalogIndex);
                          const displayName = readString(agent.name, agentId);
                          const latestActivityLabel = agentMetrics?.latestActivityLabel ?? 'Syncing recent activity';
                          const conversationLabel = agentMetrics?.conversationCountLabel ?? 'Syncing inbox';
                          const escalationLabel = agentMetrics?.unresolvedEscalationsLabel ?? 'Checking escalations';
                          return (
                            <button
                              key={agentId}
                              type="button"
                              onClick={() => {
                                setSelectedAgentId(agentId);
                                setOverlayAgentId(agentId);
                                setOverlayTab('overview');
                              }}
                              className={`deployed-agents-card${selected ? ' deployed-agents-card--selected' : ''}`}
                            >
                              <span className="deployed-agents-card__header">
                                <span className="deployed-agents-card__avatar" aria-hidden="true">
                                  {displayName.charAt(0).toUpperCase()}
                                </span>
                                <span className="deployed-agents-card__copy">
                                  <span className="deployed-agents-card__name-row">
                                    <strong className="deployed-agents-card__title">{displayName}</strong>
                                  </span>
                                  <span className="deployed-agents-card__state-row">
                                    <span
                                      className={`deployed-agents-card__status deployed-agents-card__status--${rosterStatusTone(agent.deployment_state)}`}
                                      aria-hidden="true"
                                    />
                                    <span className="deployed-agents-card__state">{stateLabel}</span>
                                  </span>
                                </span>
                              </span>
                              <span className="deployed-agents-card__meta">{latestActivityLabel}</span>
                              <span className="deployed-agents-card__subtle">
                                {`${conversationLabel} · ${memoryEnabled ? 'Memory on' : 'Memory off'} · ${escalationLabel}`}
                              </span>
                              <div className="deployed-agents-card__badges">
                                <span className="deployed-agents-card__badge">{channelLabel}</span>
                                <span className="deployed-agents-card__badge">{modelLabel}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ListDetailPanel>
                ) : null}

                {showReadinessPanel ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--readiness"
                    eyebrow="Readiness"
                    title="Launch readiness"
                    subtitle="The live channel, runtime target, and go-live posture for the selected specialist."
                  >
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Primary channel" value={activeChannels[0] ? humanizeToken(activeChannels[0], activeChannels[0]) : 'No live channel'} />
                      <FormReadout label="Channels" value={activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'} />
                      <FormReadout label="Runtime" value={humanizeToken(selectedAgent?.runtime_target, 'Cloud')} />
                    </FormGrid>
                  </ListDetailPanel>
                ) : null}
              </div>
            )}
            secondary={(
              <div className="app-stack-4">
                {showDetailPanel ? (
                <ListDetailPanel
                  className="studio-panel studio-panel--detail"
                  eyebrow="Detail"
                  title={selectedAgent ? readString(selectedAgent.name, 'Specialist details') : 'Specialist details'}
                  subtitle={selectedAgent ? 'Launch state, tools, memory, and cost posture for the selected specialist.' : 'Select a specialist.'}
                  actions={selectedAgent ? (
                    <div className="app-inline-actions app-inline-actions--tight">
                      <AppButton type="button" tone="secondary" onClick={openEditWizard}>
                        Edit
                      </AppButton>
                      <AppButton
                        type="button"
                        onClick={() => {
                          void handleDeploymentAction('deploy');
                        }}
                        disabled={
                          busyAgentId === readString(selectedAgent.id)
                          || readString(selectedAgent.deployment_state).toLowerCase() === 'live'
                          || isLoadingTelegramReadiness
                          || !selectedTelegramReadiness
                          || (selectedTelegramReadiness !== null && selectedTelegramReadiness.readyForLive !== true)
                        }
                      >
                        Deploy
                      </AppButton>
                      <AppButton
                        type="button"
                        tone="danger"
                        onClick={() => {
                          void handleDeploymentAction('pause');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id) || readString(selectedAgent.deployment_state).toLowerCase() === 'paused'}
                      >
                        Pause
                      </AppButton>
                    </div>
                  ) : null}
                >
                  {!selectedAgent ? (
                    <EmptyPanel
                      title="No specialist selected"
                      body="Choose a specialist to review readiness, tools, memory, and launch settings."
                    />
                  ) : isLoadingDetail ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="4rem" />
                    </>
                  ) : (
                    <>
                      {selectedTelegramReadiness ? (
                        <StateBanner
                          tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                          title={selectedTelegramReadiness.readyForLive ? 'Telegram launch ready' : 'Telegram launch not ready'}
                          detail={selectedTelegramReadiness.nextAction ?? 'Connector checks are in progress.'}
                        >
                          {selectedTelegramReadiness.blockers.length > 0
                            ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                            : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || `${selectedTelegramReadiness.connectors.length} connector${selectedTelegramReadiness.connectors.length === 1 ? '' : 's'} checked.`}
                        </StateBanner>
                      ) : isLoadingTelegramReadiness ? (
                        <SkeletonBlock height="5rem" />
                      ) : null}
                      <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                        <FormReadout label="State" value={humanizeToken(selectedAgent.deployment_state, 'Draft')} />
                        <FormReadout label="Run environment" value={humanizeToken(selectedAgent.runtime_target, 'Cloud')} />
                        <FormReadout label="Provider" value={humanizeToken(selectedProviderId(selectedAgent), 'Not pinned')} />
                        <FormReadout label="Model" value={selectedModelId(selectedAgent) || 'Not pinned'} />
                        <FormReadout label="Billing plan" value={humanizeToken(selectedAgent.billing_plan, 'Free')} />
                        <FormReadout
                          label="Persistent memory"
                          value={
                            readRecord(readRecord(selectedAgent.config).memory_policy).memory_enabled === true
                            || readRecord(selectedAgent.metadata).memory_enabled === true
                              ? 'Enabled'
                              : 'Disabled'
                          }
                        />
                        <FormReadout
                          label="Monthly cap"
                          value={formatUsd(
                            readRecord(readRecord(selectedAgent.config).commerce_policy).monthly_cost_cap_usd
                            ?? readRecord(selectedAgent.metadata).monthly_cost_cap_usd,
                          )}
                        />
                        <FormReadout label="Specialist id" value={readString(selectedAgent.backing_install_id, 'pending')} />
                      </FormGrid>
                      <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                        <FormReadout label="Live channels" value={activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'} />
                        <FormReadout
                          label="Allowed tools"
                          value={
                            normalizeToolIds(readRecord(readRecord(selectedAgent.config).tool_policy).enabled_tools ?? readRecord(selectedAgent.metadata).selected_tool_ids)
                              .map((item) => toolLabel(item))
                              .join(', ')
                            || 'No tools selected'
                          }
                        />
                        <FormReadout
                          label="Telegram connector"
                          value={readString(
                            readRecord(selectedTelegramReadiness?.configuredBinding).label,
                            readString(readRecord(selectedTelegramReadiness?.configuredBinding).connector_id, 'Not bound'),
                          )}
                        />
                        <FormReadout
                          label="Inbound key"
                          value={readString(readRecord(selectedTelegramReadiness?.configuredBinding).endpoint_key, 'Not bound')}
                        />
                        <FormReadout
                          label="Webhook status"
                          value={humanizeToken(readRecord(selectedTelegramReadiness?.webhook).status, 'Checking')}
                        />
                        <FormReadout label="Knowledge refs" value={`${knowledgeSourceCount} referenced sources`} />
                        <FormReadout label="Conversation count" value={selectedAgentMetrics?.conversationCountLabel ?? 'Syncing inbox'} />
                        <FormReadout label="Latest activity" value={selectedAgentMetrics?.latestActivityLabel ?? 'Fetching recent customer activity'} />
                        <FormReadout label="Last updated" value={formatTimestamp(selectedAgent.updated_at)} />
                      </FormGrid>
                      <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                        <FormReadout label="Current burn" value={formatUsd(selectedBudgetCycle.current_burn_usd)} />
                        <FormReadout label="Percent used" value={readNumber(selectedBudgetCycle.percent_used) === null ? 'n/a' : `${readNumber(selectedBudgetCycle.percent_used)?.toFixed(2)}%`} />
                        <FormReadout label="Last threshold" value={humanizeToken(selectedBudgetCycle.last_threshold_reached, 'None')} />
                        <FormReadout label="Budget month" value={readString(selectedBudgetCycle.usage_month, 'No tracked spend yet')} />
                      </FormGrid>
                      <div data-deployed-agent-analytics="detail">
                        <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                          <FormReadout label="Active users (30d)" value={selectedAnalytics ? formatCompactCount(selectedAnalytics.activeUsersLast30d) : (isLoadingAnalytics ? 'Syncing analytics' : '0')} />
                          <FormReadout label="Messages (24h)" value={selectedAnalytics ? formatCompactCount(selectedAnalytics.messageVolumeDay) : (isLoadingAnalytics ? 'Syncing analytics' : '0')} />
                          <FormReadout label="Messages (7d)" value={selectedAnalytics ? formatCompactCount(selectedAnalytics.messageVolumeWeek) : (isLoadingAnalytics ? 'Syncing analytics' : '0')} />
                          <FormReadout label="Messages (30d)" value={selectedAnalytics ? formatCompactCount(selectedAnalytics.messageVolumeMonth) : (isLoadingAnalytics ? 'Syncing analytics' : '0')} />
                          <FormReadout
                            label="Escalation rate"
                            value={selectedAnalytics ? `${selectedAnalytics.escalationRatePercent.toFixed(1)}%` : (isLoadingAnalytics ? 'Syncing analytics' : '0.0%')}
                          />
                          <FormReadout label="Outcomes" value={formatOutcomeSummary(selectedAnalytics)} />
                        </FormGrid>
                      </div>
                      {detailConfigDraft ? (
                        <>
                          <FormField label="Tools" hint="Choose the minimum allowed tools for this specialist after creation.">
                            <div className="app-inline-actions studio-inline-wrap">
                              {STUDIO_TOOL_OPTIONS.map((tool) => {
                                const selected = detailConfigDraft.selectedToolIds.includes(tool.id);
                                return (
                                  <AppButton
                                    key={tool.id}
                                    type="button"
                                    tone={selected ? 'primary' : 'secondary'}
                                    onClick={() => {
                                      setDetailConfigDraft((current) => {
                                        if (!current) {
                                          return current;
                                        }
                                        const nextSelected = current.selectedToolIds.includes(tool.id)
                                          ? current.selectedToolIds.filter((item) => item !== tool.id)
                                          : [...current.selectedToolIds, tool.id];
                                        return {
                                          ...current,
                                          selectedToolIds: nextSelected,
                                        };
                                      });
                                    }}
                                  >
                                    {selected ? `Enabled · ${tool.label}` : tool.label}
                                  </AppButton>
                                );
                              })}
                            </div>
                          </FormField>
                          <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                            <FormField label="Persistent memory" hint="Enable memory and adjust retention after the specialist has been created.">
                              <FormSelect
                                value={detailConfigDraft.memoryEnabled ? 'enabled' : 'disabled'}
                                onChange={(event) => {
                                  const nextValue = event.currentTarget.value === 'enabled';
                                  setDetailConfigDraft((current) => current ? { ...current, memoryEnabled: nextValue } : current);
                                }}
                              >
                                <option value="disabled">Disabled</option>
                                <option value="enabled">Enabled</option>
                              </FormSelect>
                            </FormField>
                            <ContextPresetControl
                              value={detailConfigDraft.contextBudgetPreset}
                              onSelect={(nextValue) => {
                                setDetailConfigDraft((current) => current ? { ...current, contextBudgetPreset: nextValue } : current);
                              }}
                            />
                            <FormField label="Retention" hint="Controls how long this specialist can retain reusable memory state.">
                              <FormSelect
                                value={detailConfigDraft.retentionPreset}
                                onChange={(event) => {
                                  const nextValue = event.currentTarget.value;
                                  setDetailConfigDraft((current) => current ? { ...current, retentionPreset: nextValue } : current);
                                }}
                              >
                                <option value="short">Short</option>
                                <option value="standard">Standard</option>
                                <option value="extended">Extended</option>
                              </FormSelect>
                            </FormField>
                          </FormGrid>
                          <div className="app-inline-actions">
                            <AppButton
                              type="button"
                              onClick={() => {
                                void saveDetailConfig();
                              }}
                              disabled={isSavingDetailConfig}
                            >
                              {isSavingDetailConfig ? 'Saving…' : 'Save'}
                            </AppButton>
                            <FormReadout
                              label="Selected tools"
                              value={detailConfigDraft.selectedToolIds.length > 0
                                ? detailConfigDraft.selectedToolIds.map((toolId) => toolLabel(toolId)).join(', ')
                                : 'No tools selected'}
                            />
                          </div>
                        </>
                      ) : null}
                      <div className="app-meta-item">
                        <div className="app-meta-label">
                          System prompt
                        </div>
                        <div className="app-meta-value app-meta-value--body">
                          {readString(selectedAgent.system_prompt, 'No launch prompt configured yet.')}
                        </div>
                      </div>
                    </>
                  )}
                </ListDetailPanel>
                ) : null}

                {showInboxPanels ? (
                <ListDetailPanel
                  className="studio-panel studio-panel--inbox"
                  eyebrow="Conversations"
                  title="Live conversation inbox"
                  subtitle="Open customer sessions for the selected specialist, with filters for channel, escalation, and outcome."
                >
                  {!selectedAgent ? (
                    <EmptyPanel
                      title="Select a specialist first"
                      body="Pick a specialist to open its inbox and review customer sessions."
                    />
                  ) : isLoadingConversations ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="3rem" />
                    </>
                  ) : conversations.length === 0 ? (
                    <EmptyPanel
                      title="No customer sessions yet"
                      body="Connect Telegram and send the first customer message to start this inbox."
                    />
                  ) : (
                    <div data-deployed-agent-conversations="list">
                      <div data-deployed-agent-conversations="filters" className="deployed-agents-filter-bar">
                        <FormGrid columns="repeat(auto-fit, minmax(10rem, 1fr))">
                          <FormField label="Channel filter" hint="Keep the inbox focused on one customer channel at a time.">
                            <FormSelect
                              value={conversationFilters.channel}
                              onChange={(event) => {
                                const nextChannel = event.currentTarget.value;
                                setConversationFilters((current) => ({ ...current, channel: nextChannel }));
                              }}
                            >
                              <option value="all">All channels</option>
                              {channelFilterOptions.map((channel) => (
                                <option key={channel} value={channel}>
                                  {humanizeToken(channel, channel)}
                                </option>
                              ))}
                            </FormSelect>
                          </FormField>
                          <FormField label="Escalation filter" hint="Separate clear sessions from approval or escalation pressure.">
                            <FormSelect
                              value={conversationFilters.escalationState}
                              onChange={(event) => {
                                const nextEscalationState = event.currentTarget.value;
                                setConversationFilters((current) => ({ ...current, escalationState: nextEscalationState }));
                              }}
                            >
                              <option value="all">All escalation states</option>
                              {escalationFilterOptions.map((state) => (
                                <option key={state} value={state}>
                                  {humanizeToken(state, state)}
                                </option>
                              ))}
                            </FormSelect>
                          </FormField>
                          <FormField label="Outcome filter" hint="Focus on open work versus completed customer sessions.">
                            <FormSelect
                              value={conversationFilters.outcome}
                              onChange={(event) => {
                                const nextOutcome = event.currentTarget.value;
                                setConversationFilters((current) => ({ ...current, outcome: nextOutcome }));
                              }}
                            >
                              <option value="all">All outcomes</option>
                              {outcomeFilterOptions.map((outcome) => (
                                <option key={outcome} value={outcome}>
                                  {humanizeToken(outcome, outcome)}
                                </option>
                              ))}
                            </FormSelect>
                          </FormField>
                        </FormGrid>
                        <div className="deployed-agents-filter-summary">
                          <div className="app-data-table__hint">
                            Showing {filteredConversations.length} of {conversations.length} customer sessions.
                          </div>
                          <AppButton
                            type="button"
                            tone="secondary"
                            className="app-button--compact"
                            onClick={() => setConversationFilters({ channel: 'all', escalationState: 'all', outcome: 'all' })}
                          >
                            Clear filters
                          </AppButton>
                        </div>
                      </div>
                      {filteredConversations.length === 0 ? (
                        <EmptyPanel
                          title="No sessions match the active filters"
                          body="No sessions match these filters. Clear them to return to the full inbox."
                        />
                      ) : (
                      <DataTable>
                        <DataTableHeader columns="minmax(0, 1fr) auto auto">
                          <DataTableHeaderCell>Customer</DataTableHeaderCell>
                          <DataTableHeaderCell>State</DataTableHeaderCell>
                          <DataTableHeaderCell align="end">Updated</DataTableHeaderCell>
                        </DataTableHeader>
                        {filteredConversations.map((conversation) => {
                          const sessionId = readString(conversation.session_id);
                          const selected = sessionId === selectedSessionId;
                          return (
                            <DataTableRow
                              key={sessionId}
                              columns="minmax(0, 1fr) auto auto"
                              selected={selected}
                              onClick={() => setSelectedSessionId(sessionId)}
                            >
                              <DataTableCell
                                primary={conversationCustomerLabel(conversation)}
                                secondary={readString(conversation.last_message, 'No last message preview')}
                                meta={humanizeToken(conversation.channel, 'Channel')}
                              />
                              <DataTableCell
                                primary={(
                                  <div className="deployed-agents-badge-row">
                                    <DataBadge tone={escalationTone(conversation.escalation_state)}>
                                      {humanizeToken(conversation.escalation_state, 'Clear')}
                                    </DataBadge>
                                    <DataBadge tone={outcomeTone(conversation.outcome)}>
                                      {humanizeToken(conversation.outcome, 'Open')}
                                    </DataBadge>
                                  </div>
                                )}
                                secondary={readString(conversation.latest_run_id, 'No run linked')}
                              />
                              <DataTableCell align="end" primary={formatTimestamp(conversation.last_message_at)} />
                            </DataTableRow>
                          );
                        })}
                      </DataTable>
                      )}
                    </div>
                  )}
                </ListDetailPanel>
                ) : null}

                {showInboxPanels ? (
                <ListDetailPanel
                  className="studio-panel studio-panel--transcript"
                  eyebrow="Transcript"
                  title={selectedConversation ? conversationCustomerLabel(selectedConversation) : 'Transcript detail'}
                  subtitle="Message history, runs, and escalation events for the selected customer session."
                  actions={selectedConversation && selectedExternalUserId ? (
                    <AppButton
                      type="button"
                      tone="danger"
                      onClick={() => {
                        void handleDeleteExternalUserData();
                      }}
                      disabled={busyExternalUserId === selectedExternalUserId}
                    >
                      Delete Customer Data
                    </AppButton>
                  ) : null}
                >
                  {!selectedConversation ? (
                    <EmptyPanel
                      title="Select a session"
                      body="Choose a customer session to inspect the full transcript and linked runs."
                    />
                  ) : isLoadingTranscript ? (
                    <>
                      <SkeletonBlock height="4rem" />
                      <SkeletonBlock height="4rem" />
                      <SkeletonBlock height="4rem" />
                    </>
                  ) : !selectedTranscript ? (
                    <EmptyPanel
                      title="Transcript unavailable"
                      body="This session exists, but the transcript could not be loaded right now. Refresh and try again."
                    />
                  ) : (
                    <div data-deployed-agent-transcript="detail" className="app-stack-3">
                      <FormGrid columns="repeat(auto-fit, minmax(10rem, 1fr))">
                        <FormReadout label="Channel" value={humanizeToken(selectedTranscript.channel, 'Telegram')} />
                        <FormReadout label="Outcome" value={humanizeToken(selectedTranscript.outcome, 'Open')} />
                        <FormReadout label="Thread" value={readString(selectedTranscript.thread_id, 'not linked')} />
                      </FormGrid>
                      <FormReadout
                        label="Run ids"
                        value={Array.isArray(selectedTranscript.run_ids) && selectedTranscript.run_ids.length > 0 ? selectedTranscript.run_ids.join(', ') : 'No run ids logged'}
                      />
                      {selectedAgent ? (
                        <div className="app-chat-context-strip">
                          <span>{selectedAgentModelLabel}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{`memory: ${selectedAgentMemoryEnabled ? 'on' : 'off'}`}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{`channel: ${selectedAgentChannelLabel}`}</span>
                          <span aria-hidden="true">&middot;</span>
                          <span>{`status: ${selectedAgentStatusLabel}`}</span>
                        </div>
                      ) : null}
                      {transcriptEntries.length === 0 ? (
                        <EmptyPanel
                          title="Transcript has no entries"
                          body="This session was created, but no ordered transcript entries were returned yet. Send another message and refresh."
                        />
                      ) : (
                        transcriptEntries.map((entry) => (
                          <TranscriptEntryCard
                            key={readString(entry.id, `${readString(entry.kind)}-${readString(entry.ts)}`)}
                            entry={entry}
                          />
                        ))
                      )}
                    </div>
                  )}
                </ListDetailPanel>
                ) : null}
              </div>
            )}
          />
        )}

        {currentStudioSubview === 'agents' && overlayAgent ? (
          <div className="deployed-agents-overlay" role="dialog" aria-modal="true" aria-label="Specialist settings">
            <div className="deployed-agents-overlay__shell">
              <div className="deployed-agents-overlay__header">
                <div className="deployed-agents-overlay__identity">
                  <span className="deployed-agents-overlay__avatar" aria-hidden="true">
                    {readString(overlayAgent.name, 'S').charAt(0).toUpperCase()}
                  </span>
                  <div className="deployed-agents-overlay__copy">
                    <strong className="deployed-agents-overlay__title">{readString(overlayAgent.name, 'Specialist')}</strong>
                    <div className="deployed-agents-overlay__status-row">
                      <span className={joinClassNames(
                        'deployed-agents-card__status',
                        `deployed-agents-card__status--${rosterStatusTone(overlayAgent.deployment_state)}`,
                      )}
                      />
                      <span className="deployed-agents-overlay__status-label">{deploymentStateLabel(overlayAgent.deployment_state)}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="deployed-agents-overlay__close"
                  onClick={() => setOverlayAgentId(null)}
                  aria-label="Close specialist settings"
                >
                  <X size={16} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>

              <div className="deployed-agents-overlay__tabs" role="tablist" aria-label="Specialist settings tabs">
                {SPECIALIST_OVERLAY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={overlayTab === tab.id}
                    className={joinClassNames(
                      'deployed-agents-overlay__tab',
                      overlayTab === tab.id && 'deployed-agents-overlay__tab--active',
                    )}
                    onClick={() => setOverlayTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="deployed-agents-overlay__body">
                {overlayTab === 'overview' ? (
                  <div className="deployed-agents-overlay__section">
                    <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                      <FormField label="Agent name">
                        <FormInput
                          value={overlayName}
                          onChange={(event) => setOverlayName(event.currentTarget.value)}
                          placeholder="Specialist name"
                        />
                      </FormField>
                      <FormField label="Last active">
                        <FormReadout
                          label="Last active"
                          value={overlayAgentMetrics?.latestActivityLabel ?? 'No recent activity'}
                        />
                      </FormField>
                    </FormGrid>
                    <FormField label="Purpose / persona">
                      <FormTextarea
                        value={overlayPersona}
                        onChange={(event) => setOverlayPersona(event.currentTarget.value)}
                        rows={5}
                      />
                    </FormField>
                    <div className="deployed-agents-overlay__marketplace">
                      <div className="deployed-agents-overlay__marketplace-header">
                        <div>
                          <strong className="deployed-agents-overlay__marketplace-title">Marketplace</strong>
                          <p className="deployed-agents-overlay__marketplace-hint">
                            Control whether this specialist appears in the public Marketplace catalog.
                          </p>
                        </div>
                        <button
                          type="button"
                          className={joinClassNames(
                            'sage-tool-toggle',
                            overlayMarketplaceListed && 'sage-tool-toggle--enabled',
                          )}
                          role="switch"
                          aria-checked={overlayMarketplaceListed}
                          onClick={() => setOverlayMarketplaceListed((current) => !current)}
                        >
                          <span className="sage-tool-toggle__thumb" />
                        </button>
                      </div>
                      <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                        <FormField
                          label="List in Marketplace"
                          hint="Owners control public listing. The Telegram button disables automatically when no Telegram username is configured."
                        >
                          <FormReadout
                            label="List in Marketplace"
                            value={overlayMarketplaceListed ? 'Enabled' : 'Disabled'}
                          />
                        </FormField>
                        <FormField label="Category" hint="Examples: Medical, Legal, Finance.">
                          <FormInput
                            value={overlayMarketplaceCategory}
                            onChange={(event) => setOverlayMarketplaceCategory(event.currentTarget.value)}
                            placeholder="e.g. Medical, Legal, Finance"
                          />
                        </FormField>
                      </FormGrid>
                      <div className="deployed-agents-overlay__platform-rating">
                        <div className="deployed-agents-overlay__platform-rating-copy">
                          <strong>Set by platform operator</strong>
                          <span>
                            {overlayQualityStars !== null && overlayQualityStars > 0
                              ? 'Quality rating and cost tier are managed centrally.'
                              : 'Not yet rated by platform.'}
                          </span>
                        </div>
                        <div className="deployed-agents-overlay__platform-rating-values">
                          {overlayQualityStars !== null && overlayQualityStars > 0 ? (
                            <div className="deployed-agents-overlay__stars" aria-label={`Quality ${overlayQualityStars} out of 5`}>
                              {Array.from({ length: 5 }).map((_, starIndex) => (
                                <span
                                  key={`overlay-star-${starIndex}`}
                                  className={joinClassNames(
                                    'deployed-agents-overlay__star',
                                    starIndex < overlayQualityStars
                                      && 'deployed-agents-overlay__star--filled',
                                  )}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="deployed-agents-overlay__unrated">Not yet rated</span>
                          )}
                          {overlayCostTier ? (
                            <span className="deployed-agents-overlay__tier-badge">
                              {humanizeToken(overlayCostTier, 'Unrated')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="deployed-agents-overlay__overview-grid">
                      <div className="deployed-agents-overlay__meta">
                        <span className="deployed-agents-overlay__meta-label">Channel</span>
                        <span className="deployed-agents-overlay__meta-value">
                          {readString(readRecord(selectedTelegramReadiness?.configuredBinding).label, overlayChannels[0] || 'Not bound')}
                        </span>
                        <button type="button" className="deployed-agents-overlay__meta-link" onClick={openEditWizard}>
                          Rebind →
                        </button>
                      </div>
                      <div className="deployed-agents-overlay__meta">
                        <span className="deployed-agents-overlay__meta-label">Deploy state</span>
                        <span className="deployed-agents-overlay__meta-value">{deploymentStateLabel(overlayAgent.deployment_state)}</span>
                        <div className="deployed-agents-overlay__action-row">
                          <AppButton
                            type="button"
                            onClick={() => {
                              void handleDeploymentAction('deploy');
                            }}
                            disabled={
                              busyAgentId === readString(overlayAgent.id)
                              || readString(overlayAgent.deployment_state).toLowerCase() === 'live'
                              || isLoadingTelegramReadiness
                              || !selectedTelegramReadiness
                              || (selectedTelegramReadiness !== null && selectedTelegramReadiness.readyForLive !== true)
                            }
                          >
                            Deploy
                          </AppButton>
                          <AppButton
                            type="button"
                            tone="secondary"
                            onClick={() => {
                              void handleDeploymentAction('pause');
                            }}
                            disabled={busyAgentId === readString(overlayAgent.id) || readString(overlayAgent.deployment_state).toLowerCase() === 'paused'}
                          >
                            Pause
                          </AppButton>
                        </div>
                      </div>
                    </div>
                    <div className="deployed-agents-overlay__footer">
                      <AppButton type="button" onClick={() => { void saveOverlayOverview(); }} disabled={isSavingOverlayOverview}>
                        {isSavingOverlayOverview ? 'Saving…' : 'Save'}
                      </AppButton>
                    </div>
                  </div>
                ) : null}

                {overlayTab === 'tools' ? (
                  <div className="deployed-agents-overlay__section">
                    <div className="sage-tool-list" role="list">
                      {STUDIO_TOOL_OPTIONS.map((tool) => {
                        const selected = detailConfigDraft?.selectedToolIds.includes(tool.id) ?? false;
                        return (
                          <article key={tool.id} className="sage-tool-row" role="listitem">
                            <div className="sage-tool-row__copy">
                              <strong className="sage-tool-row__title">{tool.label}</strong>
                              <p className="sage-tool-row__description">{tool.description}</p>
                            </div>
                            <div className="sage-tool-row__actions">
                              <button
                                type="button"
                                className={joinClassNames('sage-tool-toggle', selected && 'sage-tool-toggle--enabled')}
                                role="switch"
                                aria-checked={selected}
                                onClick={() => {
                                  setDetailConfigDraft((current) => {
                                    if (!current) {
                                      return current;
                                    }
                                    const nextSelected = current.selectedToolIds.includes(tool.id)
                                      ? current.selectedToolIds.filter((item) => item !== tool.id)
                                      : [...current.selectedToolIds, tool.id];
                                    return { ...current, selectedToolIds: nextSelected };
                                  });
                                }}
                              >
                                <span className="sage-tool-toggle__thumb" />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="deployed-agents-overlay__footer">
                      <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                        {isSavingDetailConfig ? 'Saving…' : 'Save'}
                      </AppButton>
                    </div>
                  </div>
                ) : null}

                {overlayTab === 'memory' ? (
                  <div className="deployed-agents-overlay__section">
                    {detailConfigDraft ? (
                      <>
                        <div className="deployed-agents-overlay__toggle-row">
                          <div className="sage-tool-row__copy">
                            <strong className="sage-tool-row__title">Persistent memory</strong>
                            <p className="sage-tool-row__description">Keep reusable specialist context across customer sessions.</p>
                          </div>
                          <button
                            type="button"
                            className={joinClassNames('sage-tool-toggle', detailConfigDraft.memoryEnabled && 'sage-tool-toggle--enabled')}
                            role="switch"
                            aria-checked={detailConfigDraft.memoryEnabled}
                            onClick={() => {
                              setDetailConfigDraft((current) => current ? { ...current, memoryEnabled: !current.memoryEnabled } : current);
                            }}
                          >
                            <span className="sage-tool-toggle__thumb" />
                          </button>
                        </div>
                        <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                          <ContextPresetControl
                            value={detailConfigDraft.contextBudgetPreset}
                            onSelect={(nextValue) => {
                              setDetailConfigDraft((current) => current ? { ...current, contextBudgetPreset: nextValue } : current);
                            }}
                          />
                          <FormField label="Retention window">
                            <FormSelect
                              value={detailConfigDraft.retentionPreset}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value;
                                setDetailConfigDraft((current) => current ? { ...current, retentionPreset: nextValue } : current);
                              }}
                            >
                              <option value="short">Short</option>
                              <option value="standard">Standard</option>
                              <option value="extended">Extended</option>
                            </FormSelect>
                          </FormField>
                        </FormGrid>
                        <div className="deployed-agents-overlay__memory-list">
                          {isLoadingOverlayMemory && overlayMemoryEntries.length === 0 ? (
                            <>
                              <SkeletonBlock height="4rem" />
                              <SkeletonBlock height="4rem" />
                            </>
                          ) : overlayMemoryEntries.length === 0 ? (
                            <div className="deployed-agents-overlay__empty">No customer memory yet — memory builds as customers chat with this specialist.</div>
                          ) : overlayMemoryEntries.map((entry) => (
                            <article key={readString(entry.id, `${readString(entry.channel)}-${readString(entry.external_user_id)}`)} className="deployed-agents-overlay__memory-entry">
                              <strong className="deployed-agents-overlay__memory-title">{truncateExternalUserId(entry.external_user_id)}</strong>
                              <p className="deployed-agents-overlay__memory-body deployed-agents-overlay__memory-body--summary">
                                {readString(entry.summary_text, 'No memory summary yet.')}
                              </p>
                              <span className="deployed-agents-overlay__memory-meta">{formatTimestamp(entry.updated_at)}</span>
                            </article>
                          ))}
                        </div>
                        <div className="deployed-agents-overlay__footer">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {overlayTab === 'connectors' ? (
                  <div className="deployed-agents-overlay__section">
                    <div className="sage-unified-grid sage-unified-grid--4">
                      {overlayConnectorCards.map((connector) => (
                        <article key={connector.id} className="sage-unified-card deployed-agents-overlay__connector-card">
                          <span className="sage-integration-brand" aria-hidden="true">
                            <img src={connector.image} alt="" className="sage-integration-brand__image" />
                          </span>
                          <strong className="sage-unified-card__title">{connector.label}</strong>
                          <span className={joinClassNames('sage-unified-card__status', connector.connected && 'sage-unified-card__status--connected')}>
                            {connector.connected ? <span className="sage-unified-card__dot" aria-hidden="true" /> : null}
                            {connector.statusLabel}
                          </span>
                          <div className="sage-unified-expand__tag-row">
                            {connector.capabilityTags.map((tag) => (
                              <span key={tag} className="sage-unified-expand__tag">{tag}</span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}

                {overlayTab === 'analytics' ? (
                  <div className="deployed-agents-overlay__section">
                    <WorkstationDeployedAgentAnalyticsPane
                      agentId={readString(overlayAgent.id)}
                      workspaceId={services.scope.workspaceId}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

      <CommandSheet
        open={isWizardOpen}
        title={wizardMode === 'create' ? 'New Specialist' : 'Edit Specialist'}
        description="Set the specialist up, connect the customer channel, and review launch settings."
        onClose={closeWizard}
          actions={(
            <div className="app-inline-actions">
              {wizardStepIndex > 0 ? (
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => setWizardStepIndex((current) => Math.max(0, current - 1))}
                  disabled={isSubmittingWizard}
                >
                  Back
                </AppButton>
              ) : null}
              {wizardStepIndex < DEPLOYED_AGENT_WIZARD_STEPS.length - 1 ? (
                <AppButton
                  type="button"
                  onClick={() => setWizardStepIndex((current) => Math.min(DEPLOYED_AGENT_WIZARD_STEPS.length - 1, current + 1))}
                  disabled={isSubmittingWizard}
                >
                  Continue
                </AppButton>
              ) : (
                <AppButton
                  type="button"
                  onClick={() => {
                    void persistWizard();
                  }}
                  disabled={isSubmittingWizard}
                >
                  {wizardMode === 'create' ? 'Create Draft' : 'Save'}
                </AppButton>
              )}
            </div>
          )}
        >
          <div data-deployed-agent-wizard="root" className="deployed-agents-wizard">
            <div className="deployed-agents-wizard__steps">
              {DEPLOYED_AGENT_WIZARD_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  data-deployed-agent-wizard-step={step.id}
                  className="deployed-agents-wizard__step"
                  data-active={index === wizardStepIndex ? 'true' : 'false'}
                >
                  <span className="deployed-agents-wizard__step-eyebrow">
                    Step {index + 1}
                  </span>
                  <strong className="deployed-agents-wizard__step-title">{step.label}</strong>
                </div>
              ))}
            </div>

            <ModalSection title={wizardStep.label} description={wizardStep.description}>
              {wizardStep.id === 'setup' ? (
                <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                  <FormField label="Specialist name" hint="The public name customers will see in Telegram.">
                    <FormInput
                      value={wizardState.name}
                      onChange={(event) => setWizardField('name', event.currentTarget.value)}
                      placeholder="Support Specialist"
                    />
                  </FormField>
                  <FormField label="Avatar URL" hint="Optional public avatar or brand mark.">
                    <FormInput
                      value={wizardState.avatar}
                      onChange={(event) => setWizardField('avatar', event.currentTarget.value)}
                      placeholder="https://example.com/avatar.png"
                    />
                  </FormField>
                  <FormField label="Persona" hint="Short description of the specialist’s tone and behavior.">
                    <FormTextarea
                      rows={4}
                      value={wizardState.persona}
                      onChange={(event) => setWizardField('persona', event.currentTarget.value)}
                      placeholder="Fast and calm Telegram support specialist"
                    />
                    <div className="deployed-agents-wizard__memory-toggle">
                      <div className="sage-tool-row__copy">
                        <strong className="sage-tool-row__title">Enable persistent memory</strong>
                        <p className="sage-tool-row__description">Specialist remembers each customer across conversations.</p>
                      </div>
                      <button
                        type="button"
                        className={joinClassNames('sage-tool-toggle', wizardState.memoryEnabled && 'sage-tool-toggle--enabled')}
                        role="switch"
                        aria-checked={wizardState.memoryEnabled}
                        onClick={() => setWizardField('memoryEnabled', !wizardState.memoryEnabled)}
                      >
                        <span className="sage-tool-toggle__thumb" />
                      </button>
                    </div>
                    <ContextPresetControl
                      value={wizardState.contextBudgetPreset}
                      onSelect={(nextValue) => setWizardField('contextBudgetPreset', nextValue)}
                    />
                  </FormField>
                  <FormField label="Purpose and behavior" hint="Core instructions this specialist follows.">
                    <FormTextarea
                      rows={6}
                      value={wizardState.systemPrompt}
                      onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                      placeholder="Handle customer requests, escalate safely when needed, and keep replies short and accurate."
                    />
                  </FormField>
                  <FormField label="Knowledge references" hint="Optional reference URIs (one per line).">
                    <FormTextarea
                      rows={6}
                      value={wizardState.knowledgeSourceText}
                      onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                      placeholder={'kb://faq\nkb://returns'}
                    />
                  </FormField>
                </FormGrid>
              ) : null}

              {wizardStep.id === 'connect' ? (
                <div className="app-stack-3">
                  {selectedTelegramReadiness ? (
                    <StateBanner
                      tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                      title={selectedTelegramReadiness.readyForLive ? 'Telegram launch path is ready' : 'Telegram launch checks'}
                      detail={selectedTelegramReadiness.nextAction ?? 'Connector checks are in progress.'}
                    >
                      {selectedTelegramReadiness.blockers.length > 0
                        ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                        : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || `${selectedTelegramReadiness.connectors.length} connector${selectedTelegramReadiness.connectors.length === 1 ? '' : 's'} checked.`}
                    </StateBanner>
                  ) : isLoadingTelegramReadiness ? (
                    <SkeletonBlock height="5rem" />
                  ) : null}
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Telegram state" hint="Enable Telegram when this specialist is ready for live customer conversations.">
                      <FormSelect
                        value={wizardState.telegramEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('telegramEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Keep disabled</option>
                        <option value="enabled">Ready for live deploy</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Telegram connector" hint="Bind to one workspace Telegram bot.">
                      <FormSelect
                        value={wizardState.telegramConnectorId}
                        onChange={(event) => {
                          const nextConnectorId = event.currentTarget.value;
                          const nextConnector = selectedTelegramReadiness?.connectors.find((item) => item.id === nextConnectorId) ?? null;
                          setWizardState((current) => ({
                            ...current,
                            telegramConnectorId: nextConnectorId,
                            telegramEndpointKey: nextConnector?.endpointKey ?? '',
                          }));
                        }}
                        disabled={!wizardState.telegramEnabled || isLoadingTelegramReadiness}
                      >
                        <option value="">
                          {isLoadingTelegramReadiness
                            ? 'Checking Telegram connectors…'
                            : selectedTelegramReadiness?.connectors.length
                              ? 'Select a Telegram bot'
                              : 'No Telegram connectors available'}
                        </option>
                        {(selectedTelegramReadiness?.connectors ?? []).map((connector) => (
                          <option key={connector.id} value={connector.id}>
                            {connector.label}
                          </option>
                        ))}
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                  {!isLoadingTelegramReadiness && (selectedTelegramReadiness?.connectors.length ?? 0) === 0 ? (
                    <div className="app-stack-3">
                      <StateBanner tone="neutral" title="No Telegram bot connected yet.">
                        Studio needs one Telegram bot before this specialist can go live.
                      </StateBanner>
                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          tone="secondary"
                          onClick={() => {
                            const nextOpenState = !isTelegramSetupOpen;
                            setIsTelegramSetupOpen(nextOpenState);
                            if (nextOpenState) {
                              void loadTelegramReadiness(readString(selectedAgent?.id) || undefined);
                            }
                          }}
                        >
                          {isTelegramSetupOpen ? 'Hide Telegram setup' : 'Connect Telegram bot'}
                        </AppButton>
                      </div>
                      {isTelegramSetupOpen ? (
                        <WorkspaceChannelPairingSurface featureId="settings" />
                      ) : null}
                    </div>
                  ) : null}
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Inbound binding key" value={selectedWizardConnector?.endpointKey || wizardState.telegramEndpointKey || 'Select a connector'} />
                    <FormReadout label="Bot username" value={selectedWizardConnector?.botUsername || 'Not exposed by connector'} />
                    <FormReadout
                      label="Webhook path"
                      value={selectedWizardConnector?.webhookPath || readString(readRecord(selectedTelegramReadiness?.webhook).path_template, 'Awaiting connector')}
                    />
                    <FormReadout
                      label="Webhook status"
                      value={humanizeToken(readRecord(selectedTelegramReadiness?.webhook).status, 'Checking')}
                    />
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'deploy' ? (
                <div className="app-stack-3">
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Provider" hint="Choose the AI provider for this specialist.">
                      <FormSelect
                        data-deployed-agent-provider-select="true"
                        value={wizardState.providerId}
                        onChange={(event) => {
                          const nextProviderId = event.currentTarget.value;
                          const nextProvider = providerCatalogIndex[nextProviderId] ?? null;
                          const nextModelId = nextProvider?.defaultModel && nextProvider.models.some((item) => item.id === nextProvider.defaultModel)
                            ? nextProvider.defaultModel
                            : nextProvider?.models[0]?.id || '';
                          setWizardState((current) => ({
                            ...current,
                            providerId: nextProviderId,
                            modelId: nextModelId,
                          }));
                        }}
                        disabled={isLoadingProviderCatalog || providerCatalog.length === 0}
                      >
                        <option value="">
                          {isLoadingProviderCatalog ? 'Loading providers…' : 'Select a provider'}
                        </option>
                        {providerCatalog.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </FormSelect>
                    </FormField>
                    <FormField label="Model" hint="Choose the model this specialist should use.">
                      <FormSelect
                        data-deployed-agent-model-select="true"
                        value={wizardState.modelId}
                        onChange={(event) => setWizardField('modelId', event.currentTarget.value)}
                        disabled={!selectedProviderCatalog || selectedProviderCatalog.models.length === 0}
                      >
                        <option value="">
                          {selectedProviderCatalog ? 'Select a model' : 'Select a provider first'}
                        </option>
                        {(selectedProviderCatalog?.models ?? []).map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label}
                          </option>
                        ))}
                      </FormSelect>
                    </FormField>
                    <FormField label="Run environment" hint="Choose where this specialist runs.">
                      <FormSelect
                        value={wizardState.runtimeTarget}
                        onChange={(event) => setWizardField('runtimeTarget', event.currentTarget.value)}
                      >
                        <option value="cloud">Cloud</option>
                        <option value="local">Local</option>
                        <option value="device">Privileged device</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Billing plan" hint="Choose the plan tied to this specialist.">
                      <FormSelect
                        value={wizardState.billingPlan}
                        onChange={(event) => setWizardField('billingPlan', event.currentTarget.value)}
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="team">Team</option>
                        <option value="enterprise">Enterprise</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Provider state" value={humanizeToken(selectedProviderCatalog?.state, isLoadingProviderCatalog ? 'Loading' : 'Unknown')} />
                    <FormReadout label="Privacy profile" value={selectedProviderCatalog?.privacyPosture || 'n/a'} />
                    <FormReadout label="Jurisdiction" value={selectedProviderCatalog?.jurisdiction || 'n/a'} />
                    <FormReadout label="Residency" value={selectedProviderCatalog?.residency || 'n/a'} />
                    <FormReadout label="Context window" value={formatContextWindow(selectedProviderModelCatalog?.contextWindowTokens)} />
                    <FormReadout
                      label="Pricing"
                      value={
                        selectedProviderModelCatalog
                          ? `${formatUsdPer1k(selectedProviderModelCatalog.inputCostPer1kUsd)} in · ${formatUsdPer1k(selectedProviderModelCatalog.outputCostPer1kUsd)} out`
                          : 'n/a'
                      }
                    />
                  </FormGrid>
                  <FormReadout
                      label="Capabilities"
                      value={
                        selectedProviderModelCatalog?.capabilityLabels.join(', ')
                      || selectedProviderCatalog?.capabilityLabels.join(', ')
                      || 'No capability labels yet'
                    }
                  />
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Daily message limit" hint="Per external user, reset at UTC midnight. Leave blank to disable free-tier limits.">
                      <FormInput
                        value={wizardState.dailyMessageLimit}
                        onChange={(event) => setWizardField('dailyMessageLimit', event.currentTarget.value)}
                        inputMode="numeric"
                        placeholder="25"
                      />
                    </FormField>
                    <FormField label="Monthly cost cap (USD)" hint="Automatically pauses this specialist after reaching this monthly cap.">
                      <FormInput
                        value={wizardState.monthlyCostCapUsd}
                        onChange={(event) => setWizardField('monthlyCostCapUsd', event.currentTarget.value)}
                        inputMode="decimal"
                        placeholder="25.00"
                      />
                    </FormField>
                  </FormGrid>
                  {wizardMode === 'edit' && selectedAgent ? (
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Current state" value={humanizeToken(selectedAgent.deployment_state, 'Draft')} />
                      <FormReadout label="Specialist id" value={readString(selectedAgent.backing_install_id, 'pending')} />
                    </FormGrid>
                  ) : null}
                  {wizardMode === 'edit' && selectedAgent ? (
                    <div className="app-inline-actions">
                      <AppButton
                        type="button"
                        onClick={() => {
                          void handleDeploymentAction('deploy');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id)}
                      >
                        Deploy
                      </AppButton>
                      <AppButton
                        type="button"
                        tone="danger"
                        onClick={() => {
                          void handleDeploymentAction('pause');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id)}
                      >
                        Pause
                      </AppButton>
                    </div>
                  ) : (
                    <FormReadout label="Launch" value="Create the draft first, then launch from the details panel or edit step." />
                  )}
                </div>
              ) : null}
            </ModalSection>
          </div>
        </CommandSheet>
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
