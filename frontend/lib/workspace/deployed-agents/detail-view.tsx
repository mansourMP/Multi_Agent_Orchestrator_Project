'use client';

import { memo, useEffect, useMemo, useState } from 'react';

import { ListDetailPanel } from '@/lib/ui/list-detail';
import { AnimatePresence, MotionTabPanel } from '@/lib/ui/motion';
import { AppButton, AppSurfaceStat, AppSurfaceStatGrid, joinClassNames } from '@/lib/ui/primitives';
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
  SPECIALIST_CONNECTOR_CARDS,
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
  createEmptyDeployedAgentTestChatSession,
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

export interface AgentDetailViewProps {
  selectedAgent: DeployedAgentRecord | null;
  overlayTab: SpecialistOverlayTabId;
  detailConfigDraft: DetailConfigDraft | null;
  onSaveDetailConfig: () => void;
  isSavingDetailConfig: boolean;
  onUpdateDetailConfig: (next: Partial<DetailConfigDraft>) => void;
  providerCatalog: ProviderCatalogSnapshot[];
  isLoadingProviderCatalog: boolean;
  onRefreshProviderModels: (providerId: string) => void;
  workspaceId: string;
  services: any;
  bootstrap: any;
  runtimeAttachments: RuntimeAttachmentSnapshot[];
  selectedAgentAnalytics: AgentAnalyticsSnapshot | null;
  isLoadingAnalytics: boolean;
  selectedAgentMetrics: AgentOperationalMetrics | null;
  selectedTelegramReadiness: TelegramReadinessSnapshot | null;
  isLoadingTelegramReadiness: boolean;
  onOpenEditWizard: () => void;
  onDeploy: () => void;
  onPause: () => void;
  busyAgentId: string | null;
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
}

export const AgentDetailView = memo(({
  selectedAgent,
  overlayTab,
  detailConfigDraft,
  onSaveDetailConfig,
  isSavingDetailConfig,
  onUpdateDetailConfig,
  providerCatalog,
  isLoadingProviderCatalog,
  onRefreshProviderModels,
  workspaceId,
  services,
  bootstrap,
  runtimeAttachments,
  selectedAgentAnalytics,
  isLoadingAnalytics,
  selectedAgentMetrics,
  selectedTelegramReadiness,
  isLoadingTelegramReadiness,
  onOpenEditWizard,
  onDeploy,
  onPause,
  busyAgentId,
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
}: AgentDetailViewProps) => {
  const selectedAgentId = readString(selectedAgent?.id);
  const [testChatSession, setTestChatSession] = useState<DeployedAgentTestChatSessionState>(
    () => createEmptyDeployedAgentTestChatSession(),
  );
  const [knowledgeVerificationQuery, setKnowledgeVerificationQuery] = useState('');
  const [knowledgeVerificationResult, setKnowledgeVerificationResult] = useState<Record<string, unknown> | null>(null);
  const [knowledgeVerificationError, setKnowledgeVerificationError] = useState<string | null>(null);
  const [isVerifyingKnowledge, setIsVerifyingKnowledge] = useState(false);

  useEffect(() => {
    setTestChatSession(createEmptyDeployedAgentTestChatSession());
    setKnowledgeVerificationQuery('');
    setKnowledgeVerificationResult(null);
    setKnowledgeVerificationError(null);
    setIsVerifyingKnowledge(false);
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

  const selectedContextPresetLabel = detailConfigDraft
    ? CONTEXT_PRESET_OPTIONS.find((option) => option.id === detailConfigDraft.contextBudgetPreset)?.label ?? 'Balanced'
    : 'Balanced';

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

  const selectedBudgetCycle = readBudgetCycle(selectedAgent);
  const selectedBudgetBurn = selectedAgentAnalytics?.currentBurnUsd ?? readNumber(selectedBudgetCycle.current_burn_usd);

  const selectedAgentModeLabel = selectedAgent
    ? runtimePlacementLabel(selectedAgentRuntimePlacement)
    : 'Empyralis Cloud';

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
  ];
  const readyCount = readinessItems.filter((item) => item.ready).length;
  const launchReady = deployBlockers.length === 0 && modelReady && instructionsReady && knowledgeReady && channelReady && runtimeReady && telegramReady;
  const launchTitle = selectedAgentState === 'live'
    ? 'Live and serving customers'
    : launchReady
      ? 'Ready to deploy'
      : 'Launch needs attention';
  const launchDetail = selectedAgentState === 'live'
    ? 'This agent can receive customer traffic.'
    : launchReady
      ? 'Production-safe defaults are set. Test once, then deploy when ready.'
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
  const knowledgeVerificationRecord = readRecord(knowledgeVerificationResult);
  const knowledgeVerificationStatus = readString(knowledgeVerificationRecord.status);
  const knowledgeVerificationMessage = readString(knowledgeVerificationRecord.message);
  const knowledgeVerificationMatches = Array.isArray(knowledgeVerificationRecord.matched_sources)
    ? knowledgeVerificationRecord.matched_sources
    : [];
  const knowledgeVerificationChunks = Array.isArray(knowledgeVerificationRecord.matched_chunks)
    ? knowledgeVerificationRecord.matched_chunks
    : [];
  const knowledgeVerificationAvailable = knowledgeVerificationRecord.content_retrieval_available === true;
  const canVerifyKnowledge = Boolean(
    selectedAgentId &&
    knowledgeSourceCount > 0 &&
    knowledgeVerificationQuery.trim() &&
    !isVerifyingKnowledge,
  );
  const handleVerifyKnowledge = async () => {
    if (!selectedAgentId || !knowledgeVerificationQuery.trim() || isVerifyingKnowledge) {
      return;
    }
    setIsVerifyingKnowledge(true);
    setKnowledgeVerificationError(null);
    try {
      const result = await services.client.verifyDeployedAgentKnowledge({
        deployedAgentId: selectedAgentId,
        query: knowledgeVerificationQuery.trim(),
        limit: 5,
      });
      setKnowledgeVerificationResult(result ?? null);
    } catch (error: unknown) {
      setKnowledgeVerificationResult(null);
      setKnowledgeVerificationError(error instanceof Error ? error.message : 'Knowledge verification failed.');
    } finally {
      setIsVerifyingKnowledge(false);
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

  return (
    <div className="app-stack-4 studio-agent-detail-motion">
      <AnimatePresence mode="wait" initial={false}>
              {currentStudioSubview === 'agents' && overlayTab === 'chat' && (
        <MotionTabPanel key="chat" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail studio-panel--chat"
          eyebrow="Chat"
          title="Chat"
          subtitle="Private messages for checking the selected agent before live customer traffic."
        >
          {selectedAgentId && workspaceId ? (
            <AgentPlaygroundPanel
              deployedAgentId={selectedAgentId}
              workspaceId={workspaceId}
              client={services.client}
              runtimeMode={testRuntimeModeForPlacement(selectedAgentRuntimePlacement)}
              session={testChatSession}
              onSessionChange={setTestChatSession}
              onResetSession={() => setTestChatSession(createEmptyDeployedAgentTestChatSession())}
            />
          ) : (
            <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then test it here." />
          )}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'knowledge' && (
        <MotionTabPanel key="knowledge" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          eyebrow="Knowledge"
          title="Agent knowledge"
          subtitle="Instructions and trusted sources this agent should use when answering."
          actions={(
            <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
              Edit
            </AppButton>
          )}
        >
          <div className="studio-agent-knowledge">
            <section className="studio-agent-knowledge__section">
              <div className="studio-agent-knowledge__section-head">
                <div>
                  <span>Instructions</span>
                  <strong>Agent Purpose</strong>
                </div>
              </div>
              <div className="studio-agent-knowledge__block">
                <p>{selectedAgentInstructionsText || 'No custom instructions configured.'}</p>
                <small>{selectedAgentPersonaText || 'No persona configured.'}</small>
              </div>
            </section>

            <section className="studio-agent-knowledge__section">
              <div className="studio-agent-knowledge__section-head">
                <div>
                  <span>Knowledge Sources</span>
                  <strong>Indexed Evidence</strong>
                </div>
                <div className="studio-agent-knowledge__status-pill">
                  {knowledgeSourceCount > 0 ? 'Sources listed' : 'No data'}
                </div>
              </div>

              <div className="studio-agent-knowledge__grid">
                <div>
                  <span>Sources</span>
                  <strong>{knowledgeSourceCount} connected</strong>
                </div>
                <div>
                  <span>Context policy</span>
                  <strong>{selectedContextPresetLabel}</strong>
                </div>
                <div>
                  <span>Retrieval status</span>
                  <strong>
                    {knowledgeSourceCount > 0 ? 'Ready to verify' : 'Needs source'}
                  </strong>
                </div>
              </div>

              <div className="studio-agent-knowledge__sources">
                {selectedKnowledgeSources.length === 0 ? (
                  <div className="deployed-agents-overlay__empty">No knowledge sources connected yet.</div>
                ) : selectedKnowledgeSources.map((source, index) => {
                  const record = readRecord(source);
                  const label = readString(record.label ?? record.uri ?? record.id, `Knowledge source ${index + 1}`);
                  return (
                    <div key={`${label}-${index}`} className="studio-agent-knowledge__source">
                      <div className="studio-agent-knowledge__source-main">
                        <strong>{label}</strong>
                        <span>{readString(record.kind, humanizeToken(record.type, 'Source'))}</span>
                      </div>
                      <DataBadge tone="success">Ready</DataBadge>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="studio-agent-knowledge__section">
              <div className="studio-agent-knowledge__section-head">
                <div>
                  <span>Evidence test</span>
                  <strong>Verify retrieval</strong>
                </div>
              </div>
              <div className="studio-agent-knowledge__test-box">
                <p>
                  {knowledgeSourceCount > 0
                    ? "Run a retrieval check against saved knowledge sources and inspect the grounded chunks used as evidence."
                    : "Add at least one trusted source to enable retrieval testing."}
                </p>
                <div className="studio-agent-knowledge__test-input">
                  <input
                    type="text"
                    value={knowledgeVerificationQuery}
                    disabled={knowledgeSourceCount === 0 || isVerifyingKnowledge}
                    placeholder={knowledgeSourceCount > 0 ? "Example: What is the refund policy?" : "Add sources first..."}
                    aria-label="Knowledge retrieval test prompt"
                    onChange={(event) => setKnowledgeVerificationQuery(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleVerifyKnowledge();
                      }
                    }}
                  />
                  <AppButton
                    type="button"
                    tone="secondary"
                    disabled={!canVerifyKnowledge}
                    onClick={() => void handleVerifyKnowledge()}
                  >
                    {isVerifyingKnowledge ? 'Checking...' : 'Verify'}
                  </AppButton>
                </div>
                {knowledgeVerificationError ? (
                  <small role="alert">{knowledgeVerificationError}</small>
                ) : null}
                {knowledgeVerificationResult ? (
                  <div className="studio-agent-knowledge__sources" aria-label="Knowledge verification result">
                    <div className="studio-agent-knowledge__source">
                      <div className="studio-agent-knowledge__source-main">
                        <strong>{humanizeToken(knowledgeVerificationStatus, 'Verification result')}</strong>
                        <span>{knowledgeVerificationMessage || 'Knowledge verification completed.'}</span>
                      </div>
                      <DataBadge tone={knowledgeVerificationStatus === 'retrieval_available' ? 'success' : 'warning'}>
                        {knowledgeVerificationAvailable ? 'Grounded chunks' : 'Index needed'}
                      </DataBadge>
                    </div>
                    {knowledgeVerificationChunks.length > 0 ? knowledgeVerificationChunks.map((chunk, index) => {
                      const match = readRecord(chunk);
                      const citation = readRecord(match.citation);
                      const label = readString(citation.label ?? match.source_label ?? match.source_uri, `Retrieved chunk ${index + 1}`);
                      const snippet = readString(match.chunk_text, 'Retrieved evidence');
                      return (
                        <div key={`${label}-chunk-${index}`} className="studio-agent-knowledge__source">
                          <div className="studio-agent-knowledge__source-main">
                            <strong>{label}</strong>
                            <span>{snippet}</span>
                          </div>
                          <DataBadge tone="success">Evidence</DataBadge>
                        </div>
                      );
                    }) : null}
                    {knowledgeVerificationMatches.length > 0 ? knowledgeVerificationMatches.map((source, index) => {
                      const match = readRecord(source);
                      const label = readString(match.label ?? match.uri ?? match.path ?? match.id, `Matched source ${index + 1}`);
                      return (
                        <div key={`${label}-${index}`} className="studio-agent-knowledge__source">
                          <div className="studio-agent-knowledge__source-main">
                            <strong>{label}</strong>
                            <span>{readString(match.source_kind, 'Source reference')}</span>
                          </div>
                          <DataBadge tone="success">Matched</DataBadge>
                        </div>
                      );
                    }) : null}
                  </div>
                ) : null}
              </div>
            </section>

            {detailConfigDraft ? (
              <div className="app-stack-2">
                <ContextPresetControl
                  value={detailConfigDraft.contextBudgetPreset}
                  onSelect={(nextValue) => onUpdateDetailConfig({ contextBudgetPreset: nextValue })}
                />
                <div className="app-inline-actions">
                  <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                    {isSavingDetailConfig ? 'Saving…' : 'Save changes'}
                  </AppButton>
                </div>
              </div>
            ) : null}
          </div>
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'ai' && (
        <MotionTabPanel key="ai" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          eyebrow="Model"
          title="AI route"
          subtitle="Choose whether this agent uses Empyralis credits or a connected API account."
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
                onOpenIntegrations={() => onSelectTab('connectors')}
              />
              <div className="app-inline-actions">
                <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                  {isSavingDetailConfig ? 'Saving…' : 'Save'}
                </AppButton>
              </div>
            </>
          ) : null}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'tools' && (
        <MotionTabPanel key="tools" className="studio-agent-motion-panel">
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
                onOpenIntegrations={() => onSelectTab('connectors')}
                onToggleTool={(toolId) => {
                  const nextSelected = detailConfigDraft.selectedToolIds.includes(toolId)
                    ? detailConfigDraft.selectedToolIds.filter((item) => item !== toolId)
                    : [...detailConfigDraft.selectedToolIds, toolId];
                  onUpdateDetailConfig({ selectedToolIds: nextSelected });
                }}
              />
              <div className="app-inline-actions">
                <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                  {isSavingDetailConfig ? 'Saving…' : 'Save'}
                </AppButton>
              </div>
            </>
          ) : null}
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'memory' && (
        <MotionTabPanel key="memory" className="studio-agent-motion-panel">
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
              <div className="app-inline-actions">
                <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                  {isSavingDetailConfig ? 'Saving…' : 'Save'}
                </AppButton>
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
          />
        </ListDetailPanel>
        </MotionTabPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'analytics' && (
        <MotionTabPanel key="analytics" className="studio-agent-motion-panel">
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
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
          eyebrow="Command Center"
          title={readString(selectedAgent.name, 'Assistant overview')}
          subtitle="Identity, launch readiness, and live performance signals."
          actions={(
            <div className="app-inline-actions app-inline-actions--tight">
              <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
                Edit profile
              </AppButton>
              <AppButton
                type="button"
                onClick={onDeploy}
                disabled={
                  busyAgentId === selectedAgentId ||
                  !launchReady ||
                  readString(selectedAgent.deployment_state).toLowerCase() === 'live' ||
                  (selectedAgentNeedsTelegramReadiness && isLoadingTelegramReadiness) ||
                  (selectedAgentNeedsTelegramReadiness && !selectedTelegramReadiness) ||
                  (selectedAgentNeedsTelegramReadiness && selectedTelegramReadiness !== null && selectedTelegramReadiness.readyForLive !== true) ||
                  Boolean(selectedAgentModelDeployBlocker) ||
                  Boolean(selectedAgentSelfHostedDeployBlocker)
                }
              >
                Go live
              </AppButton>
              <AppButton
                type="button"
                tone="danger"
                onClick={onPause}
                disabled={busyAgentId === selectedAgentId || readString(selectedAgent.deployment_state).toLowerCase() === 'paused'}
              >
                Pause
              </AppButton>
            </div>
          )}
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
  );
});

AgentDetailView.displayName = 'AgentDetailView';
