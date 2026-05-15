'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, RefreshCw, X } from 'lucide-react';

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
import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { ModalSection } from '@/lib/ui/modal';
import { PlatformNotification } from '@/lib/ui/platform-notification';
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
  StudioProofAgentSeedRecord,
} from '@/lib/workspace/workstation-client';
import { WorkstationDeployedAgentAnalyticsPane } from '@/lib/workspace/workstation-deployed-agent-analytics-pane';
import { DeployedAgentTestTurnPane } from '@/lib/workspace/workstation-deployed-agent-test-turn-pane';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSplitWorkbench } from '@/lib/workspace/workstation-split-workbench';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type WizardMode = 'create' | 'edit';
type WizardStepId = 'overview' | 'knowledge' | 'tools' | 'channels' | 'memory' | 'safety' | 'test' | 'deploy';
type StudioSubview = 'agents' | 'inbox' | 'deploy';
type AgentRosterFilterId = 'all' | 'text' | 'computer' | 'connected' | 'draft';
type SpecialistOverlayTabId = 'overview' | 'chat' | 'knowledge' | 'ai' | 'tools' | 'memory' | 'connectors' | 'analytics';

type StudioTemplate = {
  id: string;
  title: string;
  category: string;
  icon: string;
  outcome: string;
  description: string;
  setupTime: string;
  channelLabel: string;
  requiredConnectors: string[];
  defaultName: string;
  persona: string;
  systemPrompt: string;
  knowledgePlaceholder: string;
  selectedToolIds: string[];
  memoryEnabled: boolean;
  contextBudgetPreset: string;
};

type WizardState = {
  name: string;
  avatar: string;
  persona: string;
  systemPrompt: string;
  knowledgeSourceText: string;
  aiTier: 'light' | 'pro' | 'max';
  runtimeSupplierKind: 'empyralis' | 'customer' | 'third_party_certified';
  runtimeSupplierId: string;
  runtimeSupplierLabel: string;
  runtimePlacement: 'managed_cloud' | 'hosted_hardware_pool' | 'customer_local' | 'customer_hosted';
  marketplacePublishAllowed: boolean;
  thirdPartyRuntimeAllowed: boolean;
  computerAutomationEnabled: boolean;
  computerAutomationRuntimeClass: 'virtual_browser' | 'virtual_desktop' | 'virtual_code_sandbox' | 'local_browser' | 'local_desktop';
  computerAutomationAllowedDomains: string;
  computerAutomationMaxSessions: string;
  computerAutomationDailyBudgetUsd: string;
  computerAutomationMonthlyBudgetUsd: string;
  approvalMode: 'guarded' | 'balanced' | 'autonomous';
  customerChannel: 'telegram' | 'whatsapp' | 'web_widget' | 'draft';
  telegramEnabled: boolean;
  telegramConnectorId: string;
  telegramEndpointKey: string;
  providerId: string;
  modelId: string;
  runtimeTarget: string;
  selfHostedRuntimeProfileId: string;
  selfHostedPrivacyAccepted: boolean;
  selfHostedSafetyAccepted: boolean;
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
  selectedAgentId: string | null;
  overlayAgentId: string | null;
  selectedAgentDetail: DeployedAgentRecord | null;
  selectedAgentAnalytics: AgentAnalyticsSnapshot | null;
  selectedTelegramReadiness: TelegramReadinessSnapshot | null;
  conversations: DeployedAgentConversationRecord[];
  selectedSessionId: string | null;
  selectedTranscript: DeployedAgentConversationDetail | null;
};

type DetailConfigDraft = Pick<
  WizardState,
  'aiTier' | 'providerId' | 'modelId' | 'billingPlan' | 'selectedToolIds' | 'memoryEnabled' | 'contextBudgetPreset' | 'retentionPreset'
>;

const studioPaneCache = new Map<string, StudioPaneCache>();

const DEFAULT_SAFE_AGENT_PERSONA = 'Helpful customer-facing assistant that answers clearly, stays within the configured business information, and asks a human for help when unsure.';
const DEFAULT_SAFE_AGENT_SYSTEM_PROMPT = 'Answer using the agent instructions and trusted knowledge sources. If the answer is not known, say so clearly and ask for a human follow-up. Do not invent prices, policies, availability, legal advice, medical advice, or financial advice.';
const DEFAULT_SAFE_MONTHLY_COST_CAP_USD = '25';

function updateStudioPaneCache(workspaceId: string, partial: Partial<StudioPaneCache>) {
  const current = studioPaneCache.get(workspaceId);
  studioPaneCache.set(workspaceId, {
    providerCatalog: current?.providerCatalog ?? [],
    agents: current?.agents ?? [],
    connectorVaultIds: current?.connectorVaultIds ?? [],
    agentMetricsById: current?.agentMetricsById ?? {},
    agentAnalyticsById: current?.agentAnalyticsById ?? {},
    selectedAgentId: current?.selectedAgentId ?? null,
    overlayAgentId: null,
    selectedAgentDetail: current?.selectedAgentDetail ?? null,
    selectedAgentAnalytics: current?.selectedAgentAnalytics ?? null,
    selectedTelegramReadiness: current?.selectedTelegramReadiness ?? null,
    conversations: current?.conversations ?? [],
    selectedSessionId: current?.selectedSessionId ?? null,
    selectedTranscript: current?.selectedTranscript ?? null,
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
  supportsVision: boolean;
  supportsJson: boolean;
  supportsReasoning: boolean;
  localSelfHostedCompatible: boolean;
  pricingKnown: boolean;
  source: string | null;
  fetchedAt: string | null;
  lifecycle: string | null;
  capabilityLabels: string[];
};

type ProviderCatalogSnapshot = {
  id: string;
  label: string;
  state: string;
  defaultModel: string | null;
  studioVisible: boolean;
  providerScopes: string[];
  privacyPosture: string | null;
  jurisdiction: string | null;
  residency: string | null;
  localSelfHostedCompatible: boolean;
  capabilityLabels: string[];
  modelsSource: string | null;
  modelsSyncedAt: string | null;
  modelsExpiresAt: string | null;
  modelsError: string | null;
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

type AgentIntegrationConnectorCard = {
  id: string;
  label: string;
  image: string;
  connected: boolean;
  statusLabel: string;
  capabilityTags: string[];
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

type RuntimeAttachmentSnapshot = {
  attachmentId: string;
  attachmentKind: string;
  runtimeProfileId: string;
  runtimeNodeId: string;
  label: string;
  online: boolean;
  healthy: boolean;
  ownerApproved: boolean;
  status: string;
  selfHostedNodeStatus: string;
  nodeKind: string;
  heartbeatAt: string | null;
  capabilities: string[];
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
    id: 'overview',
    label: 'Basics',
    description: 'Name the assistant and describe the customer job in plain language.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Add the menu, catalog, FAQ, sheet, or document this assistant should trust.',
  },
  {
    id: 'tools',
    label: 'Actions',
    description: 'Choose only the simple actions this assistant needs for the job.',
  },
  {
    id: 'channels',
    label: 'Customer Channels',
    description: 'Connect the customer inbox or bot when the assistant is ready for live traffic.',
  },
  {
    id: 'memory',
    label: 'Agent Memory',
    description: 'Decide whether this assistant remembers customers across conversations.',
  },
  {
    id: 'safety',
    label: 'Safety',
    description: 'Set when this assistant should involve a human.',
  },
  {
    id: 'test',
    label: 'Review',
    description: 'Review the simple launch checklist before creating the assistant.',
  },
];

const CREATE_AGENT_WIZARD_STEPS: Array<{
  id: WizardStepId;
  label: string;
  description: string;
}> = [
  {
    id: 'overview',
    label: 'Create agent',
    description: 'Name the agent. Memory, integrations, channels, and actions come after creation.',
  },
];

const AGENT_ROSTER_FILTERS: ReadonlyArray<{ id: AgentRosterFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Text' },
  { id: 'computer', label: 'Computer' },
  { id: 'connected', label: 'Connected' },
  { id: 'draft', label: 'Draft' },
];

const STUDIO_AI_TIER_OPTIONS: ReadonlyArray<{
  value: WizardState['aiTier'];
  label: string;
  hint: string;
}> = [
  { value: 'light', label: 'Fast', hint: 'Lower cost for routine customer replies.' },
  { value: 'pro', label: 'Balanced', hint: 'Recommended default for production customer support.' },
  { value: 'max', label: 'Best', hint: 'Highest answer quality when accuracy matters more than cost.' },
];

const STUDIO_API_PROVIDER_IDS = new Set([
  'anthropic',
  'azure_openai',
  'deepseek',
  'gemini',
  'groq',
  'mistral',
  'ollama_cloud',
  'openai',
  'openrouter',
  'qwen',
  'custom_openai_compatible',
  'vertex',
  'xai',
]);

const STUDIO_LOCAL_PROVIDER_IDS = new Set([
  'codex',
  'codex_cli',
  'local',
  'local_ollama',
  'ollama',
  'openai-codex',
]);

const STUDIO_RUNTIME_OPTIONS: ReadonlyArray<{
  value: WizardState['runtimePlacement'];
  label: string;
  hint: string;
  supplier: WizardState['runtimeSupplierKind'];
  capabilities: string;
  runsWhere: string;
  privacy: string;
  costRisk: string;
  setup: string;
  bestFor: string;
}> = [
  {
    value: 'managed_cloud',
    label: 'Text Agent',
    supplier: 'empyralis',
    hint: 'Cloud chat with approved tools. No browser or computer control.',
    capabilities: 'Chat, memory, knowledge lookup, and approved API-style tools.',
    runsWhere: 'Managed cloud runtime in the Empyralis control plane.',
    privacy: 'High. No direct computer access surface.',
    costRisk: 'Low to medium.',
    setup: 'No extra setup.',
    bestFor: 'Support, FAQs, triage, and policy-safe assistants.',
  },
  {
    value: 'hosted_hardware_pool',
    label: 'Cloud Computer Agent',
    supplier: 'empyralis',
    hint: 'Cloud agent with isolated computer/browser automation under policy controls.',
    capabilities: 'Browser, files, and task automation inside an isolated cloud session.',
    runsWhere: 'Isolated cloud computer managed by Empyralis.',
    privacy: 'Medium. Session activity can be logged for safety and audit.',
    costRisk: 'High.',
    setup: 'Enable computer automation policy and usage limits.',
    bestFor: 'Web workflows, operations playbooks, and guided back-office tasks.',
  },
  {
    value: 'customer_local',
    label: 'My Computer Agent',
    supplier: 'customer',
    hint: 'Agent uses a connected computer with explicit permissions.',
    capabilities: 'Local browser/files/terminal actions after explicit grants.',
    runsWhere: 'A connected computer registered to this workspace.',
    privacy: 'Very high data locality, with host-device trust responsibility.',
    costRisk: 'Medium.',
    setup: 'Connect a computer, then grant scoped permissions.',
    bestFor: 'Personal workflows and device-local automation.',
  },
  {
    value: 'customer_hosted',
    label: 'Self-Hosted Agent',
    supplier: 'customer',
    hint: 'Agent runs on a customer-owned server or self-hosted node.',
    capabilities: 'Customer-managed execution with workspace-scoped controls.',
    runsWhere: 'Customer-owned infrastructure registered to this workspace.',
    privacy: 'Highest control in your own environment.',
    costRisk: 'Variable, depends on your infrastructure.',
    setup: 'Register and maintain a healthy self-hosted node.',
    bestFor: 'Regulated environments and enterprise-owned operations.',
  },
];

const STUDIO_APPROVAL_MODE_OPTIONS: ReadonlyArray<{
  value: WizardState['approvalMode'];
  label: string;
  hint: string;
}> = [
  { value: 'guarded', label: 'Guarded', hint: 'Escalate early and require more owner confirmation.' },
  { value: 'balanced', label: 'Balanced', hint: 'Default approval posture for most assistants.' },
  { value: 'autonomous', label: 'Autonomous', hint: 'Allow more automated handling before handoff.' },
];

const STUDIO_TOOL_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'spreadsheet_read',
    label: 'Spreadsheet read',
    description: 'Read menu, availability, and daily specials from connected sheets.',
  },
  {
    id: 'spreadsheet_append',
    label: 'Spreadsheet append',
    description: 'Log confirmed orders or owner follow-ups into a connected sheet.',
  },
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

const STUDIO_ACTION_SKILL_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  requiredToolIds: string[];
}> = [
  {
    id: 'book_appointment',
    label: 'Book appointment',
    description: 'Coordinate a time, create the calendar event, and send the customer a confirmation.',
    requiredToolIds: ['calendar_write', 'gmail_send'],
  },
  {
    id: 'look_up_sheet_record',
    label: 'Look up sheet records',
    description: 'Check approved sheets before answering about availability, orders, or accounts.',
    requiredToolIds: ['spreadsheet_read'],
  },
  {
    id: 'log_workspace_note',
    label: 'Log workspace note',
    description: 'Write confirmed orders, handoff notes, or follow-up tasks to a connected sheet.',
    requiredToolIds: ['spreadsheet_append'],
  },
  {
    id: 'send_email_update',
    label: 'Send email update',
    description: 'Draft or send a customer-ready email from the connected workspace mailbox.',
    requiredToolIds: ['gmail_send'],
  },
  {
    id: 'call_approved_api',
    label: 'Call approved API',
    description: 'Use an approved webhook or API endpoint for live account, order, or inventory lookups.',
    requiredToolIds: ['http_request'],
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
    description: 'Lower cost',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended',
  },
  {
    id: 'deep',
    label: 'Deep',
    description: 'More source context',
  },
];

const RETENTION_PRESET_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'short',
    label: 'Short',
    description: 'Recent conversation only',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Normal support memory',
  },
  {
    id: 'extended',
    label: 'Extended',
    description: 'Long-running customer relationship',
  },
];

const SPECIALIST_OVERLAY_TABS: Array<{
  id: SpecialistOverlayTabId;
  label: string;
}> = [
  { id: 'overview', label: 'Overview' },
  { id: 'chat', label: 'Chat' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'ai', label: 'Model' },
  { id: 'tools', label: 'Actions' },
  { id: 'memory', label: 'Memory' },
  { id: 'connectors', label: 'Integrations' },
  { id: 'analytics', label: 'Results' },
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
    label: 'Telegram Bot',
    image: '/integrations/telegram.png',
    capabilityTags: ['Messages', 'Replies'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
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
  {
    id: 'custom_api',
    label: 'Custom API',
    image: '/integrations/webhook.png',
    connectorIds: ['webhook'],
    capabilityTags: ['API', 'Webhook'],
  },
  {
    id: 'tool_server',
    label: 'Tool server',
    image: '/integrations/github.png',
    connectorIds: ['mcp_server'],
    capabilityTags: ['MCP', 'Custom tools'],
  },
];

const STUDIO_TEMPLATES: ReadonlyArray<StudioTemplate> = [
  {
    id: 'shop_assistant',
    title: 'Shop Assistant',
    category: 'Retail',
    icon: 'SA',
    outcome: 'Answers product questions, checks availability, and captures buyer details.',
    description: 'Customer assistant for local shops, boutiques, auto-parts stores, and product catalogs.',
    setupTime: '5 min setup',
    channelLabel: 'Telegram / WhatsApp',
    requiredConnectors: ['Customer Channels', 'Product catalog'],
    defaultName: 'Shop Assistant',
    persona: 'Friendly shop assistant that helps customers choose products and asks before promising availability.',
    systemPrompt: 'Answer product questions from approved catalog sources, ask clarifying questions when the customer is unsure, capture contact details, and escalate unavailable or uncertain items to a human.',
    knowledgePlaceholder: 'Paste product catalog links, spreadsheet references, pricing notes, or availability rules here.',
    selectedToolIds: ['spreadsheet_read', 'spreadsheet_append'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'restaurant_orders',
    title: 'Restaurant Orders',
    category: 'Food service',
    icon: 'RO',
    outcome: 'Answers menu questions and confirms orders.',
    description: 'Ordering assistant for restaurants, cafes, and local kitchens.',
    setupTime: '5 min setup',
    channelLabel: 'Telegram',
    requiredConnectors: ['Telegram bot', 'Menu sheet'],
    defaultName: 'Restaurant Order Assistant',
    persona: 'Fast, friendly ordering assistant for a restaurant or cafe.',
    systemPrompt: 'Answer menu questions, check availability from connected sheets, confirm orders clearly, and escalate uncertain cases to a human.',
    knowledgePlaceholder: 'Paste a menu PDF, Google Sheet, or daily specials source here.',
    selectedToolIds: ['spreadsheet_read', 'spreadsheet_append'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'dental_receptionist',
    title: 'Dental Receptionist',
    category: 'Healthcare admin',
    icon: 'DR',
    outcome: 'Answers clinic FAQs, collects appointment needs, and routes urgent cases.',
    description: 'Front-desk assistant for dental clinics that need safe intake, FAQ answers, and booking handoff.',
    setupTime: '6 min setup',
    channelLabel: 'Telegram / Email',
    requiredConnectors: ['Clinic FAQ', 'Calendar'],
    defaultName: 'Dental Receptionist',
    persona: 'Polite dental front-desk assistant that answers only approved clinic information and routes medical uncertainty to staff.',
    systemPrompt: 'Answer clinic FAQs from approved knowledge, collect preferred appointment times and contact details, avoid diagnosis or medical advice, and escalate pain, emergency, billing, or uncertain cases to the clinic team.',
    knowledgePlaceholder: 'Paste clinic hours, services, insurance notes, booking rules, and emergency routing instructions here.',
    selectedToolIds: ['calendar_write', 'gmail_send'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'real_estate_leads',
    title: 'Real Estate Leads',
    category: 'Sales',
    icon: 'RE',
    outcome: 'Captures requirements and books follow-up.',
    description: 'Lead intake assistant for brokers, agents, and property teams.',
    setupTime: '6 min setup',
    channelLabel: 'Telegram / Email',
    requiredConnectors: ['Lead channel', 'Calendar'],
    defaultName: 'Real Estate Lead Assistant',
    persona: 'Calm, concise lead qualification assistant for real estate inquiries.',
    systemPrompt: 'Ask for location, budget, timing, property type, and contact preference. Summarize qualified leads and schedule follow-up when calendar access is available.',
    knowledgePlaceholder: 'Paste listing sheet, neighborhood notes, or qualification rules here.',
    selectedToolIds: ['calendar_write', 'gmail_send', 'spreadsheet_append'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'support_faq',
    title: 'Support FAQ',
    category: 'Customer support',
    icon: 'SF',
    outcome: 'Answers common questions and escalates edge cases.',
    description: 'FAQ assistant for product, account, delivery, or policy questions.',
    setupTime: '4 min setup',
    channelLabel: 'Email / Chat',
    requiredConnectors: ['FAQ source', 'Support inbox'],
    defaultName: 'Support FAQ Assistant',
    persona: 'Clear support assistant that answers from approved knowledge only.',
    systemPrompt: 'Answer only from approved knowledge sources. Ask clarifying questions when needed and escalate unsupported or account-sensitive issues to a human.',
    knowledgePlaceholder: 'Paste help center links, policy docs, or faq:// references here.',
    selectedToolIds: ['web_search', 'http_request', 'gmail_send'],
    memoryEnabled: false,
    contextBudgetPreset: 'compact',
  },
  {
    id: 'appointment_booking',
    title: 'Appointment Booking',
    category: 'Scheduling',
    icon: 'AB',
    outcome: 'Finds a time, confirms, and writes calendar events.',
    description: 'Booking assistant for salons, clinics, services, and local businesses.',
    setupTime: '5 min setup',
    channelLabel: 'Telegram / Email',
    requiredConnectors: ['Calendar', 'Customer Channels'],
    defaultName: 'Appointment Booking Assistant',
    persona: 'Polite scheduling assistant that confirms details before booking.',
    systemPrompt: 'Collect service type, preferred date and time, customer contact details, and confirmation. Write calendar events only after details are clear.',
    knowledgePlaceholder: 'Add service list, booking rules, and availability source here.',
    selectedToolIds: ['calendar_write', 'gmail_send'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'spreadsheet_catalog',
    title: 'Spreadsheet Catalog Bot',
    category: 'Catalog',
    icon: 'SC',
    outcome: 'Looks up rows and answers from a live catalog.',
    description: 'Assistant for products, SKUs, menus, inventory, or internal catalogs.',
    setupTime: '3 min setup',
    channelLabel: 'Any channel',
    requiredConnectors: ['Spreadsheet'],
    defaultName: 'Catalog Assistant',
    persona: 'Accurate catalog assistant that prefers exact matches and asks when ambiguous.',
    systemPrompt: 'Use connected spreadsheets as the source of truth. Return exact row details when possible and ask for clarification when there are multiple matches.',
    knowledgePlaceholder: 'Add sheet://catalog or paste the spreadsheet reference here.',
    selectedToolIds: ['spreadsheet_read', 'spreadsheet_append'],
    memoryEnabled: false,
    contextBudgetPreset: 'compact',
  },
  {
    id: 'telegram_sales',
    title: 'Telegram Sales Bot',
    category: 'Sales',
    icon: 'TS',
    outcome: 'Responds to inbound leads and captures next action.',
    description: 'General Telegram sales assistant for SMB customer conversations.',
    setupTime: '5 min setup',
    channelLabel: 'Telegram',
    requiredConnectors: ['Telegram bot', 'Sales notes'],
    defaultName: 'Telegram Sales Assistant',
    persona: 'Direct, friendly sales assistant for Telegram customer conversations.',
    systemPrompt: 'Answer product questions, qualify intent, capture contact details, and escalate high-intent or uncertain cases to a human.',
    knowledgePlaceholder: 'Paste product pages, pricing notes, or sales sheet references here.',
    selectedToolIds: ['spreadsheet_read', 'web_search', 'gmail_send'],
    memoryEnabled: true,
    contextBudgetPreset: 'balanced',
  },
  {
    id: 'github_triage',
    title: 'GitHub Triage',
    category: 'Engineering',
    icon: 'GT',
    outcome: 'Summarizes issues and routes work.',
    description: 'Engineering assistant for issue triage, release notes, and team summaries.',
    setupTime: '8 min setup',
    channelLabel: 'GitHub / Email',
    requiredConnectors: ['GitHub', 'Email'],
    defaultName: 'GitHub Triage Assistant',
    persona: 'Precise engineering triage assistant that keeps summaries factual and actionable.',
    systemPrompt: 'Summarize issues, extract blockers, identify owners when available, and avoid changing code unless explicitly approved.',
    knowledgePlaceholder: 'Paste repository, issue board, or release-note source references here.',
    selectedToolIds: ['http_request', 'gmail_send'],
    memoryEnabled: false,
    contextBudgetPreset: 'deep',
  },
];

const DEFAULT_STUDIO_TEMPLATE = STUDIO_TEMPLATES[0]!;
const PRIMARY_STUDIO_TEMPLATE_ORDER = [
  'shop_assistant',
  'restaurant_orders',
  'dental_receptionist',
  'support_faq',
] as const;
const PRIMARY_STUDIO_TEMPLATE_IDS = new Set<string>(PRIMARY_STUDIO_TEMPLATE_ORDER);
const CUSTOM_STUDIO_TEMPLATE: StudioTemplate = {
  id: 'custom_agent',
  title: 'Custom Agent',
  category: 'Blank',
  icon: '+',
  outcome: 'Build a private assistant from your own instructions.',
  description: 'Start with a clean draft when none of the templates match the job.',
  setupTime: 'Custom setup',
  channelLabel: 'Choose later',
  requiredConnectors: ['Choose tools', 'Choose channel'],
  defaultName: '',
  persona: '',
  systemPrompt: '',
  knowledgePlaceholder: 'Add the trusted sources this assistant should use.',
  selectedToolIds: [],
  memoryEnabled: false,
  contextBudgetPreset: 'balanced',
};

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

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
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

function normalizeRuntimeAttachments(payload: unknown): RuntimeAttachmentSnapshot[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const attachments = (payload as Record<string, unknown>).attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }
  return attachments
    .map((item) => readRecord(item))
    .map((item) => ({
      attachmentId: readString(item.attachment_id),
      attachmentKind: readString(item.attachment_kind),
      runtimeProfileId: readString(item.runtime_profile_id),
      runtimeNodeId: readString(item.runtime_node_id),
      label: readString(item.label, 'Self-hosted node'),
      online: readBoolean(item.online),
      healthy: readBoolean(item.healthy),
      ownerApproved: readBoolean(item.owner_approved),
      status: readString(item.status),
      selfHostedNodeStatus: readString(item.self_hosted_node_status),
      nodeKind: readString(item.node_kind),
      heartbeatAt: readOptionalString(item.heartbeat_at ?? item.last_seen_at),
      capabilities: normalizeLabelList(item.capabilities),
    }))
    .filter((item) => item.attachmentKind === 'self_hosted_business_node');
}

function selfHostedNodeGateReason(node: RuntimeAttachmentSnapshot | null): string | null {
  if (!node) {
    return 'Select a self-hosted node.';
  }
  if (!node.runtimeProfileId) {
    return 'Selected node is missing its binding id.';
  }
  if (!node.ownerApproved) {
    return 'Selected node is not owner-approved.';
  }
  if (!node.online) {
    return 'Selected node is offline.';
  }
  if (!node.healthy) {
    return 'Selected node is unhealthy.';
  }
  const status = node.selfHostedNodeStatus.toLowerCase();
  if (status === 'revoked') {
    return 'Selected node is revoked.';
  }
  return null;
}

function selfHostedNodeHealthLabel(node: RuntimeAttachmentSnapshot | null): string {
  if (!node) {
    return 'Not selected';
  }
  if (!node.ownerApproved) {
    return 'Pending owner approval';
  }
  if (!node.online) {
    return 'Offline';
  }
  if (!node.healthy) {
    return 'Unhealthy';
  }
  return 'Online and healthy';
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

function hasEnabledChannel(channels: unknown, channelKey: string): boolean {
  return readRecord(readRecord(channels)[channelKey]).enabled === true;
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
      kind: inferKnowledgeSourceKind(uri),
    }));
}

function inferKnowledgeSourceKind(uri: string): string {
  const token = uri.trim().toLowerCase();
  if (token.startsWith('http://') || token.startsWith('https://')) {
    return 'Website';
  }
  if (token.startsWith('sheet://') || token.includes('docs.google.com/spreadsheets')) {
    return 'Table or sheet';
  }
  if (token.startsWith('app://') || token.startsWith('drive://') || token.includes('docs.google.com/document')) {
    return 'App document';
  }
  if (token.startsWith('note://') || token.startsWith('text://')) {
    return 'Manual note';
  }
  return 'File or document';
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

function mapSeedToolToStudioToolId(toolId: string): string {
  const normalized = toolId.trim().toLowerCase();
  if (normalized.includes('catalog') || normalized.includes('menu') || normalized.includes('availability_read')) {
    return 'spreadsheet_read';
  }
  if (normalized.includes('capture') || normalized.includes('request') || normalized.includes('confirmation')) {
    return 'spreadsheet_append';
  }
  if (normalized.includes('calendar') || normalized.includes('appointment')) {
    return 'calendar_write';
  }
  if (normalized.includes('handoff')) {
    return 'gmail_send';
  }
  return normalized;
}

function normalizeTemplateToken(value: string): string {
  return value.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function studioTemplateById(
  templateId: string | null | undefined,
  templates: ReadonlyArray<StudioTemplate> = STUDIO_TEMPLATES,
): StudioTemplate {
  const normalizedTemplateId = normalizeTemplateToken(readString(templateId));
  if (!normalizedTemplateId) {
    return templates[0] ?? DEFAULT_STUDIO_TEMPLATE;
  }
  if (normalizedTemplateId === normalizeTemplateToken(CUSTOM_STUDIO_TEMPLATE.id)) {
    return CUSTOM_STUDIO_TEMPLATE;
  }
  return templates.find((template) => normalizeTemplateToken(template.id) === normalizedTemplateId)
    ?? templates[0]
    ?? DEFAULT_STUDIO_TEMPLATE;
}

function mapStudioSeedToTemplate(seed: StudioProofAgentSeedRecord): StudioTemplate | null {
  const slug = readString(seed.slug);
  const name = readString(seed.name);
  if (!slug || !name) {
    return null;
  }
  const persona = readRecord(seed.persona);
  const runtime = readRecord(seed.runtime_tier_recommendation);
  const dataSources = Array.isArray(seed.default_data_sources)
    ? seed.default_data_sources.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const channels = Array.isArray(seed.channels)
    ? seed.channels.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const tools = Array.isArray(seed.tools_skills)
    ? seed.tools_skills.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const requiredConnectors = [
    ...dataSources.map((item) => readString(item.label, readString(item.source_id))).filter(Boolean),
    ...channels
      .filter((item) => readBoolean(item.default_enabled))
      .map((item) => readString(item.label, readString(item.channel_key)))
      .filter(Boolean),
  ];
  const selectedToolIds = normalizeToolIds(
    tools
      .filter((item) => readBoolean(item.default_enabled))
      .map((item) => mapSeedToolToStudioToolId(readString(item.id))),
  );
  const personaRole = readString(persona.role);
  const personaTone = readString(persona.tone);
  const instructions = Array.isArray(persona.instructions)
    ? persona.instructions.map((item) => readString(item)).filter(Boolean)
    : [];
  return {
    id: normalizeTemplateToken(slug),
    title: name,
    category: readString(seed.category, 'Specialist'),
    icon: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'AI',
    outcome: readString(seed.description, 'Customize and deploy this assistant.'),
    description: readString(seed.description, 'Backend-defined assistant template.'),
    setupTime: '5 min setup',
    channelLabel: channels.map((item) => readString(item.label, readString(item.channel_key))).filter(Boolean).slice(0, 3).join(' / ') || 'Choose later',
    requiredConnectors: requiredConnectors.length ? requiredConnectors.slice(0, 4) : ['Connect live data'],
    defaultName: readString(persona.default_name, name),
    persona: [personaRole, personaTone].filter(Boolean).join(' — ') || readString(seed.description),
    systemPrompt: instructions.join('\n') || readString(seed.description),
    knowledgePlaceholder: dataSources.length
      ? dataSources.map((item) => `${readString(item.label, readString(item.source_id))}: ${readString(item.kind, 'source')}`).join('\n')
      : 'Add trusted docs, spreadsheets, URLs, or live data sources here.',
    selectedToolIds: selectedToolIds.length ? selectedToolIds : ['web_search'],
    memoryEnabled: true,
    contextBudgetPreset: readString(runtime.tier).includes('hosted') ? 'balanced' : 'deep',
  };
}

function normalizeStudioTemplates(payload: unknown): StudioTemplate[] {
  const seedTemplates = readItems<StudioProofAgentSeedRecord>(payload)
    .map(mapStudioSeedToTemplate)
    .filter((item): item is StudioTemplate => Boolean(item));
  if (!seedTemplates.length) {
    return sortStudioTemplatesForBusinessFlow(STUDIO_TEMPLATES);
  }
  const seedIds = new Set(seedTemplates.map((template) => normalizeTemplateToken(template.id)));
  const primaryFallbacks = STUDIO_TEMPLATES.filter((template) => (
    PRIMARY_STUDIO_TEMPLATE_IDS.has(normalizeTemplateToken(template.id))
    && !seedIds.has(normalizeTemplateToken(template.id))
  ));
  const staticExtras = STUDIO_TEMPLATES.filter((template) => {
    const templateId = normalizeTemplateToken(template.id);
    return !seedIds.has(templateId) && !PRIMARY_STUDIO_TEMPLATE_IDS.has(templateId);
  });
  return sortStudioTemplatesForBusinessFlow([
    ...seedTemplates,
    ...primaryFallbacks,
    ...staticExtras,
  ]);
}

function sortStudioTemplatesForBusinessFlow(templates: ReadonlyArray<StudioTemplate>): StudioTemplate[] {
  return [...templates].sort((left, right) => {
    const leftRank = PRIMARY_STUDIO_TEMPLATE_ORDER.indexOf(normalizeTemplateToken(left.id) as typeof PRIMARY_STUDIO_TEMPLATE_ORDER[number]);
    const rightRank = PRIMARY_STUDIO_TEMPLATE_ORDER.indexOf(normalizeTemplateToken(right.id) as typeof PRIMARY_STUDIO_TEMPLATE_ORDER[number]);
    const normalizedLeftRank = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
    const normalizedRightRank = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;
    return normalizedLeftRank - normalizedRightRank;
  });
}

function applyStudioTemplate(state: WizardState, template: StudioTemplate): WizardState {
  const usesTelegram = template.channelLabel.toLowerCase().includes('telegram');
  return {
    ...state,
    name: template.defaultName || state.name,
    persona: template.persona || '',
    systemPrompt: template.systemPrompt || '',
    knowledgeSourceText: template.id === CUSTOM_STUDIO_TEMPLATE.id ? '' : state.knowledgeSourceText,
    selectedToolIds: template.selectedToolIds,
    memoryEnabled: template.memoryEnabled,
    contextBudgetPreset: template.contextBudgetPreset,
    customerChannel: usesTelegram ? 'telegram' : state.customerChannel,
    telegramEnabled: usesTelegram,
  };
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

function studioProviderRank(providerId: string): number {
  switch (providerId) {
    case 'gemini':
      return 0;
    case 'openai':
      return 1;
    case 'anthropic':
      return 2;
    case 'openrouter':
      return 3;
    case 'groq':
      return 4;
    case 'xai':
      return 5;
    case 'deepseek':
      return 6;
    case 'mistral':
      return 7;
    case 'qwen':
      return 8;
    case 'vertex':
      return 9;
    case 'azure_openai':
      return 10;
    case 'bedrock':
      return 11;
    case 'custom_openai_compatible':
      return 12;
    default:
      return 99;
  }
}

function isStudioApiProvider(
  providerId: string,
  provider: ProviderCatalogRecord,
  providerScopes: string[],
): boolean {
  const normalizedProviderId = providerId.trim().toLowerCase();
  if (!normalizedProviderId || STUDIO_LOCAL_PROVIDER_IDS.has(normalizedProviderId)) {
    return false;
  }
  if (provider.local_only === true) {
    return false;
  }
  if (providerScopes.some((scope) => scope.includes('local') || scope.includes('cli'))) {
    return false;
  }
  return providerScopes.includes('studio_safe') || STUDIO_API_PROVIDER_IDS.has(normalizedProviderId);
}

function normalizeProviderCatalog(payload: unknown): ProviderCatalogSnapshot[] {
  return readProviderCatalogItems(payload)
    .map((provider) => {
      const providerId = readString(provider.id);
      if (!providerId || readString(provider.kind).toLowerCase() !== 'provider' || provider.hidden === true) {
        return null;
      }
      const providerScopes = Array.isArray(provider.provider_scopes)
        ? provider.provider_scopes.map((item) => readString(item).toLowerCase()).filter(Boolean)
        : [];
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
            supportsVision: model.supports_vision === true,
            supportsJson: model.supports_json === true,
            supportsReasoning: model.supports_reasoning === true,
            localSelfHostedCompatible: model.local_self_hosted_compatible === true,
            pricingKnown: model.pricing_known === true || readNumber(model.input_cost_per_1k_usd) !== null || readNumber(model.output_cost_per_1k_usd) !== null,
            source: readOptionalString(model.source),
            fetchedAt: readOptionalString(model.fetched_at),
            lifecycle: readOptionalString(model.lifecycle),
            capabilityLabels: normalizeLabelList(model.capability_labels),
          }))
          .filter((item) => item.id)
        : [];
      return {
        id: providerId,
        label: readString(provider.label, humanizeToken(providerId, providerId)),
        state: readString(provider.state, 'unknown'),
        defaultModel: readOptionalString(provider.default_model),
        studioVisible: isStudioApiProvider(providerId, provider, providerScopes),
        providerScopes,
        privacyPosture: readOptionalString(provider.privacy_posture),
        jurisdiction: readOptionalString(provider.jurisdiction),
        residency: readOptionalString(provider.residency),
        localSelfHostedCompatible: provider.local_self_hosted_compatible === true,
        capabilityLabels: normalizeLabelList(provider.capability_labels),
        modelsSource: readOptionalString(provider.models_source),
        modelsSyncedAt: readOptionalString(provider.models_synced_at),
        modelsExpiresAt: readOptionalString(provider.models_expires_at),
        modelsError: readOptionalString(provider.models_error),
        models,
      } satisfies ProviderCatalogSnapshot;
    })
    .filter((item): item is ProviderCatalogSnapshot => Boolean(item))
    .filter((item) => item.studioVisible)
    .sort((left, right) => {
      const rankDelta = studioProviderRank(left.id) - studioProviderRank(right.id);
      if (rankDelta !== 0) {
        return rankDelta;
      }
      return left.label.localeCompare(right.label);
    });
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

function providerIsReadyForStudio(provider: ProviderCatalogSnapshot | null | undefined): boolean {
  const state = readString(provider?.state).toLowerCase();
  return ['ready', 'connected', 'active', 'configured'].includes(state);
}

function agentModelDeployBlocker(
  agent: DeployedAgentRecord | null | undefined,
  catalogByProvider: Record<string, ProviderCatalogSnapshot>,
): string | null {
  if (!agent) {
    return null;
  }
  const providerId = selectedProviderId(agent);
  const modelId = selectedModelId(agent);
  if (!providerId || !modelId) {
    return 'Connect a model provider before launch.';
  }
  const provider = catalogByProvider[providerId] ?? null;
  if (!provider || !providerIsReadyForStudio(provider)) {
    return 'Connect a model provider before launch.';
  }
  return null;
}

function normalizeWizardAiTier(value: unknown): WizardState['aiTier'] {
  const token = readString(value).toLowerCase().replace('-', '_');
  if (token === 'light' || token === 'pro' || token === 'max') {
    return token;
  }
  return 'pro';
}

function normalizeRuntimePlacement(value: unknown): WizardState['runtimePlacement'] {
  const token = readString(value).toLowerCase().replace('-', '_');
  if (
    token === 'hosted_hardware_pool'
    || token === 'empyralis_hosted'
    || token === 'empyralis_hosted_device'
    || token === 'empyralis_hardware_pool'
  ) {
    return 'hosted_hardware_pool';
  }
  if (
    token === 'local'
    || token === 'local_secure'
    || token === 'local_companion'
    || token === 'local_computer'
    || token === 'customer_local'
    || token === 'this_computer'
  ) {
    return 'customer_local';
  }
  if (
    token === 'self_hosted'
    || token === 'self_hosted_business'
    || token === 'self_host_runtime'
    || token === 'customer_hosted'
    || token === 'self_hosted_business_node'
  ) {
    return 'customer_hosted';
  }
  return 'managed_cloud';
}

function runtimeTargetForPlacement(value: WizardState['runtimePlacement']): string {
  if (value === 'customer_local') {
    return 'local';
  }
  if (value === 'customer_hosted') {
    return 'self_hosted';
  }
  return 'cloud';
}

function runtimeSupplierForPlacement(value: WizardState['runtimePlacement']): WizardState['runtimeSupplierKind'] {
  return STUDIO_RUNTIME_OPTIONS.find((item) => item.value === value)?.supplier ?? 'empyralis';
}

function runtimePlacementLabel(value: unknown): string {
  const placement = normalizeRuntimePlacement(value);
  return STUDIO_RUNTIME_OPTIONS.find((item) => item.value === placement)?.label ?? 'Text Agent';
}

function testRuntimeModeForPlacement(value: unknown): string {
  const placement = normalizeRuntimePlacement(value);
  if (placement === 'customer_hosted') {
    return 'self_hosted_agent';
  }
  if (placement === 'customer_local') {
    return 'my_computer_agent';
  }
  if (placement === 'hosted_hardware_pool') {
    return 'cloud_computer_agent';
  }
  return 'text_agent';
}

function agentRuntimePlacement(agent: DeployedAgentRecord | null | undefined): WizardState['runtimePlacement'] {
  const config = readRecord(agent?.config);
  const metadata = readRecord(agent?.metadata);
  return normalizeRuntimePlacement(
    config.runtime_placement
    ?? metadata.runtime_placement
    ?? agent?.runtime_target,
  );
}

function agentModeBucket(agent: DeployedAgentRecord | null | undefined): 'text' | 'computer' {
  return agentRuntimePlacement(agent) === 'managed_cloud' ? 'text' : 'computer';
}

function agentMatchesRosterFilter(agent: DeployedAgentRecord, filterId: AgentRosterFilterId): boolean {
  if (filterId === 'all') {
    return true;
  }
  if (filterId === 'text' || filterId === 'computer') {
    return agentModeBucket(agent) === filterId;
  }
  if (filterId === 'connected') {
    return listEnabledChannels(agent.channels).length > 0;
  }
  const state = readString(agent.deployment_state).toLowerCase();
  return state !== 'live';
}

function normalizeApprovalModeFromPolicies(escalationPreset: unknown, handoffMode: unknown): WizardState['approvalMode'] {
  const escalation = readString(escalationPreset).toLowerCase();
  const handoff = readString(handoffMode).toLowerCase();
  if (escalation === 'conservative' || handoff === 'pause_thread') {
    return 'guarded';
  }
  if (escalation === 'autonomous' || handoff === 'summary_only') {
    return 'autonomous';
  }
  return 'balanced';
}

function applyApprovalModeToWizardState(
  mode: WizardState['approvalMode'],
  current: Pick<WizardState, 'escalationPreset' | 'handoffMode'>,
): Pick<WizardState, 'escalationPreset' | 'handoffMode'> {
  if (mode === 'guarded') {
    return {
      escalationPreset: 'conservative',
      handoffMode: 'pause_thread',
    };
  }
  if (mode === 'autonomous') {
    return {
      escalationPreset: 'autonomous',
      handoffMode: 'summary_only',
    };
  }
  return {
    escalationPreset: 'standard',
    handoffMode: current.handoffMode === 'summary_only' ? 'notify_owner' : current.handoffMode || 'notify_owner',
  };
}

function inferCustomerChannel(channels: Record<string, unknown>): WizardState['customerChannel'] {
  if (readRecord(channels.telegram).enabled === true) {
    return 'telegram';
  }
  if (readRecord(channels.whatsapp).enabled === true) {
    return 'whatsapp';
  }
  if (readRecord(channels.web_widget).enabled === true) {
    return 'web_widget';
  }
  return 'draft';
}

function inferAiTierFromProviderModel(providerId: string, modelId: string): WizardState['aiTier'] {
  const model = modelId.trim().toLowerCase();
  if (/flash|mini|haiku|small|lite|fast/.test(model)) {
    return 'light';
  }
  if (/opus|max|premium|large|gpt-5\.5/.test(model)) {
    return 'max';
  }
  return 'pro';
}

function modelPreferenceScore(model: ProviderCatalogModelSnapshot, tier: WizardState['aiTier']): number {
  const id = `${model.id} ${model.label}`.toLowerCase();
  if (tier === 'light') {
    if (/flash|mini|haiku|small|lite|fast/.test(id)) {
      return 0;
    }
    return model.inputCostPer1kUsd !== null ? 10 + model.inputCostPer1kUsd : 50;
  }
  if (tier === 'max') {
    if (/opus|max|premium|large|gpt-5\.2|gpt-5\.5/.test(id)) {
      return 0;
    }
    if (/pro|sonnet|gpt-5|reason/.test(id)) {
      return 4;
    }
    return 20;
  }
  if (/pro|sonnet|gpt-5|reason/.test(id)) {
    return 0;
  }
  if (/flash|mini|haiku|small|lite|fast/.test(id)) {
    return 8;
  }
  return 4;
}

function pickStudioModelForTier(provider: ProviderCatalogSnapshot, tier: WizardState['aiTier']): string {
  if (provider.models.length === 0) {
    return '';
  }
  const rankedModels = [...provider.models].sort((left, right) => {
    const scoreDelta = modelPreferenceScore(left, tier) - modelPreferenceScore(right, tier);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.label.localeCompare(right.label);
  });
  const defaultModel = provider.defaultModel && provider.models.some((item) => item.id === provider.defaultModel)
    ? provider.defaultModel
    : '';
  return rankedModels[0]?.id || defaultModel || provider.models[0]?.id || '';
}

function resolveProviderModelForTier(
  tier: WizardState['aiTier'],
  catalog: ProviderCatalogSnapshot[],
): { providerId: string; modelId: string } {
  const catalogByProvider = providerCatalogById(catalog);
  const providerOrder = ['gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'xai', 'deepseek', 'mistral', 'qwen', 'azure_openai', 'vertex', 'ollama_cloud', 'custom_openai_compatible'];
  for (const providerId of providerOrder) {
    const provider = catalogByProvider[providerId] ?? null;
    if (provider && provider.models.length > 0) {
      return {
        providerId: provider.id,
        modelId: pickStudioModelForTier(provider, tier),
      };
    }
  }
  const fallbackProvider = catalogByProvider.gemini ? catalogByProvider.gemini : catalog[0] ?? null;
  if (!fallbackProvider) {
    return {
      providerId: '',
      modelId: '',
    };
  }
  const fallbackModel = fallbackProvider.defaultModel && fallbackProvider.models.some((item) => item.id === fallbackProvider.defaultModel)
    ? fallbackProvider.defaultModel
    : fallbackProvider.models[0]?.id || '';
  return {
    providerId: fallbackProvider.id,
    modelId: fallbackModel,
  };
}

function applyProviderCatalogDefaults(
  state: WizardState,
  catalog: ProviderCatalogSnapshot[],
): WizardState {
  if (catalog.length === 0) {
    return state;
  }
  const tierRoute = resolveProviderModelForTier(state.aiTier, catalog);
  const catalogByProvider = providerCatalogById(catalog);
  const preferredProviderId = tierRoute.providerId || (catalogByProvider.gemini ? 'gemini' : catalog[0]?.id || '');
  const providerId = state.providerId && catalogByProvider[state.providerId]
    ? state.providerId
    : preferredProviderId;
  const provider = catalogByProvider[providerId] ?? null;
  const availableModels = provider?.models ?? [];
  const preferredModelId = providerId === tierRoute.providerId ? tierRoute.modelId : '';
  const nextModelId = state.modelId && availableModels.some((item) => item.id === state.modelId)
    ? state.modelId
    : preferredModelId && availableModels.some((item) => item.id === preferredModelId)
      ? preferredModelId
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
  const isNewDraft = !agent;
  const channels = readRecord(agent?.channels);
  const telegram = readRecord(channels.telegram);
  const config = readRecord(agent?.config);
  const customerPolicy = readRecord(config.customer_policy);
  const memoryPolicy = readRecord(config.memory_policy);
  const safetyPolicy = readRecord(config.safety_policy);
  const commercePolicy = readRecord(config.commerce_policy);
  const escalationPolicy = readRecord(config.escalation_policy);
  const computerAutomation = readRecord(config.computer_automation ?? readRecord(agent?.metadata).computer_automation);
  const metadata = readRecord(agent?.metadata);
  const selfHostedBinding = readRecord(metadata.self_hosted_runtime_binding);
  const privacyContractSnapshot = readRecord(metadata.privacy_contract_snapshot);
  const computerSafetyContractSnapshot = readRecord(metadata.computer_safety_contract_snapshot);
  const runtimeSupply = readRecord(config.runtime_supply ?? metadata.runtime_supply);
  const runtimeSupplySupplier = readRecord(runtimeSupply.supplier);
  const runtimeSupplyMarketplace = readRecord(runtimeSupply.marketplace_policy);
  const providerId = readString(agent?.provider ?? metadata.provider);
  const modelId = readString(agent?.model ?? metadata.model);
  const aiTier = normalizeWizardAiTier(
    metadata.public_tier
    ?? metadata.model_tier
    ?? metadata.empyralis_model_tier
    ?? inferAiTierFromProviderModel(providerId, modelId),
  );
  const customerChannel = inferCustomerChannel(channels);
  const runtimePlacement = normalizeRuntimePlacement(
    readRecord(runtimeSupply.placement).kind
    ?? config.runtime_placement
    ?? metadata.runtime_placement
    ?? metadata.studio_runtime
    ?? metadata.runtime
    ?? agent?.runtime_target,
  );
  const runtimeSupplierKind = readString(runtimeSupplySupplier.kind) === 'customer'
    ? 'customer'
    : readString(runtimeSupplySupplier.kind) === 'third_party_certified'
      ? 'third_party_certified'
      : runtimeSupplierForPlacement(runtimePlacement);
  const approvalMode = normalizeApprovalModeFromPolicies(
    escalationPolicy.preset ?? metadata.escalation_preset,
    escalationPolicy.handoff_mode ?? metadata.handoff_mode,
  );
  const selectedToolIds = normalizeToolIds(readRecord(config.tool_policy).enabled_tools ?? metadata.selected_tool_ids);
  return {
    name: readString(agent?.name),
    avatar: readString(agent?.avatar),
    persona: readString(agent?.persona, DEFAULT_SAFE_AGENT_PERSONA),
    systemPrompt: readString(
      agent?.system_prompt,
      DEFAULT_SAFE_AGENT_SYSTEM_PROMPT,
    ),
    knowledgeSourceText: serializeKnowledgeSources(agent?.knowledge_sources),
    aiTier,
    runtimeSupplierKind,
    runtimeSupplierId: readString(runtimeSupplySupplier.id, runtimeSupplierKind),
    runtimeSupplierLabel: readString(runtimeSupplySupplier.label, runtimeSupplierKind === 'empyralis' ? 'Empyralis' : 'Customer-owned compute'),
    runtimePlacement,
    marketplacePublishAllowed: readString(runtimeSupplyMarketplace.visibility) === 'marketplace',
    thirdPartyRuntimeAllowed: runtimeSupplyMarketplace.third_party_runtime_allowed === true,
    computerAutomationEnabled: computerAutomation.enabled === true,
    computerAutomationRuntimeClass: readString(computerAutomation.runtime_class, 'virtual_browser') as WizardState['computerAutomationRuntimeClass'],
    computerAutomationAllowedDomains: Array.isArray(computerAutomation.allowed_domains)
      ? computerAutomation.allowed_domains.map((item) => readString(item)).filter(Boolean).join(', ')
      : '',
    computerAutomationMaxSessions: readIntegerString(computerAutomation.max_concurrent_sessions) || '1',
    computerAutomationDailyBudgetUsd: readPositiveDecimalString(computerAutomation.daily_budget_usd),
    computerAutomationMonthlyBudgetUsd: readPositiveDecimalString(computerAutomation.monthly_budget_usd),
    approvalMode,
    customerChannel,
    telegramEnabled: customerChannel === 'telegram' && telegram.enabled === true,
    telegramConnectorId: readString(telegram.connector_id ?? telegram.credential_id),
    telegramEndpointKey: readString(telegram.endpoint_key),
    providerId,
    modelId,
    runtimeTarget: readString(agent?.runtime_target, runtimeTargetForPlacement(runtimePlacement)),
    selfHostedRuntimeProfileId: readString(
      config.runtime_profile_id
      ?? selfHostedBinding.runtime_profile_id
      ?? metadata.runtime_profile_id,
    ),
    selfHostedPrivacyAccepted: Boolean(
      readOptionalString(privacyContractSnapshot.accepted_at)
      || readOptionalString(metadata.privacy_contract_accepted_at),
    ),
    selfHostedSafetyAccepted: Boolean(
      readOptionalString(computerSafetyContractSnapshot.accepted_at)
      || readOptionalString(metadata.computer_safety_contract_accepted_at),
    ),
    billingPlan: readString(agent?.billing_plan, 'free'),
    selectedToolIds: selectedToolIds.length > 0 ? selectedToolIds : ['spreadsheet_read', 'spreadsheet_append'],
    memoryEnabled: agent
      ? memoryPolicy.memory_enabled === true || metadata.memory_enabled === true
      : false,
    contextBudgetPreset: readString(memoryPolicy.context_budget_preset ?? metadata.context_budget_preset, 'balanced'),
    retentionPreset: readString(memoryPolicy.retention_preset ?? metadata.retention_preset, 'standard'),
    healthSafetyEnabled: safetyPolicy.health_safety_enabled === true || metadata.health_safety_enabled === true,
    healthSafetyAssistantName: readString(safetyPolicy.assistant_name ?? metadata.health_safety_assistant_name),
    pausedMessage: readString(customerPolicy.paused_message ?? metadata.paused_message),
    welcomeIntro: readString(customerPolicy.public_intro ?? metadata.public_intro, isNewDraft ? 'Scan to browse the menu, check specials, and place an order in minutes.' : ''),
    welcomeCoreValue: readString(customerPolicy.public_core_value ?? metadata.public_core_value, isNewDraft ? 'Menu answers, availability, and order confirmation in one Telegram flow.' : ''),
    publicStartCtaLabel: readString(customerPolicy.public_start_cta_label ?? metadata.platform_cta_label, isNewDraft ? 'Open menu' : ''),
    publicStartCtaUrl: readString(customerPolicy.public_start_cta_url ?? metadata.platform_cta_url),
    escalationPreset: readString(escalationPolicy.preset ?? metadata.escalation_preset, 'standard'),
    handoffMode: readString(escalationPolicy.handoff_mode ?? metadata.handoff_mode, 'notify_owner'),
    ownerNotificationDestination: readString(
      escalationPolicy.owner_notification_destination ?? metadata.owner_notification_destination,
    ),
    dailyMessageLimit: readIntegerString(customerPolicy.daily_message_limit ?? metadata.daily_message_limit),
    monthlyCostCapUsd: readPositiveDecimalString(
      commercePolicy.monthly_cost_cap_usd ?? metadata.monthly_cost_cap_usd,
    ) || DEFAULT_SAFE_MONTHLY_COST_CAP_USD,
    upgradeCtaUrl: readString(customerPolicy.upgrade_cta_url ?? metadata.upgrade_cta_url),
    upgradeCtaLabel: readString(customerPolicy.upgrade_cta_label ?? metadata.upgrade_cta_label),
  };
}

function buildCreateDraftWizardState(state: WizardState): WizardState {
  return {
    ...state,
    persona: DEFAULT_SAFE_AGENT_PERSONA,
    systemPrompt: DEFAULT_SAFE_AGENT_SYSTEM_PROMPT,
    knowledgeSourceText: '',
    selectedToolIds: [],
    memoryEnabled: false,
    customerChannel: 'draft',
    telegramEnabled: false,
    telegramConnectorId: '',
    telegramEndpointKey: '',
    runtimePlacement: 'managed_cloud',
    runtimeTarget: runtimeTargetForPlacement('managed_cloud'),
    runtimeSupplierKind: runtimeSupplierForPlacement('managed_cloud'),
    runtimeSupplierId: 'empyralis',
    runtimeSupplierLabel: 'Empyralis',
    selfHostedRuntimeProfileId: '',
    selfHostedPrivacyAccepted: false,
    selfHostedSafetyAccepted: false,
    computerAutomationEnabled: false,
    monthlyCostCapUsd: state.monthlyCostCapUsd || DEFAULT_SAFE_MONTHLY_COST_CAP_USD,
    dailyMessageLimit: '',
    upgradeCtaLabel: '',
    upgradeCtaUrl: '',
    approvalMode: 'balanced',
    escalationPreset: 'standard',
    handoffMode: 'notify_owner',
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
  const telegramEnabled = state.customerChannel === 'telegram' && state.telegramEnabled;
  const whatsappEnabled = state.customerChannel === 'whatsapp';
  const webWidgetEnabled = state.customerChannel === 'web_widget';
  return {
    telegram: {
      enabled: telegramEnabled,
      connector_id: state.telegramConnectorId.trim() || undefined,
      credential_id: state.telegramConnectorId.trim() || undefined,
      endpoint_key: state.telegramEndpointKey.trim() || undefined,
    },
    whatsapp: {
      enabled: whatsappEnabled,
      availability: 'roadmap',
    },
    instagram: {
      enabled: false,
      availability: 'roadmap',
    },
    web_widget: {
      enabled: webWidgetEnabled,
      availability: 'roadmap',
    },
  };
}

function buildDeploymentConfig(state: WizardState): Record<string, unknown> {
  const dailyMessageLimit = state.dailyMessageLimit.trim();
  const monthlyCostCapUsd = state.monthlyCostCapUsd.trim();
  const automationDailyBudget = state.computerAutomationDailyBudgetUsd.trim();
  const automationMonthlyBudget = state.computerAutomationMonthlyBudgetUsd.trim();
  const automationMaxSessions = state.computerAutomationMaxSessions.trim();
  const automationAllowedDomains = state.computerAutomationAllowedDomains
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const runtimeSupplier = runtimeSupplierForPlacement(state.runtimePlacement);
  const computerAutomation = {
    enabled: state.computerAutomationEnabled,
    runtime_class: state.computerAutomationEnabled ? state.computerAutomationRuntimeClass : null,
    allowed_domains: state.computerAutomationEnabled ? automationAllowedDomains : [],
    max_concurrent_sessions: state.computerAutomationEnabled && automationMaxSessions ? Number(automationMaxSessions) : 0,
    daily_budget_usd: state.computerAutomationEnabled && automationDailyBudget ? Number(automationDailyBudget) : null,
    monthly_budget_usd: state.computerAutomationEnabled && automationMonthlyBudget ? Number(automationMonthlyBudget) : null,
    requires_owner_approval: true,
  };
  return {
    runtime_placement: state.runtimePlacement,
    runtime_profile_id: state.runtimePlacement === 'customer_hosted'
      ? state.selfHostedRuntimeProfileId.trim() || null
      : null,
    runtime_supplier: runtimeSupplier,
    runtime_supply: {
      schema_version: 1,
      supplier: {
        kind: runtimeSupplier,
        id: runtimeSupplier === 'empyralis' ? 'empyralis' : state.runtimeSupplierId.trim() || runtimeSupplier,
        label: runtimeSupplier === 'empyralis' ? 'Empyralis' : state.runtimeSupplierLabel.trim() || 'Customer-owned compute',
      },
      placement: {
        kind: state.runtimePlacement,
        runtime_target: runtimeTargetForPlacement(state.runtimePlacement),
      },
      computer_automation: computerAutomation,
      marketplace_policy: {
        visibility: state.marketplacePublishAllowed ? 'marketplace' : 'private',
        third_party_runtime_allowed: state.thirdPartyRuntimeAllowed,
      },
      model_tier: {
        public_tier: state.aiTier,
        public_label: STUDIO_AI_TIER_OPTIONS.find((item) => item.value === state.aiTier)?.label ?? 'Pro',
        billing_source: 'empyralis_credits',
      },
      provider_binding: {
        internal_provider: state.providerId || null,
        internal_model: state.modelId || null,
        expose_provider_model_to_ordinary_ui: false,
      },
    },
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
    computer_automation: computerAutomation,
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
    aiTier: state.aiTier,
    providerId: state.providerId,
    modelId: state.modelId,
    billingPlan: state.billingPlan,
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
      <div className="deployed-agents-context-presets__label">Source depth</div>
      <div className="deployed-agents-context-presets__grid" role="tablist" aria-label="Source depth presets">
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

function RetentionPresetControl({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (nextValue: string) => void;
}) {
  return (
    <div className="deployed-agents-context-presets">
      <div className="deployed-agents-context-presets__label">Customer memory length</div>
      <div className="deployed-agents-context-presets__grid" role="tablist" aria-label="Customer memory length presets">
        {RETENTION_PRESET_OPTIONS.map((option) => {
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

function formatRosterMetricValue(value: number, emptyLabel: string): string {
  return value > 0 ? formatCompactCount(value) : emptyLabel;
}

function formatRosterOutcomeMetric(snapshot: AgentAnalyticsSnapshot | null): { label: string; value: string } {
  if (!snapshot || snapshot.outcomes.length === 0) {
    return { label: 'Outcome', value: 'None yet' };
  }
  const [topOutcome, topCount] = snapshot.outcomes[0];
  return {
    label: humanizeToken(topOutcome, 'Outcome'),
    value: formatCompactCount(topCount),
  };
}

function formatRosterSpendMetric(snapshot: AgentAnalyticsSnapshot | null): string {
  if (!snapshot || snapshot.currentBurnUsd === null || !Number.isFinite(snapshot.currentBurnUsd)) {
    return 'n/a';
  }
  return formatUsd(snapshot.currentBurnUsd);
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

function isWizardScopedError(message: string | null): boolean {
  const normalized = readString(message).toLowerCase();
  return Boolean(normalized) && (
    normalized.includes('self-hosted mode requires selecting')
    || normalized.includes('select a self-hosted node')
    || normalized.includes('accept the privacy contract')
    || normalized.includes('accept the safety contract')
    || normalized.includes('daily message limit')
    || normalized.includes('monthly cost cap')
    || normalized.includes('telegram connected app')
    || normalized.includes('assistant needs a public name')
    || normalized.includes('ai tier route is unavailable')
    || normalized.includes('computer automation needs')
  );
}

function StudioTemplateCard({
  template,
  onSelect,
  actionLabel = 'Create assistant',
}: {
  template: StudioTemplate;
  onSelect: (templateId: string) => void;
  actionLabel?: string;
}) {
  return (
    <button
      type="button"
      className="studio-template-card"
      onClick={() => onSelect(template.id)}
    >
      <span className="studio-template-card__topline">
        <span className="studio-template-card__icon" aria-hidden="true">{template.icon}</span>
        <span className="studio-template-card__setup">{template.setupTime}</span>
      </span>
      <span className="studio-template-card__copy">
        <span className="studio-template-card__category">{template.category}</span>
        <strong className="studio-template-card__title">{template.title}</strong>
        <span className="studio-template-card__outcome">{template.outcome}</span>
      </span>
      <span className="studio-template-card__tags">
        {template.requiredConnectors.slice(0, 3).map((connector) => (
          <span key={connector} className="studio-template-card__tag">{connector}</span>
        ))}
      </span>
      <span className="studio-template-card__action">{actionLabel}</span>
    </button>
  );
}

function DeployedAgentsSkeleton() {
  return (
    <WorkstationSplitWorkbench
      ariaLabel="Agents"
      className="studio-agents-workbench"
      sidebar={(
        <ListDetailPanel eyebrow="Assistants" title="Loading assistants">
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
        </ListDetailPanel>
      )}
    >
      <div className="app-stack-4">
        <ListDetailPanel eyebrow="Detail" title="Loading assistant details">
          <SkeletonBlock height="4rem" />
          <SkeletonBlock height="5rem" />
        </ListDetailPanel>
        <ListDetailPanel eyebrow="Conversations" title="Loading inbox">
          <SkeletonBlock height="3rem" />
          <SkeletonBlock height="3rem" />
        </ListDetailPanel>
      </div>
    </WorkstationSplitWorkbench>
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

type RuntimeCardStatus = {
  label: 'Ready' | 'Needs connected computer' | 'Needs Approval Policy' | 'Unsupported in this workspace' | 'Dev-only';
  tone: 'success' | 'warning' | 'danger' | 'neutral';
};

function resolveRuntimeCardStatus(
  option: typeof STUDIO_RUNTIME_OPTIONS[number],
  hasGatewayOnlineTarget: boolean,
  hasCloudComputerAvailableTarget: boolean,
): RuntimeCardStatus[] {
  if (option.value === 'managed_cloud') {
    return [{ label: 'Ready', tone: 'success' }];
  }
  if (option.value === 'hosted_hardware_pool') {
    if (!hasCloudComputerAvailableTarget) {
      return [{ label: 'Unsupported in this workspace', tone: 'danger' }];
    }
    return [
      { label: 'Needs Approval Policy', tone: 'warning' },
      { label: 'Ready', tone: 'success' },
    ];
  }
  if (option.value === 'customer_local') {
    if (!hasGatewayOnlineTarget) {
      return [{ label: 'Needs connected computer', tone: 'warning' }];
    }
    return [{ label: 'Ready', tone: 'success' }];
  }
  return [{ label: 'Dev-only', tone: 'neutral' }];
}

function RuntimeModeSelector({
  value,
  options,
  hasGatewayOnlineTarget,
  hasCloudComputerAvailableTarget,
  onSelect,
}: {
  value: WizardState['runtimePlacement'];
  options: ReadonlyArray<typeof STUDIO_RUNTIME_OPTIONS[number]>;
  hasGatewayOnlineTarget: boolean;
  hasCloudComputerAvailableTarget: boolean;
  onSelect: (next: WizardState['runtimePlacement']) => void;
}) {
  return (
    <div className="deployed-agents-wizard__runtime-grid">
      {options.map((option) => {
        const selected = value === option.value;
        const statuses = resolveRuntimeCardStatus(option, hasGatewayOnlineTarget, hasCloudComputerAvailableTarget);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className={joinClassNames(
              'deployed-agents-wizard__tool-card',
              'deployed-agents-wizard__runtime-card',
              selected && 'deployed-agents-wizard__tool-card--selected',
            )}
            onClick={() => onSelect(normalizeRuntimePlacement(option.value))}
          >
            <div className="app-inline-actions app-inline-actions--tight">
              <strong>{option.label}</strong>
              {statuses.map((status) => (
                <DataBadge key={`${option.value}:${status.label}`} tone={status.tone}>
                  {status.label}
                </DataBadge>
              ))}
            </div>
            <small>{option.hint}</small>
            <dl className="deployed-agents-wizard__runtime-metadata">
              <div>
                <dt>What it can do</dt>
                <dd>{option.capabilities}</dd>
              </div>
              <div>
                <dt>Where it runs</dt>
                <dd>{option.runsWhere}</dd>
              </div>
              <div>
                <dt>Privacy level</dt>
                <dd>{option.privacy}</dd>
              </div>
              <div>
                <dt>Cost risk</dt>
                <dd>{option.costRisk}</dd>
              </div>
              <div>
                <dt>Required setup</dt>
                <dd>{option.setup}</dd>
              </div>
              <div>
                <dt>Best use cases</dt>
                <dd>{option.bestFor}</dd>
              </div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}

function AgentSafetySummary({
  approvalMode,
  memoryEnabled,
  monthlyCostCapUsd,
  dailyMessageLimit,
}: {
  approvalMode: WizardState['approvalMode'];
  memoryEnabled: boolean;
  monthlyCostCapUsd: string;
  dailyMessageLimit: string;
}) {
  return (
    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
      <FormReadout label="Approval posture" value={humanizeToken(approvalMode, 'Balanced')} />
      <FormReadout label="Memory policy" value={memoryEnabled ? 'Enabled' : 'Disabled'} />
      <FormReadout label="Monthly spend cap" value={monthlyCostCapUsd.trim() || 'Not set'} />
      <FormReadout label="Daily message limit" value={dailyMessageLimit.trim() || 'Not set'} />
    </FormGrid>
  );
}

function AgentLaunchChecklist({
  hasGatewayOnlineTarget,
  hasCloudComputerAvailableTarget,
  state,
}: {
  hasGatewayOnlineTarget: boolean;
  hasCloudComputerAvailableTarget: boolean;
  state: WizardState;
}) {
  const runtimeModeValid = state.runtimePlacement !== 'hosted_hardware_pool'
    || hasCloudComputerAvailableTarget;
  const checks = [
    { id: 'gateway', label: 'Connected computer ready', ok: state.runtimePlacement !== 'customer_local' || hasGatewayOnlineTarget },
    { id: 'runtime', label: 'Agent mode valid', ok: Boolean(state.runtimePlacement) && runtimeModeValid },
    { id: 'tools', label: 'Tools policy valid', ok: state.selectedToolIds.length > 0 },
    { id: 'memory', label: 'Memory policy valid', ok: true },
    { id: 'approval', label: 'Approval policy valid', ok: Boolean(state.approvalMode) },
    { id: 'limits', label: 'Rate limits active', ok: state.dailyMessageLimit.trim().length > 0 },
    { id: 'audit', label: 'Audit active', ok: true },
  ];
  return (
    <div className="studio-template-detail__group">
      <span className="studio-template-detail__label">Launch checklist</span>
      <ul className="studio-template-detail__checklist">
        {checks.map((item) => (
          <li key={item.id}>{item.ok ? 'Ready' : 'Pending'} - {item.label}</li>
        ))}
      </ul>
    </div>
  );
}

function AgentAiSettingsSections({
  value,
  providerCatalog,
  isLoadingProviderCatalog,
  onSelectTier,
  onSelectProvider,
  onSelectModel,
  onRefreshProviderModels,
  onOpenIntegrations,
}: {
  value: DetailConfigDraft;
  providerCatalog: ProviderCatalogSnapshot[];
  isLoadingProviderCatalog: boolean;
  onSelectTier: (nextTier: WizardState['aiTier']) => void;
  onSelectProvider: (nextProviderId: string) => void;
  onSelectModel: (nextModelId: string) => void;
  onRefreshProviderModels?: (providerId: string) => void;
  onOpenIntegrations?: () => void;
}) {
  const [modelQuery, setModelQuery] = useState('');
  const selectedProvider = providerCatalog.find((provider) => provider.id === value.providerId) ?? null;
  const selectedModel = selectedProvider?.models.find((model) => model.id === value.modelId) ?? null;
  const selectedTier = STUDIO_AI_TIER_OPTIONS.find((option) => option.value === value.aiTier) ?? STUDIO_AI_TIER_OPTIONS[1];
  const providerReady = selectedProvider?.state.toLowerCase() === 'ready' || selectedProvider?.state.toLowerCase() === 'connected';
  const activeProvider = selectedProvider ?? providerCatalog[0] ?? null;
  const query = modelQuery.trim().toLowerCase();
  const modelOptions = providerCatalog.flatMap((provider) => provider.models.map((model) => ({ provider, model })));
  const filteredModelOptions = modelOptions
    .filter(({ provider, model }) => {
      if (!query) {
        return true;
      }
      return `${provider.label} ${provider.id} ${model.label} ${model.id} ${model.capabilityLabels.join(' ')}`.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      const leftSelected = left.provider.id === value.providerId && left.model.id === value.modelId ? -1 : 0;
      const rightSelected = right.provider.id === value.providerId && right.model.id === value.modelId ? -1 : 0;
      if (leftSelected !== rightSelected) {
        return leftSelected - rightSelected;
      }
      const tierDelta = modelPreferenceScore(left.model, value.aiTier) - modelPreferenceScore(right.model, value.aiTier);
      if (tierDelta !== 0) {
        return tierDelta;
      }
      return `${left.provider.label} ${left.model.label}`.localeCompare(`${right.provider.label} ${right.model.label}`);
    });
  const recommendedOptions = filteredModelOptions.slice(0, 6);
  const liveModelCount = providerCatalog.reduce((total, provider) => total + provider.models.length, 0);
  const sourceLabel = selectedProvider?.modelsSource === 'workspace_cached_models'
    ? 'Live catalog'
    : selectedProvider?.modelsSource === 'static_catalog'
      ? 'Fallback catalog'
      : humanizeToken(selectedProvider?.modelsSource, selectedProvider?.modelsSource || 'Catalog');
  function selectProviderModel(providerId: string, modelId: string) {
    onSelectProvider(providerId);
    onSelectModel(modelId);
  }
  return (
    <div className="studio-ai-settings">
      <div className="studio-ai-settings__summary" aria-label="Model setup summary">
        <div>
          <span>Model setup</span>
          <strong>{selectedModel?.label ?? selectedTier.label} · {selectedProvider?.label ?? 'Connect provider'}</strong>
          <p>Connect a provider in Integrations, then choose the default model this customer-facing agent should use.</p>
        </div>
        <div className="studio-ai-settings__badges" aria-label="Model setup constraints">
          <span>{liveModelCount} models</span>
          <span>{sourceLabel}</span>
        </div>
      </div>

      <section className="studio-ai-settings__section" aria-label="AI quality tier">
        <div className="studio-actions__section-head">
          <div>
            <span>Quality tier</span>
            <strong>Choose the default answer quality</strong>
          </div>
          <small>{selectedTier.label}</small>
        </div>
        <div className="studio-ai-settings__tier-grid" role="radiogroup" aria-label="AI quality tier">
          {STUDIO_AI_TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={joinClassNames('studio-ai-settings__tier', value.aiTier === option.value && 'studio-ai-settings__tier--selected')}
              aria-checked={value.aiTier === option.value}
              role="radio"
              onClick={() => onSelectTier(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="studio-ai-settings__section" aria-label="Default model">
        <div className="studio-actions__section-head">
          <div>
            <span>Connected model provider</span>
            <strong>Default model for this agent</strong>
          </div>
          <div className="studio-actions__section-head-actions">
            <small>{providerCatalog.length} provider{providerCatalog.length === 1 ? '' : 's'} · {liveModelCount} model{liveModelCount === 1 ? '' : 's'}</small>
            {activeProvider && onRefreshProviderModels ? (
              <button type="button" className="studio-actions__link-button" onClick={() => onRefreshProviderModels(activeProvider.id)}>
                <RefreshCw aria-hidden="true" />
                Refresh models
              </button>
            ) : null}
            {onOpenIntegrations ? (
              <button type="button" className="studio-actions__link-button" onClick={onOpenIntegrations}>
                <Plus aria-hidden="true" />
                Connect provider
              </button>
            ) : null}
          </div>
        </div>
        <div className="studio-ai-settings__form">
          {providerCatalog.length === 0 ? (
            <StateBanner
              tone="warning"
              title={isLoadingProviderCatalog ? 'Loading model providers' : 'No model providers connected'}
              detail={isLoadingProviderCatalog ? 'Checking workspace provider catalog.' : 'Connect a provider account before changing the model route.'}
            />
          ) : null}
          <div className="studio-ai-settings__provider-strip" aria-label="Connected providers">
            {providerCatalog.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={joinClassNames('studio-ai-settings__provider-pill', provider.id === value.providerId && 'studio-ai-settings__provider-pill--selected')}
                onClick={() => {
                  const nextModel = pickStudioModelForTier(provider, value.aiTier);
                  selectProviderModel(provider.id, nextModel);
                }}
              >
                <strong>{provider.label}</strong>
                <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
          <FormField label="Search models" hint="Live models appear after the provider account is connected. Fallback models are used only when discovery is unavailable.">
            <FormInput
              value={modelQuery}
              onChange={(event) => setModelQuery(event.currentTarget.value)}
              placeholder="Search by provider, model, or capability"
              disabled={providerCatalog.length === 0}
            />
          </FormField>
          <div className="studio-ai-settings__model-grid" aria-label="Model choices">
            {recommendedOptions.length > 0 ? recommendedOptions.map(({ provider, model }) => {
              const selected = provider.id === value.providerId && model.id === value.modelId;
              const tags = [
                model.supportsReasoning ? 'Reasoning' : null,
                model.supportsTools ? 'Tools' : null,
                model.supportsVision ? 'Vision' : null,
                model.supportsJson ? 'JSON' : null,
                ...model.capabilityLabels,
              ].filter((item): item is string => Boolean(item));
              return (
                <button
                  key={`${provider.id}:${model.id}`}
                  type="button"
                  className={joinClassNames('studio-ai-settings__model-card', selected && 'studio-ai-settings__model-card--selected')}
                  onClick={() => selectProviderModel(provider.id, model.id)}
                >
                  <span>{provider.label}</span>
                  <strong>{model.label}</strong>
                  <small>{formatContextWindow(model.contextWindowTokens)} · {model.pricingKnown ? `${formatUsdPer1k(model.inputCostPer1kUsd)} in / ${formatUsdPer1k(model.outputCostPer1kUsd)} out` : 'Pricing unknown'}</small>
                  {tags.length > 0 ? (
                    <em>{Array.from(new Set(tags)).slice(0, 4).join(' · ')}</em>
                  ) : null}
                </button>
              );
            }) : (
              <StateBanner
                tone="warning"
                title="No models found"
                detail="Refresh the provider catalog or enter a model ID manually."
              />
            )}
          </div>
          {selectedProvider ? (
            <FormField label="Manual model ID" hint="Use this when the provider supports a model that did not appear in discovery yet.">
              <FormInput
                value={value.modelId}
                onChange={(event) => onSelectModel(event.currentTarget.value)}
                placeholder="provider/model-id or model-id"
              />
            </FormField>
          ) : null}
          <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
            <FormReadout label="Provider connection" value={providerReady ? 'Connected' : humanizeToken(selectedProvider?.state, isLoadingProviderCatalog ? 'Loading' : 'Setup required')} />
            <FormReadout label="Input price" value={selectedModel?.pricingKnown ? formatUsdPer1k(selectedModel.inputCostPer1kUsd) : 'Pricing unknown'} />
            <FormReadout label="Output price" value={selectedModel?.pricingKnown ? formatUsdPer1k(selectedModel.outputCostPer1kUsd) : 'Pricing unknown'} />
            <FormReadout label="Model capacity" value={formatContextWindow(selectedModel?.contextWindowTokens)} />
            <FormReadout
              label="Model capabilities"
              value={selectedModel?.capabilityLabels.length ? selectedModel.capabilityLabels.join(', ') : selectedProvider?.capabilityLabels.join(', ') || 'n/a'}
            />
            <FormReadout label="Catalog status" value={selectedProvider?.modelsError ? 'Refresh failed' : sourceLabel} />
          </FormGrid>
          {selectedProvider?.modelsError ? (
            <StateBanner tone="warning" title="Model refresh failed" detail={selectedProvider.modelsError} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AgentActionCapabilitySections({
  selectedToolIds,
  onToggleTool,
  onOpenIntegrations,
}: {
  selectedToolIds: string[];
  onToggleTool: (toolId: string) => void;
  onOpenIntegrations?: () => void;
}) {
  const selectedToolSet = new Set(selectedToolIds);
  const readySkills = STUDIO_ACTION_SKILL_OPTIONS.filter((skill) => skill.requiredToolIds.every((toolId) => selectedToolSet.has(toolId)));
  const blockedSkills = STUDIO_ACTION_SKILL_OPTIONS.length - readySkills.length;
  return (
    <div className="studio-actions">
      <div className="studio-actions__summary" aria-label="Actions summary">
        <div className="studio-actions__summary-copy">
          <span>Action system</span>
          <strong>{readySkills.length} workflows ready</strong>
          <p>Playbooks are the customer-facing workflows. Tools are the permissions those workflows can call.</p>
        </div>
        <div className="studio-actions__summary-stats" aria-label="Action readiness">
          <div>
            <strong>{readySkills.length}</strong>
            <span>Playbooks</span>
          </div>
          <div>
            <strong>{blockedSkills}</strong>
            <span>Needs setup</span>
          </div>
          <div>
            <strong>{selectedToolIds.length}</strong>
            <span>Tools on</span>
          </div>
        </div>
      </div>
      <section className="studio-actions__section" aria-label="Skills and playbooks">
        <div className="studio-actions__section-head">
          <div>
            <span>Action playbooks</span>
            <strong>Workflows this agent can perform</strong>
          </div>
          <small>Powered by enabled actions</small>
        </div>
        <div className="studio-actions__skills">
          {STUDIO_ACTION_SKILL_OPTIONS.map((skill) => {
            const missingToolIds = skill.requiredToolIds.filter((toolId) => !selectedToolSet.has(toolId));
            const ready = missingToolIds.length === 0;
            return (
              <article
                key={skill.id}
                className={joinClassNames('studio-actions__skill', ready && 'studio-actions__skill--ready')}
              >
                <div className="studio-actions__skill-copy">
                  <strong>{skill.label}</strong>
                  <p>{skill.description}</p>
                </div>
                <span className={joinClassNames('studio-actions__status', ready ? 'studio-actions__status--ready' : 'studio-actions__status--blocked')}>
                  {ready ? 'Ready' : `Needs ${missingToolIds.map((toolId) => toolLabel(toolId)).join(', ')}`}
                </span>
              </article>
            );
          })}
        </div>
      </section>
      <section className="studio-actions__section" aria-label="Tool permissions">
        <div className="studio-actions__section-head">
          <div>
            <span>Tools</span>
            <strong>Actions this agent is allowed to use</strong>
          </div>
          <div className="studio-actions__section-head-actions">
            <small>{selectedToolIds.length} enabled</small>
            {onOpenIntegrations ? (
              <button type="button" className="studio-actions__link-button" onClick={onOpenIntegrations}>
                <Plus aria-hidden="true" />
                Add tool
              </button>
            ) : null}
          </div>
        </div>
        <div className="sage-tool-list" role="list">
          {STUDIO_TOOL_OPTIONS.map((tool) => {
            const selected = selectedToolSet.has(tool.id);
            return (
              <article key={tool.id} className={joinClassNames('sage-tool-row', selected && 'sage-tool-row--enabled')} role="listitem">
                <div className="sage-tool-row__identity">
                  <div className="sage-tool-row__icon" aria-hidden="true">{tool.label.slice(0, 1)}</div>
                  <div className="sage-tool-row__copy">
                    <strong className="sage-tool-row__title">{tool.label}</strong>
                    <p className="sage-tool-row__description">{tool.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={joinClassNames('sage-tool-toggle', selected && 'sage-tool-toggle--enabled')}
                  role="switch"
                  aria-checked={selected}
                  onClick={() => onToggleTool(tool.id)}
                >
                  <span className="sage-tool-toggle__thumb" />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AgentIntegrationsSections({
  providerCatalog,
  connectorCards,
  workspaceId,
}: {
  providerCatalog: ProviderCatalogSnapshot[];
  connectorCards: AgentIntegrationConnectorCard[];
  workspaceId: string;
}) {
  const connectedProviderCount = providerCatalog.filter((provider) => providerIsReadyForStudio(provider)).length;
  return (
    <div className="studio-agent-integrations">
      <section className="studio-agent-integrations__section" aria-label="Model providers">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Model providers</span>
            <strong>AI accounts this agent can use</strong>
            <p>Connect API providers here. Studio agents use cloud API accounts only; personal and local routes stay with Sage.</p>
          </div>
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/integrations`)}
          >
            Open provider setup
          </AppButton>
        </div>
        <div className="studio-agent-integrations__provider-grid">
          {providerCatalog.length === 0 ? (
            <div className="deployed-agents-overlay__empty">Connect a model provider before launch.</div>
          ) : providerCatalog.slice(0, 8).map((provider) => {
            const ready = providerIsReadyForStudio(provider);
            return (
              <article key={provider.id} className="studio-agent-integrations__provider-card">
                <div>
                  <strong>{provider.label}</strong>
                  <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</span>
                </div>
                <span className={joinClassNames('studio-agent-integrations__status', ready && 'studio-agent-integrations__status--ready')}>
                  {ready ? 'Connected' : 'Setup required'}
                </span>
              </article>
            );
          })}
        </div>
        <div className="studio-agent-integrations__foot">
          {connectedProviderCount > 0 ? `${connectedProviderCount} provider${connectedProviderCount === 1 ? '' : 's'} connected for Studio agents.` : 'Connect a model provider before launch.'}
        </div>
      </section>

      <section className="studio-agent-integrations__section" aria-label="Channels and systems">
        <div className="studio-agent-integrations__head">
          <div>
            <span>Channels and systems</span>
            <strong>Where the agent talks and what it can access</strong>
            <p>Use Actions for permissions. Use Integrations for accounts, channels, and external systems.</p>
          </div>
        </div>
        <div className="sage-unified-grid sage-unified-grid--4">
          {connectorCards.map((connector) => (
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
      </section>
    </div>
  );
}

function AgentPlaygroundPanel({
  deployedAgentId,
  workspaceId,
  client,
  agentName,
  runtimeMode,
}: {
  deployedAgentId: string;
  workspaceId: string;
  client: { testTurnDeployedAgent: (params: { deployedAgentId: string; body: Record<string, unknown> }) => Promise<Record<string, unknown> | null> };
  agentName?: string | null;
  runtimeMode?: string;
}) {
  return (
    <div className="studio-agent-chat">
      <DeployedAgentTestTurnPane
        deployedAgentId={deployedAgentId}
        workspaceId={workspaceId}
        client={client}
        agentName={agentName}
        runtimeMode={runtimeMode}
      />
    </div>
  );
}

export function WorkstationDeployedAgentsPane({
  initialSubview = 'agents',
}: {
  initialSubview?: StudioSubview;
}) {
  const { workspaceId, bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const searchParams = useSearchParams();
  const cachedStudioPane = studioPaneCache.get(workspaceId) ?? null;
  const [hadInitialCache] = useState(() => cachedStudioPane !== null);
  const [currentStudioSubview, setCurrentStudioSubview] = useState<StudioSubview>(initialSubview);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogSnapshot[]>(() => cachedStudioPane?.providerCatalog ?? []);
  const [studioTemplates, setStudioTemplates] = useState<StudioTemplate[]>(() => [...STUDIO_TEMPLATES]);
  const [agents, setAgents] = useState<DeployedAgentRecord[]>([]);
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
  const [runtimeAttachments, setRuntimeAttachments] = useState<RuntimeAttachmentSnapshot[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<DeployedAgentConversationDetail | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [hasLoadedAgentListOnce, setHasLoadedAgentListOnce] = useState(false);
  const [isLoadingProviderCatalog, setIsLoadingProviderCatalog] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isLoadingTelegramReadiness, setIsLoadingTelegramReadiness] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingOverlayMemory, setIsLoadingOverlayMemory] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isLoadingRuntimeAttachments, setIsLoadingRuntimeAttachments] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isTelegramSetupOpen, setIsTelegramSetupOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(() => buildWizardState(null));
  const [wizardErrorMessage, setWizardErrorMessage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => CUSTOM_STUDIO_TEMPLATE.id);
  const handledTemplateDeepLinkRef = useRef<string | null>(null);
  const [isSubmittingWizard, setIsSubmittingWizard] = useState(false);
  const [detailConfigDraft, setDetailConfigDraft] = useState<DetailConfigDraft | null>(null);
  const [isSavingDetailConfig, setIsSavingDetailConfig] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [busyExternalUserId, setBusyExternalUserId] = useState<string | null>(null);
  const [recentlyCreatedAgentId, setRecentlyCreatedAgentId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agentRosterFilter, setAgentRosterFilter] = useState<AgentRosterFilterId>('all');
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
  const selfHostedNodeOptions = useMemo(
    () => runtimeAttachments
      .filter((item) => item.runtimeProfileId)
      .sort((left, right) => left.label.localeCompare(right.label)),
    [runtimeAttachments],
  );
  const selectedSelfHostedNode = useMemo(
    () => selfHostedNodeOptions.find((item) => item.runtimeProfileId === wizardState.selfHostedRuntimeProfileId) ?? null,
    [selfHostedNodeOptions, wizardState.selfHostedRuntimeProfileId],
  );
  const selfHostedWizardNodeBlocker = useMemo(() => {
    if (wizardState.runtimePlacement !== 'customer_hosted') {
      return null;
    }
    return selfHostedNodeGateReason(selectedSelfHostedNode);
  }, [selectedSelfHostedNode, wizardState.runtimePlacement]);
  const selectedAgentRuntimePlacement = useMemo(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    const runtimeSupply = readRecord(config.runtime_supply ?? metadata.runtime_supply);
    const placement = readRecord(runtimeSupply.placement);
    return normalizeRuntimePlacement(
      placement.kind
      ?? config.runtime_placement
      ?? metadata.runtime_placement
      ?? selectedAgent?.runtime_target,
    );
  }, [selectedAgent]);
  const selectedAgentSelfHostedProfileId = useMemo(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    const binding = readRecord(metadata.self_hosted_runtime_binding);
    return readString(config.runtime_profile_id ?? binding.runtime_profile_id ?? metadata.runtime_profile_id);
  }, [selectedAgent]);
  const selectedAgentSelfHostedNode = useMemo(
    () => selfHostedNodeOptions.find((item) => item.runtimeProfileId === selectedAgentSelfHostedProfileId) ?? null,
    [selectedAgentSelfHostedProfileId, selfHostedNodeOptions],
  );
  const selectedAgentSelfHostedDeployBlocker = useMemo(() => {
    if (selectedAgentRuntimePlacement !== 'customer_hosted') {
      return null;
    }
    if (!selectedAgentSelfHostedProfileId) {
      return 'Self-hosted deployment requires an explicit self-hosted node binding.';
    }
    return selfHostedNodeGateReason(selectedAgentSelfHostedNode);
  }, [selectedAgentRuntimePlacement, selectedAgentSelfHostedNode, selectedAgentSelfHostedProfileId]);
  const selectedAgentModelDeployBlocker = useMemo(
    () => agentModelDeployBlocker(selectedAgent, providerCatalogIndex),
    [providerCatalogIndex, selectedAgent],
  );
  const selectedWizardConnector = useMemo(
    () => selectedTelegramReadiness?.connectors.find((item) => item.id === wizardState.telegramConnectorId) ?? null,
    [selectedTelegramReadiness, wizardState.telegramConnectorId],
  );
  const selectedStudioTemplate = useMemo(
    () => studioTemplateById(selectedTemplateId, studioTemplates),
    [selectedTemplateId, studioTemplates],
  );
  const primaryStudioTemplates = useMemo(
    () => studioTemplates.filter((template) => PRIMARY_STUDIO_TEMPLATE_IDS.has(template.id)),
    [studioTemplates],
  );
  const additionalStudioTemplates = useMemo(
    () => studioTemplates.filter((template) => !PRIMARY_STUDIO_TEMPLATE_IDS.has(template.id)),
    [studioTemplates],
  );
  const agentRosterCounts = useMemo(
    () => agents.reduce<Record<AgentRosterFilterId, number>>((counts, agent) => {
      counts.all += 1;
      counts[agentModeBucket(agent)] += 1;
      if (listEnabledChannels(agent.channels).length > 0) {
        counts.connected += 1;
      }
      if (readString(agent.deployment_state).toLowerCase() !== 'live') {
        counts.draft += 1;
      }
      return counts;
    }, {
      all: 0,
      text: 0,
      computer: 0,
      connected: 0,
      draft: 0,
    }),
    [agents],
  );
  const visibleAgents = useMemo(
    () => agents.filter((agent) => agentMatchesRosterFilter(agent, agentRosterFilter)),
    [agentRosterFilter, agents],
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
  const requestedProofAgentTemplateId = useMemo(
    () => String(searchParams.get('proof_agent') || searchParams.get('template') || '').trim(),
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
      setErrorMessage(error instanceof Error ? error.message : 'AI model catalog is unavailable.');
    } finally {
      setIsLoadingProviderCatalog(false);
    }
  }

  async function refreshProviderModels(providerId: string) {
    const normalizedProviderId = readString(providerId);
    if (!normalizedProviderId) {
      return;
    }
    setIsLoadingProviderCatalog(true);
    try {
      await services.client.refreshWorkspaceProviderModels({ providerId: normalizedProviderId });
      const payload = await services.client.listProviderCatalog();
      const nextCatalog = normalizeProviderCatalog(payload);
      updateStudioPaneCache(workspaceId, { providerCatalog: nextCatalog });
      setProviderCatalog(nextCatalog);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not refresh provider models.');
    } finally {
      setIsLoadingProviderCatalog(false);
    }
  }

  async function loadRuntimeAttachments() {
    setIsLoadingRuntimeAttachments(true);
    try {
      const payload = await services.client.listRuntimeAttachments();
      setRuntimeAttachments(normalizeRuntimeAttachments(payload));
    } catch (error) {
      setRuntimeAttachments([]);
      setErrorMessage(error instanceof Error ? error.message : 'Self-hosted node inventory is unavailable.');
    } finally {
      setIsLoadingRuntimeAttachments(false);
    }
  }

  async function refreshStudioTemplates() {
    try {
      const payload = await services.client.listStudioTemplates();
      const nextTemplates = normalizeStudioTemplates(payload);
      setStudioTemplates(nextTemplates);
      setSelectedTemplateId((current) => (
        current === CUSTOM_STUDIO_TEMPLATE.id || nextTemplates.some((template) => template.id === current)
          ? current
          : nextTemplates[0]?.id ?? DEFAULT_STUDIO_TEMPLATE.id
      ));
    } catch {
      setStudioTemplates([...STUDIO_TEMPLATES]);
    }
  }

  async function refreshAgents(options: { preserveSelection?: boolean; selectAgentId?: string | null } = {}) {
    setIsLoadingAgents(true);
    setErrorMessage(null);
    try {
      const payload = await services.client.listDeployedAgents();
      const items = readItems<DeployedAgentRecord>(payload);
      setAgents(items);
      setHasLoadedAgentListOnce(true);
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
        const cachedSelection = readString(cachedStudioPane?.selectedAgentId);
        const nextSelection = cachedSelection && items.some((item) => readString(item.id) === cachedSelection)
          ? cachedSelection
          : readString(items[0]?.id) || null;
        setSelectedAgentId(nextSelection);
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
      const nextDetail = payload as DeployedAgentRecord | null;
      setSelectedAgentDetail(nextDetail);
      updateStudioPaneCache(workspaceId, { selectedAgentDetail: nextDetail });
    } catch (error) {
      setSelectedAgentDetail(null);
      updateStudioPaneCache(workspaceId, { selectedAgentDetail: null });
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
      updateStudioPaneCache(workspaceId, { selectedAgentAnalytics: analytics });
      if (analytics) {
        setAgentAnalyticsById((current) => ({
          ...current,
          [agentId]: analytics,
        }));
      }
    } catch (error) {
      setSelectedAgentAnalytics(null);
      updateStudioPaneCache(workspaceId, { selectedAgentAnalytics: null });
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
      const nextReadiness = normalizeTelegramReadiness(payload as DeployedAgentTelegramReadinessRecord | null);
      setSelectedTelegramReadiness(nextReadiness);
      updateStudioPaneCache(workspaceId, { selectedTelegramReadiness: nextReadiness });
    } catch (error) {
      setSelectedTelegramReadiness(null);
      updateStudioPaneCache(workspaceId, { selectedTelegramReadiness: null });
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
      updateStudioPaneCache(workspaceId, { conversations: items });
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
      updateStudioPaneCache(workspaceId, { conversations: [] });
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
      const nextTranscript = payload as DeployedAgentConversationDetail | null;
      setSelectedTranscript(nextTranscript);
      updateStudioPaneCache(workspaceId, { selectedTranscript: nextTranscript });
    } catch (error) {
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, { selectedTranscript: null });
      setErrorMessage(error instanceof Error ? error.message : 'Transcript detail is unavailable.');
    } finally {
      setIsLoadingTranscript(false);
    }
  }

  useEffect(() => {
    void refreshAgents();
    void refreshStudioTemplates();
    void loadRuntimeAttachments();
    const handle = window.setTimeout(() => {
      void refreshProviderCatalog();
    }, hadInitialCache ? 120 : 260);
    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hadInitialCache, services.client, workspaceId]);

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
    setOverlayAgentId(null);
  }, [agents, requestedAgentId]);

  useEffect(() => {
    const normalizedRequestedTemplateId = normalizeTemplateToken(requestedProofAgentTemplateId);
    if (!normalizedRequestedTemplateId || handledTemplateDeepLinkRef.current === normalizedRequestedTemplateId) {
      return;
    }
    const template = studioTemplateById(normalizedRequestedTemplateId, studioTemplates);
    if (normalizeTemplateToken(template.id) !== normalizedRequestedTemplateId) {
      return;
    }
    handledTemplateDeepLinkRef.current = normalizedRequestedTemplateId;
    setCurrentStudioSubview('agents');
    openCreateWizard(template.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProofAgentTemplateId, studioTemplates]);

  useEffect(() => {
    updateStudioPaneCache(workspaceId, {
      selectedAgentId,
      selectedSessionId,
    });
  }, [selectedAgentId, selectedSessionId, workspaceId]);

  useEffect(() => {
    if (!isWizardOpen) {
      return;
    }
    setWizardState((current) => applyProviderCatalogDefaults(current, providerCatalog));
  }, [isWizardOpen, providerCatalog]);

  useEffect(() => {
    if (!isWizardOpen || wizardState.runtimePlacement !== 'customer_hosted') {
      return;
    }
    void loadRuntimeAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWizardOpen, wizardState.runtimePlacement]);

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
      updateStudioPaneCache(workspaceId, {
        selectedAgentId: null,
        selectedAgentDetail: null,
        selectedAgentAnalytics: null,
        selectedTelegramReadiness: null,
        conversations: [],
        selectedSessionId: null,
        selectedTranscript: null,
      });
      return;
    }
    const currentDetailAgentId = readString(selectedAgentDetail?.id);
    if (currentDetailAgentId && currentDetailAgentId !== agentId) {
      setSelectedAgentDetail(null);
      setSelectedAgentAnalytics(null);
      setSelectedTelegramReadiness(null);
      setConversations([]);
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, {
        selectedAgentDetail: null,
        selectedAgentAnalytics: null,
        selectedTelegramReadiness: null,
        conversations: [],
        selectedSessionId: null,
        selectedTranscript: null,
      });
    }
    setConversationFilters((current) => (
      current.channel === 'all' && current.escalationState === 'all' && current.outcome === 'all'
        ? current
        : {
          channel: 'all',
          escalationState: 'all',
          outcome: 'all',
        }
    ));
    let cancelled = false;
    let timeoutHandle: number | null = null;
    const frameHandle = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      void Promise.all([
        loadAgentDetail(agentId),
        loadConversations(agentId),
      ]);
      timeoutHandle = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        void Promise.all([
          loadAgentAnalytics(agentId),
          loadTelegramReadiness(agentId),
        ]);
      }, 140);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameHandle);
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayAgentId, selectedAgentDetail?.id, selectedAgentId, workspaceId]);

  useEffect(() => {
    const agentId = readString(selectedAgentId);
    const sessionId = readString(selectedSessionId);
    if (!agentId || !sessionId) {
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, { selectedTranscript: null });
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

  const overlayMemoryTargetAgentId = readString(overlayAgentId || selectedAgentId);
  useEffect(() => {
    const agentId = overlayMemoryTargetAgentId;
    if (!agentId || overlayTab !== 'memory') {
      return;
    }
    void loadMemoryEntries(agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayMemoryTargetAgentId, overlayTab]);

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

  function openCreateWizard(templateId: string = selectedTemplateId) {
    const template = studioTemplateById(templateId, studioTemplates);
    setWizardMode('create');
    setWizardStepIndex(0);
    setWizardErrorMessage(null);
    setSelectedTemplateId(template.id);
    setWizardState(applyProviderCatalogDefaults({
      ...applyStudioTemplate(buildWizardState(null), template),
      customerChannel: 'draft',
      telegramEnabled: false,
      telegramConnectorId: '',
      telegramEndpointKey: '',
      runtimePlacement: 'managed_cloud',
      runtimeTarget: runtimeTargetForPlacement('managed_cloud'),
      runtimeSupplierKind: runtimeSupplierForPlacement('managed_cloud'),
      selfHostedRuntimeProfileId: '',
      selfHostedPrivacyAccepted: false,
      selfHostedSafetyAccepted: false,
      computerAutomationEnabled: false,
    }, providerCatalog));
    setIsTelegramSetupOpen(false);
    setIsWizardOpen(true);
    void loadTelegramReadiness();
  }

  function openEditWizard() {
    setWizardMode('edit');
    setWizardStepIndex(0);
    setWizardErrorMessage(null);
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
    setWizardErrorMessage(null);
    if (selectedAgentId) {
      void loadTelegramReadiness(selectedAgentId);
    }
  }

  function setWizardField<K extends keyof WizardState>(field: K, value: WizardState[K]) {
    setWizardErrorMessage(null);
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
    const stateForSave = wizardMode === 'create' ? buildCreateDraftWizardState(wizardState) : wizardState;
    if (wizardMode === 'create') {
      const name = stateForSave.name.trim();
      if (!name) {
        setWizardErrorMessage('Name the agent before creating it.');
        return;
      }
      setIsSubmittingWizard(true);
      setWizardErrorMessage(null);
      try {
        const route = resolveProviderModelForTier(stateForSave.aiTier, providerCatalog);
        const created = await services.client.createDeployedAgent({
          name,
          avatar: null,
          persona: stateForSave.persona,
          systemPrompt: stateForSave.systemPrompt,
          channels: {},
          knowledgeSources: [],
          runtimeTarget: 'cloud',
          billingPlan: 'free',
          config: {
            studio_agent_mode: 'text_agent',
            runtime_placement: 'managed_cloud',
            runtime_target: 'cloud',
            runtime_supplier: 'empyralis',
            tool_policy: {
              enabled_tools: [],
            },
            memory_policy: {
              memory_enabled: false,
              context_budget_preset: 'balanced',
              retention_preset: 'standard',
            },
            escalation_policy: {
              preset: 'standard',
              handoff_mode: 'notify_owner',
            },
            commerce_policy: {
              monthly_cost_cap_usd: Number(DEFAULT_SAFE_MONTHLY_COST_CAP_USD),
            },
            computer_automation: {
              enabled: false,
            },
          },
          metadata: {
            customer_channel: 'draft',
            runtime_placement: 'managed_cloud',
            runtime_supplier: 'empyralis',
            computer_automation_enabled: false,
            selected_tool_ids: [],
            memory_enabled: false,
            monthly_cost_cap_usd: Number(DEFAULT_SAFE_MONTHLY_COST_CAP_USD),
            escalation_preset: 'standard',
            handoff_mode: 'notify_owner',
          },
          provider: route.providerId || null,
          model: route.modelId || null,
        });
        const record = (created ?? {}) as DeployedAgentRecord;
        const createdId = readString(record.id);
        setAgents((current) => upsertAgentRecord(current, record));
        setSelectedAgentDetail(record);
        setSelectedAgentAnalytics(null);
        setSelectedAgentId(createdId || null);
        setOverlayAgentId(null);
        setOverlayTab('overview');
        setRecentlyCreatedAgentId(createdId || null);
        setStatusMessage(`Created agent ${readString(record.name, name)}.`);
        if (createdId) {
          await Promise.all([
            loadAgentAnalytics(createdId),
            loadTelegramReadiness(createdId),
            loadConversations(createdId),
          ]);
        }
        setIsWizardOpen(false);
      } catch (error) {
        setWizardErrorMessage(error instanceof Error ? error.message : 'The agent could not be created.');
      } finally {
        setIsSubmittingWizard(false);
      }
      return;
    }
    const dailyMessageLimit = stateForSave.dailyMessageLimit.trim();
    const monthlyCostCapUsd = stateForSave.monthlyCostCapUsd.trim();
    const route = resolveProviderModelForTier(stateForSave.aiTier, providerCatalog);
    const resolvedProviderId = route.providerId || stateForSave.providerId || selectedProviderId(selectedAgent) || null;
    const resolvedModelId = route.modelId || stateForSave.modelId || selectedModelId(selectedAgent) || null;
    if (dailyMessageLimit) {
      const parsedLimit = Number(dailyMessageLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        setWizardErrorMessage('Daily message limit must be a whole number greater than zero.');
        return;
      }
      if (!stateForSave.upgradeCtaLabel.trim()) {
        setWizardErrorMessage('Add an upgrade CTA label when a daily message limit is enabled.');
        return;
      }
      if (!stateForSave.upgradeCtaUrl.trim()) {
        setWizardErrorMessage('Add an upgrade CTA URL when a daily message limit is enabled.');
        return;
      }
    }
    if (monthlyCostCapUsd) {
      const parsedCap = Number(monthlyCostCapUsd);
      if (!Number.isFinite(parsedCap) || parsedCap <= 0) {
        setWizardErrorMessage('Monthly cost cap must be a number greater than zero.');
        return;
      }
    }
    if (stateForSave.computerAutomationEnabled) {
      if (!stateForSave.computerAutomationAllowedDomains.trim()) {
        setWizardErrorMessage('Computer Automation needs at least one allowed domain.');
        return;
      }
      const parsedSessions = Number(stateForSave.computerAutomationMaxSessions.trim());
      if (!Number.isFinite(parsedSessions) || parsedSessions < 1) {
        setWizardErrorMessage('Computer Automation needs at least one allowed session.');
        return;
      }
    }
    if (stateForSave.runtimePlacement === 'customer_hosted') {
      if (!stateForSave.selfHostedRuntimeProfileId.trim()) {
        setWizardErrorMessage('Self-hosted mode requires selecting a self-hosted node.');
        return;
      }
      if (selfHostedWizardNodeBlocker) {
        setWizardErrorMessage(selfHostedWizardNodeBlocker);
        return;
      }
      if (!stateForSave.selfHostedPrivacyAccepted) {
        setWizardErrorMessage('Accept the privacy contract before saving a self-hosted assistant.');
        return;
      }
      if (!stateForSave.selfHostedSafetyAccepted) {
        setWizardErrorMessage('Accept the safety contract before saving a self-hosted assistant.');
        return;
      }
    }
    if (stateForSave.customerChannel === 'telegram' && stateForSave.telegramEnabled && !stateForSave.telegramConnectorId.trim()) {
      setWizardErrorMessage('Choose a Telegram connected app before saving a live-ready assistant.');
      return;
    }
    const approvalPolicy = applyApprovalModeToWizardState(stateForSave.approvalMode, {
      escalationPreset: stateForSave.escalationPreset,
      handoffMode: stateForSave.handoffMode,
    });
    const resolvedRuntimeTarget = runtimeTargetForPlacement(stateForSave.runtimePlacement);
    const payload = {
      name: stateForSave.name.trim(),
      avatar: stateForSave.avatar.trim() || null,
      persona: stateForSave.persona.trim(),
      systemPrompt: stateForSave.systemPrompt.trim(),
      channels: buildChannelPayload(stateForSave),
      knowledgeSources: parseKnowledgeSources(stateForSave.knowledgeSourceText),
      runtimeTarget: resolvedRuntimeTarget,
      runtimeProfileId: stateForSave.runtimePlacement === 'customer_hosted'
        ? stateForSave.selfHostedRuntimeProfileId.trim() || null
        : null,
      billingPlan: stateForSave.billingPlan,
      provider: resolvedProviderId,
      model: resolvedModelId,
      config: buildDeploymentConfig({
        ...stateForSave,
        runtimeTarget: resolvedRuntimeTarget,
        escalationPreset: approvalPolicy.escalationPreset,
        handoffMode: approvalPolicy.handoffMode,
      }),
      metadata: {
        public_tier: stateForSave.aiTier,
        model_tier: stateForSave.aiTier,
        empyralis_model_tier: stateForSave.aiTier,
        runtime_placement: stateForSave.runtimePlacement,
        runtime_supplier: runtimeSupplierForPlacement(stateForSave.runtimePlacement),
        computer_automation_enabled: stateForSave.computerAutomationEnabled,
        approval_mode: stateForSave.approvalMode,
        customer_channel: stateForSave.customerChannel,
        self_hosted_runtime_profile_id: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedRuntimeProfileId.trim() || null
          : null,
        self_hosted_privacy_contract_accepted: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedPrivacyAccepted
          : null,
        self_hosted_safety_contract_accepted: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedSafetyAccepted
          : null,
      },
    };

    if (!payload.name) {
      setWizardErrorMessage('An assistant needs a public name before it can be saved.');
      return;
    }

    setIsSubmittingWizard(true);
    setWizardErrorMessage(null);
    try {
      const agentId = readString(selectedAgent?.id);
      if (!agentId) {
        throw new Error('Select an assistant before editing it.');
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
      setRecentlyCreatedAgentId(null);
      setStatusMessage(`Updated ${readString(record.name, 'assistant')} settings.`);
      setIsWizardOpen(false);
    } catch (error) {
      setWizardErrorMessage(error instanceof Error ? error.message : 'The assistant could not be saved.');
    } finally {
      setIsSubmittingWizard(false);
    }
  }

  async function handleDeploymentAction(action: 'deploy' | 'pause') {
    const agentId = readString(selectedAgent?.id);
    if (!agentId) {
      return;
    }
    const selectedConfig = readRecord(selectedAgent?.config);
    const selectedMetadata = readRecord(selectedAgent?.metadata);
    const selectedCommercePolicy = readRecord(selectedConfig.commerce_policy);
    const selectedMonthlyCostCap = readPositiveDecimalString(
      selectedCommercePolicy.monthly_cost_cap_usd ?? selectedMetadata.monthly_cost_cap_usd,
    );
    const needsDeploySafeDefaults = action === 'deploy' && Boolean(selectedAgent) && (
      !readString(selectedAgent?.persona)
      || !readString(selectedAgent?.system_prompt)
      || !selectedMonthlyCostCap
    );
    if (action === 'deploy' && selectedAgentSelfHostedDeployBlocker) {
      setErrorMessage(selectedAgentSelfHostedDeployBlocker);
      return;
    }
    if (action === 'deploy' && selectedAgentModelDeployBlocker) {
      setOverlayTab('connectors');
      setErrorMessage(`${selectedAgentModelDeployBlocker} Open Integrations and connect OpenRouter, OpenAI, Anthropic, Google Gemini, or another API provider.`);
      return;
    }
    if (
      action === 'deploy'
      && selectedAgentNeedsTelegramReadiness
      && !selectedTelegramReadiness
    ) {
      setErrorMessage('Telegram checks are still loading. Wait for readiness to finish before enabling that customer channel.');
      return;
    }
    if (
      action === 'deploy'
      && selectedAgentNeedsTelegramReadiness
      && selectedTelegramReadiness
      && selectedTelegramReadiness.readyForLive !== true
    ) {
      const firstBlocker = selectedTelegramReadiness.blockers[0];
      const guidance = firstBlocker?.guidance || selectedTelegramReadiness.nextAction || 'Resolve the Telegram readiness blockers before enabling that customer channel.';
      setErrorMessage(firstBlocker?.message ? `${firstBlocker.message} ${guidance}` : guidance);
      return;
    }
    setBusyAgentId(agentId);
    setErrorMessage(null);
    try {
      if (needsDeploySafeDefaults) {
        const currentState = buildWizardState(selectedAgent);
        const route = resolveProviderModelForTier(currentState.aiTier, providerCatalog);
        const resolvedProviderId = route.providerId || currentState.providerId || selectedProviderId(selectedAgent) || null;
        const resolvedModelId = route.modelId || currentState.modelId || selectedModelId(selectedAgent) || null;
        const patched = await services.client.updateDeployedAgent({
          deployedAgentId: agentId,
          persona: currentState.persona,
          systemPrompt: currentState.systemPrompt,
          provider: resolvedProviderId,
          model: resolvedModelId,
          config: buildDeploymentConfig({
            ...currentState,
            providerId: resolvedProviderId || '',
            modelId: resolvedModelId || '',
          }),
        });
        if (patched) {
          const patchedRecord = patched as DeployedAgentRecord;
          setAgents((current) => upsertAgentRecord(current, patchedRecord));
          setSelectedAgentDetail(patchedRecord);
        }
      }
      const payload =
        action === 'deploy'
          ? await services.client.deployDeployedAgent({ deployedAgentId: agentId })
          : await services.client.pauseDeployedAgent({ deployedAgentId: agentId });
      const record = (payload ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setStatusMessage(
        action === 'deploy'
          ? activeChannels.length > 0
            ? `${readString(record.name, 'Assistant')} is now live on its configured channels.`
            : `${readString(record.name, 'Assistant')} is live with safe defaults. Connect a customer channel when ready.`
          : `${readString(record.name, 'Assistant')} is paused and will no longer reply to live customer messages.`,
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
      setStatusMessage(`Updated ${readString(record.name, 'assistant')}.`);
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
      aiTier: detailConfigDraft.aiTier,
      providerId: detailConfigDraft.providerId,
      modelId: detailConfigDraft.modelId,
      billingPlan: detailConfigDraft.billingPlan,
      selectedToolIds: detailConfigDraft.selectedToolIds,
      memoryEnabled: detailConfigDraft.memoryEnabled,
      contextBudgetPreset: detailConfigDraft.contextBudgetPreset,
      retentionPreset: detailConfigDraft.retentionPreset,
    };
    const resolvedProviderModel = resolveProviderModelForTier(nextState.aiTier, providerCatalog);
    const resolvedProviderId = nextState.providerId || resolvedProviderModel.providerId;
    const resolvedProvider = providerCatalogIndex[resolvedProviderId] ?? null;
    const resolvedModelId = nextState.modelId && resolvedProvider?.models.some((item) => item.id === nextState.modelId)
      ? nextState.modelId
      : resolvedProvider
        ? pickStudioModelForTier(resolvedProvider, nextState.aiTier)
        : resolvedProviderModel.modelId;
    const nextConfigPayload = buildDeploymentConfig(nextState);
    const currentConfig = readRecord(selectedAgent?.config);
    const currentMetadata = readRecord(selectedAgent?.metadata);
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
    const mergedMetadata = {
      ...currentMetadata,
      public_tier: nextState.aiTier,
      model_tier: nextState.aiTier,
      empyralis_model_tier: nextState.aiTier,
    };

    setIsSavingDetailConfig(true);
    setErrorMessage(null);
    try {
      const updated = await services.client.updateDeployedAgent({
        deployedAgentId: agentId,
        provider: resolvedProviderId || null,
        model: resolvedModelId || null,
        billingPlan: nextState.billingPlan,
        config: mergedConfig,
        metadata: mergedMetadata,
      });
      const record = (updated ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setDetailConfigDraft(buildDetailConfigDraft(record));
      setStatusMessage(`Updated ${readString(record.name, 'assistant')} AI, actions, and memory settings.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI, actions, and memory settings could not be saved.');
    } finally {
      setIsSavingDetailConfig(false);
    }
  }

  function updateDetailAiTier(nextTier: WizardState['aiTier']) {
    const route = resolveProviderModelForTier(nextTier, providerCatalog);
    setDetailConfigDraft((current) => current ? {
      ...current,
      aiTier: nextTier,
      providerId: route.providerId || current.providerId,
      modelId: route.modelId || current.modelId,
    } : current);
  }

  function updateDetailProvider(nextProviderId: string) {
    const nextProvider = providerCatalogIndex[nextProviderId] ?? null;
    setDetailConfigDraft((current) => {
      if (!current) {
        return current;
      }
      const nextModelId = nextProvider
        ? pickStudioModelForTier(nextProvider, current.aiTier)
        : '';
      return {
        ...current,
        providerId: nextProviderId,
        modelId: nextModelId,
      };
    });
  }

  function updateDetailModel(nextModelId: string) {
    setDetailConfigDraft((current) => current ? {
      ...current,
      modelId: nextModelId,
      aiTier: inferAiTierFromProviderModel(current.providerId, nextModelId),
    } : current);
  }

  const activeChannels = listEnabledChannels(selectedAgent?.channels);
  const selectedAgentNeedsTelegramReadiness = hasEnabledChannel(selectedAgent?.channels, 'telegram');
  const selectedKnowledgeSources = Array.isArray(selectedAgent?.knowledge_sources)
    ? selectedAgent.knowledge_sources
    : [];
  const knowledgeSourceCount = selectedKnowledgeSources.length;
  const studioTitle = currentStudioSubview === 'agents'
    ? 'Agents'
    : currentStudioSubview === 'inbox'
      ? 'Assistant inbox'
      : 'Assistant launch';
  const studioSubtitle = currentStudioSubview === 'agents'
    ? 'Manage text agents, computer agents, and connected customer assistants.'
    : currentStudioSubview === 'inbox'
      ? 'Customer sessions and handoffs for assistants that are already working.'
      : 'Go-live checks and spending guardrails for customer-facing assistants.';
  const showAgentsIndex = currentStudioSubview === 'agents' || currentStudioSubview === 'inbox';
  const showReadinessPanel = currentStudioSubview === 'deploy';
  const showDetailPanel = currentStudioSubview === 'deploy'
    || (currentStudioSubview === 'agents' && Boolean(selectedAgent) && overlayTab === 'overview');
  const showInboxPanels = currentStudioSubview === 'inbox';
  const visibleErrorMessage = isWizardScopedError(errorMessage) ? null : summarizeStudioErrorMessage(errorMessage);
  const isRecoverableLoadTimeout = Boolean(visibleErrorMessage && /too long to respond|timed out/i.test(visibleErrorMessage));
  const isAgentListUnavailable = Boolean(visibleErrorMessage && !isRecoverableLoadTimeout && !isLoadingAgents && agents.length === 0);
  const isAgentListPriming = agents.length === 0 && (
    isLoadingAgents
    || isRecoverableLoadTimeout
    || (!hasLoadedAgentListOnce && !isAgentListUnavailable)
  );
  const visibleGlobalErrorMessage = isRecoverableLoadTimeout ? null : visibleErrorMessage;
  const activeWizardSteps = wizardMode === 'create' ? CREATE_AGENT_WIZARD_STEPS : DEPLOYED_AGENT_WIZARD_STEPS;
  const wizardStep = activeWizardSteps[Math.min(wizardStepIndex, activeWizardSteps.length - 1)] ?? activeWizardSteps[0];
  const transcriptEntries: TimelineEntry[] = Array.isArray(selectedTranscript?.entries)
    ? (selectedTranscript.entries as TimelineEntry[])
    : [];
  const overviewTrendValues = selectedAnalytics
    ? [
        0,
        selectedAnalytics.messageVolumeDay,
        Math.max(selectedAnalytics.messageVolumeWeek - selectedAnalytics.messageVolumeDay, 0),
        Math.max(selectedAnalytics.messageVolumeMonth - selectedAnalytics.messageVolumeWeek, 0),
        selectedAnalytics.messageVolumeMonth,
      ]
    : [0, 0, 0, 0, 0];
  const overviewTrendMax = Math.max(...overviewTrendValues, 1);
  const overviewTrendPoints = overviewTrendValues
    .map((value, index) => {
      const x = (index / Math.max(overviewTrendValues.length - 1, 1)) * 100;
      const y = 76 - (Math.max(value, 0) / overviewTrendMax) * 56;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const selectedAgentModeLabel = selectedAgent
    ? runtimePlacementLabel(
        readRecord(selectedAgent.config).runtime_placement
        ?? readRecord(selectedAgent.metadata).runtime_placement
        ?? selectedAgent.runtime_target,
      )
    : 'Text Agent';
  const selectedContextPresetLabel = detailConfigDraft
    ? CONTEXT_PRESET_OPTIONS.find((option) => option.id === detailConfigDraft.contextBudgetPreset)?.label ?? 'Balanced'
    : 'Balanced';
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
  const overlayMemoryAgentId = readString(overlayAgentId || selectedAgentId);
  const overlayMemoryEntries = overlayMemoryAgentId
    ? agentMemoryById[overlayMemoryAgentId] ?? []
    : [];
  const overlayQualityStars = readNumber(overlayAgent?.quality_stars);
  const overlayCostTier = readString(overlayAgent?.cost_tier);
  const hasGatewayOnlineTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target) => target.id === 'local_companion' && target.online),
    [bootstrap.runtime.runtimeTargets],
  );
  const hasCloudComputerAvailableTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target) => target.id === 'sage_cloud_computer' && target.available),
    [bootstrap.runtime.runtimeTargets],
  );

  async function handleDeleteExternalUserData() {
    const agentId = readString(selectedAgent?.id);
    const externalUserId = readString(selectedExternalUserId);
    const channel = readString(selectedConversation?.channel || selectedTranscript?.channel).toLowerCase();
    if (!agentId || !externalUserId || !channel) {
      return;
    }
    const confirmed = window.confirm(
      `Delete saved conversation data for ${selectedExternalUserLabel} from this assistant? This removes message history, memory summaries, and usage records for that user.`,
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
      setStatusMessage(`Deleted saved data for ${selectedExternalUserLabel} from ${readString(selectedAgent?.name, 'this assistant')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Customer data could not be deleted.');
    } finally {
      setBusyExternalUserId(null);
    }
  }

  const connectorCardAgent = overlayAgent ?? selectedAgent;
  const overlayConnectorCards = connectorCardAgent ? SPECIALIST_CONNECTOR_CARDS.map((connector) => {
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
        className={joinClassNames(
          'app-studio-shell',
          currentStudioSubview === 'agents' && 'app-studio-shell--agents',
        )}
        title={studioTitle}
        subtitle={studioSubtitle}
        actions={currentStudioSubview === 'agents' ? (
          <AppButton type="button" tone="primary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
            Add agent
          </AppButton>
        ) : undefined}
      >
        {visibleGlobalErrorMessage ? (
          <PlatformNotification
            tone="danger"
            title="Build is having trouble loading"
            detail="Build keeps any successfully loaded assistant data visible while retrying failed requests."
            onClose={() => setErrorMessage(null)}
          >
            {visibleGlobalErrorMessage}
          </PlatformNotification>
        ) : statusMessage ? (
          <PlatformNotification
            tone="success"
            title="Assistant updated"
            detail={statusMessage}
            onClose={() => setStatusMessage(null)}
          />
        ) : null}

          <WorkstationSplitWorkbench
            ariaLabel="Agents"
            className="studio-agents-workbench"
            mainHeader={currentStudioSubview === 'agents' ? (
              <div className="studio-agents-workbench__header">
                {selectedAgent ? (
                  <div className="studio-agent-detail-tabs studio-agent-detail-tabs--header" role="tablist" aria-label="Agent sections">
                    {SPECIALIST_OVERLAY_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={overlayTab === tab.id}
                        className={joinClassNames(
                          'studio-agent-detail-tabs__button',
                          overlayTab === tab.id && 'studio-agent-detail-tabs__button--active',
                        )}
                        onClick={() => setOverlayTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="studio-agents-workbench__header-spacer" aria-hidden="true" />
                )}
                <AppButton type="button" tone="primary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                  Add agent
                </AppButton>
              </div>
            ) : undefined}
            sidebar={(
              <div className="app-stack-4">
                {showAgentsIndex ? (
                  <>
                    {recentlyCreatedAgentId && selectedAgent ? (
                      <ListDetailPanel
                        className="studio-panel studio-panel--demo-proof"
                        eyebrow="Next step"
                        title="Show proof in under a minute"
                        subtitle="Open activity to show customer work, then open billing and credits to show the revenue path."
                        actions={(
                          <div className="app-inline-actions app-inline-actions--tight">
                            <AppButton type="button" tone="secondary" onClick={() => setRecentlyCreatedAgentId(null)}>
                              Dismiss
                            </AppButton>
                          </div>
                        )}
                      >
                        <div className="app-inline-actions app-inline-actions--tight studio-inline-wrap">
                          <AppButton
                            type="button"
                            onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/activity`)}
                          >
                            Open Activity proof
                          </AppButton>
                          <AppButton
                            type="button"
                            tone="secondary"
                            onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`)}
                          >
                            Open billing & credits
                          </AppButton>
                          <AppButton
                            type="button"
                            tone="secondary"
                            onClick={() => {
                              setSelectedAgentId(recentlyCreatedAgentId);
                              setOverlayAgentId(null);
                              setOverlayTab('overview');
                            }}
                          >
                            Open assistant detail
                          </AppButton>
                        </div>
                      </ListDetailPanel>
                    ) : null}

                    <ListDetailPanel
                      className="studio-panel studio-panel--demo-path"
                      eyebrow="Start here"
                      title="Create one working business assistant"
                      subtitle="Choose a common business job, add the facts it should trust, test privately, then go live."
                      actions={(
                        <AppButton type="button" tone="primary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                          Create assistant
                        </AppButton>
                      )}
                    >
                      <div className="deployed-agents-card__badges" aria-label="Business assistant creation steps">
                        <span className="deployed-agents-card__badge">1. Pick business</span>
                        <span className="deployed-agents-card__badge">2. Add trusted info</span>
                        <span className="deployed-agents-card__badge">3. Test privately</span>
                        <span className="deployed-agents-card__badge">4. Go live</span>
                      </div>
                    </ListDetailPanel>

                    <ListDetailPanel
                      className="studio-panel studio-panel--demo-proof"
                      eyebrow="Investor demo"
                      title="Show the whole company story"
                      subtitle="Run one clean path: ask Sage, create or use Shop Assistant, answer from catalog, request approval for risky work, then show activity and billing proof."
                      actions={(
                        <div className="app-inline-actions app-inline-actions--tight studio-inline-wrap">
                          <AppButton type="button" tone="primary" onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/demo`)}>
                            Open Demo
                          </AppButton>
                          <AppButton type="button" tone="secondary" onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}`)}>
                            Ask Sage
                          </AppButton>
                          <AppButton type="button" tone="secondary" onClick={() => openCreateWizard('shop_assistant')}>
                            Create Shop Assistant
                          </AppButton>
                          <AppButton type="button" tone="secondary" onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/activity`)}>
                            Activity proof
                          </AppButton>
                          <AppButton type="button" tone="secondary" onClick={() => window.location.assign(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`)}>
                            Billing proof
                          </AppButton>
                        </div>
                      )}
                    >
                      <div className="deployed-agents-card__badges" aria-label="Investor demo certification flow">
                        <span className="deployed-agents-card__badge">1. Login</span>
                        <span className="deployed-agents-card__badge">2. Ask Sage</span>
                        <span className="deployed-agents-card__badge">3. Shop Assistant</span>
                        <span className="deployed-agents-card__badge">4. Live catalog answer</span>
                        <span className="deployed-agents-card__badge">5. Approval gate</span>
                        <span className="deployed-agents-card__badge">6. Activity</span>
                        <span className="deployed-agents-card__badge">7. Billing</span>
                        <span className="deployed-agents-card__badge">8. Computer proof if needed</span>
                      </div>
                    </ListDetailPanel>

                    <ListDetailPanel
                      className="studio-panel studio-panel--templates"
                      eyebrow="Templates"
                      title="What do you need?"
                      subtitle="Most owners start with one of these four paths: shop assistant, restaurant orders, dental receptionist, or support FAQ."
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
                            aria-label="Refresh build"
                            title="Refresh build"
                          >
                            <RefreshCw size={14} strokeWidth={1.9} aria-hidden="true" />
                          </AppButton>
                        </div>
                      ) : undefined}
                    >
                      <div className="studio-template-grid" data-studio-template-grid="true">
                        {primaryStudioTemplates.map((template) => (
                          <StudioTemplateCard
                            key={template.id}
                            template={template}
                            onSelect={openCreateWizard}
                          />
                        ))}
                      </div>
                      {additionalStudioTemplates.length > 0 ? (
                        <details className="app-stack-3">
                          <summary>More assistant types</summary>
                          <div className="studio-template-grid" data-studio-template-grid="more">
                            {additionalStudioTemplates.map((template) => (
                              <StudioTemplateCard
                                key={template.id}
                                template={template}
                                onSelect={openCreateWizard}
                              />
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </ListDetailPanel>

                    <div className={joinClassNames('studio-agents-nav', agents.length === 0 && 'studio-agents-nav--empty')} aria-label="Workspace agents">
                      {isAgentListPriming ? (
                        <div className="studio-agents-nav__empty">
                          <div className="studio-agents-nav__empty-copy">
                            <strong>Loading agents</strong>
                            <span>Checking this workspace for agents.</span>
                          </div>
                          <AppButton type="button" tone="secondary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                            Create agent
                          </AppButton>
                        </div>
                      ) : isAgentListUnavailable ? (
                        <div className="studio-agents-nav__empty">
                          <div className="studio-agents-nav__empty-copy">
                            <strong>Could not load agents</strong>
                            <span>Retry the agent list, or create a new workspace agent.</span>
                          </div>
                          <div className="studio-agents-nav__empty-actions">
                            <AppButton type="button" tone="primary" onClick={() => { void refreshAgents(); }}>
                              Retry
                            </AppButton>
                            <AppButton type="button" tone="secondary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                              Create agent
                            </AppButton>
                          </div>
                        </div>
                      ) : agents.length === 0 ? (
                        <div className="studio-agents-nav__empty">
                          <div className="studio-agents-nav__empty-copy">
                            <strong>No agents yet</strong>
                            <span>Create the first workspace agent.</span>
                          </div>
                          <AppButton type="button" tone="primary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                            Create agent
                          </AppButton>
                        </div>
                      ) : (
                        <>
                          <div className="studio-agents-nav__filters" aria-label="Agent filters">
                            {AGENT_ROSTER_FILTERS.map((filter) => (
                              <button
                                key={filter.id}
                                type="button"
                                className={joinClassNames(
                                  'studio-agents-nav__filter',
                                  agentRosterFilter === filter.id && 'studio-agents-nav__filter--active',
                                )}
                                aria-pressed={agentRosterFilter === filter.id}
                                onClick={() => setAgentRosterFilter(filter.id)}
                              >
                                <span>{filter.label}</span>
                                <strong>{agentRosterCounts[filter.id]}</strong>
                              </button>
                            ))}
                          </div>
                          {visibleAgents.length === 0 ? (
                            <div className="studio-agents-nav__placeholder">
                              <strong>No agents match</strong>
                              <span>Switch filters to see more workspace agents.</span>
                            </div>
                          ) : (
                            <div className="studio-agents-nav__items">
                              {visibleAgents.map((agent, index) => {
                                const agentId = readString(agent.id, `deployed-agent-${index}`);
                                const selected = agentId === selectedAgentId;
                                const agentMetrics = agentMetricsById[agentId] ?? null;
                                const channels = listEnabledChannels(agent.channels);
                                const channelLabel = humanizeToken(channels[0] || 'no_channel', 'No channel');
                                const modeLabel = runtimePlacementLabel(agentRuntimePlacement(agent));
                                const stateLabel = deploymentStateLabel(agent.deployment_state);
                                const displayName = readString(agent.name, agentId);
                                const latestActivityLabel = agentMetrics?.latestActivityLabel ?? 'Syncing recent activity';
                                return (
                                  <button
                                    key={agentId}
                                    type="button"
                                    className={joinClassNames(
                                      'studio-agents-nav__agent',
                                      selected && 'studio-agents-nav__agent--active',
                                    )}
                                    aria-selected={selected}
                                    onClick={() => {
                                      setSelectedAgentId(agentId);
                                      setOverlayAgentId(null);
                                      setOverlayTab('overview');
                                    }}
                                  >
                                    <span className="studio-agents-nav__copy">
                                      <span className="studio-agents-nav__label">{displayName}</span>
                                      <span className="studio-agents-nav__detail">
                                        {modeLabel} · {channelLabel} · {latestActivityLabel}
                                      </span>
                                    </span>
                                    <span className={joinClassNames('studio-agents-nav__status', `studio-agents-nav__status--${rosterStatusTone(agent.deployment_state)}`)}>
                                      {stateLabel}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                ) : null}

                {showReadinessPanel ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--readiness"
                    eyebrow="Readiness"
                    title="Launch readiness"
                    subtitle="The live channel and go-live posture for the selected assistant."
                  >
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Primary channel" value={activeChannels[0] ? humanizeToken(activeChannels[0], activeChannels[0]) : 'No live channel'} />
                      <FormReadout label="Channels" value={activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'} />
                      <FormReadout label="Model provider" value={selectedAgentModelDeployBlocker ? 'Needs connection' : formatDeploymentModelLabel(selectedAgent, providerCatalogIndex)} />
                      <FormReadout label="Agent mode" value={runtimePlacementLabel(readRecord(selectedAgent?.config).runtime_placement ?? readRecord(selectedAgent?.metadata).runtime_placement ?? selectedAgent?.runtime_target)} />
                    </FormGrid>
                    {selectedAgentModelDeployBlocker ? (
                      <StateBanner
                        tone="warning"
                        title="Connect a model provider before launch"
                        detail="Open Integrations and connect OpenRouter, OpenAI, Anthropic, Google Gemini, or another API provider."
                      />
                    ) : null}
                    {selectedAgentRuntimePlacement === 'customer_hosted' ? (
                      <div className="app-stack-2">
                        <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                          <FormReadout label="Node health" value={selfHostedNodeHealthLabel(selectedAgentSelfHostedNode)} />
                          <FormReadout label="Node" value={selectedAgentSelfHostedNode?.label || 'Not bound'} />
                          <FormReadout label="Node kind" value={humanizeToken(selectedAgentSelfHostedNode?.nodeKind, 'n/a')} />
                        </FormGrid>
                        {selectedAgentSelfHostedDeployBlocker ? (
                          <StateBanner
                            tone="warning"
                            title="Self-hosted readiness blocked"
                            detail={selectedAgentSelfHostedDeployBlocker}
                          />
                        ) : (
                          <StateBanner
                            tone="success"
                            title="Self-hosted readiness passed"
                            detail="This assistant runs on customer-hosted compute only. No silent fallback to platform-hosted compute."
                          />
                        )}
                      </div>
                    ) : null}
                  </ListDetailPanel>
                ) : null}
              </div>
            )}
          >
            <div className="app-stack-4">
                {currentStudioSubview === 'agents' && !selectedAgent ? (
                  isAgentListPriming ? (
                    <div className="studio-agent-detail-loading" aria-label="Loading agent profile">
                      <SkeletonBlock height="2.75rem" />
                      <SkeletonBlock height="8rem" />
                      <div className="studio-agent-detail-loading__grid">
                        <SkeletonBlock height="6rem" />
                        <SkeletonBlock height="6rem" />
                        <SkeletonBlock height="6rem" />
                      </div>
                    </div>
                  ) : (
                    <div className="studio-agent-detail-empty" aria-label="Agent detail">
                      <strong>{isAgentListUnavailable ? 'Agent list did not load' : agents.length === 0 ? 'Add your agent' : 'Select an agent'}</strong>
                      <span>
                        {isAgentListUnavailable
                          ? 'Retry the workspace agent list. Once an agent is selected, its overview, actions, memory, integrations, and results appear here.'
                          : agents.length === 0
                          ? 'Create the first workspace agent, then configure its memory, integrations, channels, and actions here.'
                          : 'Agent configuration, channels, memory, analytics, and launch state will appear here.'}
                      </span>
                      {isAgentListUnavailable ? (
                        <div className="app-inline-actions app-inline-actions--tight">
                          <AppButton type="button" tone="primary" onClick={() => { void refreshAgents(); }}>
                            Retry
                          </AppButton>
                          <AppButton type="button" tone="secondary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                            Create agent
                          </AppButton>
                        </div>
                      ) : agents.length === 0 ? (
                        <AppButton type="button" tone="primary" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                          Create agent
                        </AppButton>
                      ) : null}
                    </div>
                  )
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'chat' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Chat"
                    title="Chat"
                    subtitle="Private messages for checking the selected agent before live customer traffic."
                  >
                    {selectedAgent.id && workspaceId ? (
                      <AgentPlaygroundPanel
                        deployedAgentId={readString(selectedAgent.id)}
                        workspaceId={workspaceId}
                        client={services.client}
                        agentName={readString(selectedAgent.name, 'agent')}
                        runtimeMode={testRuntimeModeForPlacement(selectedAgentRuntimePlacement)}
                      />
                    ) : (
                      <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then test it here." />
                    )}
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'knowledge' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Knowledge"
                    title="Agent knowledge"
                    subtitle="Instructions and trusted sources this agent should use when answering."
                    actions={(
                      <AppButton type="button" tone="secondary" onClick={openEditWizard}>
                        Edit
                      </AppButton>
                    )}
                  >
                    <div className="studio-agent-knowledge">
                      <div className="studio-agent-knowledge__block">
                        <span>Instructions</span>
                        <strong>Behavior document</strong>
                        <p>{readString(selectedAgent.system_prompt, 'No response instructions configured yet.')}</p>
                      </div>
                      <div className="studio-agent-knowledge__block">
                        <span>Role and tone</span>
                        <p>{readString(selectedAgent.persona, 'No persona configured yet.')}</p>
                      </div>
                      <div className="studio-agent-knowledge__grid">
                        <div>
                          <span>Sources</span>
                          <strong>{knowledgeSourceCount} connected</strong>
                        </div>
                        <div>
                          <span>Source depth</span>
                          <strong>{selectedContextPresetLabel}</strong>
                        </div>
                        <div>
                          <span>Retrieval test</span>
                          <strong>{knowledgeSourceCount > 0 ? 'Ready' : 'Add sources'}</strong>
                        </div>
                      </div>
                      {detailConfigDraft ? (
                        <ContextPresetControl
                          value={detailConfigDraft.contextBudgetPreset}
                          onSelect={(nextValue) => setDetailConfigDraft((current) => current ? { ...current, contextBudgetPreset: nextValue } : current)}
                        />
                      ) : null}
                      <div className="studio-agent-knowledge__sources">
                        <div className="studio-agent-knowledge__section-head">
                          <div>
                            <span>Sources</span>
                            <strong>Files, URLs, app docs, tables, or notes</strong>
                          </div>
                          <AppButton type="button" tone="secondary" onClick={openEditWizard}>
                            Add source
                          </AppButton>
                        </div>
                        {selectedKnowledgeSources.length === 0 ? (
                          <div className="deployed-agents-overlay__empty">No knowledge sources connected yet.</div>
                        ) : selectedKnowledgeSources.map((source, index) => {
                          const record = readRecord(source);
                          const label = readString(record.label ?? record.uri ?? record.id, `Knowledge source ${index + 1}`);
                          return (
                            <div key={`${label}-${index}`} className="studio-agent-knowledge__source">
                              <strong>{label}</strong>
                              <span>{readString(record.kind, humanizeToken(record.type, inferKnowledgeSourceKind(label)))}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="studio-agent-knowledge__block">
                        <span>Retrieval / Test</span>
                        <strong>Ask what the agent would use</strong>
                        <div className="studio-agent-knowledge__test">
                          <input
                            type="text"
                            readOnly
                            value=""
                            placeholder="Example: What sources would answer a refund policy question?"
                            aria-label="Knowledge retrieval test prompt"
                          />
                          <AppButton type="button" tone="secondary" onClick={() => setOverlayTab('chat')}>
                            Test in chat
                          </AppButton>
                        </div>
                        <p>{knowledgeSourceCount > 0 ? `${knowledgeSourceCount} source${knowledgeSourceCount === 1 ? '' : 's'} available for private test chat.` : 'Add a source, then test whether the agent cites the right material.'}</p>
                      </div>
                      {detailConfigDraft ? (
                        <div className="app-inline-actions">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      ) : null}
                    </div>
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'ai' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Model"
                    title="Agent model"
                    subtitle="Choose the provider account, model, and visible usage price for this agent."
                  >
                    {detailConfigDraft ? (
                      <>
                        <AgentAiSettingsSections
                          value={detailConfigDraft}
                          providerCatalog={providerCatalog}
                          isLoadingProviderCatalog={isLoadingProviderCatalog}
                          onSelectTier={updateDetailAiTier}
                          onSelectProvider={updateDetailProvider}
                          onSelectModel={updateDetailModel}
                          onRefreshProviderModels={(providerId) => { void refreshProviderModels(providerId); }}
                          onOpenIntegrations={() => setOverlayTab('connectors')}
                        />
                        <div className="app-inline-actions">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      </>
                    ) : null}
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'tools' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Actions"
                    title="Agent actions"
                    subtitle="Choose what this agent may do with connected services."
                  >
                    {detailConfigDraft ? (
                      <>
                        <AgentActionCapabilitySections
                          selectedToolIds={detailConfigDraft.selectedToolIds}
                          onOpenIntegrations={() => setOverlayTab('connectors')}
                          onToggleTool={(toolId) => {
                            setDetailConfigDraft((current) => {
                              if (!current) {
                                return current;
                              }
                              const nextSelected = current.selectedToolIds.includes(toolId)
                                ? current.selectedToolIds.filter((item) => item !== toolId)
                                : [...current.selectedToolIds, toolId];
                              return { ...current, selectedToolIds: nextSelected };
                            });
                          }}
                        />
                        <div className="app-inline-actions">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      </>
                    ) : null}
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'memory' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Memory"
                    title="Agent memory"
                    subtitle="Control what this agent can carry forward from customer conversations."
                  >
                    {detailConfigDraft ? (
                      <>
                        <div className="deployed-agents-overlay__toggle-row">
                          <div className="sage-tool-row__copy">
                            <strong className="sage-tool-row__title">Persistent memory</strong>
                            <p className="sage-tool-row__description">Remember useful customer facts across conversations.</p>
                          </div>
                          <button
                            type="button"
                            className={joinClassNames('sage-tool-toggle', detailConfigDraft.memoryEnabled && 'sage-tool-toggle--enabled')}
                            role="switch"
                            aria-checked={detailConfigDraft.memoryEnabled}
                            onClick={() => setDetailConfigDraft((current) => current ? { ...current, memoryEnabled: !current.memoryEnabled } : current)}
                          >
                            <span className="sage-tool-toggle__thumb" />
                          </button>
                        </div>
                        {detailConfigDraft.memoryEnabled ? (
                          <div className="studio-agent-memory-settings">
                          <RetentionPresetControl
                            value={detailConfigDraft.retentionPreset}
                            onSelect={(nextValue) => setDetailConfigDraft((current) => current ? { ...current, retentionPreset: nextValue } : current)}
                          />
                          </div>
                        ) : null}
                        <div className="deployed-agents-overlay__memory-list">
                          {isLoadingOverlayMemory && overlayMemoryEntries.length === 0 ? (
                            <>
                              <SkeletonBlock height="4rem" />
                              <SkeletonBlock height="4rem" />
                            </>
                          ) : overlayMemoryEntries.length === 0 ? (
                            <div className="deployed-agents-overlay__empty">No customer memory yet. Memory builds as customers chat with this agent.</div>
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
                        <div className="app-inline-actions">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      </>
                    ) : null}
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'connectors' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Integrations"
                    title="Agent integrations"
                    subtitle="Connect customer channels and trusted systems after the agent exists."
                  >
                    <AgentIntegrationsSections
                      providerCatalog={providerCatalog}
                      connectorCards={overlayConnectorCards}
                      workspaceId={workspaceId}
                    />
                  </ListDetailPanel>
                ) : null}

                {currentStudioSubview === 'agents' && selectedAgent && overlayTab === 'analytics' ? (
                  <ListDetailPanel
                    className="studio-panel studio-panel--detail"
                    eyebrow="Results"
                    title="Agent results"
                    subtitle="Activity and outcome signals for the selected agent."
                  >
                    <WorkstationDeployedAgentAnalyticsPane
                      agentId={readString(selectedAgent.id)}
                      workspaceId={services.scope.workspaceId}
                    />
                  </ListDetailPanel>
                ) : null}

                {showDetailPanel ? (
                <ListDetailPanel
                  className="studio-panel studio-panel--detail"
                  eyebrow="Detail"
                  title={selectedAgent ? readString(selectedAgent.name, 'Assistant details') : 'Assistant details'}
                  subtitle={selectedAgent ? 'Launch state, actions, memory, and cost posture for the selected assistant.' : 'Select an assistant.'}
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
                          || (selectedAgentNeedsTelegramReadiness && isLoadingTelegramReadiness)
                          || isLoadingRuntimeAttachments
                          || (selectedAgentNeedsTelegramReadiness && !selectedTelegramReadiness)
                          || (selectedAgentNeedsTelegramReadiness && selectedTelegramReadiness !== null && selectedTelegramReadiness.readyForLive !== true)
                          || Boolean(selectedAgentModelDeployBlocker)
                          || Boolean(selectedAgentSelfHostedDeployBlocker)
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
                    <div className="studio-template-detail" data-studio-template-detail="true">
                      <span className="studio-template-card__icon studio-template-detail__icon" aria-hidden="true">
                        {selectedStudioTemplate.icon}
                      </span>
                      <div className="studio-template-detail__copy">
                        <span className="studio-template-card__category">{selectedStudioTemplate.category}</span>
                        <strong className="studio-template-detail__title">{selectedStudioTemplate.title}</strong>
                        <p className="studio-template-detail__description">{selectedStudioTemplate.description}</p>
                      </div>
                      <FormGrid columns="repeat(auto-fit, minmax(10rem, 1fr))">
                        <FormReadout label="Setup time" value={selectedStudioTemplate.setupTime} />
                        <FormReadout label="Channel" value={selectedStudioTemplate.channelLabel} />
                        <FormReadout label="Memory" value={selectedStudioTemplate.memoryEnabled ? 'Enabled by default' : 'Off by default'} />
                        <FormReadout label="Source depth" value={humanizeToken(selectedStudioTemplate.contextBudgetPreset, 'Balanced')} />
                      </FormGrid>
                      <div className="studio-template-detail__group">
                        <span className="studio-template-detail__label">What you’ll connect</span>
                        <div className="studio-template-card__tags">
                          {selectedStudioTemplate.requiredConnectors.map((connector) => (
                            <span key={connector} className="studio-template-card__tag">{connector}</span>
                          ))}
                        </div>
                      </div>
                      <div className="studio-template-detail__group">
                        <span className="studio-template-detail__label">Suggested actions</span>
                        <div className="studio-template-card__tags">
                          {selectedStudioTemplate.selectedToolIds.map((toolId) => (
                            <span key={toolId} className="studio-template-card__tag">{toolLabel(toolId)}</span>
                          ))}
                        </div>
                      </div>
                      <div className="studio-template-detail__group">
                        <span className="studio-template-detail__label">Launch checklist</span>
                        <ul className="studio-template-detail__checklist">
                          <li>Name the assistant and review the behavior.</li>
                          <li>Add the trusted source of truth.</li>
                          <li>Connect the customer channel only when ready.</li>
                          <li>Test privately before deploying live traffic.</li>
                        </ul>
                      </div>
                      <div className="app-inline-actions app-inline-actions--tight">
                        <AppButton type="button" onClick={() => openCreateWizard(selectedStudioTemplate.id)}>
                          Create assistant
                        </AppButton>
                      </div>
                    </div>
                  ) : isLoadingDetail ? (
                    <>
                      <SkeletonBlock height="3rem" />
                      <SkeletonBlock height="4rem" />
                    </>
                  ) : (
                    <>
                      {selectedAgentNeedsTelegramReadiness && selectedTelegramReadiness ? (
                        <StateBanner
                          tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                          title={selectedTelegramReadiness.readyForLive ? 'Telegram launch ready' : 'Telegram launch not ready'}
                          detail={selectedTelegramReadiness.nextAction ?? 'Connected app checks are in progress.'}
                        >
                          {selectedTelegramReadiness.blockers.length > 0
                            ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                            : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || `${selectedTelegramReadiness.connectors.length} connected app${selectedTelegramReadiness.connectors.length === 1 ? '' : 's'} checked.`}
                        </StateBanner>
                      ) : selectedAgentNeedsTelegramReadiness && isLoadingTelegramReadiness ? (
                        <SkeletonBlock height="5rem" />
                      ) : null}
                      <div className="studio-agent-overview">
                        <div className="studio-agent-overview__metrics">
                          <div className="studio-agent-metric">
                            <span>Active users</span>
                            <strong>{selectedAnalytics ? formatCompactCount(selectedAnalytics.activeUsersLast30d) : (isLoadingAnalytics ? 'Syncing' : '0')}</strong>
                            <small>Last 30 days</small>
                          </div>
                          <div className="studio-agent-metric">
                            <span>Messages</span>
                            <strong>{selectedAnalytics ? formatCompactCount(selectedAnalytics.messageVolumeMonth) : (isLoadingAnalytics ? 'Syncing' : '0')}</strong>
                            <small>This month</small>
                          </div>
                          <div className="studio-agent-metric">
                            <span>Customers</span>
                            <strong>{selectedAgentMetrics?.conversationCountLabel ?? '0'}</strong>
                            <small>Total conversations</small>
                          </div>
                          <div className="studio-agent-metric">
                            <span>Escalation rate</span>
                            <strong>{selectedAnalytics ? `${selectedAnalytics.escalationRatePercent.toFixed(1)}%` : '0.0%'}</strong>
                            <small>Owner review pressure</small>
                          </div>
                        </div>

                        <div className="studio-agent-overview__chart">
                          <div className="studio-agent-overview__chart-copy">
                            <span>Traffic trend</span>
                            <strong>{selectedAnalytics ? formatCompactCount(selectedAnalytics.messageVolumeMonth) : '0'} messages</strong>
                            <small>Daily, weekly, and monthly message signal for this agent.</small>
                          </div>
                          <svg className="studio-agent-overview__sparkline" viewBox="0 0 100 88" preserveAspectRatio="none" aria-hidden="true">
                            <line x1="0" y1="76" x2="100" y2="76" />
                            <polyline points={overviewTrendPoints} />
                          </svg>
                        </div>

                        <div className="studio-agent-overview__facts">
                          <div><span>State</span><strong>{humanizeToken(selectedAgent.deployment_state, 'Draft')}</strong></div>
                          <div><span>Mode</span><strong>{selectedAgentModeLabel}</strong></div>
                          <div><span>Model</span><strong>{selectedModelId(selectedAgent) || humanizeToken(selectedProviderId(selectedAgent), 'Not pinned')}</strong></div>
                          <div><span>Channels</span><strong>{activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'}</strong></div>
                          <div><span>Actions</span><strong>{normalizeToolIds(readRecord(readRecord(selectedAgent.config).tool_policy).enabled_tools ?? readRecord(selectedAgent.metadata).selected_tool_ids).length || 0} enabled</strong></div>
                          <div><span>Memory</span><strong>{selectedAgentMemoryEnabled ? 'Enabled' : 'Disabled'}</strong></div>
                          <div><span>Knowledge</span><strong>{knowledgeSourceCount} sources</strong></div>
                          <div><span>Source depth</span><strong>{selectedContextPresetLabel}</strong></div>
                          <div><span>Budget</span><strong>{formatUsd(selectedBudgetCycle.current_burn_usd)}</strong></div>
                          <div><span>Last activity</span><strong>{selectedAgentMetrics?.latestActivityLabel ?? 'No recent activity'}</strong></div>
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
                  subtitle="Open customer sessions for the selected assistant, with filters for channel, handoff, and outcome."
                >
                  {!selectedAgent ? (
                    <EmptyPanel
                      title="Select an assistant first"
                      body="Pick an assistant to open its inbox and review customer sessions."
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
          </WorkstationSplitWorkbench>

        {currentStudioSubview === 'agents' && overlayAgent ? (
          <div className="deployed-agents-overlay" role="dialog" aria-modal="true" aria-label="Assistant settings">
            <div className="deployed-agents-overlay__shell">
              <div className="deployed-agents-overlay__header">
                <div className="deployed-agents-overlay__identity">
                  <span className="deployed-agents-overlay__avatar" aria-hidden="true">
                    {readString(overlayAgent.name, 'S').charAt(0).toUpperCase()}
                  </span>
                  <div className="deployed-agents-overlay__copy">
                    <strong className="deployed-agents-overlay__title">{readString(overlayAgent.name, 'Assistant')}</strong>
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
                  aria-label="Close assistant settings"
                >
                  <X size={16} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </div>

              <div className="deployed-agents-overlay__tabs" role="tablist" aria-label="Assistant settings tabs">
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
                          placeholder="Assistant name"
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
                          <strong className="deployed-agents-overlay__marketplace-title">Discover listing</strong>
                          <p className="deployed-agents-overlay__marketplace-hint">
                            Build keeps assistants private by default. Only turn this on if you want this assistant to appear in Discover.
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
                          label="Show in Discover"
                          hint="Owners control public listing. Leave this off for private assistants."
                        >
                          <FormReadout
                            label="Show in Discover"
                            value={overlayMarketplaceListed ? 'Visible in Discover' : 'Private assistant'}
                          />
                        </FormField>
                        <FormField label="Discover category" hint="Only used when this assistant is visible in Discover.">
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
                              || (selectedAgentNeedsTelegramReadiness && isLoadingTelegramReadiness)
                              || isLoadingRuntimeAttachments
                              || (selectedAgentNeedsTelegramReadiness && !selectedTelegramReadiness)
                              || (selectedAgentNeedsTelegramReadiness && selectedTelegramReadiness !== null && selectedTelegramReadiness.readyForLive !== true)
                              || Boolean(selectedAgentModelDeployBlocker)
                              || Boolean(selectedAgentSelfHostedDeployBlocker)
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

                {overlayTab === 'ai' ? (
                  <div className="deployed-agents-overlay__section">
                    {detailConfigDraft ? (
                      <>
                        <AgentAiSettingsSections
                          value={detailConfigDraft}
                          providerCatalog={providerCatalog}
                          isLoadingProviderCatalog={isLoadingProviderCatalog}
                          onSelectTier={updateDetailAiTier}
                          onSelectProvider={updateDetailProvider}
                          onSelectModel={updateDetailModel}
                          onRefreshProviderModels={(providerId) => { void refreshProviderModels(providerId); }}
                          onOpenIntegrations={() => setOverlayTab('connectors')}
                        />
                        <div className="deployed-agents-overlay__footer">
                          <AppButton type="button" onClick={() => { void saveDetailConfig(); }} disabled={isSavingDetailConfig}>
                            {isSavingDetailConfig ? 'Saving…' : 'Save'}
                          </AppButton>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {overlayTab === 'tools' ? (
                  <div className="deployed-agents-overlay__section">
                    <AgentActionCapabilitySections
                      selectedToolIds={detailConfigDraft?.selectedToolIds ?? []}
                      onOpenIntegrations={() => setOverlayTab('connectors')}
                      onToggleTool={(toolId) => {
                        setDetailConfigDraft((current) => {
                          if (!current) {
                            return current;
                          }
                          const nextSelected = current.selectedToolIds.includes(toolId)
                            ? current.selectedToolIds.filter((item) => item !== toolId)
                            : [...current.selectedToolIds, toolId];
                          return { ...current, selectedToolIds: nextSelected };
                        });
                      }}
                    />
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
                            <p className="sage-tool-row__description">Remember useful customer facts across conversations.</p>
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
                        {detailConfigDraft.memoryEnabled ? (
                          <RetentionPresetControl
                            value={detailConfigDraft.retentionPreset}
                            onSelect={(nextValue) => {
                              setDetailConfigDraft((current) => current ? { ...current, retentionPreset: nextValue } : current);
                            }}
                          />
                        ) : null}
                        <div className="deployed-agents-overlay__memory-list">
                          {isLoadingOverlayMemory && overlayMemoryEntries.length === 0 ? (
                            <>
                              <SkeletonBlock height="4rem" />
                              <SkeletonBlock height="4rem" />
                            </>
                          ) : overlayMemoryEntries.length === 0 ? (
                            <div className="deployed-agents-overlay__empty">No customer memory yet — memory builds as customers chat with this assistant.</div>
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
                    <AgentIntegrationsSections
                      providerCatalog={providerCatalog}
                      connectorCards={overlayConnectorCards}
                      workspaceId={workspaceId}
                    />
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
        title={wizardMode === 'create' ? 'Create agent' : 'Edit agent'}
        description={
          wizardMode === 'create'
            ? 'Start with a deploy-safe draft. Add knowledge, integrations, and channels after it exists.'
            : 'Adjust the agent profile, knowledge, customer channel, and safety behavior.'
        }
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
              {wizardStepIndex < activeWizardSteps.length - 1 ? (
                <AppButton
                  type="button"
                  onClick={() => setWizardStepIndex((current) => Math.min(activeWizardSteps.length - 1, current + 1))}
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
                  {wizardMode === 'create' ? 'Create agent' : 'Save'}
                </AppButton>
              )}
            </div>
          )}
        >
          <div data-deployed-agent-wizard="root" className="deployed-agents-wizard">
            {activeWizardSteps.length > 1 ? (
            <div className="deployed-agents-wizard__steps">
              {activeWizardSteps.map((step, index) => (
                <button
                  type="button"
                  key={step.id}
                  data-deployed-agent-wizard-step={step.id}
                  className="deployed-agents-wizard__step"
                  data-active={index === wizardStepIndex ? 'true' : 'false'}
                  disabled={isSubmittingWizard}
                  onClick={() => setWizardStepIndex(index)}
                >
                  <span className="deployed-agents-wizard__step-eyebrow">
                    Step {index + 1}
                  </span>
                  <strong className="deployed-agents-wizard__step-title">{step.label}</strong>
                </button>
              ))}
            </div>
            ) : null}

            {summarizeStudioErrorMessage(wizardErrorMessage) ? (
              <StateBanner tone="warning" title="Agent setup needs attention">
                {summarizeStudioErrorMessage(wizardErrorMessage)}
              </StateBanner>
            ) : null}

            <ModalSection title={wizardStep.label} description={wizardStep.description}>
              {wizardStep.id === 'overview' ? (
                wizardMode === 'create' ? (
                  <div className="deployed-agents-wizard__create-draft">
                    <div className="deployed-agents-wizard__quickstart">
                      <FormField label="Agent name" hint="The name your team sees in the agent list.">
                        <FormInput
                          value={wizardState.name}
                          onChange={(event) => setWizardField('name', event.currentTarget.value)}
                          placeholder="New agent"
                        />
                      </FormField>
                    </div>
                  </div>
                ) : (
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Assistant name" hint="The public name customers will see.">
                      <FormInput
                        value={wizardState.name}
                        onChange={(event) => setWizardField('name', event.currentTarget.value)}
                        placeholder="Bluebird Cafe"
                      />
                    </FormField>
                    <FormField label="Avatar URL" hint="Optional public avatar or brand mark.">
                      <FormInput
                        value={wizardState.avatar}
                        onChange={(event) => setWizardField('avatar', event.currentTarget.value)}
                        placeholder="https://example.com/avatar.png"
                      />
                    </FormField>
                    <FormField label="Personality" hint="Short description of how this assistant should speak and behave.">
                      <FormTextarea
                        rows={4}
                        value={wizardState.persona}
                        onChange={(event) => setWizardField('persona', event.currentTarget.value)}
                        placeholder="Fast, friendly customer assistant for a cafe, clinic, shop, or support desk."
                      />
                      <div className="deployed-agents-wizard__memory-toggle">
                        <div className="sage-tool-row__copy">
                          <strong className="sage-tool-row__title">Enable persistent memory</strong>
                          <p className="sage-tool-row__description">Assistant remembers useful customer facts across conversations.</p>
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
                    </FormField>
                    <FormField label="Purpose and behavior" hint="Core customer instructions this assistant follows.">
                      <FormTextarea
                        rows={6}
                        value={wizardState.systemPrompt}
                        onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                        placeholder="Answer menu questions, check specials and availability, confirm orders clearly, and escalate edge cases to a human."
                      />
                    </FormField>
                    <FormField label="Knowledge references" hint="Menu, catalog, FAQ, or Google Sheet references, one per line.">
                      <FormTextarea
                        rows={6}
                        value={wizardState.knowledgeSourceText}
                        onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                        placeholder={'kb://menu-pdf\nsheet://daily-menu'}
                      />
                      <ContextPresetControl
                        value={wizardState.contextBudgetPreset}
                        onSelect={(nextValue) => setWizardField('contextBudgetPreset', nextValue)}
                      />
                    </FormField>
                  </FormGrid>
                )
              ) : null}

              {wizardStep.id === 'knowledge' ? (
                <div className="app-stack-3">
                  <FormField label="Knowledge source" hint="Paste a sheet, PDF, document, URL, or leave empty and add it later.">
                    <FormTextarea
                      rows={5}
                      value={wizardState.knowledgeSourceText}
                      onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                      placeholder={selectedStudioTemplate.knowledgePlaceholder}
                    />
                  </FormField>
                  <FormField label="Instructions" hint="Specific rules this assistant must follow when answering customers.">
                    <FormTextarea
                      data-deployed-agent-instructions-input="true"
                      rows={6}
                      value={wizardState.systemPrompt}
                      onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                      placeholder={selectedStudioTemplate.systemPrompt}
                    />
                  </FormField>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Public intro" hint="Optional customer-facing intro for mini-app or channel entry points.">
                      <FormTextarea
                        rows={3}
                        value={wizardState.welcomeIntro}
                        onChange={(event) => setWizardField('welcomeIntro', event.currentTarget.value)}
                        placeholder="Quickly ask questions, check availability, and get help."
                      />
                    </FormField>
                    <FormField label="Core value" hint="One sentence explaining what this assistant does for customers.">
                      <FormTextarea
                        rows={3}
                        value={wizardState.welcomeCoreValue}
                        onChange={(event) => setWizardField('welcomeCoreValue', event.currentTarget.value)}
                        placeholder={selectedStudioTemplate.outcome}
                      />
                    </FormField>
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'tools' ? (
                <div className="app-stack-3">
                  <FormField label="Actions this assistant can take" hint="Keep this narrow. Add only the actions needed for the job.">
                    <div className="deployed-agents-wizard__tool-grid">
                      {STUDIO_TOOL_OPTIONS.map((tool) => {
                        const selected = wizardState.selectedToolIds.includes(tool.id);
                        return (
                          <button
                            key={tool.id}
                            type="button"
                            className={joinClassNames(
                              'deployed-agents-wizard__tool-card',
                              selected && 'deployed-agents-wizard__tool-card--selected',
                            )}
                            aria-pressed={selected}
                            onClick={() => {
                              setWizardState((current) => {
                                const nextSelectedToolIds = current.selectedToolIds.includes(tool.id)
                                  ? current.selectedToolIds.filter((item) => item !== tool.id)
                                  : [...current.selectedToolIds, tool.id];
                                return {
                                  ...current,
                                  selectedToolIds: nextSelectedToolIds,
                                };
                              });
                            }}
                          >
                            <span>{selected ? 'Enabled' : 'Disabled'}</span>
                            <strong>{tool.label}</strong>
                            <small>{tool.description}</small>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                </div>
              ) : null}

              {wizardStep.id === 'channels' ? (
                <div className="app-stack-3">
                  {selectedTelegramReadiness ? (
                    <StateBanner
                      tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                      title={selectedTelegramReadiness.readyForLive ? 'Telegram launch path is ready' : 'Telegram launch checks'}
                      detail={selectedTelegramReadiness.nextAction ?? 'Connected app checks are in progress.'}
                    >
                      {selectedTelegramReadiness.blockers.length > 0
                        ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                        : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || `${selectedTelegramReadiness.connectors.length} connected app${selectedTelegramReadiness.connectors.length === 1 ? '' : 's'} checked.`}
                    </StateBanner>
                  ) : isLoadingTelegramReadiness ? (
                    <SkeletonBlock height="5rem" />
                  ) : null}
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Telegram state" hint="Enable Telegram when this assistant is ready for live customer conversations.">
                      <FormSelect
                        value={wizardState.telegramEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => {
                          const enabled = event.currentTarget.value === 'enabled';
                          setWizardState((current) => ({
                            ...current,
                            telegramEnabled: enabled,
                            customerChannel: enabled
                              ? 'telegram'
                              : (current.customerChannel === 'telegram' ? 'draft' : current.customerChannel),
                          }));
                        }}
                      >
                        <option value="disabled">Keep disabled</option>
                        <option value="enabled">Ready for live deploy</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Telegram connected app" hint="Bind to one workspace Telegram bot.">
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
                            ? 'Checking Telegram connected apps…'
                            : selectedTelegramReadiness?.connectors.length
                              ? 'Select a Telegram bot'
                              : 'No Telegram connected apps available'}
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
                        Build needs one Telegram bot before this assistant can go live.
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

              {wizardStep.id === 'memory' ? (
                <div className="app-stack-3">
                  <div className="deployed-agents-wizard__memory-toggle deployed-agents-wizard__memory-toggle--panel">
                    <div className="sage-tool-row__copy">
                      <strong className="sage-tool-row__title">Persistent customer memory</strong>
                      <p className="sage-tool-row__description">
                        Remember useful customer facts across conversations.
                      </p>
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
                  {wizardState.memoryEnabled ? (
                    <RetentionPresetControl
                      value={wizardState.retentionPreset}
                      onSelect={(nextValue) => setWizardField('retentionPreset', nextValue)}
                    />
                  ) : null}
                </div>
              ) : null}

              {wizardStep.id === 'safety' ? (
                <div className="app-stack-3">
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Human handoff" hint="When the assistant should involve a human.">
                      <FormSelect
                        value={wizardState.escalationPreset}
                        onChange={(event) => setWizardField('escalationPreset', event.currentTarget.value)}
                      >
                        <option value="conservative">Escalate early</option>
                        <option value="standard">Standard</option>
                        <option value="autonomous">More autonomous</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Handoff mode" hint="Where human handoff should go.">
                      <FormSelect
                        value={wizardState.handoffMode}
                        onChange={(event) => setWizardField('handoffMode', event.currentTarget.value)}
                      >
                        <option value="notify_owner">Notify owner</option>
                        <option value="pause_thread">Pause customer thread</option>
                        <option value="summary_only">Create summary only</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Owner notification destination" hint="Email, Telegram chat, or internal queue for handoff.">
                      <FormInput
                        value={wizardState.ownerNotificationDestination}
                        onChange={(event) => setWizardField('ownerNotificationDestination', event.currentTarget.value)}
                        placeholder="owner@example.com"
                      />
                    </FormField>
                    <FormField label="Paused message" hint="What customers see when the assistant is paused.">
                      <FormInput
                        value={wizardState.pausedMessage}
                        onChange={(event) => setWizardField('pausedMessage', event.currentTarget.value)}
                        placeholder="A human will follow up shortly."
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Sensitive-topic safety" hint="Enable for health, legal, finance, or restricted customer cases.">
                      <FormSelect
                        value={wizardState.healthSafetyEnabled ? 'enabled' : 'disabled'}
                        onChange={(event) => setWizardField('healthSafetyEnabled', event.currentTarget.value === 'enabled')}
                      >
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Safety assistant name" hint="Optional name used in regulated-domain handoffs.">
                      <FormInput
                        value={wizardState.healthSafetyAssistantName}
                        onChange={(event) => setWizardField('healthSafetyAssistantName', event.currentTarget.value)}
                        placeholder="Safety reviewer"
                      />
                    </FormField>
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'test' ? (
                <div className="app-stack-3">
                  <StateBanner
                    tone="neutral"
                    title="Draft review"
                    detail="This is the pre-launch checklist. Create the assistant, test it privately, then deploy from the detail panel."
                  />
                  <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                    <FormReadout label="Template" value={selectedStudioTemplate.title} />
                    <FormReadout label="Assistant name" value={wizardState.name || 'Not named'} />
                    <FormReadout label="Channel" value={wizardState.customerChannel === 'telegram' ? 'Telegram bot' : wizardState.customerChannel === 'draft' ? 'Draft only' : humanizeToken(wizardState.customerChannel, 'Draft only')} />
                    <FormReadout label="Knowledge" value={wizardState.knowledgeSourceText.trim() ? 'Source added' : 'Add later'} />
                    <FormReadout label="Actions" value={`${wizardState.selectedToolIds.length} enabled`} />
                    <FormReadout label="Memory" value={wizardState.memoryEnabled ? 'Enabled' : 'Disabled'} />
                  </FormGrid>
                </div>
              ) : null}

              {wizardStep.id === 'deploy' ? (
                <div className="app-stack-3">
                  <StateBanner
                    tone="neutral"
                    title="Launch contract for this business assistant"
                    detail="Defaults are safe for production. Change these only when the assistant needs a different runtime, channel, or spending cap."
                  />
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="AI tier" hint="Product-level capability for this assistant.">
                      <FormSelect
                        value={wizardState.aiTier}
                        onChange={(event) => {
                          const nextTier = normalizeWizardAiTier(event.currentTarget.value);
                          const route = resolveProviderModelForTier(nextTier, providerCatalog);
                          setWizardState((current) => ({
                            ...current,
                            aiTier: nextTier,
                            providerId: route.providerId || current.providerId,
                            modelId: route.modelId || current.modelId,
                          }));
                        }}
                      >
                        {STUDIO_AI_TIER_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FormSelect>
                      <div className="app-surface-field-help">
                        {STUDIO_AI_TIER_OPTIONS.find((item) => item.value === wizardState.aiTier)?.hint}
                      </div>
                    </FormField>
                    <FormField label="Agent mode" hint="Choose how this assistant runs. Internal identifiers are hidden in this view.">
                      <RuntimeModeSelector
                        value={wizardState.runtimePlacement}
                        options={STUDIO_RUNTIME_OPTIONS}
                        hasGatewayOnlineTarget={hasGatewayOnlineTarget}
                        hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
                        onSelect={(nextRuntime) => {
                          setWizardState((current) => ({
                            ...current,
                            runtimePlacement: nextRuntime,
                            runtimeTarget: runtimeTargetForPlacement(nextRuntime),
                          }));
                        }}
                      />
                    </FormField>
                    <FormField label="Approval mode" hint="How much autonomy this assistant gets before human handoff.">
                      <FormSelect
                        value={wizardState.approvalMode}
                        onChange={(event) => {
                          const nextMode = readString(event.currentTarget.value) as WizardState['approvalMode'];
                          const normalizedMode = nextMode === 'guarded' || nextMode === 'autonomous' ? nextMode : 'balanced';
                          const mapping = applyApprovalModeToWizardState(normalizedMode, {
                            escalationPreset: wizardState.escalationPreset,
                            handoffMode: wizardState.handoffMode,
                          });
                          setWizardState((current) => ({
                            ...current,
                            approvalMode: normalizedMode,
                            escalationPreset: mapping.escalationPreset,
                            handoffMode: mapping.handoffMode,
                          }));
                        }}
                      >
                        {STUDIO_APPROVAL_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </FormSelect>
                      <div className="app-surface-field-help">
                        {STUDIO_APPROVAL_MODE_OPTIONS.find((item) => item.value === wizardState.approvalMode)?.hint}
                      </div>
                    </FormField>
                    <FormField label="Customer Channels" hint="Primary live channel for this assistant.">
                      <FormSelect
                        value={wizardState.customerChannel}
                        onChange={(event) => {
                          const nextChannel = readString(event.currentTarget.value) as WizardState['customerChannel'];
                          setWizardState((current) => ({
                            ...current,
                            customerChannel: nextChannel,
                            telegramEnabled: nextChannel === 'telegram' ? current.telegramEnabled : false,
                          }));
                        }}
                      >
                        <option value="telegram">Telegram bot</option>
                        <option value="draft">Draft only</option>
                        <option value="whatsapp" disabled>WhatsApp Business soon</option>
                        <option value="web_widget" disabled>Web chat soon</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                  <AgentSafetySummary
                    approvalMode={wizardState.approvalMode}
                    memoryEnabled={wizardState.memoryEnabled}
                    monthlyCostCapUsd={wizardState.monthlyCostCapUsd}
                    dailyMessageLimit={wizardState.dailyMessageLimit}
                  />
                  <AgentLaunchChecklist
                    hasGatewayOnlineTarget={hasGatewayOnlineTarget}
                    hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
                    state={wizardState}
                  />
                  {wizardState.runtimePlacement === 'customer_hosted' ? (
                    <div className="app-stack-3">
                      <StateBanner
                        tone="neutral"
                        title="Self-hosted execution boundary"
                        detail="This mode runs only on your selected customer-owned node. Platform-hosted compute is not used as fallback."
                      />
                      <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                        <FormField label="Self-hosted node" hint="Choose an enrolled self-hosted node in this workspace.">
                          <FormSelect
                            value={wizardState.selfHostedRuntimeProfileId}
                            onChange={(event) => setWizardField('selfHostedRuntimeProfileId', event.currentTarget.value)}
                            disabled={isLoadingRuntimeAttachments}
                          >
                            <option value="">
                              {isLoadingRuntimeAttachments ? 'Loading nodes…' : selfHostedNodeOptions.length > 0 ? 'Select a node' : 'No enrolled nodes found'}
                            </option>
                            {selfHostedNodeOptions.map((node) => (
                              <option key={node.runtimeProfileId} value={node.runtimeProfileId}>
                                {node.label} ({humanizeToken(node.nodeKind, 'node')})
                              </option>
                            ))}
                          </FormSelect>
                        </FormField>
                        <FormReadout label="Node health" value={selfHostedNodeHealthLabel(selectedSelfHostedNode)} />
                        <FormReadout label="Heartbeat" value={selectedSelfHostedNode?.heartbeatAt ? formatRelativeTime(selectedSelfHostedNode.heartbeatAt) : 'n/a'} />
                        <FormReadout label="Capabilities" value={selectedSelfHostedNode?.capabilities.length ? selectedSelfHostedNode.capabilities.join(', ') : 'n/a'} />
                      </FormGrid>
                      <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                        <FormField label="Privacy contract" hint="Required before a self-hosted assistant can be saved.">
                          <FormSelect
                            value={wizardState.selfHostedPrivacyAccepted ? 'accepted' : 'pending'}
                            onChange={(event) => setWizardField('selfHostedPrivacyAccepted', event.currentTarget.value === 'accepted')}
                          >
                            <option value="pending">Not accepted</option>
                            <option value="accepted">Accepted</option>
                          </FormSelect>
                        </FormField>
                        <FormField label="Safety contract" hint="Required before a self-hosted assistant can be saved.">
                          <FormSelect
                            value={wizardState.selfHostedSafetyAccepted ? 'accepted' : 'pending'}
                            onChange={(event) => setWizardField('selfHostedSafetyAccepted', event.currentTarget.value === 'accepted')}
                          >
                            <option value="pending">Not accepted</option>
                            <option value="accepted">Accepted</option>
                          </FormSelect>
                        </FormField>
                      </FormGrid>
                      {selfHostedWizardNodeBlocker ? (
                        <StateBanner tone="warning" title="Self-hosted setup required" detail={selfHostedWizardNodeBlocker} />
                      ) : (
                        <StateBanner tone="success" title="Self-hosted node ready" detail="Node selection and health checks passed for this draft." />
                      )}
                    </div>
                  ) : null}
                  <details className="app-stack-3">
                    <summary>Computer Automation Add-on</summary>
                    <p className="app-surface-field-help">
                      Off by default. Enable only when this assistant must operate websites or apps without APIs.
                    </p>
                    <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                      <FormField label="Automation" hint="Customer messages cannot start computer sessions while this is off.">
                        <FormSelect
                          value={wizardState.computerAutomationEnabled ? 'enabled' : 'disabled'}
                          onChange={(event) => setWizardState((current) => ({
                            ...current,
                            computerAutomationEnabled: event.currentTarget.value === 'enabled',
                          }))}
                        >
                          <option value="disabled">Off</option>
                          <option value="enabled">On — approval gated</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Computer add-on" hint="Choose the computer environment for this add-on.">
                        <FormSelect
                          value={wizardState.computerAutomationRuntimeClass}
                          disabled={!wizardState.computerAutomationEnabled}
                          onChange={(event) => setWizardField('computerAutomationRuntimeClass', event.currentTarget.value as WizardState['computerAutomationRuntimeClass'])}
                        >
                          <option value="virtual_browser">Cloud browser</option>
                          <option value="virtual_desktop">Cloud desktop</option>
                          <option value="virtual_code_sandbox">Cloud code sandbox</option>
                          <option value="local_browser">Browser on my computer</option>
                          <option value="local_desktop">Desktop on my computer</option>
                        </FormSelect>
                      </FormField>
                      <FormField label="Allowed domains" hint="Comma-separated domains. Required when automation is on.">
                        <FormInput
                          value={wizardState.computerAutomationAllowedDomains}
                          disabled={!wizardState.computerAutomationEnabled}
                          onChange={(event) => setWizardField('computerAutomationAllowedDomains', event.currentTarget.value)}
                          placeholder="supplier.example.com, portal.example.com"
                        />
                      </FormField>
                      <FormField label="Max active sessions" hint="Many agents can be registered; active sessions stay capped and the rest queue.">
                        <FormInput
                          type="number"
                          min="1"
                          value={wizardState.computerAutomationMaxSessions}
                          disabled={!wizardState.computerAutomationEnabled}
                          onChange={(event) => setWizardField('computerAutomationMaxSessions', event.currentTarget.value)}
                        />
                      </FormField>
                      <FormField label="Daily budget" hint="Stops automation when the daily cloud-computer budget is hit.">
                        <FormInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardState.computerAutomationDailyBudgetUsd}
                          disabled={!wizardState.computerAutomationEnabled}
                          onChange={(event) => setWizardField('computerAutomationDailyBudgetUsd', event.currentTarget.value)}
                        />
                      </FormField>
                      <FormField label="Monthly budget" hint="Stops automation when the monthly cloud-computer budget is hit.">
                        <FormInput
                          type="number"
                          min="0"
                          step="0.01"
                          value={wizardState.computerAutomationMonthlyBudgetUsd}
                          disabled={!wizardState.computerAutomationEnabled}
                          onChange={(event) => setWizardField('computerAutomationMonthlyBudgetUsd', event.currentTarget.value)}
                        />
                      </FormField>
                    </FormGrid>
                  </details>
                  <details className="app-stack-3">
                    <summary>AI model and cost details</summary>
                    <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                      <FormField label="AI model provider" hint="Choose the AI model provider for this assistant.">
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
                              aiTier: inferAiTierFromProviderModel(nextProviderId, nextModelId),
                            }));
                          }}
                          disabled={isLoadingProviderCatalog || providerCatalog.length === 0}
                        >
                          <option value="">
                            {isLoadingProviderCatalog ? 'Loading AI model providers…' : 'Select an AI model provider'}
                          </option>
                          {providerCatalog.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.label}
                            </option>
                          ))}
                        </FormSelect>
                      </FormField>
                      <FormField label="Model" hint="Choose the model this assistant should use.">
                        <FormSelect
                          data-deployed-agent-model-select="true"
                          value={wizardState.modelId}
                          onChange={(event) => {
                            const nextModelId = event.currentTarget.value;
                            setWizardState((current) => ({
                              ...current,
                              modelId: nextModelId,
                              aiTier: inferAiTierFromProviderModel(current.providerId, nextModelId),
                            }));
                          }}
                          disabled={!selectedProviderCatalog || selectedProviderCatalog.models.length === 0}
                        >
                          <option value="">
                            {selectedProviderCatalog ? 'Select a model' : 'Select an AI model provider first'}
                          </option>
                          {(selectedProviderCatalog?.models ?? []).map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </FormSelect>
                      </FormField>
                    </FormGrid>
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="AI model provider state" value={humanizeToken(selectedProviderCatalog?.state, isLoadingProviderCatalog ? 'Loading' : 'Unknown')} />
                      <FormReadout label="Privacy profile" value={selectedProviderCatalog?.privacyPosture || 'n/a'} />
                      <FormReadout label="Jurisdiction" value={selectedProviderCatalog?.jurisdiction || 'n/a'} />
                      <FormReadout label="Residency" value={selectedProviderCatalog?.residency || 'n/a'} />
                      <FormReadout label="Model capacity" value={formatContextWindow(selectedProviderModelCatalog?.contextWindowTokens)} />
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
                  </details>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Budget cap (USD)" hint="Automatic monthly pause threshold for this assistant.">
                      <FormInput
                        value={wizardState.monthlyCostCapUsd}
                        onChange={(event) => setWizardField('monthlyCostCapUsd', event.currentTarget.value)}
                        inputMode="decimal"
                        placeholder="250"
                      />
                    </FormField>
                    <FormField label="Daily message limit" hint="Per external user, reset at UTC midnight. Leave blank to disable free-tier limits.">
                      <FormInput
                        value={wizardState.dailyMessageLimit}
                        onChange={(event) => setWizardField('dailyMessageLimit', event.currentTarget.value)}
                        inputMode="numeric"
                        placeholder="25"
                      />
                    </FormField>
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Upgrade CTA label" hint="Required when message limits are active.">
                      <FormInput
                        value={wizardState.upgradeCtaLabel}
                        onChange={(event) => setWizardField('upgradeCtaLabel', event.currentTarget.value)}
                        placeholder="Continue on Empyralis"
                      />
                    </FormField>
                    <FormField label="Upgrade CTA URL" hint="Where limited users go when they need more messages.">
                      <FormInput
                        value={wizardState.upgradeCtaUrl}
                        onChange={(event) => setWizardField('upgradeCtaUrl', event.currentTarget.value)}
                        placeholder="https://app.empyralis.com/upgrade"
                      />
                    </FormField>
                  </FormGrid>
                  {wizardMode === 'edit' && selectedAgent ? (
                    <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                      <FormReadout label="Current state" value={humanizeToken(selectedAgent.deployment_state, 'Draft')} />
                      <FormReadout label="Assistant id" value={readString(selectedAgent.backing_install_id, 'pending')} />
                    </FormGrid>
                  ) : null}
                  {wizardMode === 'edit' && selectedAgent ? (
                    <div className="app-inline-actions">
                      <AppButton
                        type="button"
                        onClick={() => {
                          void handleDeploymentAction('deploy');
                        }}
                        disabled={busyAgentId === readString(selectedAgent.id) || Boolean(selectedAgentModelDeployBlocker) || Boolean(selectedAgentSelfHostedDeployBlocker)}
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
