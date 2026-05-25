'use client';

import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Cable,
  LayoutDashboard,
  MessageSquareText,
  Route,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { ListDetailPanel } from '@/lib/ui/list-detail';
import { AnimatePresence, MotionTabPanel } from '@/lib/ui/motion';
import { AppButton, AppSurfaceStat, AppSurfaceStatGrid, AppTextarea, joinClassNames } from '@/lib/ui/primitives';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { DataBadge } from '@/lib/ui/data-table';
import type {
  DeployedAgentMemoryRecord,
  DeployedAgentRecord,
} from '@/lib/workspace/workstation-client';
import { WorkstationDeployedAgentAnalyticsPane } from '@/lib/workspace/workstation-deployed-agent-analytics-pane';
import type {
  AgentAnalyticsSnapshot,
  AgentOperationalMetrics,
  DetailConfigDraft,
  ProviderCatalogSnapshot,
  RuntimeAttachmentSnapshot,
  SpecialistOverlayTabId,
  TelegramReadinessSnapshot,
} from './types';
import {
  CONTEXT_PRESET_OPTIONS,
  DEFAULT_SAFE_AGENT_PERSONA_VALUES,
  DEFAULT_SAFE_AGENT_SYSTEM_PROMPT_VALUES,
  AGENT_STUDIO_OBJECT_LABELS,
  AGENT_VISIBILITY_LABELS,
  SPECIALIST_CONNECTOR_CARDS,
  SPECIALIST_OVERLAY_TABS,
  normalizeContextPresetId,
} from './constants';
import {
  ContextPresetControl,
  RetentionPresetControl,
} from './components';
import { AgentAiSettingsSections } from './ai-settings';
import { AgentActionCapabilitySections } from './action-settings';
import { AgentIntegrationsSections } from './integration-settings';
import { AgentPlaygroundPanel } from './playground-panel';
import {
  type DeployedAgentTestChatSessionState,
} from '@/lib/workspace/workstation-deployed-agent-test-turn-pane';
import {
  readString,
  readRecord,
  readNumber,
  humanizeToken,
  formatCompactCount,
  formatUsd,
  normalizeToolIds,
  deploymentStateLabel,
  rosterStatusTone,
  testRuntimeModeForPlacement,
  formatDeploymentModelLabel,
  formatDeploymentModelSummary,
  selfHostedNodeHealthLabel,
  truncateExternalUserId,
  formatTimestamp,
  selectedModelId,
  selectedProviderId,
  listEnabledChannels,
  readBudgetCycle,
  runtimePlacementLabel,
  inferAiTierFromProviderModel,
  connectorConnected,
  providerCatalogById,
} from './utils';

const SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS = ['.md', '.markdown', '.txt', '.csv', '.json'];
const KNOWLEDGE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const KNOWLEDGE_UPLOAD_MAX_MB = '2 MB';

const AGENT_SECTION_ICONS: Record<SpecialistOverlayTabId, LucideIcon> = {
  overview: LayoutDashboard,
  chat: MessageSquareText,
  knowledge: BookOpen,
  ai: Route,
  tools: Zap,
  memory: Brain,
  connectors: Cable,
  analytics: BarChart3,
};

function isSupportedKnowledgeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function knowledgeSourceLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface AgentDetailViewProps {
  selectedAgent: DeployedAgentRecord | null;
  overlayTab: SpecialistOverlayTabId;
  detailConfigDraft: DetailConfigDraft | null;
  onSaveDetailConfig: () => void;
  isSavingDetailConfig: boolean;
  onUpdateDetailConfig: (next: Partial<DetailConfigDraft>) => void;
  onUploadKnowledgeFile: (file: File) => Promise<void>;
  providerCatalog: ProviderCatalogSnapshot[];
  isLoadingProviderCatalog: boolean;
  onRefreshProviderModels: (providerId: string) => void;
  onSaveProviderCredential: (providerId: string, apiKey: string) => Promise<void>;
  isSavingProviderCredential: boolean;
  workspaceId: string;
  services: any;
  bootstrap: any;
  runtimeAttachments: RuntimeAttachmentSnapshot[];
  selectedAgentAnalytics: AgentAnalyticsSnapshot | null;
  isLoadingAnalytics: boolean;
  selectedAgentMetrics: AgentOperationalMetrics | null;
  selectedTelegramReadiness: TelegramReadinessSnapshot | null;
  onOpenEditWizard: () => void;
  hasGatewayOnlineTarget: boolean;
  hasCloudComputerAvailableTarget: boolean;
  isLoadingDetail: boolean;
  overlayMemoryEntries: DeployedAgentMemoryRecord[];
  isLoadingOverlayMemory: boolean;
  currentStudioSubview: 'agents' | 'inbox' | 'deploy';
  onSelectTab: (tabId: SpecialistOverlayTabId) => void;
  connectorVaultIds: Set<string>;
  selectedAgentModelDeployBlocker: string | null;
  selectedAgentSelfHostedDeployBlocker: string | null;
  selectedStudioTemplate: any;
  onOpenCreateWizard: (templateId: string) => void;
  testChatSession: DeployedAgentTestChatSessionState;
  onTestChatSessionChange: Dispatch<SetStateAction<DeployedAgentTestChatSessionState>>;
  onResetTestChatSession: () => void;
}

export const AgentDetailView = memo(({
  selectedAgent,
  overlayTab,
  detailConfigDraft,
  onSaveDetailConfig,
  isSavingDetailConfig,
  onUpdateDetailConfig,
  onUploadKnowledgeFile,
  providerCatalog,
  isLoadingProviderCatalog,
  onRefreshProviderModels,
  onSaveProviderCredential,
  isSavingProviderCredential: isSavingProviderCredentialProp,
  workspaceId,
  services,
  bootstrap,
  runtimeAttachments,
  selectedAgentAnalytics,
  isLoadingAnalytics,
  selectedAgentMetrics,
  selectedTelegramReadiness,
  onOpenEditWizard,
  hasGatewayOnlineTarget,
  hasCloudComputerAvailableTarget,
  isLoadingDetail,
  overlayMemoryEntries,
  isLoadingOverlayMemory,
  currentStudioSubview,
  onSelectTab,
  connectorVaultIds,
  selectedAgentModelDeployBlocker,
  selectedAgentSelfHostedDeployBlocker,
  selectedStudioTemplate,
  onOpenCreateWizard,
  testChatSession,
  onTestChatSessionChange,
  onResetTestChatSession,
}: AgentDetailViewProps) => {
  const selectedAgentId = readString(selectedAgent?.id);
  const [knowledgeSourceInput, setKnowledgeSourceInput] = useState('');
  const [knowledgeFileError, setKnowledgeFileError] = useState<string | null>(null);
  const [isUploadingKnowledgeFile, setIsUploadingKnowledgeFile] = useState(false);
  const knowledgeFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setKnowledgeSourceInput('');
    setKnowledgeFileError(null);
    setIsUploadingKnowledgeFile(false);
  }, [workspaceId, selectedAgentId]);

  const selectedAgentRuntimePlacement = useMemo(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    return (
      config.runtime_placement ??
      metadata.runtime_placement ??
      selectedAgent?.runtime_target
    );
  }, [selectedAgent]);

  const selectedKnowledgeSources = Array.isArray(selectedAgent?.knowledge_sources)
    ? selectedAgent.knowledge_sources
    : [];
  const knowledgeSourceCount = selectedKnowledgeSources.length;
  const draftKnowledgeSourceLines = detailConfigDraft
    ? knowledgeSourceLines(detailConfigDraft.knowledgeSourceText)
    : [];
  const visibleKnowledgeSources = detailConfigDraft
    ? draftKnowledgeSourceLines.map((uri, index) => ({ id: `draft-source-${index + 1}`, uri, label: uri, kind: uri.startsWith('knowledge://') ? 'file' : 'source' }))
    : selectedKnowledgeSources;
  const visibleKnowledgeSourceCount = visibleKnowledgeSources.length;

  const selectedContextPresetLabel = detailConfigDraft
    ? CONTEXT_PRESET_OPTIONS.find((option) => option.id === normalizeContextPresetId(detailConfigDraft.contextBudgetPreset))?.label ?? 'Standard'
    : 'Standard';

  const selectedAgentMemoryEnabled =
    readRecord(readRecord(selectedAgent?.config).memory_policy).memory_enabled === true ||
    readRecord(selectedAgent?.metadata).memory_enabled === true;
  const selectedAgentConfig = readRecord(selectedAgent?.config);
  const selectedAgentMetadata = readRecord(selectedAgent?.metadata);
  const selectedAgentInstructionsText = readString(
    selectedAgent?.system_prompt ??
    selectedAgentConfig.system_prompt ??
    selectedAgentConfig.instructions ??
    selectedAgentMetadata.system_prompt ??
    selectedAgentMetadata.instructions,
  );
  const selectedAgentPersonaText = readString(
    selectedAgent?.persona ??
    selectedAgentConfig.persona ??
    selectedAgentMetadata.persona,
  );
  const selectedAgentInstructionsAreDefault = DEFAULT_SAFE_AGENT_SYSTEM_PROMPT_VALUES.includes(selectedAgentInstructionsText);
  const selectedAgentPersonaIsDefault = DEFAULT_SAFE_AGENT_PERSONA_VALUES.includes(selectedAgentPersonaText);
  const visibleAgentInstructionsText =
    selectedAgentInstructionsAreDefault ? '' : selectedAgentInstructionsText;
  const visibleAgentPersonaText =
    selectedAgentPersonaIsDefault ? '' : selectedAgentPersonaText;
  const detailInstructionsValue = detailConfigDraft
    ? (DEFAULT_SAFE_AGENT_SYSTEM_PROMPT_VALUES.includes(detailConfigDraft.systemPrompt) ? '' : detailConfigDraft.systemPrompt)
    : visibleAgentInstructionsText;
  const detailPersonaValue = detailConfigDraft
    ? (DEFAULT_SAFE_AGENT_PERSONA_VALUES.includes(detailConfigDraft.persona) ? '' : detailConfigDraft.persona)
    : visibleAgentPersonaText;

  const selectedBudgetCycle = readBudgetCycle(selectedAgent);
  const selectedBudgetBurn = selectedAgentAnalytics?.currentBurnUsd ?? readNumber(selectedBudgetCycle.current_burn_usd);

  const selectedAgentModeLabel = selectedAgent
    ? runtimePlacementLabel(selectedAgentRuntimePlacement)
    : 'Cloud worker';

  const overviewTrendValues = selectedAgentAnalytics
    ? [
        0,
        selectedAgentAnalytics.messageVolumeDay,
        Math.max(selectedAgentAnalytics.messageVolumeWeek - selectedAgentAnalytics.messageVolumeDay, 0),
        Math.max(selectedAgentAnalytics.messageVolumeMonth - selectedAgentAnalytics.messageVolumeWeek, 0),
        selectedAgentAnalytics.messageVolumeMonth,
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

  const overlayConnectorCards = useMemo(() => {
    if (!selectedAgent) return [];
    return SPECIALIST_CONNECTOR_CARDS.map((connector) => {
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
    });
  }, [selectedAgent, selectedTelegramReadiness, connectorVaultIds]);

  const selectedAgentNeedsTelegramReadiness = useMemo(() => {
    const channels = readRecord(selectedAgent?.channels);
    return Boolean(readRecord(channels.telegram).enabled);
  }, [selectedAgent]);
  const selectedAgentChannelLabel = useMemo(() => {
    const channels = listEnabledChannels(selectedAgent?.channels);
    return channels.length > 0
      ? channels.map((channel) => humanizeToken(channel, channel)).join(', ')
      : 'No active channels';
  }, [selectedAgent]);
  const providerCatalogIndex = useMemo(
    () => providerCatalogById(providerCatalog),
    [providerCatalog],
  );
  const selectedAgentState = readString(selectedAgent?.deployment_state).toLowerCase();
  const selectedAgentStateLabel = humanizeToken(selectedAgent?.deployment_state, 'Draft');
  const selectedAgentProviderIdValue = selectedProviderId(selectedAgent);
  const selectedAgentModelLabel = formatDeploymentModelLabel(selectedAgent, providerCatalogIndex);
  const selectedAgentModelSummary = formatDeploymentModelSummary(selectedAgent, providerCatalogIndex);
  const selectedAgentRouteLabel = selectedAgentProviderIdValue
    ? providerCatalogIndex[selectedAgentProviderIdValue]?.label ?? humanizeToken(selectedAgentProviderIdValue, 'Custom API')
    : 'Empyralis Credits';
  const selectedAgentToolCount = normalizeToolIds(
    readRecord(readRecord(selectedAgent?.config).tool_policy).enabled_tools ??
    readRecord(selectedAgent?.metadata).selected_tool_ids,
  ).length;
  const modelReady = !selectedAgentModelDeployBlocker && Boolean(selectedModelId(selectedAgent) || selectedProviderId(selectedAgent));
  const instructionsReady = Boolean(
    readString(readRecord(selectedAgent?.config).instructions).trim() ||
    readString(readRecord(selectedAgent?.metadata).instructions).trim() ||
    readString(readRecord(selectedAgent?.config).system_prompt).trim() ||
    readString(readRecord(selectedAgent?.metadata).system_prompt).trim(),
  );
  const channelReady = listEnabledChannels(selectedAgent?.channels).length > 0;
  const selectedAgentVisibilityLabel = selectedAgentState === 'live' && channelReady
    ? AGENT_VISIBILITY_LABELS.public_channel
    : AGENT_VISIBILITY_LABELS.private_workspace;
  const runtimeReady = !selectedAgentSelfHostedDeployBlocker;
  const telegramReady = !selectedAgentNeedsTelegramReadiness || selectedTelegramReadiness?.readyForLive === true;
  const deployBlockers = [
    selectedAgentModelDeployBlocker,
    selectedAgentSelfHostedDeployBlocker,
    selectedAgentNeedsTelegramReadiness && selectedTelegramReadiness?.readyForLive !== true
      ? selectedTelegramReadiness?.nextAction || 'Finish channel setup before launch.'
      : null,
  ].filter((item): item is string => Boolean(item));
  const knowledgeReady = knowledgeSourceCount > 0;
  const launchReady = deployBlockers.length === 0 && modelReady && instructionsReady && knowledgeReady && channelReady && runtimeReady && telegramReady;
  const readinessItems = [
    {
      label: 'Model',
      detail: modelReady ? selectedAgentModelLabel : selectedAgentModelDeployBlocker || 'Connect a model provider.',
      ready: modelReady,
      tab: 'ai' as SpecialistOverlayTabId,
    },
    {
      label: 'Instructions',
      detail: instructionsReady ? 'Behavior document is present.' : 'Add how this agent should answer.',
      ready: instructionsReady,
      tab: 'knowledge' as SpecialistOverlayTabId,
    },
    {
      label: 'Knowledge',
      detail: knowledgeReady ? `${knowledgeSourceCount} trusted source${knowledgeSourceCount === 1 ? '' : 's'}.` : 'No trusted sources connected yet.',
      ready: knowledgeReady,
      tab: 'knowledge' as SpecialistOverlayTabId,
    },
    {
      label: 'Channel',
      detail: channelReady ? selectedAgentChannelLabel : 'No customer channel connected.',
      ready: channelReady && telegramReady,
      tab: 'connectors' as SpecialistOverlayTabId,
    },
    {
      label: 'Actions',
      detail: selectedAgentToolCount > 0 ? `${selectedAgentToolCount} permission${selectedAgentToolCount === 1 ? '' : 's'} enabled.` : 'No tool permissions enabled.',
      ready: selectedAgentToolCount > 0,
      tab: 'tools' as SpecialistOverlayTabId,
    },
    {
      label: 'Memory',
      detail: selectedAgentMemoryEnabled ? 'Customer memory is enabled.' : 'Customer memory is off.',
      ready: true,
      tab: 'memory' as SpecialistOverlayTabId,
    },
    {
      label: 'Workspace chat',
      detail: selectedAgentId ? 'Private owner chat is ready.' : 'Save the agent before chatting.',
      ready: Boolean(selectedAgentId),
      tab: 'chat' as SpecialistOverlayTabId,
    },
    {
      label: 'Deploy state',
      detail: selectedAgentState === 'live' ? 'Receiving customer traffic.' : launchReady ? 'Ready for go-live.' : 'Resolve setup blockers first.',
      ready: selectedAgentState === 'live' || launchReady,
      tab: 'overview' as SpecialistOverlayTabId,
    },
    {
      label: 'Usage',
      detail: `${formatUsd(selectedBudgetBurn)} used this month.`,
      ready: true,
      tab: 'analytics' as SpecialistOverlayTabId,
    },
  ];
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const launchTitle = selectedAgentState === 'live'
    ? 'Live and serving customers'
    : launchReady
      ? 'Ready to deploy'
      : 'Launch needs attention';
  const launchDetail = selectedAgentState === 'live'
    ? 'This agent can receive customer traffic.'
    : launchReady
      ? 'Production-safe defaults are set. Chat with it privately, then deploy when ready.'
      : deployBlockers[0] || 'Finish the required setup before customer traffic.';
  const setupCards = [
    {
      label: 'Knowledge',
      value: `${knowledgeSourceCount} source${knowledgeSourceCount === 1 ? '' : 's'}`,
      detail: instructionsReady ? 'Instructions ready' : 'Instructions missing',
      tab: 'knowledge' as SpecialistOverlayTabId,
    },
    {
      label: 'Model',
      value: selectedAgentModelLabel,
      detail: modelReady ? selectedAgentModeLabel : 'Provider setup required',
      tab: 'ai' as SpecialistOverlayTabId,
    },
    {
      label: 'Channel',
      value: selectedAgentChannelLabel,
      detail: channelReady ? 'Customer entrypoint selected' : 'Connect before launch',
      tab: 'connectors' as SpecialistOverlayTabId,
    },
    {
      label: 'Actions',
      value: `${selectedAgentToolCount} enabled`,
      detail: selectedAgentToolCount > 0 ? 'Permissions reviewed' : 'No actions allowed',
      tab: 'tools' as SpecialistOverlayTabId,
    },
    {
      label: 'Memory',
      value: selectedAgentMemoryEnabled ? 'On' : 'Off',
      detail: selectedAgentMemoryEnabled ? selectedContextPresetLabel : 'No customer facts stored',
      tab: 'memory' as SpecialistOverlayTabId,
    },
    {
      label: 'Results',
      value: selectedAgentMetrics?.conversationCountLabel ?? '0 conversations',
      detail: selectedAgentMetrics?.latestActivityLabel ?? 'No recent activity',
      tab: 'analytics' as SpecialistOverlayTabId,
    },
  ];
  const addKnowledgeReferenceToDraft = (reference: string) => {
    const cleanReference = reference.trim();
    if (!cleanReference || !detailConfigDraft) {
      return;
    }
    const currentLines = knowledgeSourceLines(detailConfigDraft.knowledgeSourceText);
    if (currentLines.includes(cleanReference)) {
      setKnowledgeSourceInput('');
      return;
    }
    onUpdateDetailConfig({
      knowledgeSourceText: [...currentLines, cleanReference].join('\n'),
    });
    setKnowledgeSourceInput('');
  };
  const handleKnowledgeReferenceSubmit = () => {
    addKnowledgeReferenceToDraft(knowledgeSourceInput);
  };
  const handleKnowledgeFiles = async (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (!nextFiles.length) {
      return;
    }
    if (!detailConfigDraft) {
      setKnowledgeFileError('Open a Business Agent before adding files.');
      return;
    }
    const unsupported = nextFiles.find((file) => !isSupportedKnowledgeFile(file));
    if (unsupported) {
      setKnowledgeFileError(`Unsupported file type: ${unsupported.name}. Use ${SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS.join(', ')}.`);
      return;
    }
    setIsUploadingKnowledgeFile(true);
    setKnowledgeFileError(null);
    try {
      const oversized = nextFiles.find((file) => file.size > KNOWLEDGE_UPLOAD_MAX_BYTES);
      if (oversized) {
        setKnowledgeFileError(`${oversized.name} exceeds ${KNOWLEDGE_UPLOAD_MAX_MB}. Reduce file size and retry.`);
        return;
      }

      for (const file of nextFiles) {
        await onUploadKnowledgeFile(file);
      }
    } catch (error) {
      setKnowledgeFileError(error instanceof Error ? error.message : 'Knowledge file could not be uploaded.');
    } finally {
      setIsUploadingKnowledgeFile(false);
      if (knowledgeFileInputRef.current) {
        knowledgeFileInputRef.current.value = '';
      }
    }
  };

  if (!selectedAgent) {
    return (
      <div className="studio-agent-detail-empty" aria-label="Agent detail">
        <strong>Select an agent</strong>
        <span>
          Agent configuration, channels, memory, analytics, and launch state will appear here.
        </span>
      </div>
    );
  }

  const showSectionRail = currentStudioSubview === 'agents';

  return (
    <div className="app-stack-4 studio-agent-detail-motion">
      <div className={joinClassNames(
        'studio-agent-detail-layout',
        showSectionRail && 'studio-agent-detail-layout--with-rail',
        currentStudioSubview !== 'agents' && 'studio-agent-detail-layout--single',
      )}>
        {showSectionRail ? (
          <nav className="studio-agent-detail-tabs studio-agent-detail-tabs--rail" role="tablist" aria-label="Business Agent sections">
            {SPECIALIST_OVERLAY_TABS.map((tab) => {
              const SectionIcon = AGENT_SECTION_ICONS[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={joinClassNames(
                    'studio-agent-detail-tabs__button',
                    overlayTab === tab.id && 'studio-agent-detail-tabs__button--active',
                  )}
                  aria-label={tab.label}
                  aria-selected={overlayTab === tab.id}
                  title={tab.label}
                  onClick={() => onSelectTab(tab.id)}
                >
                  <SectionIcon size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className="studio-agent-detail-content">
        <AnimatePresence mode="wait" initial={false}>
              {currentStudioSubview === 'agents' && overlayTab === 'chat' && (
        <MotionTabPanel key="chat" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail studio-panel--chat"
          hideHeaderText
          eyebrow="Chat"
          title="Workspace chat"
          subtitle="Chat privately with this agent. Messages stay in Studio and never send to customer channels."
        >
          {selectedAgentId && workspaceId ? (
            <AgentPlaygroundPanel
              deployedAgentId={selectedAgentId}
              workspaceId={workspaceId}
              client={services.client}
              runtimeMode={testRuntimeModeForPlacement(selectedAgentRuntimePlacement)}
              session={testChatSession}
              onSessionChange={onTestChatSessionChange}
              onResetSession={onResetTestChatSession}
            />
          ) : (
            <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then chat with it here." />
          )}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'knowledge' && (
        <MotionTabPanel key="knowledge" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Knowledge"
          title="Agent knowledge"
          subtitle="Instructions and trusted sources this agent should use when answering."
          actions={(
            <div className="app-inline-actions app-inline-actions--tight">
              <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
                Edit
              </AppButton>
              {detailConfigDraft ? (
                <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                  {isSavingDetailConfig ? 'Saving…' : 'Save'}
                </AppButton>
              ) : null}
            </div>
          )}
        >
          <div className="studio-agent-knowledge">
            <section className="studio-agent-knowledge__section studio-agent-knowledge__section--instructions">
              <div className="studio-agent-knowledge__block studio-agent-knowledge__block--purpose">
                {detailConfigDraft ? (
                  <>
                    <label className="studio-agent-knowledge__edit-field">
                      <span>Purpose and behavior</span>
                      <AppTextarea
                        rows={5}
                        value={detailInstructionsValue}
                        onChange={(event) => onUpdateDetailConfig({ systemPrompt: event.currentTarget.value })}
                        placeholder="Describe what this Business Agent should do, what it should answer, and when it should hand off to a human."
                      />
                    </label>
                    <label className="studio-agent-knowledge__edit-field">
                      <span>Tone</span>
                      <AppTextarea
                        rows={2}
                        value={detailPersonaValue}
                        onChange={(event) => onUpdateDetailConfig({ persona: event.currentTarget.value })}
                        placeholder="Describe the voice and style this Business Agent should use."
                      />
                    </label>
                    <div className="studio-agent-knowledge__block-actions">
                      <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                        {isSavingDetailConfig ? 'Saving...' : 'Save instructions'}
                      </AppButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p>{visibleAgentInstructionsText || 'No instructions configured yet.'}</p>
                    <small>{visibleAgentPersonaText || 'No tone configured yet.'}</small>
                  </>
                )}
              </div>
            </section>

            <section className="studio-agent-knowledge__section">
              <div className="studio-agent-knowledge__section-head">
                <div>
                  <span>Knowledge</span>
                  <strong>Files and sources</strong>
                </div>
                <div className="studio-agent-knowledge__status-pill">
                  {visibleKnowledgeSourceCount > 0 ? `${visibleKnowledgeSourceCount} source${visibleKnowledgeSourceCount === 1 ? '' : 's'}` : 'No data'}
                </div>
              </div>

              {detailConfigDraft ? (
                <div className="studio-agent-knowledge__source-tools">
                  <button
                    type="button"
                    className="studio-agent-knowledge__dropzone"
                    disabled={isUploadingKnowledgeFile}
                    onClick={() => knowledgeFileInputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleKnowledgeFiles(event.dataTransfer.files);
                    }}
                  >
                    <strong>{isUploadingKnowledgeFile ? 'Uploading file...' : 'Drop files here or choose files'}</strong>
                    <span>{`Supports ${SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS.join(', ')} files up to ${KNOWLEDGE_UPLOAD_MAX_MB} (JSON request body limit).`}</span>
                  </button>
                  <input
                    ref={knowledgeFileInputRef}
                    type="file"
                    multiple
                    accept={SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS.join(',')}
                    className="studio-agent-knowledge__file-input"
                    onChange={(event) => {
                      if (event.currentTarget.files) {
                        void handleKnowledgeFiles(event.currentTarget.files);
                      }
                    }}
                  />
                  <div className="studio-agent-knowledge__source-form">
                    <input
                      type="text"
                      value={knowledgeSourceInput}
                      placeholder="Add a website, Google Sheet, file URI, or source reference..."
                      aria-label="Knowledge source reference"
                      onChange={(event) => setKnowledgeSourceInput(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleKnowledgeReferenceSubmit();
                        }
                      }}
                    />
                    <AppButton
                      type="button"
                      tone="secondary"
                      disabled={!knowledgeSourceInput.trim()}
                      onClick={handleKnowledgeReferenceSubmit}
                    >
                      Add source
                    </AppButton>
                  </div>
                  {knowledgeFileError ? (
                    <small className="studio-agent-knowledge__error" role="alert">{knowledgeFileError}</small>
                  ) : null}
                  <div className="studio-agent-knowledge__block-actions">
                    <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                      {isSavingDetailConfig ? 'Saving...' : 'Save sources'}
                    </AppButton>
                  </div>
                </div>
              ) : null}

              <div className="studio-agent-knowledge__sources">
                {visibleKnowledgeSources.length === 0 ? (
                  <div className="deployed-agents-overlay__empty">No knowledge sources connected yet.</div>
                ) : visibleKnowledgeSources.map((source, index) => {
                  const record = readRecord(source);
                  const label = readString(record.label ?? record.uri ?? record.id, `Knowledge source ${index + 1}`);
                  return (
                    <div key={`${label}-${index}`} className="studio-agent-knowledge__source">
                      <div className="studio-agent-knowledge__source-main">
                        <strong>{label}</strong>
                        <span>{readString(record.kind, humanizeToken(record.type, 'Source'))}</span>
                      </div>
                      <DataBadge tone={index < knowledgeSourceCount ? 'success' : 'neutral'}>
                        {index < knowledgeSourceCount ? 'Saved' : 'Unsaved'}
                      </DataBadge>
                    </div>
                  );
                })}
              </div>
            </section>

            {detailConfigDraft ? (
              <section className="studio-agent-knowledge__section studio-agent-knowledge__section--depth">
                <ContextPresetControl
                  value={detailConfigDraft.contextBudgetPreset}
                  onSelect={(nextValue) => onUpdateDetailConfig({ contextBudgetPreset: nextValue })}
                />
              </section>
            ) : null}
          </div>
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'ai' && (
        <MotionTabPanel key="ai" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Model"
          title="AI route"
          subtitle="Choose whether this agent uses Empyralis credits or a connected API account."
          actions={detailConfigDraft ? (
            <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
              {isSavingDetailConfig ? 'Saving…' : 'Save'}
            </AppButton>
          ) : undefined}
        >
          {detailConfigDraft ? (
            <>
              <AgentAiSettingsSections
                value={detailConfigDraft}
                providerCatalog={providerCatalog}
                isLoadingProviderCatalog={isLoadingProviderCatalog}
                onSelectTier={(nextTier) => {
                  onUpdateDetailConfig({ aiTier: nextTier });
                }}
                onSelectAiSource={(nextSource) => {
                  onUpdateDetailConfig({ aiSource: nextSource });
                }}
                onSelectProvider={(nextProviderId) => {
                   onUpdateDetailConfig({ providerId: nextProviderId });
                }}
                onSelectModel={(nextModelId) => {
                   onUpdateDetailConfig({ modelId: nextModelId });
                }}
                onRefreshProviderModels={onRefreshProviderModels}
                onSaveProviderCredential={onSaveProviderCredential}
                isSavingProviderCredential={isSavingProviderCredentialProp}
              />
            </>
          ) : null}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'tools' && (
        <MotionTabPanel key="tools" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Actions"
          title="Agent actions"
          subtitle="Choose what this agent may do with connected services."
          actions={detailConfigDraft ? (
            <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
              {isSavingDetailConfig ? 'Saving…' : 'Save'}
            </AppButton>
          ) : undefined}
        >
          {detailConfigDraft ? (
            <>
              <AgentActionCapabilitySections
                selectedToolIds={detailConfigDraft.selectedToolIds}
                onOpenIntegrations={() => onSelectTab('connectors')}
                onToggleTool={(toolId) => {
                  const nextSelected = detailConfigDraft.selectedToolIds.includes(toolId)
                    ? detailConfigDraft.selectedToolIds.filter((item) => item !== toolId)
                    : [...detailConfigDraft.selectedToolIds, toolId];
                  onUpdateDetailConfig({ selectedToolIds: nextSelected });
                }}
              />
            </>
          ) : null}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'memory' && (
        <MotionTabPanel key="memory" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Memory"
          title="Agent memory"
          subtitle="Control what this agent can carry forward from customer conversations."
          actions={detailConfigDraft ? (
            <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
              {isSavingDetailConfig ? 'Saving…' : 'Save'}
            </AppButton>
          ) : undefined}
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
                  onClick={() => onUpdateDetailConfig({ memoryEnabled: !detailConfigDraft.memoryEnabled })}
                >
                  <span className="sage-tool-toggle__thumb" />
                </button>
              </div>
              {detailConfigDraft.memoryEnabled ? (
                <div className="studio-agent-memory-settings">
                <RetentionPresetControl
                  value={detailConfigDraft.retentionPreset}
                  onSelect={(nextValue) => onUpdateDetailConfig({ retentionPreset: nextValue })}
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
            </>
          ) : null}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'connectors' && (
        <MotionTabPanel key="connectors" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Integrations"
          title="Agent integrations"
          subtitle="Connect customer channels and trusted systems after the agent exists."
        >
          <AgentIntegrationsSections
            providerCatalog={providerCatalog}
            connectorCards={overlayConnectorCards}
            runtimeAttachments={runtimeAttachments}
            hasGatewayOnlineTarget={hasGatewayOnlineTarget}
            hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
            workspaceId={workspaceId}
            selectedAgentId={selectedAgentId}
          />
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'analytics' && (
        <MotionTabPanel key="analytics" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Results"
          title="Agent results"
          subtitle="Activity and outcome signals for the selected agent."
        >
          <WorkstationDeployedAgentAnalyticsPane
            agentId={selectedAgentId!}
            workspaceId={workspaceId}
          />
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {(currentStudioSubview === 'deploy' || (currentStudioSubview === 'agents' && overlayTab === 'overview')) && (
        <MotionTabPanel key="overview" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          hideHeaderText
          eyebrow="Command Center"
          title={readString(selectedAgent.name, 'Assistant overview')}
          subtitle="Identity, launch readiness, and live performance signals."
        >
          {isLoadingDetail ? (
            <div className="app-stack-3">
              <SkeletonBlock height="6rem" />
              <SkeletonBlock height="12rem" />
            </div>
          ) : (
            <div className="studio-agent-overview">
              <section className="studio-agent-overview__readiness-hero">
                <div className="studio-agent-overview__hero-status">
                  <div className="studio-agent-overview__status-line">
                    <span className={joinClassNames('studio-agent-overview__status-dot', launchReady && 'studio-agent-overview__status-dot--ready')} />
                    <DataBadge tone={selectedAgentState === 'live' ? 'success' : launchReady ? 'success' : 'warning'}>
                      {selectedAgentStateLabel}
                    </DataBadge>
                  </div>
                  <strong>{launchTitle}</strong>
                  <p>{launchDetail}</p>
                  <div className="studio-agent-overview__identity-chips" aria-label="Agent scope">
                    <span>{AGENT_STUDIO_OBJECT_LABELS.studio_agent}</span>
                    <span>{selectedAgentVisibilityLabel}</span>
                    <span>{selectedAgentModeLabel}</span>
                  </div>
                  <div className="studio-agent-overview__hero-actions">
                    <AppButton type="button" onClick={() => onSelectTab('chat')}>
                      Chat with this agent
                    </AppButton>
                    <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
                      Edit setup
                    </AppButton>
                  </div>
                </div>
                <div className="studio-agent-overview__hero-metrics">
                  <div className="studio-agent-overview__hero-metric">
                    <span>Checklist</span>
                    <strong>{readyCount}/{readinessItems.length}</strong>
                  </div>
                  <div className="studio-agent-overview__hero-metric">
                    <span>Conversations</span>
                    <strong>{selectedAgentMetrics?.conversationCountLabel ?? '0'}</strong>
                  </div>
                  <div className="studio-agent-overview__hero-metric">
                    <span>Messages</span>
                    <strong>{selectedAgentAnalytics ? formatCompactCount(selectedAgentAnalytics.messageVolumeMonth) : '0'}</strong>
                  </div>
                  <div className="studio-agent-overview__hero-metric">
                    <span>Monthly cost</span>
                    <strong>{formatUsd(selectedBudgetBurn)}</strong>
                  </div>
                </div>
              </section>

              <section className="studio-agent-overview__launch-checklist" aria-label="Launch checklist">
                <div className="studio-agent-overview__section-head">
                  <div>
                    <span>Launch readiness</span>
                    <strong>What must be true before customers see it</strong>
                  </div>
                  <small>{readyCount} of {readinessItems.length} ready</small>
                </div>
                <div className="studio-agent-overview__checklist-grid">
                  {readinessItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={joinClassNames('studio-agent-overview__checklist-card', item.ready && 'studio-agent-overview__checklist-card--ready')}
                      onClick={() => onSelectTab(item.tab)}
                    >
                      <span className="studio-agent-overview__checklist-dot" />
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </button>
                  ))}
                </div>
              </section>

              <div className="studio-agent-overview__grid">
                <section className="studio-agent-overview__group">
                  <div className="studio-agent-overview__group-head">
                    <strong>Identity & Purpose</strong>
                    <button type="button" onClick={() => onSelectTab('knowledge')}>View instructions</button>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Public name</span>
                    <strong>{readString(selectedAgent.name, 'Unnamed agent')}</strong>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Avatar</span>
                    <div className="studio-agent-overview__avatar-preview">
                      {readString(selectedAgent.avatar) ? (
                        <img src={selectedAgent.avatar!} alt="Avatar" />
                      ) : (
                        <div className="studio-agent-overview__avatar-placeholder">
                          {readString(selectedAgent.name, 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{readString(selectedAgent.avatar) ? 'Custom' : 'Default'}</span>
                    </div>
                  </div>
                  <div className="studio-agent-overview__card studio-agent-overview__card--wide">
                    <span>Job description</span>
                    <p>{readString(selectedAgent.persona, 'No job description set.')}</p>
                  </div>
                </section>

                <section className="studio-agent-overview__group">
                  <div className="studio-agent-overview__group-head">
                    <strong>Knowledge & Retrieval</strong>
                    <button type="button" onClick={() => onSelectTab('knowledge')}>Test search</button>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Sources</span>
                    <strong>{knowledgeSourceCount} connected</strong>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Retrieval health</span>
                    <strong>
                      {knowledgeSourceCount > 0 ? 'Reference check ready' : 'Needs data'}
                    </strong>
                  </div>
                  <div className="studio-agent-overview__card studio-agent-overview__card--wide">
                    <span>Status</span>
                    <p>{knowledgeSourceCount > 0 ? 'Saved source references can be verified by name, kind, URI, or path. Content citation indexing is still reported separately.' : 'Agent will answer based on general instructions only.'}</p>
                  </div>
                </section>

                <section className="studio-agent-overview__group">
                  <div className="studio-agent-overview__group-head">
                    <strong>Model & Route</strong>
                    <button type="button" onClick={() => onSelectTab('ai')}>Change route</button>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Selected route</span>
                    <strong>{selectedAgentRouteLabel}</strong>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Default model</span>
                    <strong>{selectedAgentModelLabel}</strong>
                  </div>
                  <div className="studio-agent-overview__card studio-agent-overview__card--wide">
                    <span>Runtime</span>
                    <p>{selectedAgentModelSummary} · {modelReady ? 'Ready for production traffic.' : 'Connect a provider in Integrations.'}</p>
                  </div>
                </section>

                <section className="studio-agent-overview__group">
                  <div className="studio-agent-overview__group-head">
                    <strong>Safety & Compliance</strong>
                    <button type="button" onClick={onOpenEditWizard}>Adjust limits</button>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Human handoff</span>
                    <strong>{humanizeToken(readRecord(readRecord(selectedAgent.config).escalation_policy).preset, 'Standard')}</strong>
                  </div>
                  <div className="studio-agent-overview__card">
                    <span>Monthly cap</span>
                    <strong>{formatUsd(readRecord(readRecord(selectedAgent.config).commerce_policy).monthly_cost_cap_usd)}</strong>
                  </div>
                  <div className="studio-agent-overview__card studio-agent-overview__card--wide">
                    <span>Safety engine</span>
                    <p>Guarded by Empyralis Safety. {readRecord(readRecord(selectedAgent.config).safety_policy).health_safety_enabled === true ? 'Sensitive topic filter active.' : 'Standard safety active.'}</p>
                  </div>
                </section>
              </div>

              <section className="studio-agent-overview__integrations">
                <div className="studio-agent-overview__section-head">
                  <div>
                    <span>Integrations</span>
                    <strong>Live Channels & Connectors</strong>
                  </div>
                  <button type="button" className="studio-actions__link-button" onClick={() => onSelectTab('connectors')}>Manage integrations</button>
                </div>
                <div className="studio-agent-overview__connector-strip">
                  {overlayConnectorCards.slice(0, 4).map((card) => (
                    <div key={card.id} className={joinClassNames('studio-agent-overview__connector-pill', card.connected && 'studio-agent-overview__connector-pill--connected')}>
                      <span>{card.label}</span>
                      <strong>{card.statusLabel}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="studio-agent-overview__next-steps">
                <div className="studio-agent-overview__section-head">
                  <div>
                    <span>Next steps</span>
                    <strong>Path to production</strong>
                  </div>
                </div>
                <div className="studio-agent-overview__step-list">
                  {!launchReady ? (
                    <div className="studio-agent-overview__step studio-agent-overview__step--todo">
                      <div className="studio-agent-overview__step-mark">!</div>
                      <div className="studio-agent-overview__step-copy">
                        <strong>Complete the launch checklist</strong>
                        <p>{launchDetail}</p>
                        <AppButton type="button" tone="secondary" onClick={() => onSelectTab(readinessItems.find((item) => !item.ready)?.tab ?? 'ai')}>Resolve</AppButton>
                      </div>
                    </div>
                  ) : selectedAgentState !== 'live' ? (
                    <div className="studio-agent-overview__step studio-agent-overview__step--todo">
                      <div className="studio-agent-overview__step-mark">?</div>
                      <div className="studio-agent-overview__step-copy">
                        <strong>Test before deploying</strong>
                        <p>Open the private chat to verify the agent follows its instructions and cites the correct sources.</p>
                        <AppButton type="button" tone="secondary" onClick={() => onSelectTab('chat')}>Open chat</AppButton>
                      </div>
                    </div>
                  ) : (
                    <div className="studio-agent-overview__step studio-agent-overview__step--done">
                      <div className="studio-agent-overview__step-mark">✓</div>
                      <div className="studio-agent-overview__step-copy">
                        <strong>Agent is live</strong>
                        <p>Monitor customer conversations and outcomes in the Results tab.</p>
                        <AppButton type="button" tone="secondary" onClick={() => onSelectTab('analytics')}>View results</AppButton>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}
        </ListDetailPanel>
        </MotionTabPanel>
      )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

AgentDetailView.displayName = 'AgentDetailView';
