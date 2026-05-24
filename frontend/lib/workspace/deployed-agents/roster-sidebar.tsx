'use client';

import { memo, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { ListDetailPanel } from '@/lib/ui/list-detail';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { DataBadge } from '@/lib/ui/data-table';
import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { StateBanner } from '@/lib/ui/state-banner';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { DeployedAgentRecord } from '@/lib/workspace/workstation-client';
import type {
  AgentOperationalMetrics,
  LaunchReadinessItem,
  RuntimeAttachmentSnapshot,
  StudioTemplate,
} from './types';
import {
  CUSTOM_STUDIO_TEMPLATE,
  PRIMARY_STUDIO_TEMPLATE_IDS,
} from './constants';
import {
  StudioTemplateCard,
  LaunchReadinessChecklist,
} from './components';
import {
  readRecord,
  readString,
  humanizeToken,
  deploymentStateLabel,
  rosterStatusTone,
  runtimePlacementLabel,
} from './utils';

const AgentRosterItem = memo(({
  agent,
  selected,
  agentMetrics,
  onSelectAgent,
}: {
  agent: DeployedAgentRecord;
  selected: boolean;
  agentMetrics: AgentOperationalMetrics | null;
  onSelectAgent: (id: string) => void;
}) => {
  const agentId = readString(agent.id);

  // Memoize the JSON parsing so it only happens when agent strings change
  const channels = useMemo(() => Object.entries(readRecord(agent.channels))
    .filter(([_, value]) => readRecord(value).enabled === true)
    .map(([key]) => key), [agent.channels]);

  const channelLabel = humanizeToken(channels[0] || 'no_channel', 'No channel');

  const modeLabel = useMemo(() => runtimePlacementLabel(
     readRecord(agent.config).runtime_placement ?? readRecord(agent.metadata).runtime_placement ?? agent.runtime_target
  ), [agent.config, agent.metadata, agent.runtime_target]);

  const stateLabel = deploymentStateLabel(agent.deployment_state);
  const displayName = readString(agent.name, agentId);
  const displayInitial = (displayName.trim().charAt(0) || 'A').toUpperCase();
  const latestActivityLabel = agentMetrics?.latestActivityLabel ?? 'Syncing recent activity';

  return (
    <button
      type="button"
      className={joinClassNames(
        'studio-agents-nav__agent',
        selected && 'studio-agents-nav__agent--active',
      )}
      aria-selected={selected}
      onClick={() => onSelectAgent(agentId)}
    >
      <span className="studio-agents-nav__avatar" aria-hidden="true">{displayInitial}</span>
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
});

AgentRosterItem.displayName = 'AgentRosterItem';

export interface AgentRosterSidebarProps {
  collapsed?: boolean;
  showAgentsIndex: boolean;
  recentlyCreatedAgentId: string | null;
  selectedAgent: DeployedAgentRecord | null;
  onDismissRecentlyCreated: () => void;
  onOpenChatProof: () => void;
  onOpenBilling: () => void;
  onExportAudit: (agentId: string) => void;
  onOpenAssistantDetail: (id: string) => void;
  onOpenCreateWizard: (templateId: string) => void;
  currentStudioSubview: 'agents' | 'inbox' | 'deploy';
  onRefreshAgents: () => void;
  studioTemplates: StudioTemplate[];
  agents: DeployedAgentRecord[];
  selectedAgentId: string | null;
  busyAuditExportAgentId: string | null;
  onSelectAgent: (id: string) => void;
  agentMetricsById: Record<string, AgentOperationalMetrics>;
  isAgentListPriming: boolean;
  isAgentListUnavailable: boolean;
  showReadinessPanel: boolean;
  activeChannels: string[];
  selectedAgentModelDeployBlocker: string | null;
  selectedAgentRuntimeOption: any;
  selectedAgentRuntimeBlocker: string | null;
  selectedAgentRuntimePlacement: string;
  selectedAgentLaunchReadinessItems: LaunchReadinessItem[];
  selectedAgentSelfHostedNode: RuntimeAttachmentSnapshot | null;
  selectedAgentSelfHostedDeployBlocker: string | null;
  selfHostedNodeHealthLabel: (node: RuntimeAttachmentSnapshot | null) => string;
}

export const AgentRosterSidebar = memo(({
  collapsed = false,
  showAgentsIndex,
  recentlyCreatedAgentId,
  selectedAgent,
  onDismissRecentlyCreated,
  onOpenChatProof,
  onOpenBilling,
  onExportAudit,
  onOpenAssistantDetail,
  onOpenCreateWizard,
  currentStudioSubview,
  onRefreshAgents,
  studioTemplates,
  agents,
  selectedAgentId,
  busyAuditExportAgentId,
  onSelectAgent,
  agentMetricsById,
  isAgentListPriming,
  isAgentListUnavailable,
  showReadinessPanel,
  activeChannels,
  selectedAgentModelDeployBlocker,
  selectedAgentRuntimeOption,
  selectedAgentRuntimeBlocker,
  selectedAgentRuntimePlacement,
  selectedAgentLaunchReadinessItems,
  selectedAgentSelfHostedNode,
  selectedAgentSelfHostedDeployBlocker,
  selfHostedNodeHealthLabel,
}: AgentRosterSidebarProps) => {
  const primaryStudioTemplates = studioTemplates.filter((template) => PRIMARY_STUDIO_TEMPLATE_IDS.has(template.id));
  const additionalStudioTemplates = studioTemplates.filter((template) => !PRIMARY_STUDIO_TEMPLATE_IDS.has(template.id));

  return (
    <div className="app-stack-4">
      {showAgentsIndex ? (
        <>
          {!collapsed ? (
            <>
              {recentlyCreatedAgentId && selectedAgent ? (
                <ListDetailPanel
                  className="studio-panel studio-panel--demo-proof"
                  eyebrow="Next step"
                  title="Show proof in under a minute"
                  subtitle="Open the chat transcript to show customer work, then open billing and credits to show the revenue path."
                  actions={(
                    <div className="app-inline-actions app-inline-actions--tight">
                      <AppButton type="button" tone="secondary" onClick={onDismissRecentlyCreated}>
                        Dismiss
                      </AppButton>
                    </div>
                  )}
                >
                  <div className="app-inline-actions app-inline-actions--tight studio-inline-wrap">
                    <AppButton type="button" onClick={onOpenChatProof}>
                      Open chat proof
                    </AppButton>
                    <AppButton type="button" tone="secondary" onClick={onOpenBilling}>
                      Open billing & credits
                    </AppButton>
                    <AppButton
                      type="button"
                      tone="secondary"
                  onClick={() => onOpenAssistantDetail(recentlyCreatedAgentId)}
                >
                  Open Business Agent detail
                </AppButton>
                  </div>
                </ListDetailPanel>
              ) : null}

              <ListDetailPanel
                className="studio-panel studio-panel--demo-path"
                eyebrow="Start here"
                title="Create one working Business Agent"
                subtitle="Choose a common business job, add the facts it should trust, test privately, then go live."
                actions={(
                  <AppButton type="button" tone="primary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                    Create Business Agent
                  </AppButton>
                )}
              >
                <div className="deployed-agents-card__badges" aria-label="Business Agent creation steps">
                  <span className="deployed-agents-card__badge">1. Pick business</span>
                  <span className="deployed-agents-card__badge">2. Add trusted info</span>
                  <span className="deployed-agents-card__badge">3. Test privately</span>
                  <span className="deployed-agents-card__badge">4. Go live</span>
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
                      onClick={onRefreshAgents}
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
                      onSelect={onOpenCreateWizard}
                    />
                  ))}
                </div>
                {additionalStudioTemplates.length > 0 ? (
                  <details className="app-stack-3">
                    <summary>More Business Agent templates</summary>
                    <div className="studio-template-grid" data-studio-template-grid="more">
                      {additionalStudioTemplates.map((template) => (
                        <StudioTemplateCard
                          key={template.id}
                          template={template}
                          onSelect={onOpenCreateWizard}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </ListDetailPanel>
            </>
          ) : null}

          <div
            className={joinClassNames(
              'studio-agents-nav',
              collapsed && 'studio-agents-nav--collapsed',
              agents.length === 0 && 'studio-agents-nav--empty',
            )}
            aria-label="Business Agents"
          >
            {collapsed && agents.length === 0 ? null : isAgentListPriming ? (
              <div className="studio-agents-nav__loading">
                <SkeletonBlock height="4.5rem" />
                <SkeletonBlock height="4.5rem" />
                <SkeletonBlock height="4.5rem" />
              </div>
            ) : isAgentListUnavailable ? (
              <div className="studio-agents-nav__empty">
                <div className="studio-agents-nav__empty-copy">
                  <strong>Could not load Business Agents</strong>
                  <span>Retry the worker list, or create a new Business Agent.</span>
                </div>
                <div className="studio-agents-nav__empty-actions">
                  <AppButton type="button" tone="primary" onClick={onRefreshAgents}>
                    Retry
                  </AppButton>
                  <AppButton type="button" tone="secondary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                    Create Business Agent
                  </AppButton>
                </div>
              </div>
            ) : agents.length === 0 ? (
              <div className="studio-agents-nav__empty">
                <div className="studio-agents-nav__empty-copy">
                  <strong>No Business Agents yet</strong>
                  <span>Create the first worker for a customer, channel, or business workflow.</span>
                </div>
                <AppButton type="button" tone="primary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                  Create Business Agent
                </AppButton>
              </div>
            ) : (
              <div className="studio-agents-nav__items">
                {agents.map((agent, index) => {
                  const agentId = readString(agent.id, `deployed-agent-${index}`);
                  return (
                    <AgentRosterItem
                      key={agentId}
                      agent={agent}
                      selected={agentId === selectedAgentId}
                      agentMetrics={agentMetricsById[agentId] ?? null}
                      onSelectAgent={onSelectAgent}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {showReadinessPanel ? (
        <ListDetailPanel
          className="studio-panel studio-panel--readiness"
          eyebrow="Readiness"
          title="Launch readiness"
          subtitle="The launch contract for this Business Agent."
          actions={selectedAgent ? (
            <AppButton
              type="button"
              tone="secondary"
              disabled={busyAuditExportAgentId === readString(selectedAgent.id, '')}
              onClick={() => onExportAudit(readString(selectedAgent.id, ''))}
            >
              {busyAuditExportAgentId === readString(selectedAgent.id, '') ? 'Exporting audit…' : 'Export audit'}
            </AppButton>
          ) : undefined}
        >
          <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
            <FormReadout label="Primary channel" value={activeChannels[0] ? humanizeToken(activeChannels[0], activeChannels[0]) : 'No live channel'} />
            <FormReadout label="Channels" value={activeChannels.length > 0 ? activeChannels.join(', ') : 'No active channels'} />
            <FormReadout label="Model provider" value={selectedAgentModelDeployBlocker ? 'Needs connection' : 'Connected'} />
            <FormReadout label="Where it runs" value={selectedAgentRuntimeOption.label} />
          </FormGrid>
          <section className="studio-actions__section studio-actions__section--compact" aria-label="Runtime posture">
            <div className="studio-actions__section-head">
              <div>
                <span>Where it runs</span>
                <strong>{selectedAgentRuntimeOption.label}</strong>
              </div>
              <DataBadge tone={selectedAgentRuntimeBlocker ? 'warning' : 'success'}>
                {selectedAgentRuntimeBlocker ? 'Needs setup' : selectedAgentRuntimePlacement === 'managed_cloud' ? 'Default' : 'Ready'}
              </DataBadge>
            </div>
            <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
              <FormReadout label="Runtime type" value={selectedAgentRuntimePlacement === 'managed_cloud' ? 'Cloud worker' : selectedAgentRuntimeOption.label} />
              <FormReadout label="Computer required" value={selectedAgentRuntimePlacement === 'managed_cloud' ? 'No' : 'Yes, setup required'} />
              <FormReadout label="Runtime owner" value={selectedAgentRuntimeOption.supplier === 'empyralis' ? 'Empyralis' : 'Customer'} />
              <FormReadout label="Cost posture" value={selectedAgentRuntimeOption.costRisk} />
            </FormGrid>
            <p className="studio-actions__note">{selectedAgentRuntimeOption.runsWhere}</p>
          </section>
          <LaunchReadinessChecklist items={selectedAgentLaunchReadinessItems} />
          {selectedAgentModelDeployBlocker ? (
            <StateBanner
              tone="warning"
              title="Connect a model provider before launch"
              detail="Open Integrations and connect OpenRouter, OpenAI, Anthropic, Google Gemini, or another API provider."
            />
          ) : null}
          {selectedAgentRuntimeBlocker ? (
            <StateBanner
              tone="warning"
              title="Runtime needs setup"
              detail={selectedAgentRuntimeBlocker}
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
                  detail="This Business Agent runs on customer-hosted compute only. No silent fallback to platform-hosted compute."
                />
              )}
            </div>
          ) : null}
        </ListDetailPanel>
      ) : null}
    </div>
  );
});

AgentRosterSidebar.displayName = 'AgentRosterSidebar';
