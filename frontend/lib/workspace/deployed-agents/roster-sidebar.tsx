'use client';

import { memo, useMemo } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { DeployedAgentRecord } from '@/lib/workspace/workstation-client';
import type {
  AgentOperationalMetrics,
  RuntimeAttachmentSnapshot,
  StudioAgentComputerSurface,
  StudioConnectedExternalAgent,
} from './types';
import {
  AGENT_STUDIO_OBJECT_LABELS,
  AGENT_VISIBILITY_LABELS,
  CUSTOM_STUDIO_TEMPLATE,
} from './constants';
import {
  readRecord,
  readString,
  humanizeToken,
  deploymentStateLabel,
  rosterStatusTone,
  runtimePlacementLabel,
} from './utils';

type StudioRosterFilterId = 'all' | 'live' | 'draft' | 'needs_attention' | 'paused';

const STUDIO_ROSTER_FILTERS: ReadonlyArray<{ id: StudioRosterFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'draft', label: 'Draft' },
  { id: 'needs_attention', label: 'Needs attention' },
  { id: 'paused', label: 'Paused' },
];

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
  const visibilityLabel = readString(agent.deployment_state).toLowerCase() === 'live' && channels.length > 0
    ? AGENT_VISIBILITY_LABELS.public_channel
    : AGENT_VISIBILITY_LABELS.private_workspace;

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
        <span className="studio-agents-nav__chips" aria-label={`${displayName} scope`}>
          <span>{AGENT_STUDIO_OBJECT_LABELS.studio_agent}</span>
          <span>{visibilityLabel}</span>
          <span>{modeLabel}</span>
        </span>
        <span className="studio-agents-nav__detail">
          {channelLabel} · {latestActivityLabel}
        </span>
      </span>
      <span className={joinClassNames('studio-agents-nav__status', `studio-agents-nav__status--${rosterStatusTone(agent.deployment_state)}`)}>
        {stateLabel}
      </span>
    </button>
  );
});

AgentRosterItem.displayName = 'AgentRosterItem';

const ConnectedExternalAgentRosterItem = memo(({
  agent,
  selected,
  onSelectAgent,
}: {
  agent: StudioConnectedExternalAgent;
  selected: boolean;
  onSelectAgent: (id: string) => void;
}) => {
  const agentId = readString(agent.id);
  const displayName = readString(agent.name ?? agent.label, agentId || 'Connected Agent');
  const connectionState = readString(agent.connection_state, 'unverified');
  const providerLabel = humanizeToken(agent.provider_kind, 'Custom endpoint');

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
      <span className="studio-agents-nav__copy">
        <span className="studio-agents-nav__label">{displayName}</span>
        <span className="studio-agents-nav__chips" aria-label={`${displayName} connection`}>
          <span>{AGENT_STUDIO_OBJECT_LABELS.connected_external_agent}</span>
          <span>{AGENT_VISIBILITY_LABELS.private_workspace}</span>
          <span>{providerLabel}</span>
        </span>
        <span className="studio-agents-nav__detail">
          Backend proxy · {humanizeToken(connectionState, 'Unverified')}
        </span>
      </span>
      <span className={joinClassNames('studio-agents-nav__status', connectionState === 'verified' ? 'studio-agents-nav__status--live' : connectionState === 'revoked' ? 'studio-agents-nav__status--danger' : 'studio-agents-nav__status--warning')}>
        {humanizeToken(connectionState, 'Unverified')}
      </span>
    </button>
  );
});

ConnectedExternalAgentRosterItem.displayName = 'ConnectedExternalAgentRosterItem';

function readComputerValue(computer: StudioAgentComputerSurface | RuntimeAttachmentSnapshot, key: string): unknown {
  if (key in computer) {
    return (computer as Record<string, unknown>)[key];
  }
  return readRecord((computer as StudioAgentComputerSurface).record)[key];
}

const AgentComputerRosterItem = memo(({
  computer,
  selected,
  onSelectComputer,
}: {
  computer: StudioAgentComputerSurface | RuntimeAttachmentSnapshot;
  selected: boolean;
  onSelectComputer: (id: string) => void;
}) => {
  const computerId = readString(
    readComputerValue(computer, 'id')
    ?? readComputerValue(computer, 'attachmentId')
    ?? readComputerValue(computer, 'attachment_id'),
  );
  const displayName = readString(readComputerValue(computer, 'name') ?? readComputerValue(computer, 'label'), computerId || 'Agent Computer');
  const status = readString(readComputerValue(computer, 'status'), 'unknown');
  const kindLabel = humanizeToken(readComputerValue(computer, 'nodeKind') ?? readComputerValue(computer, 'node_kind'), 'Runtime');
  const online = readComputerValue(computer, 'online') === true;

  return (
    <button
      type="button"
      className={joinClassNames(
        'studio-agents-nav__agent',
        selected && 'studio-agents-nav__agent--active',
      )}
      aria-selected={selected}
      onClick={() => onSelectComputer(computerId)}
    >
      <span className="studio-agents-nav__copy">
        <span className="studio-agents-nav__label">{displayName}</span>
        <span className="studio-agents-nav__chips" aria-label={`${displayName} resource`}>
          <span>{AGENT_STUDIO_OBJECT_LABELS.agent_computer}</span>
          <span>{kindLabel}</span>
        </span>
        <span className="studio-agents-nav__detail">
          Runtime resource · {online ? 'Online' : humanizeToken(status, 'Unknown')}
        </span>
      </span>
      <span className={joinClassNames('studio-agents-nav__status', online ? 'studio-agents-nav__status--live' : 'studio-agents-nav__status--warning')}>
        {online ? 'Online' : humanizeToken(status, 'Unknown')}
      </span>
    </button>
  );
});

AgentComputerRosterItem.displayName = 'AgentComputerRosterItem';

export interface AgentRosterSidebarProps {
  collapsed?: boolean;
  showAgentsIndex: boolean;
  onOpenCreateWizard: (templateId: string) => void;
  onRefreshAgents: () => void;
  agents: DeployedAgentRecord[];
  connectedExternalAgents: StudioConnectedExternalAgent[];
  agentComputers: Array<StudioAgentComputerSurface | RuntimeAttachmentSnapshot>;
  selectedAgentId: string | null;
  selectedExternalAgentId: string | null;
  selectedAgentComputerId: string | null;
  onSelectAgent: (id: string) => void;
  onSelectExternalAgent: (id: string) => void;
  onSelectAgentComputer: (id: string) => void;
  agentMetricsById: Record<string, AgentOperationalMetrics>;
  isAgentListPriming: boolean;
  isAgentListUnavailable: boolean;
  rosterSearchQuery: string;
  onChangeRosterSearch: (value: string) => void;
  rosterFilter: StudioRosterFilterId;
  onChangeRosterFilter: (filter: StudioRosterFilterId) => void;
  rosterFilterCounts: Record<StudioRosterFilterId, number>;
  totalAgentCount: number;
  visibleAgentCount: number;
}

export const AgentRosterSidebar = memo(({
  collapsed = false,
  showAgentsIndex,
  onOpenCreateWizard,
  onRefreshAgents,
  agents,
  connectedExternalAgents,
  agentComputers,
  selectedAgentId,
  selectedExternalAgentId,
  selectedAgentComputerId,
  onSelectAgent,
  onSelectExternalAgent,
  onSelectAgentComputer,
  agentMetricsById,
  isAgentListPriming,
  isAgentListUnavailable,
  rosterSearchQuery,
  onChangeRosterSearch,
  rosterFilter,
  onChangeRosterFilter,
  rosterFilterCounts,
  totalAgentCount,
  visibleAgentCount,
}: AgentRosterSidebarProps) => {
  const supplementalSections = !collapsed ? (
    <>
      <div className="studio-agents-nav__section">
        <span>Connected Agents</span>
        <strong>{connectedExternalAgents.length}</strong>
      </div>
      {connectedExternalAgents.length > 0 ? connectedExternalAgents.map((agent, index) => {
        const agentId = readString(agent.id, `connected-agent-${index}`);
        return (
          <ConnectedExternalAgentRosterItem
            key={agentId}
            agent={agent}
            selected={agentId === selectedExternalAgentId}
            onSelectAgent={onSelectExternalAgent}
          />
        );
      }) : (
        <div className="studio-agents-nav__placeholder">
          <strong>No connected agents</strong>
          <span>OpenClaw, Hermes, NemoClaw, or custom endpoints can be connected here.</span>
        </div>
      )}
      <div className="studio-agents-nav__section">
        <span>Agent Computers</span>
        <strong>{agentComputers.length}</strong>
      </div>
      {agentComputers.length > 0 ? agentComputers.map((computer, index) => {
        const computerId = readString(
          readComputerValue(computer, 'id')
          ?? readComputerValue(computer, 'attachmentId')
          ?? readComputerValue(computer, 'attachment_id'),
          `agent-computer-${index}`,
        );
        return (
          <AgentComputerRosterItem
            key={computerId}
            computer={computer}
            selected={computerId === selectedAgentComputerId}
            onSelectComputer={onSelectAgentComputer}
          />
        );
      }) : (
        <div className="studio-agents-nav__placeholder">
          <strong>No Agent Computers</strong>
          <span>Connect a MacBook, server, VPS, or cloud computer as a runtime resource.</span>
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="app-stack-4">
      {showAgentsIndex ? (
        <>
          {!collapsed ? (
            <div className="studio-agents-nav__toolbar">
              <div className="studio-agents-nav__toolbar-head">
                <div>
                  <span>Business Agents</span>
                  <strong>{visibleAgentCount} of {totalAgentCount}</strong>
                </div>
                <div className="app-inline-actions app-inline-actions--tight">
                  <AppButton
                    type="button"
                    tone="secondary"
                    className="deployed-agents-tabbar__refresh"
                    onClick={onRefreshAgents}
                    aria-label="Refresh Business Agents"
                    title="Refresh Business Agents"
                  >
                    <RefreshCw size={14} strokeWidth={1.9} aria-hidden="true" />
                  </AppButton>
                  <AppButton
                    type="button"
                    tone="primary"
                    onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}
                  >
                    <Plus size={14} strokeWidth={1.9} aria-hidden="true" />
                    Add agent
                  </AppButton>
                </div>
              </div>
              <label className="studio-agents-nav__search">
                <Search size={14} strokeWidth={1.9} aria-hidden="true" />
                <input
                  type="search"
                  value={rosterSearchQuery}
                  placeholder="Search agents"
                  aria-label="Search Business Agents"
                  onChange={(event) => onChangeRosterSearch(event.currentTarget.value)}
                />
              </label>
              <div className="studio-agents-nav__filters" aria-label="Business Agent status filters">
                {STUDIO_ROSTER_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={joinClassNames(
                      'studio-agents-nav__filter',
                      rosterFilter === filter.id && 'studio-agents-nav__filter--active',
                    )}
                    aria-pressed={rosterFilter === filter.id}
                    onClick={() => onChangeRosterFilter(filter.id)}
                  >
                    <span>{filter.label}</span>
                    <strong>{rosterFilterCounts[filter.id] ?? 0}</strong>
                  </button>
                ))}
              </div>
            </div>
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
              <div className="studio-agents-nav__items">
                <div className="studio-agents-nav__empty">
                  <div className="studio-agents-nav__empty-copy">
                    <strong>{totalAgentCount > 0 ? 'No matching agents' : 'No Business Agents yet'}</strong>
                    <span>{totalAgentCount > 0 ? 'Adjust search or status filters.' : 'Create the first worker for a customer, channel, or business workflow.'}</span>
                  </div>
                  {totalAgentCount > 0 ? null : (
                    <AppButton type="button" tone="primary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                      Add agent
                    </AppButton>
                  )}
                </div>
                {supplementalSections}
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
                {supplementalSections}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
});

AgentRosterSidebar.displayName = 'AgentRosterSidebar';
