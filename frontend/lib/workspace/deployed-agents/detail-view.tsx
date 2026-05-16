'use client';

import { useMemo } from 'react';

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

export function AgentDetailView({
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
}: AgentDetailViewProps) {
  const selectedAgentId = readString(selectedAgent?.id);
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

  const selectedBudgetCycle = readBudgetCycle(selectedAgent);

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
  const selectedAgentState = readString(selectedAgent?.deployment_state).toLowerCase();
  const selectedAgentStateLabel = humanizeToken(selectedAgent?.deployment_state, 'Draft');
  const selectedAgentModelLabel = selectedModelId(selectedAgent) || humanizeToken(selectedProviderId(selectedAgent), 'Not pinned');
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
        <MotionTabPanel
          key={`${currentStudioSubview}:${overlayTab}:${selectedAgentId}`}
          className="studio-agent-motion-panel"
        >
      {currentStudioSubview === 'agents' && overlayTab === 'chat' && (
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          eyebrow="Chat"
          title="Chat"
          subtitle="Private messages for checking the selected agent before live customer traffic."
        >
          {selectedAgentId && workspaceId ? (
            <AgentPlaygroundPanel
              deployedAgentId={selectedAgentId}
              workspaceId={workspaceId}
              client={services.client}
              agentName={readString(selectedAgent.name, 'agent')}
              runtimeMode={testRuntimeModeForPlacement(selectedAgentRuntimePlacement)}
            />
          ) : (
            <EmptyPanel title="Agent is not ready yet" body="Save the agent first, then test it here." />
          )}
        </ListDetailPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'knowledge' && (
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
                onSelect={(nextValue) => onUpdateDetailConfig({ contextBudgetPreset: nextValue })}
              />
            ) : null}
            <div className="studio-agent-knowledge__sources">
              <div className="studio-agent-knowledge__section-head">
                <div>
                  <span>Sources</span>
                  <strong>Files, URLs, app docs, tables, or notes</strong>
                </div>
                <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
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
                    <span>{readString(record.kind, humanizeToken(record.type, 'Source'))}</span>
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
                <AppButton type="button" tone="secondary" onClick={() => onSelectTab('chat')}>
                  Test in chat
                </AppButton>
              </div>
              <p>{knowledgeSourceCount > 0 ? `${knowledgeSourceCount} source${knowledgeSourceCount === 1 ? '' : 's'} available for private test chat.` : 'Add a source, then test whether the agent cites the right material.'}</p>
            </div>
            {detailConfigDraft ? (
              <div className="app-inline-actions">
                <AppButton type="button" onClick={onSaveDetailConfig} disabled={isSavingDetailConfig}>
                  {isSavingDetailConfig ? 'Saving…' : 'Save'}
                </AppButton>
              </div>
            ) : null}
          </div>
        </ListDetailPanel>
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'ai' && (
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
                onSelectTier={(nextTier) => {
                  // We need updateDetailAiTier logic here or passed as prop
                  onUpdateDetailConfig({ aiTier: nextTier });
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
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'tools' && (
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
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'memory' && (
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
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'connectors' && (
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
      )}

      {currentStudioSubview === 'agents' && overlayTab === 'analytics' && (
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
      )}

      {(currentStudioSubview === 'deploy' || (currentStudioSubview === 'agents' && overlayTab === 'overview')) && (
        <ListDetailPanel
          className="studio-panel studio-panel--detail"
          eyebrow="Overview"
          title={readString(selectedAgent.name, 'Assistant details')}
          subtitle="Launch readiness, live health, and the next setup step for this agent."
          actions={(
            <div className="app-inline-actions app-inline-actions--tight">
              <AppButton type="button" tone="secondary" onClick={onOpenEditWizard}>
                Edit
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
                Deploy
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
                <section className="studio-agent-overview__hero" aria-label="Launch readiness">
                  <div className="studio-agent-overview__hero-copy">
                    <div className="studio-agent-overview__status-row">
                      <DataBadge tone={selectedAgentState === 'live' ? 'success' : launchReady ? 'success' : 'warning'}>
                        {selectedAgentStateLabel}
                      </DataBadge>
                      <DataBadge tone={launchReady ? 'success' : 'warning'}>
                        {readyCount} of {readinessItems.length} ready
                      </DataBadge>
                    </div>
                    <strong>{launchTitle}</strong>
                    <span>{launchDetail}</span>
                  </div>
                  <div className="studio-agent-overview__hero-actions">
                    <AppButton type="button" tone="secondary" onClick={() => onSelectTab('chat')}>
                      Test chat
                    </AppButton>
                    {launchReady ? (
                      <AppButton
                        type="button"
                        onClick={onDeploy}
                        disabled={busyAgentId === selectedAgentId || selectedAgentState === 'live'}
                      >
                        Deploy
                      </AppButton>
                    ) : (
                      <AppButton type="button" onClick={() => onSelectTab(readinessItems.find((item) => !item.ready)?.tab ?? 'ai')}>
                        Fix setup
                      </AppButton>
                    )}
                  </div>
                </section>

                <section className="studio-agent-overview__readiness" aria-label="Launch checklist">
                  <div className="studio-agent-overview__section-head">
                    <div>
                      <span>Launch checklist</span>
                      <strong>Production-safe defaults</strong>
                    </div>
                    <small>{launchReady ? 'No launch blockers' : `${readinessItems.length - readyCount} item${readinessItems.length - readyCount === 1 ? '' : 's'} need attention`}</small>
                  </div>
                  <div className="studio-agent-overview__check-grid">
                    {readinessItems.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={joinClassNames('studio-agent-overview__check-card', item.ready && 'studio-agent-overview__check-card--ready')}
                        onClick={() => onSelectTab(item.tab)}
                      >
                        <span className="studio-agent-overview__check-mark" aria-hidden="true">
                          {item.ready ? '✓' : '!'}
                        </span>
                        <span className="studio-agent-overview__check-copy">
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <AppSurfaceStatGrid className="studio-agent-overview__metrics">
                  <AppSurfaceStat
                    label="Active users"
                    value={selectedAgentAnalytics ? formatCompactCount(selectedAgentAnalytics.activeUsersLast30d) : (isLoadingAnalytics ? 'Syncing' : '0')}
                    hint="Last 30 days"
                  />
                  <AppSurfaceStat
                    label="Messages"
                    value={selectedAgentAnalytics ? formatCompactCount(selectedAgentAnalytics.messageVolumeMonth) : (isLoadingAnalytics ? 'Syncing' : '0')}
                    hint="This month"
                  />
                  <AppSurfaceStat
                    label="Customers"
                    value={selectedAgentMetrics?.conversationCountLabel ?? '0'}
                    hint="Open and total conversations"
                  />
                  <AppSurfaceStat
                    label="Escalation rate"
                    value={selectedAgentAnalytics ? `${selectedAgentAnalytics.escalationRatePercent.toFixed(1)}%` : '0.0%'}
                    hint="Owner review pressure"
                  />
                </AppSurfaceStatGrid>

                <section className="studio-agent-overview__chart" aria-label="Traffic trend">
                  <div className="studio-agent-overview__chart-copy">
                    <span>Traffic trend</span>
                    <strong>{selectedAgentAnalytics ? formatCompactCount(selectedAgentAnalytics.messageVolumeMonth) : '0'} messages</strong>
                    <small>Daily, weekly, and monthly message signal for this agent.</small>
                  </div>
                  <svg className="studio-agent-overview__sparkline" viewBox="0 0 100 88" preserveAspectRatio="none" aria-hidden="true">
                    <line x1="0" y1="76" x2="100" y2="76" />
                    <polyline points={overviewTrendPoints} />
                  </svg>
                </section>

                <section className="studio-agent-overview__setup" aria-label="Setup map">
                  <div className="studio-agent-overview__section-head">
                    <div>
                      <span>Agent profile</span>
                      <strong>What is configured</strong>
                    </div>
                    <small>Budget: {formatUsd(selectedBudgetCycle.current_burn_usd)} spent this cycle</small>
                  </div>
                  <div className="studio-agent-overview__setup-grid">
                    {setupCards.map((card) => (
                      <button
                        key={card.label}
                        type="button"
                        className="studio-agent-overview__setup-card"
                        onClick={() => onSelectTab(card.tab)}
                      >
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                        <small>{card.detail}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </ListDetailPanel>
      )}
        </MotionTabPanel>
      </AnimatePresence>
    </div>
  );
}
