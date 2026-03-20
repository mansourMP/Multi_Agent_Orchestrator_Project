'use client';

import { useState } from 'react';
import {
  DEFAULT_BUSINESS_PRESET_ID,
  DEFAULT_AGENT_ROLE_ID,
  DEFAULT_CONNECTOR_LABELS,
  DEFAULT_LOCAL_EXECUTION_DRAFT,
  DEFAULT_OUTCOME_PACK_ID,
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_MODELS,
  DEFAULT_PROVIDER_OPTIONS,
  type AgentRoleId,
  type ConnectionMode,
  type ConnectorCredentialItem,
  type ConnectorId,
  type DrawerPanel,
  type LocalWorkerStatus,
  type LocalExecutionDraft,
  type LogEntry,
  type PackResult,
  type ProviderId,
  type ProviderOption,
  type RoutePayload,
  type RunStatus,
  type RuntimeMetrics,
  type SetupSession,
  type TrustMode,
  type VaultCredentialItem,
} from './page.catalog';

const INITIAL_API_KEY = process.env.NEXT_PUBLIC_ORION_API_KEY || '';

export interface PageState {
  goal: string;
  setGoal: (v: string | ((prev: string) => string)) => void;
  selectedPackId: string;
  setSelectedPackId: (v: string | ((prev: string) => string)) => void;
  selectedPresetId: string;
  setSelectedPresetId: (v: string | ((prev: string) => string)) => void;
  selectedAgentRole: AgentRoleId;
  setSelectedAgentRole: (v: AgentRoleId | ((prev: AgentRoleId) => AgentRoleId)) => void;
  runtimeApiKey: string;
  setRuntimeApiKey: (v: string | ((prev: string) => string)) => void;
  inboxInput: string;
  setInboxInput: (v: string | ((prev: string) => string)) => void;
  leadsInput: string;
  setLeadsInput: (v: string | ((prev: string) => string)) => void;
  slotsInput: string;
  setSlotsInput: (v: string | ((prev: string) => string)) => void;
  localExecutionDraft: LocalExecutionDraft;
  setLocalExecutionDraft: (v: LocalExecutionDraft | ((prev: LocalExecutionDraft) => LocalExecutionDraft)) => void;
  provider: ProviderId;
  setProvider: (v: ProviderId | ((prev: ProviderId) => ProviderId)) => void;
  providerAuthMode: string;
  setProviderAuthMode: (v: string | ((prev: string) => string)) => void;
  model: string;
  setModel: (v: string | ((prev: string) => string)) => void;
  providerOptions: ProviderOption[];
  setProviderOptions: (v: ProviderOption[] | ((prev: ProviderOption[]) => ProviderOption[])) => void;
  modelOptions: string[];
  setModelOptions: (v: string[] | ((prev: string[]) => string[])) => void;
  modelsLoading: boolean;
  setModelsLoading: (v: boolean | ((prev: boolean) => boolean)) => void;
  connectionMode: ConnectionMode;
  setConnectionMode: (v: ConnectionMode | ((prev: ConnectionMode) => ConnectionMode)) => void;
  credentials: VaultCredentialItem[];
  setCredentials: (v: VaultCredentialItem[] | ((prev: VaultCredentialItem[]) => VaultCredentialItem[])) => void;
  connectorCredentials: ConnectorCredentialItem[];
  setConnectorCredentials: (v: ConnectorCredentialItem[] | ((prev: ConnectorCredentialItem[]) => ConnectorCredentialItem[])) => void;
  credentialId: string;
  setCredentialId: (v: string | ((prev: string) => string)) => void;
  connectorCredentialId: string;
  setConnectorCredentialId: (v: string | ((prev: string) => string)) => void;
  connectorType: ConnectorId;
  setConnectorType: (v: ConnectorId | ((prev: ConnectorId) => ConnectorId)) => void;
  credentialLabel: string;
  setCredentialLabel: (v: string | ((prev: string) => string)) => void;
  openaiKeyInput: string;
  setOpenaiKeyInput: (v: string | ((prev: string) => string)) => void;
  connectorLabel: string;
  setConnectorLabel: (v: string | ((prev: string) => string)) => void;
  googleUseLocalAuth: boolean;
  setGoogleUseLocalAuth: (v: boolean | ((prev: boolean) => boolean)) => void;
  googleConnectorToken: string;
  setGoogleConnectorToken: (v: string | ((prev: string) => string)) => void;
  googleCalendarId: string;
  setGoogleCalendarId: (v: string | ((prev: string) => string)) => void;
  googleTimezone: string;
  setGoogleTimezone: (v: string | ((prev: string) => string)) => void;
  microsoftAccessToken: string;
  setMicrosoftAccessToken: (v: string | ((prev: string) => string)) => void;
  telegramBotToken: string;
  setTelegramBotToken: (v: string | ((prev: string) => string)) => void;
  telegramChatId: string;
  setTelegramChatId: (v: string | ((prev: string) => string)) => void;
  discordBotToken: string;
  setDiscordBotToken: (v: string | ((prev: string) => string)) => void;
  discordChannelId: string;
  setDiscordChannelId: (v: string | ((prev: string) => string)) => void;
  discordGuildId: string;
  setDiscordGuildId: (v: string | ((prev: string) => string)) => void;
  instagramAccessToken: string;
  setInstagramAccessToken: (v: string | ((prev: string) => string)) => void;
  instagramAccountId: string;
  setInstagramAccountId: (v: string | ((prev: string) => string)) => void;
  instagramPageId: string;
  setInstagramPageId: (v: string | ((prev: string) => string)) => void;
  twilioAccountSid: string;
  setTwilioAccountSid: (v: string | ((prev: string) => string)) => void;
  twilioAuthToken: string;
  setTwilioAuthToken: (v: string | ((prev: string) => string)) => void;
  twilioFromNumber: string;
  setTwilioFromNumber: (v: string | ((prev: string) => string)) => void;
  twilioToNumber: string;
  setTwilioToNumber: (v: string | ((prev: string) => string)) => void;
  isCredentialsLoading: boolean;
  setIsCredentialsLoading: (v: boolean | ((prev: boolean) => boolean)) => void;
  isConnectorsLoading: boolean;
  setIsConnectorsLoading: (v: boolean | ((prev: boolean) => boolean)) => void;
  trustMode: TrustMode;
  setTrustMode: (v: TrustMode | ((prev: TrustMode) => TrustMode)) => void;
  status: RunStatus;
  setStatus: (v: RunStatus | ((prev: RunStatus) => RunStatus)) => void;
  isStarting: boolean;
  setIsStarting: (v: boolean | ((prev: boolean) => boolean)) => void;
  isChecking: boolean;
  setIsChecking: (v: boolean | ((prev: boolean) => boolean)) => void;
  metricsLoading: boolean;
  setMetricsLoading: (v: boolean | ((prev: boolean) => boolean)) => void;
  runtimeMetrics: RuntimeMetrics | null;
  setRuntimeMetrics: (v: RuntimeMetrics | null | ((prev: RuntimeMetrics | null) => RuntimeMetrics | null)) => void;
  localWorkerStatus: LocalWorkerStatus | null;
  setLocalWorkerStatus: (v: LocalWorkerStatus | null | ((prev: LocalWorkerStatus | null) => LocalWorkerStatus | null)) => void;
  workersLoading: boolean;
  setWorkersLoading: (v: boolean | ((prev: boolean) => boolean)) => void;
  logs: LogEntry[];
  setLogs: (v: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  runId: string | null;
  setRunId: (v: string | null | ((prev: string | null) => string | null)) => void;
  pendingApprovalId: string | null;
  setPendingApprovalId: (v: string | null | ((prev: string | null) => string | null)) => void;
  lastRouteInfo: RoutePayload | null;
  setLastRouteInfo: (v: RoutePayload | null | ((prev: RoutePayload | null) => RoutePayload | null)) => void;
  packResult: PackResult | null;
  setPackResult: (v: PackResult | null | ((prev: PackResult | null) => PackResult | null)) => void;
  lastRunPayload: Record<string, unknown> | null;
  setLastRunPayload: (v: Record<string, unknown> | null | ((prev: Record<string, unknown> | null) => Record<string, unknown> | null)) => void;
  topError: string | null;
  setTopError: (v: string | null | ((prev: string | null) => string | null)) => void;
  setupBusy: 'runtime' | 'save' | 'test' | null;
  setSetupBusy: (v: 'runtime' | 'save' | 'test' | null | ((prev: 'runtime' | 'save' | 'test' | null) => 'runtime' | 'save' | 'test' | null)) => void;
  setupStatus: { runtimeReady: boolean; accountConnected: boolean; connectionTested: boolean };
  setSetupStatus: (v: { runtimeReady: boolean; accountConnected: boolean; connectionTested: boolean } | ((prev: { runtimeReady: boolean; accountConnected: boolean; connectionTested: boolean }) => { runtimeReady: boolean; accountConnected: boolean; connectionTested: boolean })) => void;
  showSetupWizard: boolean;
  setShowSetupWizard: (v: boolean | ((prev: boolean) => boolean)) => void;
  showPackInputs: boolean;
  setShowPackInputs: (v: boolean | ((prev: boolean) => boolean)) => void;
  showAdvancedControls: boolean;
  setShowAdvancedControls: (v: boolean | ((prev: boolean) => boolean)) => void;
  showLiveLogs: boolean;
  setShowLiveLogs: (v: boolean | ((prev: boolean) => boolean)) => void;
  showKpis: boolean;
  setShowKpis: (v: boolean | ((prev: boolean) => boolean)) => void;
  drawerPanel: DrawerPanel | null;
  setDrawerPanel: (v: DrawerPanel | null | ((prev: DrawerPanel | null) => DrawerPanel | null)) => void;
  setupHydrated: boolean;
  setSetupHydrated: (v: boolean | ((prev: boolean) => boolean)) => void;
  viewportWidth: number;
  setViewportWidth: (v: number | ((prev: number) => number)) => void;
  guidedDefaultsEnabled: boolean;
  setGuidedDefaultsEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  weeklyAutopilotEnabled: boolean;
  setWeeklyAutopilotEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  weeklyAutopilotDay: string;
  setWeeklyAutopilotDay: (v: string | ((prev: string) => string)) => void;
  weeklyAutopilotTime: string;
  setWeeklyAutopilotTime: (v: string | ((prev: string) => string)) => void;
  weeklyAutopilotTimezone: 'local' | 'utc';
  setWeeklyAutopilotTimezone: (v: 'local' | 'utc' | ((prev: 'local' | 'utc') => 'local' | 'utc')) => void;
  weeklyScheduleId: string | null;
  setWeeklyScheduleId: (v: string | null | ((prev: string | null) => string | null)) => void;
  weeklyScheduleBusy: 'load' | 'save' | 'run' | 'delete' | null;
  setWeeklyScheduleBusy: (v: 'load' | 'save' | 'run' | 'delete' | null | ((prev: 'load' | 'save' | 'run' | 'delete' | null) => 'load' | 'save' | 'run' | 'delete' | null)) => void;
  weeklyScheduleStatusText: string;
  setWeeklyScheduleStatusText: (v: string | ((prev: string) => string)) => void;
  setupSessionId: string | null;
  setSetupSessionId: (v: string | null | ((prev: string | null) => string | null)) => void;
  setupSession: SetupSession | null;
  setSetupSession: (v: SetupSession | null | ((prev: SetupSession | null) => SetupSession | null)) => void;
  setupSessionBusy: boolean;
  setSetupSessionBusy: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function usePageState(): PageState {
  const [goal, setGoal] = useState('');
  const [selectedPackId, setSelectedPackId] = useState(DEFAULT_OUTCOME_PACK_ID);
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_BUSINESS_PRESET_ID);
  const [selectedAgentRole, setSelectedAgentRole] = useState<AgentRoleId>(DEFAULT_AGENT_ROLE_ID);
  const [runtimeApiKey, setRuntimeApiKey] = useState(INITIAL_API_KEY);
  const [inboxInput, setInboxInput] = useState('');
  const [leadsInput, setLeadsInput] = useState('');
  const [slotsInput, setSlotsInput] = useState(`Mon 10:00 AM
Tue 11:30 AM
Wed 3:00 PM`);
  const [localExecutionDraft, setLocalExecutionDraft] = useState<LocalExecutionDraft>(DEFAULT_LOCAL_EXECUTION_DRAFT);
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [providerAuthMode, setProviderAuthMode] = useState(DEFAULT_PROVIDER_OPTIONS[0].defaultAuthMode || DEFAULT_PROVIDER_OPTIONS[0].auth[0] || 'api_key');
  const [model, setModel] = useState('gpt-4.1');
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>(DEFAULT_PROVIDER_OPTIONS);
  const [modelOptions, setModelOptions] = useState<string[]>(DEFAULT_PROVIDER_MODELS.openai);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('managed');
  const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
  const [connectorCredentials, setConnectorCredentials] = useState<ConnectorCredentialItem[]>([]);
  const [credentialId, setCredentialId] = useState('');
  const [connectorCredentialId, setConnectorCredentialId] = useState('');
  const [connectorType, setConnectorType] = useState<ConnectorId>('google_workspace');
  const [credentialLabel, setCredentialLabel] = useState(DEFAULT_PROVIDER_LABELS.openai);
  const [openaiKeyInput, setOpenaiKeyInput] = useState('');
  const [connectorLabel, setConnectorLabel] = useState(DEFAULT_CONNECTOR_LABELS.google_workspace);
  const [googleUseLocalAuth, setGoogleUseLocalAuth] = useState(true);
  const [googleConnectorToken, setGoogleConnectorToken] = useState('');
  const [googleCalendarId, setGoogleCalendarId] = useState('primary');
  const [googleTimezone, setGoogleTimezone] = useState('UTC');
  const [microsoftAccessToken, setMicrosoftAccessToken] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [discordGuildId, setDiscordGuildId] = useState('');
  const [instagramAccessToken, setInstagramAccessToken] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [instagramPageId, setInstagramPageId] = useState('');
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioFromNumber, setTwilioFromNumber] = useState('whatsapp:+14155238886');
  const [twilioToNumber, setTwilioToNumber] = useState('');
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(false);
  const [isConnectorsLoading, setIsConnectorsLoading] = useState(false);
  const [trustMode, setTrustMode] = useState<TrustMode>('guarded');
  const [status, setStatus] = useState<RunStatus>('idle');
  const [isStarting, setIsStarting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [runtimeMetrics, setRuntimeMetrics] = useState<RuntimeMetrics | null>(null);
  const [localWorkerStatus, setLocalWorkerStatus] = useState<LocalWorkerStatus | null>(null);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [lastRouteInfo, setLastRouteInfo] = useState<RoutePayload | null>(null);
  const [packResult, setPackResult] = useState<PackResult | null>(null);
  const [lastRunPayload, setLastRunPayload] = useState<Record<string, unknown> | null>(null);
  const [topError, setTopError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState<'runtime' | 'save' | 'test' | null>(null);
  const [setupStatus, setSetupStatus] = useState({
    runtimeReady: false,
    accountConnected: false,
    connectionTested: false,
  });
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showPackInputs, setShowPackInputs] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [showLiveLogs, setShowLiveLogs] = useState(false);
  const [showKpis, setShowKpis] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel | null>(null);
  const [setupHydrated, setSetupHydrated] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);
  const [guidedDefaultsEnabled, setGuidedDefaultsEnabled] = useState(true);
  const [weeklyAutopilotEnabled, setWeeklyAutopilotEnabled] = useState(false);
  const [weeklyAutopilotDay, setWeeklyAutopilotDay] = useState('Monday');
  const [weeklyAutopilotTime, setWeeklyAutopilotTime] = useState('09:00');
  const [weeklyAutopilotTimezone, setWeeklyAutopilotTimezone] = useState<'local' | 'utc'>('local');
  const [weeklyScheduleId, setWeeklyScheduleId] = useState<string | null>(null);
  const [weeklyScheduleBusy, setWeeklyScheduleBusy] = useState<'load' | 'save' | 'run' | 'delete' | null>(null);
  const [weeklyScheduleStatusText, setWeeklyScheduleStatusText] = useState('');
  const [setupSessionId, setSetupSessionId] = useState<string | null>(null);
  const [setupSession, setSetupSession] = useState<SetupSession | null>(null);
  const [setupSessionBusy, setSetupSessionBusy] = useState(false);

  return {
    goal, setGoal,
    selectedPackId, setSelectedPackId,
    selectedPresetId, setSelectedPresetId,
    selectedAgentRole, setSelectedAgentRole,
    runtimeApiKey, setRuntimeApiKey,
    inboxInput, setInboxInput,
    leadsInput, setLeadsInput,
    slotsInput, setSlotsInput,
    localExecutionDraft, setLocalExecutionDraft,
    provider, setProvider,
    providerAuthMode, setProviderAuthMode,
    model, setModel,
    providerOptions, setProviderOptions,
    modelOptions, setModelOptions,
    modelsLoading, setModelsLoading,
    connectionMode, setConnectionMode,
    credentials, setCredentials,
    connectorCredentials, setConnectorCredentials,
    credentialId, setCredentialId,
    connectorCredentialId, setConnectorCredentialId,
    connectorType, setConnectorType,
    credentialLabel, setCredentialLabel,
    openaiKeyInput, setOpenaiKeyInput,
    connectorLabel, setConnectorLabel,
    googleUseLocalAuth, setGoogleUseLocalAuth,
    googleConnectorToken, setGoogleConnectorToken,
    googleCalendarId, setGoogleCalendarId,
    googleTimezone, setGoogleTimezone,
    microsoftAccessToken, setMicrosoftAccessToken,
    telegramBotToken, setTelegramBotToken,
    telegramChatId, setTelegramChatId,
    discordBotToken, setDiscordBotToken,
    discordChannelId, setDiscordChannelId,
    discordGuildId, setDiscordGuildId,
    instagramAccessToken, setInstagramAccessToken,
    instagramAccountId, setInstagramAccountId,
    instagramPageId, setInstagramPageId,
    twilioAccountSid, setTwilioAccountSid,
    twilioAuthToken, setTwilioAuthToken,
    twilioFromNumber, setTwilioFromNumber,
    twilioToNumber, setTwilioToNumber,
    isCredentialsLoading, setIsCredentialsLoading,
    isConnectorsLoading, setIsConnectorsLoading,
    trustMode, setTrustMode,
    status, setStatus,
    isStarting, setIsStarting,
    isChecking, setIsChecking,
    metricsLoading, setMetricsLoading,
    runtimeMetrics, setRuntimeMetrics,
    localWorkerStatus, setLocalWorkerStatus,
    workersLoading, setWorkersLoading,
    logs, setLogs,
    runId, setRunId,
    pendingApprovalId, setPendingApprovalId,
    lastRouteInfo, setLastRouteInfo,
    packResult, setPackResult,
    lastRunPayload, setLastRunPayload,
    topError, setTopError,
    setupBusy, setSetupBusy,
    setupStatus, setSetupStatus,
    showSetupWizard, setShowSetupWizard,
    showPackInputs, setShowPackInputs,
    showAdvancedControls, setShowAdvancedControls,
    showLiveLogs, setShowLiveLogs,
    showKpis, setShowKpis,
    drawerPanel, setDrawerPanel,
    setupHydrated, setSetupHydrated,
    viewportWidth, setViewportWidth,
    guidedDefaultsEnabled, setGuidedDefaultsEnabled,
    weeklyAutopilotEnabled, setWeeklyAutopilotEnabled,
    weeklyAutopilotDay, setWeeklyAutopilotDay,
    weeklyAutopilotTime, setWeeklyAutopilotTime,
    weeklyAutopilotTimezone, setWeeklyAutopilotTimezone,
    weeklyScheduleId, setWeeklyScheduleId,
    weeklyScheduleBusy, setWeeklyScheduleBusy,
    weeklyScheduleStatusText, setWeeklyScheduleStatusText,
    setupSessionId, setSetupSessionId,
    setupSession, setSetupSession,
    setupSessionBusy, setSetupSessionBusy,
  };
}
