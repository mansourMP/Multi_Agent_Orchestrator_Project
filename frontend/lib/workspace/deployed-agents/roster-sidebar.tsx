'use client';

import { memo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
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
  CUSTOM_STUDIO_TEMPLATE,
} from './constants';
import {
  readRecord,
  readString,
  humanizeToken,
  deploymentStateLabel,
  rosterStatusTone,
} from './utils';

type StudioRosterTypeFilterId = 'all' | 'native' | 'connected' | 'computers';

const STUDIO_ROSTER_TYPE_FILTERS: ReadonlyArray<{ id: StudioRosterTypeFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'native', label: 'Native' },
  { id: 'connected', label: 'Connected' },
  { id: 'computers', label: 'Computers' },
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
  const stateLabel = deploymentStateLabel(agent.deployment_state);
  const displayName = readString(agent.name, agentId);
  const displayInitial = (displayName.trim().charAt(0) || 'A').toUpperCase();
  const latestActivityLabel = agentMetrics?.latestActivityLabel;

  return (
    <button
      type="button"
      className={joinClassNames(
        'studio-agents-nav__agent',
        selected && 'studio-agents-nav__agent--active',
      )}
      aria-label={`${displayName}, ${stateLabel}${latestActivityLabel ? `, ${latestActivityLabel}` : ''}`}
      aria-selected={selected}
      onClick={() => onSelectAgent(agentId)}
    >
      <span className="studio-agents-nav__avatar" aria-hidden="true">{displayInitial}</span>
      <span className="studio-agents-nav__copy">
        <span className="studio-agents-nav__label">{displayName}</span>
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
      aria-label={`${displayName}, connected agent, ${providerLabel}, ${humanizeToken(connectionState, 'Unverified')}`}
      aria-selected={selected}
      onClick={() => onSelectAgent(agentId)}
    >
      <span className="studio-agents-nav__copy">
        <span className="studio-agents-nav__label">{displayName}</span>
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
      aria-label={`${displayName}, Agent Computer, ${kindLabel}, ${online ? 'Online' : humanizeToken(status, 'Unknown')}`}
      aria-selected={selected}
      onClick={() => onSelectComputer(computerId)}
    >
      <span className="studio-agents-nav__copy">
        <span className="studio-agents-nav__label">{displayName}</span>
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
  totalStudioObjectCount: number;
  visibleStudioObjectCount: number;
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
  totalStudioObjectCount,
  visibleStudioObjectCount,
}: AgentRosterSidebarProps) => {
  const [typeFilter, setTypeFilter] = useState<StudioRosterTypeFilterId>('all');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const typeFilterCounts: Record<StudioRosterTypeFilterId, number> = {
    all: visibleStudioObjectCount,
    native: agents.length,
    connected: connectedExternalAgents.length,
    computers: agentComputers.length,
  };
  const showNativeAgents = typeFilter === 'all' || typeFilter === 'native';
  const showConnectedAgents = typeFilter === 'all' || typeFilter === 'connected';
  const showAgentComputers = typeFilter === 'all' || typeFilter === 'computers';
  const searchVisible = searchExpanded || rosterSearchQuery.trim().length > 0;
  const visibleItemCount = typeFilterCounts[typeFilter] ?? 0;
  const hasSearchQuery = rosterSearchQuery.trim().length > 0;
  const emptyTitle = (() => {
    if (hasSearchQuery) {
      return 'No matching Studio objects';
    }
    if (typeFilter === 'native') {
      return 'No native agents yet';
    }
    if (typeFilter === 'connected') {
      return 'No connected agents yet';
    }
    if (typeFilter === 'computers') {
      return 'No Agent Computers yet';
    }
    return 'No Studio objects yet';
  })();
  const emptyDetail = (() => {
    if (hasSearchQuery) {
      return 'Try another search or switch object type.';
    }
    if (typeFilter === 'native' || typeFilter === 'all') {
      return 'Create a native agent or connect another runtime when ready.';
    }
    if (typeFilter === 'connected') {
      return 'External runtimes can be connected when that path is ready.';
    }
    return 'Runtime resources can be added when local or dedicated work is needed.';
  })();

  const connectedAgentItems = !collapsed && showConnectedAgents ? connectedExternalAgents.map((agent, index) => {
        const agentId = readString(agent.id, `connected-agent-${index}`);
        return (
          <ConnectedExternalAgentRosterItem
            key={agentId}
            agent={agent}
            selected={agentId === selectedExternalAgentId}
            onSelectAgent={onSelectExternalAgent}
          />
        );
      }) : null;

  const agentComputerItems = !collapsed && showAgentComputers ? agentComputers.map((computer, index) => {
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
      }) : null;

  return (
    <div className="app-stack-4">
      {showAgentsIndex ? (
        <>
          {!collapsed ? (
            <div className="studio-agents-nav__toolbar">
              <div className="studio-agents-nav__toolbar-head">
                <div className="studio-agents-nav__toolbar-actions">
                  <AppButton
                    type="button"
                    tone="secondary"
                    className="studio-agents-nav__icon-button"
                    onClick={() => setSearchExpanded((current) => !current)}
                    aria-label="Search Studio objects"
                    title="Search Studio objects"
                    aria-pressed={searchVisible}
                  >
                    <Search size={16} strokeWidth={1.9} aria-hidden="true" />
                  </AppButton>
                  <AppButton
                    type="button"
                    tone="primary"
                    className="studio-agents-nav__icon-button studio-agents-nav__icon-button--primary"
                    onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}
                    aria-label="Add agent"
                    title="Add agent"
                  >
                    <Plus size={18} strokeWidth={2} aria-hidden="true" />
                  </AppButton>
                </div>
              </div>
              {searchVisible ? (
                <label className="studio-agents-nav__search">
                  <Search size={14} strokeWidth={1.9} aria-hidden="true" />
                  <input
                    type="search"
                    value={rosterSearchQuery}
                    placeholder="Search agents"
                    aria-label="Search Studio objects"
                    onChange={(event) => onChangeRosterSearch(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              <div className="studio-agents-nav__filters" aria-label="Studio object type filters">
                {STUDIO_ROSTER_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    className={joinClassNames(
                      'studio-agents-nav__filter',
                      typeFilter === filter.id && 'studio-agents-nav__filter--active',
                    )}
                    aria-pressed={typeFilter === filter.id}
                    onClick={() => setTypeFilter(filter.id)}
                  >
                    <span>{filter.label}</span>
                    <strong>{typeFilterCounts[filter.id] ?? 0}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={joinClassNames(
              'studio-agents-nav',
              collapsed && 'studio-agents-nav--collapsed',
              visibleItemCount === 0 && 'studio-agents-nav--empty',
            )}
            aria-label="Studio objects"
          >
            {collapsed && visibleItemCount === 0 ? null : isAgentListPriming ? (
              <div className="studio-agents-nav__loading">
                <SkeletonBlock height="4.5rem" />
                <SkeletonBlock height="4.5rem" />
                <SkeletonBlock height="4.5rem" />
              </div>
            ) : isAgentListUnavailable ? (
              <div className="studio-agents-nav__empty">
                <div className="studio-agents-nav__empty-copy">
                  <strong>Could not load native agents</strong>
                  <span>Retry the agent list, or create a new native Studio agent.</span>
                </div>
                <div className="studio-agents-nav__empty-actions">
                  <AppButton type="button" tone="primary" onClick={onRefreshAgents}>
                    Retry
                  </AppButton>
                  <AppButton type="button" tone="secondary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                    Create native agent
                  </AppButton>
                </div>
              </div>
            ) : visibleItemCount === 0 ? (
              <div className="studio-agents-nav__items">
                <div className="studio-agents-nav__empty">
                  <div className="studio-agents-nav__empty-copy">
                    <strong>{emptyTitle}</strong>
                    <span>{emptyDetail}</span>
                  </div>
                  {totalStudioObjectCount > 0 && (typeFilter !== 'native' || hasSearchQuery) ? null : (
                    <AppButton type="button" tone="primary" onClick={() => onOpenCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                      Add agent
                    </AppButton>
                  )}
                </div>
              </div>
            ) : (
              <div className="studio-agents-nav__items">
                {showNativeAgents ? agents.map((agent, index) => {
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
                }) : null}
                {connectedAgentItems}
                {agentComputerItems}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
});

AgentRosterSidebar.displayName = 'AgentRosterSidebar';
