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
  ProviderCatalogModelRecord,
  ProviderCatalogRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type WizardMode = 'create' | 'edit';
type WizardStepId = 'identity' | 'knowledge' | 'channels' | 'launch';

type WizardState = {
  name: string;
  avatar: string;
  persona: string;
  systemPrompt: string;
  knowledgeSourceText: string;
  telegramEnabled: boolean;
  telegramEndpointKey: string;
  providerId: string;
  modelId: string;
  runtimeTarget: string;
  billingPlan: string;
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
    id: 'identity',
    label: 'Identity',
    description: 'Define the public agent identity, persona, and service prompt.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Attach referenced knowledge sources without adding a new ingestion pipeline.',
  },
  {
    id: 'channels',
    label: 'Channels',
    description: 'Configure Telegram now and keep other customer channels visibly out of live scope.',
  },
  {
    id: 'launch',
    label: 'Launch',
    description: 'Control runtime target, billing plan, and draft-to-live state from one place.',
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
  return {
    name: readString(agent?.name),
    avatar: readString(agent?.avatar),
    persona: readString(agent?.persona),
    systemPrompt: readString(agent?.system_prompt),
    knowledgeSourceText: serializeKnowledgeSources(agent?.knowledge_sources),
    telegramEnabled: telegram.enabled === true,
    telegramEndpointKey: readString(telegram.endpoint_key),
    providerId: readString(agent?.provider ?? metadata.provider),
    modelId: readString(agent?.model ?? metadata.model),
    runtimeTarget: readString(agent?.runtime_target, 'cloud'),
    billingPlan: readString(agent?.billing_plan, 'free'),
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
    return readString(entry.summary ?? entry.action, 'The conversation escalated for operator attention.');
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

function DeployedAgentsSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Deployments" title="Loading deployed agents">
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <div style={{ display: 'grid', gap: '1rem' }}>
          <ListDetailPanel eyebrow="Detail" title="Loading deployment detail">
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
    <article
      style={{
        display: 'grid',
        gap: '0.45rem',
        padding: '0.9rem 0.95rem',
        borderRadius: '0.95rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.16rem' }}>
          <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.86rem' }}>{transcriptEntryTitle(entry)}</strong>
          <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.76rem' }}>
            {formatTimestamp(entry.ts)}
          </span>
        </div>
        <DataBadge tone={transcriptEntryTone(entry)}>
          {humanizeToken(entry.kind, 'Event')}
        </DataBadge>
      </div>
      <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.83rem', lineHeight: 1.6 }}>
        {transcriptEntryBody(entry)}
      </div>
      {(runId || threadId || readOptionalString(entry.status)) ? (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            color: 'var(--app-text-tertiary)',
            fontSize: '0.74rem',
          }}
        >
          {runId ? <span>Run {runId}</span> : null}
          {threadId ? <span>Thread {threadId}</span> : null}
          {readOptionalString(entry.status) ? <span>{humanizeToken(entry.status, 'Logged')}</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export function WorkstationDeployedAgentsPane() {
  const services = useWorkspaceServices();
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogSnapshot[]>([]);
  const [agents, setAgents] = useState<DeployedAgentRecord[]>([]);
  const [agentMetricsById, setAgentMetricsById] = useState<Record<string, AgentOperationalMetrics>>({});
  const [agentAnalyticsById, setAgentAnalyticsById] = useState<Record<string, AgentAnalyticsSnapshot>>({});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<DeployedAgentRecord | null>(null);
  const [selectedAgentAnalytics, setSelectedAgentAnalytics] = useState<AgentAnalyticsSnapshot | null>(null);
  const [conversations, setConversations] = useState<DeployedAgentConversationRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<DeployedAgentConversationDetail | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [isLoadingProviderCatalog, setIsLoadingProviderCatalog] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
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
  }

  function openEditWizard() {
    setWizardMode('edit');
    setWizardStepIndex(0);
    setWizardState(applyProviderCatalogDefaults(buildWizardState(selectedAgent), providerCatalog));
    setIsWizardOpen(true);
  }

  function closeWizard() {
    if (isSubmittingWizard) {
      return;
    }
    setIsWizardOpen(false);
  }

  function setWizardField<K extends keyof WizardState>(field: K, value: WizardState[K]) {
    setWizardState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function persistWizard() {
    const dailyMessageLimit = wizardState.dailyMessageLimit.trim();
    const monthlyCostCapUsd = wizardState.monthlyCostCapUsd.trim();
    if (!wizardState.providerId.trim()) {
      setErrorMessage('Choose a provider before saving this deployment.');
      return;
    }
    if (!wizardState.modelId.trim()) {
      setErrorMessage('Choose a model before saving this deployment.');
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
      setErrorMessage('A deployed agent needs a public name before it can be saved.');
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
        setStatusMessage(`Created draft deployment ${readString(record.name, payload.name)}.`);
        if (createdId) {
          await Promise.all([
            loadAgentAnalytics(createdId),
            loadConversations(createdId),
          ]);
        }
      } else {
        const agentId = readString(selectedAgent?.id);
        if (!agentId) {
          throw new Error('Select a deployed agent before editing it.');
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
        ]);
        setStatusMessage(`Updated ${readString(record.name, 'deployment')} configuration.`);
      }
      setIsWizardOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'The deployment could not be saved.');
    } finally {
      setIsSubmittingWizard(false);
    }
  }

  async function handleDeploymentAction(action: 'deploy' | 'pause') {
    const agentId = readString(selectedAgent?.id);
    if (!agentId) {
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
          ? `${readString(record.name, 'Deployment')} is now live on its configured channels.`
          : `${readString(record.name, 'Deployment')} is paused and will no longer accept live customer traffic.`,
      );
      await Promise.all([
        refreshAgentAnalytics(upsertAgentRecord(agents, record)),
        loadAgentAnalytics(agentId),
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
      `Delete stored conversation data for ${selectedExternalUserLabel} from this deployment? This removes saved channel history, memory summaries, and rate-limit usage for that scoped user.`,
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
      setStatusMessage(`Deleted stored data for ${selectedExternalUserLabel} from ${readString(selectedAgent?.name, 'this deployment')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Customer data could not be deleted.');
    } finally {
      setBusyExternalUserId(null);
    }
  }

  return (
    <WorkstationSurfaceRoot surface="deployed-agents">
      <ListDetailShell
        title="Deployed Agents"
        subtitle="Create customer-facing specialist deployments, manage Telegram launch state, and inspect the live conversation inbox without leaving the workstation shell."
        actions={(
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
              Create Deployed Agent
            </AppButton>
          </div>
        )}
      >
        {statusMessage ? (
          <StateBanner tone="success" title="Deployment state updated">
            {statusMessage}
          </StateBanner>
        ) : null}
        {errorMessage ? (
          <StateBanner
            tone="danger"
            title="Deployed-agent surface is degraded"
            detail="The surface keeps any successfully loaded deployment state visible while one or more backend requests are being retried."
          >
            {errorMessage}
          </StateBanner>
        ) : null}

        {isLoadingAgents ? (
          <DeployedAgentsSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div style={{ display: 'grid', gap: '1rem' }}>
                <ListDetailPanel
                  eyebrow="Index"
                  title="Workspace deployments"
                  subtitle={`${agents.length} deployed-agent services currently defined for this workspace.`}
                >
                  {agents.length === 0 ? (
                    <EmptyPanel
                      title="No deployed agents yet"
                      body="Start with a named customer-facing agent, connect Telegram routing, and keep the deployment in draft until the channel binding is ready."
                      actions={(
                        <AppButton type="button" onClick={openCreateWizard}>
                          Start the 4-step wizard
                        </AppButton>
                      )}
                    />
                  ) : (
                    <DataTable>
                      <DataTableHeader columns="minmax(0, 1.1fr) auto minmax(0, 0.72fr) minmax(0, 0.9fr) auto">
                        <DataTableHeaderCell>Deployment</DataTableHeaderCell>
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
                              secondary={readString(agent.persona, 'Customer-facing deployment')}
                              meta={`Backing install ${readString(agent.backing_install_id, 'pending')}`}
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

                <ListDetailPanel
                  eyebrow="Readiness"
                  title="Current launch model"
                  subtitle="Telegram is the only live customer channel in scope for this sprint. Other customer channels remain visible but intentionally non-routable."
                >
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Live channel" value="Telegram" />
                    <FormReadout label="Unsupported this sprint" value="WhatsApp, Instagram, widget, API endpoint" />
                    <FormReadout label="Execution truth" value="Every deployed agent wraps one backing specialist install." />
                  </FormGrid>
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <div style={{ display: 'grid', gap: '1rem' }}>
                <ListDetailPanel
                  eyebrow="Detail"
                  title={selectedAgent ? readString(selectedAgent.name, 'Deployment detail') : 'Deployment detail'}
                  subtitle={selectedAgent ? readString(selectedAgent.persona, 'Customer-facing deployed agent') : 'Select a deployment to inspect its launch state and configuration.'}
                  actions={selectedAgent ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <AppButton type="button" tone="secondary" onClick={openEditWizard}>
                        Edit
                      </AppButton>
                      <AppButton
                        type="button"
                        onClick={() => {
                          void handleDeploymentAction('deploy');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id) || readString(selectedAgent.deployment_state).toLowerCase() === 'live'}
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
                      title="No deployment selected"
                      body="Pick a deployed agent from the index or start the wizard to create a new one."
                    />
                  ) : isLoadingDetail ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="4rem" />
                    </>
                  ) : (
                    <>
                      <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                        <FormReadout label="State" value={humanizeToken(selectedAgent.deployment_state, 'Draft')} />
                        <FormReadout label="Runtime" value={humanizeToken(selectedAgent.runtime_target, 'Cloud')} />
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
                        <FormReadout label="Backing install" value={readString(selectedAgent.backing_install_id, 'pending')} />
                      </FormGrid>
                      <FormGrid columns="repeat(auto-fit, minmax(11rem, 1fr))">
                        <FormReadout label="Live channels" value={activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'} />
                        <FormReadout label="Knowledge refs" value={`${knowledgeSourceCount} referenced sources`} />
                        <FormReadout label="Conversation count" value={selectedAgentMetrics?.conversationCountLabel ?? 'Syncing inbox'} />
                        <FormReadout label="Open escalations" value={selectedAgentMetrics?.unresolvedEscalationsLabel ?? 'Open escalation state pending'} />
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
                      <div style={{ display: 'grid', gap: '0.55rem' }}>
                        <div style={{ color: 'var(--app-text-tertiary)', fontSize: '0.73rem', fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          System prompt
                        </div>
                        <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.83rem', lineHeight: 1.6 }}>
                          {readString(selectedAgent.system_prompt, 'No launch prompt configured yet.')}
                        </div>
                      </div>
                    </>
                  )}
                </ListDetailPanel>

                <ListDetailPanel
                  eyebrow="Conversations"
                  title="Conversation inbox"
                  subtitle="Filter recent customer sessions by channel, escalation state, and outcome while keeping transcript detail inside the same workstation shell."
                >
                  {!selectedAgent ? (
                    <EmptyPanel
                      title="Select a deployment first"
                      body="Conversation history only appears after a deployed agent has been selected."
                    />
                  ) : isLoadingConversations ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="3rem" />
                    </>
                  ) : conversations.length === 0 ? (
                    <EmptyPanel
                      title="No customer sessions yet"
                      body="Telegram traffic logged against this deployment will appear here with the latest message, escalation state, and outcome."
                    />
                  ) : (
                    <div data-deployed-agent-conversations="list">
                      <div
                        data-deployed-agent-conversations="filters"
                        style={{ display: 'grid', gap: '0.8rem', marginBottom: '0.85rem' }}
                      >
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
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ color: 'var(--app-text-tertiary)', fontSize: '0.76rem' }}>
                            Showing {filteredConversations.length} of {conversations.length} customer sessions.
                          </div>
                          <AppButton
                            type="button"
                            tone="secondary"
                            onClick={() => setConversationFilters({ channel: 'all', escalationState: 'all', outcome: 'all' })}
                          >
                            Clear filters
                          </AppButton>
                        </div>
                      </div>
                      {filteredConversations.length === 0 ? (
                        <EmptyPanel
                          title="No sessions match the active filters"
                          body="Clear one or more filters to return to the full deployed-agent inbox."
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
                                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
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

                <ListDetailPanel
                  eyebrow="Transcript"
                  title={selectedConversation ? conversationCustomerLabel(selectedConversation) : 'Transcript detail'}
                  subtitle="Ordered message, tool-call, approval, and escalation entries come directly from the deployed-agent transcript APIs."
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
                      body="Choose a customer conversation from the inbox to inspect the ordered transcript."
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
                    <div data-deployed-agent-transcript="detail" style={{ display: 'grid', gap: '0.8rem' }}>
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
              </div>
            )}
          />
        )}

        <CommandSheet
          open={isWizardOpen}
          title={wizardMode === 'create' ? 'Create Deployed Agent' : 'Edit Deployed Agent'}
          description="Four steps define the customer-facing identity, knowledge references, live channel configuration, and launch controls."
          onClose={closeWizard}
          actions={(
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                  {wizardMode === 'create' ? 'Create draft deployment' : 'Save changes'}
                </AppButton>
              )}
            </div>
          )}
        >
          <div data-deployed-agent-wizard="root" style={{ display: 'grid', gap: '0.9rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '0.6rem',
              }}
            >
              {DEPLOYED_AGENT_WIZARD_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  data-deployed-agent-wizard-step={step.id}
                  style={{
                    display: 'grid',
                    gap: '0.22rem',
                    padding: '0.7rem 0.75rem',
                    borderRadius: '0.9rem',
                    border: index === wizardStepIndex ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                    background: index === wizardStepIndex
                      ? 'color-mix(in srgb, var(--app-accent-muted) 34%, var(--app-bg-panel) 66%)'
                      : 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                  }}
                >
                  <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.72rem', fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Step {index + 1}
                  </span>
                  <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.84rem' }}>{step.label}</strong>
                </div>
              ))}
            </div>

            <ModalSection title={wizardStep.label} description={wizardStep.description}>
              {wizardStep.id === 'identity' ? (
                <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                  <FormField label="Agent name" hint="The public name customers will see in Telegram and future channels.">
                    <FormInput
                      value={wizardState.name}
                      onChange={(event) => setWizardField('name', event.currentTarget.value)}
                      placeholder="Store Assistant"
                    />
                  </FormField>
                  <FormField label="Avatar URL" hint="Optional public avatar or brand mark for the deployed agent.">
                    <FormInput
                      value={wizardState.avatar}
                      onChange={(event) => setWizardField('avatar', event.currentTarget.value)}
                      placeholder="https://example.com/avatar.png"
                    />
                  </FormField>
                  <FormField label="Persona" hint="Short operator-facing description of the behavior and tone.">
                    <FormTextarea
                      rows={4}
                      value={wizardState.persona}
                      onChange={(event) => setWizardField('persona', event.currentTarget.value)}
                      placeholder="Helpful retail support specialist"
                    />
                  </FormField>
                  <FormField label="System prompt" hint="Service prompt for the backing specialist execution path.">
                    <FormTextarea
                      rows={6}
                      value={wizardState.systemPrompt}
                      onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                      placeholder="Use the catalog, order status, and return policy to answer customers accurately."
                    />
                  </FormField>
                </FormGrid>
              ) : null}

              {wizardStep.id === 'knowledge' ? (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  <FormField label="Knowledge references" hint="Enter one reference URI per line. These remain references only in this sprint.">
                    <FormTextarea
                      rows={8}
                      value={wizardState.knowledgeSourceText}
                      onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                      placeholder={'kb://catalog\nkb://returns\nkb://faq'}
                    />
                  </FormField>
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Reference count" value={`${parseKnowledgeSources(wizardState.knowledgeSourceText).length} sources`} />
                    <FormReadout label="Storage mode" value="Reference-only, no new ingestion subsystem" />
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'channels' ? (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Telegram state" hint="Telegram is the only actionable live customer channel in this sprint.">
                      <FormSelect
                        value={wizardState.telegramEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('telegramEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Keep disabled</option>
                        <option value="enabled">Ready for live deploy</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Telegram endpoint key" hint="Must match the existing inbound-owner binding when the deployment goes live.">
                      <FormInput
                        value={wizardState.telegramEndpointKey}
                        onChange={(event) => setWizardField('telegramEndpointKey', event.currentTarget.value)}
                        placeholder="store-bot"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="WhatsApp" value="Visible but not live-routable this sprint" />
                    <FormReadout label="Instagram DMs" value="Visible but not live-routable this sprint" />
                    <FormReadout label="Widget and API" value="Explicitly out of scope for Phase 5" />
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'launch' ? (
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Provider" hint="Pins the deployed agent to one LLM provider instead of relying on tribal knowledge.">
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
                    <FormField label="Model" hint="The selected model is persisted on the deployment and mirrored into the backing specialist metadata.">
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
                    <FormField label="Runtime target" hint="Maps onto the existing backing specialist runtime selection.">
                      <FormSelect
                        value={wizardState.runtimeTarget}
                        onChange={(event) => setWizardField('runtimeTarget', event.currentTarget.value)}
                      >
                        <option value="cloud">Cloud</option>
                        <option value="local">Local</option>
                        <option value="device">Privileged device</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Billing plan" hint="Persisted now for product shape; publisher billing arrives later.">
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
                    <FormField label="Persistent memory" hint="Loads recent channel history and summaries for returning users when enabled.">
                      <FormSelect
                        value={wizardState.memoryEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('memoryEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Context budget" hint="Controls how much recent conversation memory is packed into the prompt.">
                      <FormSelect
                        value={wizardState.contextBudgetPreset}
                        onChange={(event) => setWizardField('contextBudgetPreset', event.currentTarget.value)}
                      >
                        <option value="compact">Compact</option>
                        <option value="balanced">Balanced</option>
                        <option value="deep">Deep</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Retention preset" hint="Controls how long customer conversation memory stays eligible for runtime reuse.">
                      <FormSelect
                        value={wizardState.retentionPreset}
                        onChange={(event) => setWizardField('retentionPreset', event.currentTarget.value)}
                      >
                        <option value="short">Short</option>
                        <option value="standard">Standard</option>
                        <option value="extended">Extended</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Health safety mode" hint="Turns on the deployment health-safety overlay and disclosure behavior.">
                      <FormSelect
                        value={wizardState.healthSafetyEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('healthSafetyEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Safety assistant name" hint="Optional label used by the health-safety reply overlay when that mode is enabled.">
                      <FormInput
                        value={wizardState.healthSafetyAssistantName}
                        onChange={(event) => setWizardField('healthSafetyAssistantName', event.currentTarget.value)}
                        placeholder="HealthGuide"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Provider state" value={humanizeToken(selectedProviderCatalog?.state, isLoadingProviderCatalog ? 'Loading' : 'Unknown')} />
                    <FormReadout label="Privacy posture" value={selectedProviderCatalog?.privacyPosture || 'n/a'} />
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
                    <FormField label="Monthly cost cap (USD)" hint="Auto-pauses the deployment after the current UTC month burn reaches this cap.">
                      <FormInput
                        value={wizardState.monthlyCostCapUsd}
                        onChange={(event) => setWizardField('monthlyCostCapUsd', event.currentTarget.value)}
                        inputMode="decimal"
                        placeholder="25.00"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Escalation preset" hint="Controls the default escalation trigger posture mirrored into the backing specialist contract.">
                      <FormSelect
                        value={wizardState.escalationPreset}
                        onChange={(event) => setWizardField('escalationPreset', event.currentTarget.value)}
                      >
                        <option value="standard">Standard</option>
                        <option value="conservative">Conservative</option>
                        <option value="aggressive">Aggressive</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Human handoff mode" hint="Defines what happens after escalation is triggered for a customer conversation.">
                      <FormSelect
                        value={wizardState.handoffMode}
                        onChange={(event) => setWizardField('handoffMode', event.currentTarget.value)}
                      >
                        <option value="notify_owner">Notify owner</option>
                        <option value="pause_per_user">Pause per customer</option>
                        <option value="manual_resume">Manual resume</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Owner notification destination" hint="Slack channel, email alias, or queue name used by the escalation workflow.">
                      <FormInput
                        value={wizardState.ownerNotificationDestination}
                        onChange={(event) => setWizardField('ownerNotificationDestination', event.currentTarget.value)}
                        placeholder="ops@example.com"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Paused message" hint="Customer-facing copy returned while the deployment is manually paused.">
                      <FormTextarea
                        value={wizardState.pausedMessage}
                        onChange={(event) => setWizardField('pausedMessage', event.currentTarget.value)}
                        rows={3}
                        placeholder="I’m temporarily paused right now. Please check back shortly."
                      />
                    </FormField>
                    <FormField label="Welcome intro" hint="Primary public-start copy shown when a customer first lands on the deployment.">
                      <FormTextarea
                        value={wizardState.welcomeIntro}
                        onChange={(event) => setWizardField('welcomeIntro', event.currentTarget.value)}
                        rows={3}
                        placeholder="Fast, reliable help for your customers on Telegram."
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Welcome core value" hint="Short value statement that explains what the bot does for the customer.">
                      <FormInput
                        value={wizardState.welcomeCoreValue}
                        onChange={(event) => setWizardField('welcomeCoreValue', event.currentTarget.value)}
                        placeholder="Get quick answers and a clean handoff when a human is needed."
                      />
                    </FormField>
                    <FormField label="Public start CTA label" hint="Launch CTA shown in the public-start acquisition flow.">
                      <FormInput
                        value={wizardState.publicStartCtaLabel}
                        onChange={(event) => setWizardField('publicStartCtaLabel', event.currentTarget.value)}
                        placeholder="Continue on Empyralist"
                      />
                    </FormField>
                    <FormField label="Public start CTA URL" hint="Destination for the public-start acquisition CTA.">
                      <FormInput
                        value={wizardState.publicStartCtaUrl}
                        onChange={(event) => setWizardField('publicStartCtaUrl', event.currentTarget.value)}
                        placeholder="https://app.empyralist.com/signup"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Upgrade CTA label" hint="Shown in the branded quota message when the free tier is exhausted.">
                      <FormInput
                        value={wizardState.upgradeCtaLabel}
                        onChange={(event) => setWizardField('upgradeCtaLabel', event.currentTarget.value)}
                        placeholder="Continue on Empyralist"
                      />
                    </FormField>
                  </FormGrid>
                  <FormField label="Upgrade CTA URL" hint="Platform or signup URL appended to the quota message.">
                    <FormInput
                      value={wizardState.upgradeCtaUrl}
                      onChange={(event) => setWizardField('upgradeCtaUrl', event.currentTarget.value)}
                      placeholder="https://app.empyralist.com/signup?source=telegram"
                    />
                  </FormField>
                  {wizardMode === 'edit' && selectedAgent ? (
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Current state" value={humanizeToken(selectedAgent.deployment_state, 'Draft')} />
                      <FormReadout label="Backing install" value={readString(selectedAgent.backing_install_id, 'pending')} />
                    </FormGrid>
                  ) : null}
                  {wizardMode === 'edit' && selectedAgent ? (
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
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
                        Pause deployment
                      </AppButton>
                    </div>
                  ) : (
                    <FormReadout label="Launch control" value="Create the draft first, then use Deploy from the detail panel or edit step." />
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
