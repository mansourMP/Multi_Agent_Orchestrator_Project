'use client';

import { useEffect, useMemo, useState } from 'react';

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
import { AppButton } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import type {
  DeployedAgentAnalyticsRecord,
  DeployedAgentConversationDetail,
  DeployedAgentConversationRecord,
  DeployedAgentRecord,
  DeployedAgentTelegramReadinessRecord,
  ProviderCatalogModelRecord,
  ProviderCatalogRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type WizardMode = 'create' | 'edit';
type WizardStepId = 'name' | 'purpose' | 'tools' | 'memory' | 'telegram' | 'review' | 'deploy';
type StudioSubview = 'agents' | 'inbox' | 'deploy';

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
    id: 'name',
    label: 'Name',
    description: 'Give the specialist a clear public name and optional avatar.',
  },
  {
    id: 'purpose',
    label: 'Purpose',
    description: 'Define purpose and response behavior for this Telegram specialist.',
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Choose only the tools this specialist truly needs.',
  },
  {
    id: 'memory',
    label: 'Memory Scope',
    description: 'Choose whether memory is on and how much context to retain.',
  },
  {
    id: 'telegram',
    label: 'Telegram Binding',
    description: 'Bind to one Telegram connector and validate readiness.',
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Review the specialist setup, channel link, and launch readiness.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    description: 'Save this specialist and launch it when ready.',
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

function deploymentTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const token = readString(value).toLowerCase();
  if (token === 'live') {
    return 'success';
  }
  if (token === 'paused') {
    return 'warning';
  }
  if (token === 'staging') {
    return 'accent';
  }
  if (token === 'error' || token === 'failed') {
    return 'danger';
  }
  return 'neutral';
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
    memoryEnabled: memoryPolicy.memory_enabled === true || metadata.memory_enabled === true,
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

function readBudgetCycle(agent?: DeployedAgentRecord | null): Record<string, unknown> {
  const metadata = readRecord(agent?.metadata);
  return readRecord(metadata.current_budget_cycle);
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

function formatAnalyticsRowPrimary(snapshot: AgentAnalyticsSnapshot | null): string {
  if (!snapshot) {
    return 'Syncing analytics';
  }
  return `${formatCompactCount(snapshot.activeUsersLast30d)} active · ${formatCompactCount(snapshot.messageVolumeMonth)} msgs / 30d`;
}

function formatAnalyticsRowSecondary(snapshot: AgentAnalyticsSnapshot | null): string {
  if (!snapshot) {
    return 'Computing owner metrics';
  }
  return `${snapshot.escalationRatePercent.toFixed(1)}% escalation · ${formatUsd(snapshot.currentBurnUsd)}`;
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
  const services = useWorkspaceServices();
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogSnapshot[]>([]);
  const [agents, setAgents] = useState<DeployedAgentRecord[]>([]);
  const [agentMetricsById, setAgentMetricsById] = useState<Record<string, AgentOperationalMetrics>>({});
  const [agentAnalyticsById, setAgentAnalyticsById] = useState<Record<string, AgentAnalyticsSnapshot>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<DeployedAgentRecord | null>(null);
  const [selectedAgentAnalytics, setSelectedAgentAnalytics] = useState<AgentAnalyticsSnapshot | null>(null);
  const [selectedTelegramReadiness, setSelectedTelegramReadiness] = useState<TelegramReadinessSnapshot | null>(null);
  const [conversations, setConversations] = useState<DeployedAgentConversationRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<DeployedAgentConversationDetail | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingProviderCatalog, setIsLoadingProviderCatalog] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isLoadingTelegramReadiness, setIsLoadingTelegramReadiness] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(() => buildWizardState(null));
  const [isSubmittingWizard, setIsSubmittingWizard] = useState(false);
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

  async function refreshAgentMetrics(items: DeployedAgentRecord[]) {
    if (items.length === 0) {
      setAgentMetricsById({});
      return;
    }
    setAgentMetricsById((current) => ({
      ...current,
      ...Object.fromEntries(
        items
          .map((item) => readString(item.id))
          .filter(Boolean)
          .map((agentId) => [agentId, current[agentId] ?? buildMetricsPlaceholder()]),
      ),
    }));
    const metricsEntries = await Promise.all(
      items.map(async (agent) => {
        const agentId = readString(agent.id);
        if (!agentId) {
          return null;
        }
        try {
          const payload = await services.client.listDeployedAgentConversations({
            deployedAgentId: agentId,
            limit: 100,
            offset: 0,
          });
          const itemsForAgent = readItems<DeployedAgentConversationRecord>(payload);
          const hasMore = readRecord(payload).has_more === true;
          return [agentId, summarizeConversationMetrics(itemsForAgent, { hasMore })] as const;
        } catch {
          return [agentId, buildMetricsPlaceholder()] as const;
        }
      }),
    );
    setAgentMetricsById(
      Object.fromEntries(metricsEntries.filter((entry): entry is readonly [string, AgentOperationalMetrics] => Boolean(entry))),
    );
  }

  async function refreshAgentAnalytics(items: DeployedAgentRecord[]) {
    if (items.length === 0) {
      setAgentAnalyticsById({});
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
      setAgentAnalyticsById((current) => ({
        ...current,
        ...Object.fromEntries(nextEntries),
      }));
    } catch {
      setAgentAnalyticsById((current) => current);
    }
  }

  async function refreshProviderCatalog() {
    setIsLoadingProviderCatalog(true);
    try {
      const payload = await services.client.listProviderCatalog();
      setProviderCatalog(normalizeProviderCatalog(payload));
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
      void refreshAgentMetrics(items);
      void refreshAgentAnalytics(items);
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
      setAgentMetricsById((current) => ({
        ...current,
        [agentId]: summarizeConversationMetrics(items, {
          hasMore: readRecord(payload).has_more === true,
        }),
      }));
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

  function openCreateWizard() {
    setWizardMode('create');
    setWizardStepIndex(0);
    setWizardState(applyProviderCatalogDefaults(buildWizardState(null), providerCatalog));
    setIsWizardOpen(true);
    void loadTelegramReadiness();
  }

  function openEditWizard() {
    setWizardMode('edit');
    setWizardStepIndex(0);
    setWizardState(applyProviderCatalogDefaults(buildWizardState(selectedAgent), providerCatalog));
    setIsWizardOpen(true);
    void loadTelegramReadiness(readString(selectedAgent?.id) || undefined);
  }

  function closeWizard() {
    if (isSubmittingWizard) {
      return;
    }
    setIsWizardOpen(false);
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
    if (wizardState.selectedToolIds.length === 0) {
      setErrorMessage('Select at least one allowed tool before saving this Studio specialist.');
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

  const activeChannels = listEnabledChannels(selectedAgent?.channels);
  const selectedKnowledgeSources = Array.isArray(selectedAgent?.knowledge_sources)
    ? selectedAgent.knowledge_sources
    : [];
  const knowledgeSourceCount = selectedKnowledgeSources.length;
  const currentStudioSubview: StudioSubview = initialSubview;
  const studioTitle = currentStudioSubview === 'agents'
    ? 'Studio · Agents'
    : currentStudioSubview === 'inbox'
      ? 'Studio · Inbox'
      : 'Studio · Deploy';
  const studioSubtitle = currentStudioSubview === 'agents'
    ? 'Build your specialist roster and review each selected specialist before launch.'
    : currentStudioSubview === 'inbox'
      ? 'Review live conversations and transcript timelines from your specialist inbox.'
      : 'Use guided launch checks to move specialists from draft to live with confidence.';
  const showAgentsIndex = currentStudioSubview === 'agents' || currentStudioSubview === 'inbox';
  const showReadinessPanel = currentStudioSubview === 'agents' || currentStudioSubview === 'deploy';
  const showDetailPanel = currentStudioSubview === 'agents' || currentStudioSubview === 'deploy';
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
      ]);
      setStatusMessage(`Deleted saved data for ${selectedExternalUserLabel} from ${readString(selectedAgent?.name, 'this specialist')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Customer data could not be deleted.');
    } finally {
      setBusyExternalUserId(null);
    }
  }

  return (
    <WorkstationSurfaceRoot surface="deployed-agents">
      <ListDetailShell
        className="app-studio-shell"
        title={studioTitle}
        subtitle={studioSubtitle}
        actions={(
          <div className="app-inline-actions">
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                void Promise.all([
                  refreshProviderCatalog(),
                  refreshAgents({ preserveSelection: true }),
                ]);
              }}
            >
              Refresh
            </AppButton>
            <AppButton type="button" onClick={openCreateWizard}>
              Create Specialist
            </AppButton>
          </div>
        )}
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
                    eyebrow="Agents"
                    title="Specialist roster"
                    subtitle={`${agents.length} specialists currently configured for this workspace.`}
                  >
                    {agents.length === 0 ? (
                      <EmptyPanel
                        title="No specialists yet"
                        body="Create your first specialist and use guided setup before launch."
                        actions={(
                          <AppButton type="button" onClick={openCreateWizard}>
                            Start guided setup
                          </AppButton>
                        )}
                      />
                    ) : (
                      <DataTable>
                        <DataTableHeader columns="minmax(0, 1.1fr) auto minmax(0, 0.72fr) minmax(0, 0.9fr) auto">
                          <DataTableHeaderCell>Specialist</DataTableHeaderCell>
                          <DataTableHeaderCell>State</DataTableHeaderCell>
                          <DataTableHeaderCell>Channels</DataTableHeaderCell>
                          <DataTableHeaderCell>Operations</DataTableHeaderCell>
                          <DataTableHeaderCell align="end">Updated</DataTableHeaderCell>
                        </DataTableHeader>
                        {agents.map((agent, index) => {
                          const agentId = readString(agent.id, `deployed-agent-${index}`);
                          const selected = agentId === selectedAgentId;
                          const channels = listEnabledChannels(agent.channels);
                          const metrics = agentMetricsById[agentId];
                          const analytics = agentAnalyticsById[agentId] ?? null;
                          return (
                            <DataTableRow
                              key={agentId}
                              columns="minmax(0, 1.1fr) auto minmax(0, 0.72fr) minmax(0, 0.9fr) auto"
                              selected={selected}
                              onClick={() => setSelectedAgentId(agentId)}
                            >
                              <DataTableCell
                                primary={readString(agent.name, agentId)}
                                secondary={readString(agent.persona, 'Telegram specialist')}
                                meta={`Runtime profile ${readString(agent.backing_install_id, 'pending')}`}
                              />
                              <DataTableCell
                                primary={<DataBadge tone={deploymentTone(agent.deployment_state)}>{humanizeToken(agent.deployment_state, 'Draft')}</DataBadge>}
                              />
                              <DataTableCell
                                primary={channels.length > 0 ? channels.join(', ') : 'No live channels'}
                                secondary={`${readString(agent.runtime_target, 'cloud')} · ${formatDeploymentModelSummary(agent, providerCatalogIndex)}`}
                              />
                              <DataTableCell
                                primary={formatAnalyticsRowPrimary(analytics)}
                                secondary={formatAnalyticsRowSecondary(analytics)}
                                meta={metrics?.latestActivityLabel ?? 'Fetching recent customer activity'}
                              />
                              <DataTableCell
                                align="end"
                                primary={formatTimestamp(agent.updated_at)}
                              />
                            </DataTableRow>
                          );
                        })}
                      </DataTable>
                    )}
                  </ListDetailPanel>
                ) : null}

                {showReadinessPanel ? (
                  <ListDetailPanel
                    eyebrow="Readiness"
                    title="Launch readiness"
                    subtitle="Confirm channel availability and operational boundaries before going live."
                  >
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Live channel" value="Telegram" />
                      <FormReadout label="Additional channels" value="Not enabled in this workspace yet" />
                      <FormReadout label="Runtime profile" value="Each specialist runs with one linked runtime profile." />
                    </FormGrid>
                  </ListDetailPanel>
                ) : null}
              </div>
            )}
            secondary={(
              <div className="app-stack-4">
                {showDetailPanel ? (
                <ListDetailPanel
                  eyebrow="Detail"
                  title={selectedAgent ? readString(selectedAgent.name, 'Specialist details') : 'Specialist details'}
                  subtitle={selectedAgent ? readString(selectedAgent.persona, 'Selected specialist overview and launch controls') : 'Select a specialist to review readiness, channels, and launch controls.'}
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
                      body="Choose a specialist from the list or start guided setup to create one."
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
                          detail={selectedTelegramReadiness.nextAction ?? 'Studio verifies connector setup and message routing before launch.'}
                        >
                          {selectedTelegramReadiness.blockers.length > 0
                            ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                            : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || 'Telegram is currently the active Studio channel for live launch.'}
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
                  eyebrow="Conversations"
                  title="Live conversation inbox"
                  subtitle="Review current customer sessions, filter by status, and open transcript details."
                >
                  {!selectedAgent ? (
                    <EmptyPanel
                      title="Select a specialist first"
                      body="Conversation history appears after you select a specialist."
                    />
                  ) : isLoadingConversations ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="3rem" />
                    </>
                  ) : conversations.length === 0 ? (
                    <EmptyPanel
                      title="No customer sessions yet"
                      body="Conversations will appear here as this specialist starts receiving customer messages."
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
                          body="Clear one or more filters to return to the full inbox."
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
                  eyebrow="Transcript"
                  title={selectedConversation ? conversationCustomerLabel(selectedConversation) : 'Transcript detail'}
                  subtitle="Review message, tool, and escalation events in timeline order."
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
                      body="Choose a conversation from the inbox to review the timeline."
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
                      body="The session exists, but the transcript detail could not be loaded right now."
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
                      {transcriptEntries.length === 0 ? (
                        <EmptyPanel
                          title="Transcript has no entries"
                          body="This session is known to the inbox, but no ordered transcript entries were returned."
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

      <CommandSheet
        open={isWizardOpen}
        title={wizardMode === 'create' ? 'Create Telegram Specialist' : 'Edit Telegram Specialist'}
        description="Seven guided steps define name, purpose, tools, memory, Telegram link, review, and launch readiness."
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
                  {wizardMode === 'create' ? 'Create draft specialist' : 'Save changes'}
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
              {wizardStep.id === 'name' ? (
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
                </FormGrid>
              ) : null}

              {wizardStep.id === 'purpose' ? (
                <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                  <FormField label="Persona" hint="Short description of the specialist’s tone and behavior.">
                    <FormTextarea
                      rows={4}
                      value={wizardState.persona}
                      onChange={(event) => setWizardField('persona', event.currentTarget.value)}
                      placeholder="Fast and calm Telegram support specialist"
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

              {wizardStep.id === 'tools' ? (
                <div className="app-stack-3">
                  <FormField label="Allowed tools" hint="Select the minimum tool scope this specialist needs.">
                    <div className="app-inline-actions" style={{ flexWrap: 'wrap' }}>
                      {STUDIO_TOOL_OPTIONS.map((tool) => {
                        const selected = wizardState.selectedToolIds.includes(tool.id);
                        return (
                          <AppButton
                            key={tool.id}
                            type="button"
                            tone={selected ? 'primary' : 'secondary'}
                            onClick={() => toggleWizardTool(tool.id)}
                          >
                            {selected ? `Enabled · ${tool.label}` : tool.label}
                          </AppButton>
                        );
                      })}
                    </div>
                  </FormField>
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Selected tools" value={wizardState.selectedToolIds.length ? wizardState.selectedToolIds.map((toolId) => toolLabel(toolId)).join(', ') : 'None'} />
                    <FormReadout label="Scope policy" value="Explicit allow-list only" />
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'memory' ? (
                <div className="app-stack-3">
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Persistent memory" hint="Enable memory to retain customer context between sessions.">
                      <FormSelect
                        value={wizardState.memoryEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('memoryEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Context budget" hint="How much recent history to include while memory is enabled.">
                      <FormSelect
                        value={wizardState.contextBudgetPreset}
                        onChange={(event) => setWizardField('contextBudgetPreset', event.currentTarget.value)}
                      >
                        <option value="compact">Compact</option>
                        <option value="balanced">Balanced</option>
                        <option value="deep">Deep</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Retention" hint="How long memory remains eligible for reuse.">
                      <FormSelect
                        value={wizardState.retentionPreset}
                        onChange={(event) => setWizardField('retentionPreset', event.currentTarget.value)}
                      >
                        <option value="short">Short</option>
                        <option value="standard">Standard</option>
                        <option value="extended">Extended</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'telegram' ? (
                <div className="app-stack-3">
                  {selectedTelegramReadiness ? (
                    <StateBanner
                      tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                      title={selectedTelegramReadiness.readyForLive ? 'Telegram launch path is ready' : 'Telegram launch checks'}
                      detail={selectedTelegramReadiness.nextAction ?? 'Studio checks connector binding and message routing before live deploy.'}
                    >
                      {selectedTelegramReadiness.blockers.length > 0
                        ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                        : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || 'Telegram is currently the active live channel in Studio.'}
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
                  <FormReadout label="Additional channels" value="Coming soon" />
                </div>
              ) : null}

              {wizardStep.id === 'review' ? (
                <div className="app-stack-3">
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormReadout label="Name" value={wizardState.name || 'Not set'} />
                    <FormReadout label="Purpose" value={wizardState.persona || 'Not set'} />
                    <FormReadout
                      label="Tools"
                      value={wizardState.selectedToolIds.length ? wizardState.selectedToolIds.map((toolId) => toolLabel(toolId)).join(', ') : 'None selected'}
                    />
                    <FormReadout
                      label="Memory scope"
                      value={wizardState.memoryEnabled ? `${humanizeToken(wizardState.contextBudgetPreset)} · ${humanizeToken(wizardState.retentionPreset)}` : 'Disabled'}
                    />
                    <FormReadout
                      label="Telegram binding"
                      value={wizardState.telegramEnabled ? (selectedWizardConnector?.label || wizardState.telegramConnectorId || 'Pending connector') : 'Disabled'}
                    />
                    <FormReadout
                      label="Readiness"
                      value={selectedTelegramReadiness?.readyForLive ? 'Ready for deploy' : selectedTelegramReadiness?.nextAction || 'Pending checks'}
                    />
                  </FormGrid>
                  <FormReadout
                    label="System behavior"
                    value={wizardState.systemPrompt || 'No system behavior added yet.'}
                  />
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
                        Deploy live
                      </AppButton>
                      <AppButton
                        type="button"
                        tone="danger"
                        onClick={() => {
                          void handleDeploymentAction('pause');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id)}
                      >
                        Pause specialist
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
