'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ArrowLeft, BookOpen, Bot, Brain, ChevronRight, Compass, Cpu, LayoutGrid, Link2, ListTodo, Menu, MessageSquare, Package, Plus, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { logout } from '@/lib/auth/auth-client';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import { AppDrawer, joinClassNames } from '@/lib/ui/primitives';
import {
  APPLICATION_TITLEBAR_TABS,
  buildApplicationTabHref,
} from '@/lib/workspace/application-surface-tabs';
import { WorkstationHardwareStatus } from '@/lib/workspace/workstation-hardware-status';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';
import type { ConnectedExternalAgentRecord, DeployedAgentRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { emitWorkstationChatThreadSelected } from '@/lib/workspace/workstation-chat-thread-events';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import type { RuntimeAttachmentSnapshot, SpecialistOverlayTabId } from '@/lib/workspace/deployed-agents/types';
import {
  NATIVE_SPECIALIST_OVERLAY_TABS,
  SPECIALIST_OVERLAY_TABS,
} from '@/lib/workspace/deployed-agents/constants';
import {
  studioPaneCache,
  subscribeStudioPaneCache,
} from '@/lib/workspace/deployed-agents/utils';
import {
  activeThreadStorageKey,
  persistActiveThread,
} from '@/lib/workspace/workstation-chat-pane-model';
import {
  buildWorkspaceRouteHref,
  getWorkspaceNavRouteDefinition,
  type WorkspaceNavDestinationId,
  type WorkspaceRouteId,
} from '../../../shared/nav-manifest';

const CONTEXT_ROUTE_IDS_BY_DESTINATION: Record<WorkspaceNavDestinationId, readonly WorkspaceRouteId[]> = {
  sage: ['chat', 'activity', 'integrations', 'memory', 'tasks', 'artifacts'],
  studio: ['studio'],
  gateway: [],
  marketplace: ['marketplace'],
  applications: ['applications'],
  settings: ['settings'],
};

type ShellSectionId = WorkspaceNavDestinationId;

type PrimaryShellTabId = Extract<WorkspaceNavDestinationId, 'sage' | 'studio' | 'marketplace' | 'applications'>;

const SHELL_PRIMARY_TABS: readonly {
  id: PrimaryShellTabId;
  label: string;
  routeId: WorkspaceRouteId;
  icon: LucideIcon;
}[] = [
  { id: 'sage', label: 'Sage', routeId: 'chat', icon: Bot },
  { id: 'studio', label: 'Studio', routeId: 'studio', icon: LayoutGrid },
  { id: 'marketplace', label: 'Discover', routeId: 'marketplace', icon: Compass },
  { id: 'applications', label: 'Apps', routeId: 'applications', icon: Package },
];

const DISCOVER_FILTERS: readonly {
  id: ShellSectionId;
  label: string;
  filter: MarketplaceTitlebarFilter;
}[] = [
  { id: 'marketplace', label: 'Agent templates', filter: 'agent_template' },
  { id: 'marketplace', label: 'Skills', filter: 'skill' },
  { id: 'marketplace', label: 'MCP', filter: 'connector' },
  { id: 'marketplace', label: 'Bundles', filter: 'bundle' },
];

const SAGE_MOBILE_DRAWER_ROUTE_IDS: readonly {
  routeId: WorkspaceRouteId;
  label: string;
  icon: LucideIcon;
}[] = [
  { routeId: 'chat', label: 'Chat', icon: MessageSquare },
  { routeId: 'integrations', label: 'Connections', icon: Link2 },
  { routeId: 'memory', label: 'Memory', icon: Brain },
  { routeId: 'tasks', label: 'Tasks', icon: ListTodo },
  { routeId: 'artifacts', label: 'Library', icon: BookOpen },
];

const SAGE_SIDEBAR_NAV_ITEMS: readonly {
  routeId: WorkspaceRouteId;
  label: string;
  icon: LucideIcon;
}[] = [
  { routeId: 'memory', label: 'Memory', icon: Brain },
  { routeId: 'tasks', label: 'Tasks', icon: ListTodo },
  { routeId: 'artifacts', label: 'Library', icon: BookOpen },
];

const SAGE_SETUP_NAV_ITEMS: readonly {
  id: string;
  label: string;
  section: string;
  icon: LucideIcon;
}[] = [
  { id: 'ai-runtime', label: 'AI & Runtime', section: 'ai-runtime', icon: Cpu },
  { id: 'connections', label: 'Connections', section: 'connections', icon: Link2 },
  { id: 'plugins', label: 'Plugins', section: 'plugins', icon: Wrench },
];

const MARKETPLACE_TITLEBAR_FILTERS = [
  { id: 'agent_template', label: 'Agent templates' },
  { id: 'skill', label: 'Skills' },
  { id: 'connector', label: 'MCP' },
  { id: 'bundle', label: 'Bundles' },
] as const;

type MarketplaceTitlebarFilter = typeof MARKETPLACE_TITLEBAR_FILTERS[number]['id'];

function normalizeMarketplaceTitlebarFilter(value: string | null): MarketplaceTitlebarFilter {
  return MARKETPLACE_TITLEBAR_FILTERS.some((filter) => filter.id === value)
    ? value as MarketplaceTitlebarFilter
    : 'agent_template';
}

function buildMarketplaceCategoryHref(workspaceId: string, filter: MarketplaceTitlebarFilter): string {
  const baseHref = buildWorkspaceRouteHref(workspaceId, 'marketplace');
  return `${baseHref}?category=${encodeURIComponent(filter)}`;
}

function buildStudioCreateAgentHref(
  workspaceId: string,
  searchParams: { toString: () => string },
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('createAgent', '1');
  params.delete('agent');
  params.delete('externalAgent');
  params.delete('agentComputer');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}?${query}`;
}

type ThreadTurnRecord = Record<string, unknown> & {
  role?: string | null;
  content?: string | null;
};

type ThreadRecord = Record<string, unknown> & {
  id?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_turn_at?: string | null;
  turns?: ThreadTurnRecord[] | null;
};

type ChatHistoryItem = {
  id: string;
  title: string;
  occurredAt: string | null;
};

type AssistantProjectLink = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: LucideIcon;
};

type PanelStackLevel =
  | 'root'
  | 'assistant'
  | 'studio'
  | 'discover'
  | `agent:${string}`
  | `external-agent:${string}`
  | `agent-computer:${string}`;

type PanelTransitionDirection = 'forward' | 'back';

type AgentDetailPanelTabId = SpecialistOverlayTabId;

const AGENT_DETAIL_NAV_ITEMS: readonly {
  id: AgentDetailPanelTabId;
  label: string;
}[] = NATIVE_SPECIALIST_OVERLAY_TABS;

const AGENT_COMPUTER_DETAIL_NAV_ITEMS: readonly {
  id: AgentDetailPanelTabId;
  label: string;
}[] = [{ id: 'overview', label: 'Overview' }];

const PANEL_COLLAPSED_STORAGE_KEY = 'panel_collapsed';

function readPanelCollapsedPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(PANEL_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writePanelCollapsedPreference(collapsed: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(PANEL_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Local storage preferences are non-critical.
  }
}

const MOBILE_DESTINATION_NAV: readonly {
  id: 'chat' | 'studio' | 'marketplace' | 'applications';
  label: string;
  defaultRouteId: WorkspaceRouteId;
  icon: LucideIcon;
}[] = [
  { id: 'chat', label: 'Sage', defaultRouteId: 'chat', icon: Bot },
  { id: 'studio', label: 'Agents', defaultRouteId: 'studio', icon: LayoutGrid },
  { id: 'marketplace', label: 'Discover', defaultRouteId: 'marketplace', icon: Compass },
  { id: 'applications', label: 'Applications', defaultRouteId: 'applications', icon: Package },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readRecord(item)).filter((item) => Object.keys(item).length > 0);
}

function humanizeAgentState(value: unknown): string {
  const normalized = readString(value, 'draft').replace(/[_-]+/g, ' ');
  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildStudioAgentHref(
  workspaceId: string,
  searchParams: { toString: () => string },
  agentId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('agent', agentId);
  params.delete('externalAgent');
  params.delete('agentComputer');
  params.delete('studioFilter');
  params.delete('tab');
  params.delete('studioTab');
  params.delete('createAgent');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}${query ? `?${query}` : ''}`;
}

function buildStudioAgentTabHref(
  workspaceId: string,
  searchParams: { toString: () => string },
  agentId: string,
  tabId: AgentDetailPanelTabId,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('agent', agentId);
  params.set('tab', tabId);
  params.delete('externalAgent');
  params.delete('agentComputer');
  params.delete('studioFilter');
  params.delete('studioTab');
  params.delete('createAgent');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}${query ? `?${query}` : ''}`;
}

function buildStudioExternalAgentHref(
  workspaceId: string,
  searchParams: { toString: () => string },
  externalAgentId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('externalAgent', externalAgentId);
  params.delete('agent');
  params.delete('agentComputer');
  params.delete('studioFilter');
  params.delete('tab');
  params.delete('studioTab');
  params.delete('createAgent');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}${query ? `?${query}` : ''}`;
}

function buildStudioExternalAgentTabHref(
  workspaceId: string,
  searchParams: { toString: () => string },
  externalAgentId: string,
  tabId: AgentDetailPanelTabId,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('externalAgent', externalAgentId);
  params.set('tab', tabId);
  params.delete('agent');
  params.delete('agentComputer');
  params.delete('studioFilter');
  params.delete('studioTab');
  params.delete('createAgent');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}${query ? `?${query}` : ''}`;
}

function normalizeAgentDetailTab(value: string | null): AgentDetailPanelTabId {
  if (value === 'connectors') {
    return 'tools';
  }
  return AGENT_DETAIL_NAV_ITEMS.some((item) => item.id === value)
    ? value as AgentDetailPanelTabId
    : 'overview';
}

function normalizeExternalAgentDetailTab(
  value: string | null,
  items: readonly {
    id: AgentDetailPanelTabId;
    label: string;
  }[],
): AgentDetailPanelTabId {
  if (value === 'connectors') {
    return items.some((item) => item.id === 'artifacts') ? 'artifacts' : 'analytics';
  }
  return items.some((item) => item.id === value)
    ? value as AgentDetailPanelTabId
    : 'overview';
}

function studioSelectionLevelFromQuery({
  selectedAgentId,
  selectedExternalAgentId,
  selectedAgentComputerId,
}: {
  selectedAgentId: string | null;
  selectedExternalAgentId: string | null;
  selectedAgentComputerId: string | null;
}): PanelStackLevel | null {
  if (selectedAgentId) {
    return `agent:${selectedAgentId}`;
  }
  if (selectedExternalAgentId) {
    return `external-agent:${selectedExternalAgentId}`;
  }
  if (selectedAgentComputerId) {
    return `agent-computer:${selectedAgentComputerId}`;
  }
  return null;
}

function studioObjectLevelKind(level: PanelStackLevel): 'agent' | 'external-agent' | 'agent-computer' | null {
  if (level.startsWith('agent:')) {
    return 'agent';
  }
  if (level.startsWith('external-agent:')) {
    return 'external-agent';
  }
  if (level.startsWith('agent-computer:')) {
    return 'agent-computer';
  }
  return null;
}

function capabilityEnabled(capabilityManifest: Record<string, unknown>, key: string): boolean {
  if (capabilityManifest[key] === true) {
    return true;
  }
  const capabilities = capabilityManifest.capabilities;
  return Array.isArray(capabilities) && capabilities.map((item) => readString(item).toLowerCase()).includes(key);
}

function externalAgentHasSectionToken(agent: ConnectedExternalAgentRecord | null, tokens: readonly string[]): boolean {
  const sections = readRecordArray(agent?.surface_sections);
  return sections.some((section) => {
    const values = [
      section.id,
      section.category,
      section.capability_required,
      section.capabilityRequired,
      section.display_kind,
      section.displayKind,
      section.title,
    ].map((value) => readString(value).toLowerCase());
    return tokens.some((token) => values.some((value) => value.includes(token)));
  });
}

function externalAgentHasObjectTypeToken(agent: ConnectedExternalAgentRecord | null, tokens: readonly string[]): boolean {
  const objectTypes = Array.isArray(agent?.object_types)
    ? agent.object_types.map((item) => readString(item).toLowerCase()).filter(Boolean)
    : [];
  return objectTypes.some((value) => tokens.some((token) => value.includes(token)));
}

function externalAgentHasArtifacts(agent: ConnectedExternalAgentRecord | null): boolean {
  const capabilityManifest = readRecord(agent?.capability_manifest);
  return (
    capabilityEnabled(capabilityManifest, 'artifacts')
    || capabilityEnabled(capabilityManifest, 'artifact')
    || capabilityEnabled(capabilityManifest, 'outputs')
    || capabilityEnabled(capabilityManifest, 'resources')
    || externalAgentHasObjectTypeToken(agent, ['external_agent_artifact', 'artifact', 'output', 'resource'])
    || externalAgentHasSectionToken(agent, ['artifact', 'output', 'resource'])
  );
}

function visibleExternalAgentDetailTabs(agent: ConnectedExternalAgentRecord | null): readonly {
  id: AgentDetailPanelTabId;
  label: string;
}[] {
  const capabilityManifest = readRecord(agent?.capability_manifest);
  return SPECIALIST_OVERLAY_TABS.filter((tab) => {
    if (tab.id === 'overview' || tab.id === 'chat' || tab.id === 'analytics') {
      return true;
    }
    if (tab.id === 'channels' || tab.id === 'ai' || tab.id === 'connectors') {
      return false;
    }
    if (tab.id === 'artifacts') {
      return externalAgentHasArtifacts(agent);
    }
    if (tab.id === 'knowledge') {
      return capabilityEnabled(capabilityManifest, 'knowledge_read') || externalAgentHasSectionToken(agent, ['knowledge', 'source']);
    }
    if (tab.id === 'memory') {
      return capabilityEnabled(capabilityManifest, 'memory_read') || externalAgentHasSectionToken(agent, ['memory']);
    }
    if (tab.id === 'tools') {
      return capabilityEnabled(capabilityManifest, 'actions') || capabilityEnabled(capabilityManifest, 'tools') || externalAgentHasSectionToken(agent, ['action', 'tool']);
    }
    return false;
  });
}

function agentStatusTone(value: unknown): 'live' | 'warning' | 'danger' {
  const normalized = readString(value, 'draft').toLowerCase();
  if (['live', 'active', 'running', 'online', 'connected'].includes(normalized)) {
    return 'live';
  }
  if (['blocked', 'failed', 'error', 'offline', 'disabled'].includes(normalized)) {
    return 'danger';
  }
  return 'warning';
}

function readRuntimeAttachmentId(computer: RuntimeAttachmentSnapshot): string {
  return readString(
    computer.attachmentId
    ?? (computer as Record<string, unknown>).id
    ?? (computer as Record<string, unknown>).attachment_id,
  );
}

function buildStudioAgentComputerHref(
  workspaceId: string,
  searchParams: { toString: () => string },
  agentComputerId: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set('agentComputer', agentComputerId);
  params.delete('agent');
  params.delete('externalAgent');
  params.delete('studioFilter');
  params.delete('tab');
  params.delete('studioTab');
  params.delete('createAgent');
  const query = params.toString();
  return `${buildWorkspaceRouteHref(workspaceId, 'studio')}${query ? `?${query}` : ''}`;
}

function normalizeThreadItems(payload: unknown): ThreadRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ThreadRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isPlaceholderTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === '' || normalized === 'new chat' || normalized === 'chat' || normalized === 'primary thread';
}

function compactHistoryTitle(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Conversation';
  }
  return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized;
}

function threadHistoryTitle(thread: ThreadRecord): string {
  const explicitTitle = readString(thread.title);
  if (explicitTitle && !isPlaceholderTitle(explicitTitle)) {
    return compactHistoryTitle(explicitTitle);
  }
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const firstUserTurn = turns.find((turn) => readString(turn.role).toLowerCase() === 'user');
  const firstContent = readString(firstUserTurn?.content);
  return compactHistoryTitle(firstContent || explicitTitle || 'Conversation');
}

function formatHistoryDate(value: string | null): string {
  if (!value) {
    return 'Recent';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent';
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function readActiveThreadId(workspaceId: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    return readString(window.localStorage.getItem(activeThreadStorageKey(workspaceId))) || null;
  } catch {
    return null;
  }
}

function toHistoryItems(threads: ThreadRecord[]): ChatHistoryItem[] {
  return threads
    .map((thread) => {
      const id = readString(thread.id);
      if (!id) {
        return null;
      }
      const occurredAt = readString(thread.last_turn_at)
        || readString(thread.updated_at)
        || readString(thread.created_at)
        || null;
      return {
        id,
        title: threadHistoryTitle(thread),
        occurredAt,
      } satisfies ChatHistoryItem;
    })
    .filter((item): item is ChatHistoryItem => item !== null)
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function MainAgentMobileHistoryList({
  chatHref,
  client,
  workspaceId,
  onNavigate,
}: {
  chatHref: string;
  client: {
    listThreads: (options?: { includeTurns?: boolean; limit?: number }) => Promise<Record<string, unknown>>;
  };
  workspaceId: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => readActiveThreadId(workspaceId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    client.listThreads({ includeTurns: true, limit: 80 })
      .then((payload) => {
        if (!cancelled) {
          setItems(toHistoryItems(normalizeThreadItems(payload)));
          setActiveThreadId(readActiveThreadId(workspaceId));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, workspaceId]);

  const openThread = (threadId: string) => {
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    onNavigate();
    router.push(chatHref);
  };

  const createThread = () => {
    const threadId = `thread-${Date.now()}`;
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    onNavigate();
    router.push(chatHref);
  };

  return (
    <section className="workstation-mobile-sidebar__history" aria-label="Chat history">
      <div className="workstation-mobile-sidebar__history-head">
        <strong>History</strong>
        <button type="button" onClick={createThread}>
          <Plus size={16} aria-hidden="true" />
          <span>New chat</span>
        </button>
      </div>
      <div className="workstation-mobile-sidebar__history-list">
        {isLoading ? (
          <div className="workstation-mobile-sidebar__history-state">Loading chats...</div>
        ) : error ? (
          <div className="workstation-mobile-sidebar__history-state">Chat history could not refresh.</div>
        ) : items.length === 0 ? (
          <div className="workstation-mobile-sidebar__history-state">No chat history yet.</div>
        ) : items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={joinClassNames(
              'workstation-mobile-sidebar__history-row',
              activeThreadId === item.id && 'workstation-mobile-sidebar__history-row--active',
            )}
            onClick={() => openThread(item.id)}
          >
            <span>{item.title}</span>
            <small>{formatHistoryDate(item.occurredAt)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function AssistantPanelContent({
  chatHref,
  client,
  navigationItems,
  projectLinks,
  setupItems,
  workspaceId,
}: {
  chatHref: string;
  client: {
    listThreads: (options?: { includeTurns?: boolean; limit?: number }) => Promise<Record<string, unknown>>;
  };
  navigationItems: readonly SageContextLink[];
  projectLinks: readonly AssistantProjectLink[];
  setupItems: readonly SageContextLink[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => readActiveThreadId(workspaceId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    client.listThreads({ includeTurns: true, limit: 120 })
      .then((payload) => {
        if (!cancelled) {
          setItems(toHistoryItems(normalizeThreadItems(payload)));
          setActiveThreadId(readActiveThreadId(workspaceId));
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, workspaceId]);

  const openThread = (threadId: string) => {
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    router.push(chatHref);
  };

  const createThread = () => {
    const threadId = `thread-${Date.now()}`;
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    router.push(chatHref);
  };
  const sidebarItems = useMemo(() => [...navigationItems, ...setupItems], [navigationItems, setupItems]);

  return (
    <div className="workstation-shell-panel__assistant" data-workstation-shell-panel-content="assistant">
      <button
        type="button"
        className="workstation-shell-panel__primary-action"
        onClick={createThread}
        title="New chat"
      >
        <Plus size={14} aria-hidden="true" />
        <span>New chat</span>
      </button>
      <nav className="workstation-shell-panel__assistant-nav" aria-label="Assistant utilities">
        {sidebarItems.map((item) => (
          <Link
            key={item.id}
            href={item.href ?? buildWorkspaceRouteHref(workspaceId, item.routeId)}
            prefetch
            title={item.label}
            className="workstation-shell-panel__assistant-link"
          >
            <item.icon size={14} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <section className="workstation-shell-panel__projects" aria-label="Projects">
        <button
          type="button"
          className="workstation-shell-panel__projects-toggle"
          aria-expanded={projectsOpen}
          onClick={() => setProjectsOpen((current) => !current)}
        >
          <span>Projects</span>
          <ChevronRight
            className={joinClassNames(
              'workstation-shell-panel__projects-chevron',
              projectsOpen && 'workstation-shell-panel__projects-chevron--open',
            )}
            size={15}
            aria-hidden="true"
          />
        </button>
        {projectsOpen ? (
          <div className="workstation-shell-panel__projects-list">
            {projectLinks.map((project) => {
              const ProjectIcon = project.icon;
              return (
                <Link
                  key={project.id}
                  href={project.href}
                  prefetch
                  title={project.label}
                  className="workstation-shell-panel__project-row"
                >
                  <ProjectIcon size={14} aria-hidden="true" />
                  <span>
                    <strong>{project.label}</strong>
                    <small>{project.detail}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
      <div className="workstation-shell-panel__history-list" aria-label="Conversation history">
        {isLoading ? (
          <div className="workstation-shell-panel__state">Loading chats...</div>
        ) : error ? (
          <div className="workstation-shell-panel__state">Chat history could not refresh.</div>
        ) : items.length === 0 ? (
          <div className="workstation-shell-panel__state">No chat history yet.</div>
        ) : items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={joinClassNames(
              'workstation-shell-panel__history-row',
              activeThreadId === item.id && 'workstation-shell-panel__history-row--active',
            )}
            onClick={() => openThread(item.id)}
          >
            <span className="workstation-shell-panel__history-title">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type SageContextLink = {
  id: string;
  label: string;
  routeId: WorkspaceRouteId;
  icon: LucideIcon;
  href?: string;
};

function StudioPanelContent({
  agents,
  connectedExternalAgents,
  agentComputers,
  selectedAgentId,
  selectedExternalAgentId,
  selectedAgentComputerId,
  isAgentListPriming,
  isAgentListUnavailable,
  searchParams,
  onPushAgentDetail,
  onPushExternalAgentDetail,
  onPushAgentComputerDetail,
  workspaceId,
}: {
  agents: readonly DeployedAgentRecord[];
  connectedExternalAgents: readonly ConnectedExternalAgentRecord[];
  agentComputers: readonly RuntimeAttachmentSnapshot[];
  selectedAgentId: string | null;
  selectedExternalAgentId: string | null;
  selectedAgentComputerId: string | null;
  isAgentListPriming: boolean;
  isAgentListUnavailable: boolean;
  searchParams: { toString: () => string };
  onPushAgentDetail: (agentId: string) => void;
  onPushExternalAgentDetail: (agentId: string) => void;
  onPushAgentComputerDetail: (computerId: string) => void;
  workspaceId: string;
}) {
  const router = useRouter();
  const visibleAgents = useMemo(() => agents.filter((agent) => {
    const id = readString(agent.id);
    const state = readString(agent.deployment_state, 'draft').toLowerCase();
    if (!id || ['archived', 'deleted', 'removed'].includes(state)) {
      return false;
    }
    return true;
  }), [agents]);
  const visibleStudioObjectCount = visibleAgents.length + connectedExternalAgents.length + agentComputers.length;

  const openNativeAgent = (agentId: string) => {
    if (!agentId) {
      return;
    }
    onPushAgentDetail(agentId);
    router.push(buildStudioAgentHref(workspaceId, searchParams, agentId));
  };

  return (
    <div className="workstation-shell-panel__build" data-workstation-shell-panel-content="studio">
      <div className="workstation-shell-panel__build-list" aria-label="Agents">
        {isAgentListUnavailable ? (
          <div className="workstation-shell-panel__state">Agents are unavailable right now.</div>
        ) : isAgentListPriming ? (
          <div className="workstation-shell-panel__state">Loading agents...</div>
        ) : visibleStudioObjectCount === 0 ? (
          <div className="workstation-shell-panel__state">No agents loaded</div>
        ) : (
          <>
            {visibleAgents.map((agent) => {
              const agentId = readString(agent.id);
              const state = readString(agent.deployment_state, 'draft');
              const stateLabel = humanizeAgentState(state);
              return (
                <button
                  key={agentId}
                  type="button"
                  className={joinClassNames(
                    'workstation-shell-panel__build-row',
                    selectedAgentId === agentId && 'workstation-shell-panel__build-row--active',
                  )}
                  aria-current={selectedAgentId === agentId ? 'page' : undefined}
                  onClick={() => openNativeAgent(agentId)}
                >
                  <span className={joinClassNames('workstation-shell-panel__agent-dot', `workstation-shell-panel__agent-dot--${agentStatusTone(state)}`)} aria-hidden="true" />
                  <span className="workstation-shell-panel__build-row-label">{readString(agent.name, agentId || 'Agent')}</span>
                  {state.toLowerCase() === 'draft' ? (
                    <span className="workstation-shell-panel__build-badge">{stateLabel}</span>
                  ) : null}
                </button>
              );
            })}
            {connectedExternalAgents.map((agent) => {
              const agentId = readString(agent.id);
              const state = readString(agent.connection_state ?? agent.status, 'connected');
              return (
                <button
                  key={`external-${agentId}`}
                  type="button"
                  className={joinClassNames(
                    'workstation-shell-panel__build-row',
                    selectedExternalAgentId === agentId && 'workstation-shell-panel__build-row--active',
                  )}
                  aria-current={selectedExternalAgentId === agentId ? 'page' : undefined}
                  onClick={() => {
                    onPushExternalAgentDetail(agentId);
                    router.push(buildStudioExternalAgentHref(workspaceId, searchParams, agentId));
                  }}
                >
                  <span className={joinClassNames('workstation-shell-panel__agent-dot', `workstation-shell-panel__agent-dot--${agentStatusTone(state)}`)} aria-hidden="true" />
                  <span className="workstation-shell-panel__build-row-label">{readString(agent.name ?? agent.label, agentId || 'Connected agent')}</span>
                </button>
              );
            })}
            {agentComputers.map((computer) => {
              const computerId = readRuntimeAttachmentId(computer);
              const state = computer.online ? 'online' : readString(computer.status, 'offline');
              return (
                <button
                  key={`computer-${computerId}`}
                  type="button"
                  className={joinClassNames(
                    'workstation-shell-panel__build-row',
                    selectedAgentComputerId === computerId && 'workstation-shell-panel__build-row--active',
                  )}
                  aria-current={selectedAgentComputerId === computerId ? 'page' : undefined}
                  onClick={() => {
                    onPushAgentComputerDetail(computerId);
                    router.push(buildStudioAgentComputerHref(workspaceId, searchParams, computerId));
                  }}
                >
                  <span className={joinClassNames('workstation-shell-panel__agent-dot', `workstation-shell-panel__agent-dot--${agentStatusTone(state)}`)} aria-hidden="true" />
                  <span className="workstation-shell-panel__build-row-label">{readString(computer.label, computerId || 'Computer')}</span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <button
        type="button"
        className="workstation-shell-panel__new-agent"
        onClick={() => router.push(buildStudioCreateAgentHref(workspaceId, searchParams))}
      >
        <Plus size={14} aria-hidden="true" />
        <span>New agent</span>
      </button>
    </div>
  );
}

function DiscoverPanelContent({
  activeFilter,
  workspaceId,
}: {
  activeFilter: MarketplaceTitlebarFilter;
  workspaceId: string;
}) {
  return (
    <nav className="workstation-shell-panel__plain-list" aria-label="Discover filters" data-workstation-shell-panel-content="discover">
      {DISCOVER_FILTERS.map((item) => {
        const active = item.filter === activeFilter;
        const href = buildMarketplaceCategoryHref(workspaceId, item.filter);
        return (
          <Link
            key={item.label}
            href={href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={joinClassNames(
              'workstation-shell-panel__plain-link',
              active && 'workstation-shell-panel__plain-link--active',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function RootPanelContent({
  onOpenAssistant,
  onOpenApps,
  onOpenStudio,
  onOpenDiscover,
}: {
  onOpenAssistant: () => void;
  onOpenApps: () => void;
  onOpenStudio: () => void;
  onOpenDiscover: () => void;
}) {
  return (
    <nav className="workstation-shell-panel__root-nav" aria-label="Workspace sections" data-workstation-shell-panel-content="root">
      <button type="button" className="workstation-shell-panel__nav-row" onClick={onOpenAssistant}>
        <Bot size={15} aria-hidden="true" />
        <span>Sage</span>
      </button>
      <button type="button" className="workstation-shell-panel__nav-row" onClick={onOpenStudio}>
        <LayoutGrid size={15} aria-hidden="true" />
        <span>Studio</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <button type="button" className="workstation-shell-panel__nav-row" onClick={onOpenDiscover}>
        <Compass size={15} aria-hidden="true" />
        <span>Discover</span>
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <button type="button" className="workstation-shell-panel__nav-row" onClick={onOpenApps}>
        <Package size={15} aria-hidden="true" />
        <span>Apps</span>
      </button>
    </nav>
  );
}

function StudioObjectDetailPanelContent({
  activeTab,
  items,
  buildHref,
}: {
  activeTab: AgentDetailPanelTabId;
  items: readonly {
    id: AgentDetailPanelTabId;
    label: string;
  }[];
  buildHref: (tabId: AgentDetailPanelTabId) => string;
}) {
  const activeItem = items.some((item) => item.id === activeTab) ? activeTab : 'overview';
  return (
    <nav className="workstation-shell-panel__agent-detail-nav" aria-label="Agent detail sections" data-workstation-shell-panel-content="agent-detail">
      {items.map((item) => (
        <Link
          key={item.id}
          href={buildHref(item.id)}
          prefetch
          aria-current={activeItem === item.id ? 'page' : undefined}
          className={joinClassNames(
            'workstation-shell-panel__agent-detail-link',
            activeItem === item.id && 'workstation-shell-panel__agent-detail-link--active',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function ShellPanelHeader({
  level,
  title,
  onBack,
  onCollapse,
}: {
  level: PanelStackLevel;
  title: string;
  onBack: () => void;
  onCollapse: () => void;
}) {
  if (level === 'root') {
    return (
      <header className="workstation-shell-left-panel__header">
        <button
          type="button"
          className="workstation-shell-left-panel__header-toggle"
          aria-label="Collapse left panel"
          aria-expanded
          onClick={onCollapse}
        >
          <Menu size={17} aria-hidden="true" />
        </button>
        <strong className="workstation-shell-left-panel__brand-name">Empyralis</strong>
      </header>
    );
  }
  if (level === 'assistant') {
    return (
      <header className="workstation-shell-left-panel__assistant-header">
        <button
          type="button"
          className="workstation-shell-left-panel__header-toggle"
          aria-label="Back to main sections"
          onClick={onBack}
        >
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
        <strong className="workstation-shell-left-panel__brand-name">Empyralis</strong>
        <button
          type="button"
          className="workstation-shell-left-panel__header-toggle"
          aria-label="Collapse left panel"
          aria-expanded
          onClick={onCollapse}
        >
          <Menu size={17} aria-hidden="true" />
        </button>
      </header>
    );
  }
  return (
    <header className="workstation-shell-left-panel__drill-header">
      <button
        type="button"
        className="workstation-shell-left-panel__header-toggle"
        aria-label="Back"
        onClick={onBack}
      >
        <ArrowLeft size={17} aria-hidden="true" />
      </button>
      <strong className="workstation-shell-left-panel__drill-title">{title}</strong>
    </header>
  );
}

function accountInitialForLabel(value: string): string {
  const normalized = value.trim();
  return normalized ? normalized.charAt(0).toUpperCase() : 'A';
}

function ShellAccountBlock({
  displayName,
  email,
  planLabel,
  creditsHref,
  settingsHref,
}: {
  displayName: string;
  email: string;
  planLabel: string;
  creditsHref: string;
  settingsHref: string;
}) {
  const { actions: accountShellActions } = useAccountShell();
  const [open, setOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (accountRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleLogout = async () => {
    setLogoutPending(true);
    setError(null);
    try {
      await logout();
      accountShellActions.clearSession();
      window.location.replace('/login');
    } catch {
      setError('Logout could not finish.');
      setLogoutPending(false);
    }
  };

  return (
    <div className="workstation-shell-account" ref={accountRef}>
      {open ? (
        <div className="workstation-shell-account__popover" role="menu" aria-label="Account menu">
          <Link className="workstation-shell-account__menu-row" href={settingsHref} role="menuitem">
            Settings
          </Link>
          <Link className="workstation-shell-account__menu-row" href={creditsHref} role="menuitem">
            <span>Credits</span>
            <span className="workstation-shell-account__menu-muted">Billing</span>
          </Link>
          <button type="button" className="workstation-shell-account__menu-row" role="menuitem" onClick={() => setOpen(false)}>
            Help
          </button>
          <button
            type="button"
            className="workstation-shell-account__menu-row"
            role="menuitem"
            disabled={logoutPending}
            onClick={() => { void handleLogout(); }}
          >
            {logoutPending ? 'Signing out...' : 'Log out'}
          </button>
          {error ? <div className="workstation-shell-account__error">{error}</div> : null}
        </div>
      ) : null}
      <button
        type="button"
        className="workstation-shell-account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setError(null);
        }}
      >
        <span className="workstation-shell-account__avatar" aria-hidden="true">
          {accountInitialForLabel(displayName || email)}
        </span>
        <span className="workstation-shell-account__copy">
          <strong>{displayName}</strong>
          <span>{email}</span>
        </span>
        <span className="workstation-shell-account__plan">{planLabel}</span>
      </button>
    </div>
  );
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [panelPreferenceLoaded, setPanelPreferenceLoaded] = useState(false);
  const [panelStack, setPanelStack] = useState<PanelStackLevel[]>(['root']);
  const [panelTransitionDirection, setPanelTransitionDirection] = useState<PanelTransitionDirection>('forward');
  const [studioCacheRevision, setStudioCacheRevision] = useState(0);

  const activeRouteId = useMemo(
    () => resolveRouteIdFromHref(workspaceId, pathname),
    [pathname, workspaceId],
  );
  const activeDestinationId: WorkspaceNavDestinationId = useMemo(() => {
    if (!activeRouteId) {
      return 'sage';
    }
    return getWorkspaceNavRouteDefinition(activeRouteId).destinationId;
  }, [activeRouteId]);
  const activeMobileDestinationId = useMemo(() => {
    if (activeRouteId === 'activity' || activeRouteId === 'approvals' || activeRouteId === 'notifications') {
      return 'chat';
    }
    if (
      activeDestinationId === 'studio'
      || activeDestinationId === 'gateway'
      || activeDestinationId === 'marketplace'
      || activeDestinationId === 'applications'
    ) {
      return activeDestinationId;
    }
    return 'chat';
  }, [activeDestinationId, activeRouteId]);
  const workspaceLabel = bootstrap.workspace.label;
  const chatHref = routeManifest.routeIndex.chat?.href ?? buildWorkspaceRouteHref(workspaceId, 'chat');
  const settingsHref = routeManifest.routeIndex.settings?.href ?? buildWorkspaceRouteHref(workspaceId, 'settings');
  const creditsHref = `${settingsHref}${settingsHref.includes('?') ? '&' : '?'}section=billing`;
  const studioHref = routeManifest.routeIndex.studio?.href ?? buildWorkspaceRouteHref(workspaceId, 'studio');
  const marketplaceHref = routeManifest.routeIndex.marketplace?.href ?? buildWorkspaceRouteHref(workspaceId, 'marketplace');
  const accountEmail = readString(bootstrap.account.email, 'Account');
  const accountDisplayName = readString(bootstrap.account.displayName, accountEmail);
  const accountPlanLabel = readString(bootstrap.entitlements.label, readString(bootstrap.entitlements.plan, 'Plan'));
  const studioCache = useMemo(
    () => studioPaneCache.get(workspaceId),
    [studioCacheRevision, workspaceId],
  );
  const studioAgents = studioCache?.agents ?? [];
  const studioConnectedExternalAgents = studioCache?.connectedExternalAgents ?? [];
  const studioAgentComputers = studioCache?.runtimeAttachments ?? [];
  const selectedStudioAgentId = activeDestinationId === 'studio' ? readString(searchParams.get('agent')) || null : null;
  const selectedStudioExternalAgentId = activeDestinationId === 'studio' ? readString(searchParams.get('externalAgent')) || null : null;
  const selectedStudioAgentComputerId = activeDestinationId === 'studio' ? readString(searchParams.get('agentComputer')) || null : null;
  const latestPanelLevel = panelStack[panelStack.length - 1] ?? 'root';
  const activeStudioAgentId = selectedStudioAgentId ?? (latestPanelLevel.startsWith('agent:') ? latestPanelLevel.slice('agent:'.length) : null);
  const activeStudioExternalAgentId = selectedStudioExternalAgentId ?? (latestPanelLevel.startsWith('external-agent:') ? latestPanelLevel.slice('external-agent:'.length) : null);
  const activeStudioAgentComputerId = selectedStudioAgentComputerId ?? (latestPanelLevel.startsWith('agent-computer:') ? latestPanelLevel.slice('agent-computer:'.length) : null);
  const activeStudioAgent = activeStudioAgentId
    ? studioAgents.find((agent) => readString(agent.id) === activeStudioAgentId) ?? null
    : null;
  const activeStudioExternalAgent = activeStudioExternalAgentId
    ? studioConnectedExternalAgents.find((agent) => readString(agent.id) === activeStudioExternalAgentId) ?? null
    : null;
  const activeStudioAgentComputer = activeStudioAgentComputerId
    ? studioAgentComputers.find((computer) => readRuntimeAttachmentId(computer) === activeStudioAgentComputerId) ?? null
    : null;
  const activeStudioAgentName = activeStudioAgent
    ? readString(activeStudioAgent.name, activeStudioAgentId ?? 'Agent')
    : activeStudioExternalAgent
      ? readString(activeStudioExternalAgent.name ?? activeStudioExternalAgent.label, activeStudioExternalAgentId ?? 'Connected agent')
      : activeStudioAgentComputer
        ? readString(activeStudioAgentComputer.label, activeStudioAgentComputerId ?? 'Agent Computer')
        : activeStudioAgentId ?? activeStudioExternalAgentId ?? activeStudioAgentComputerId ?? 'Agent';
  const activeExternalAgentDetailTabs = useMemo(
    () => visibleExternalAgentDetailTabs(activeStudioExternalAgent),
    [activeStudioExternalAgent],
  );
  const activeAgentDetailTab = normalizeAgentDetailTab(searchParams.get('tab'));
  const activeExternalAgentDetailTab = normalizeExternalAgentDetailTab(searchParams.get('tab'), activeExternalAgentDetailTabs);
  const isStudioAgentListPriming = studioCache?.isAgentListPriming ?? activeDestinationId === 'studio';
  const isStudioAgentListUnavailable = studioCache?.isAgentListUnavailable ?? false;
  const sageSidebarLinks = useMemo<SageContextLink[]>(() => SAGE_SIDEBAR_NAV_ITEMS.flatMap((item) => {
    const route = routeManifest.routeIndex[item.routeId];
    if (!route) {
      return [];
    }
    return [{
      id: item.routeId,
      label: item.label,
      routeId: item.routeId,
      icon: item.icon,
    }];
  }), [routeManifest.routeIndex]);
  const sageSetupLinks = useMemo<SageContextLink[]>(() => SAGE_SETUP_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    routeId: 'integrations',
    icon: item.icon,
    href: `${buildWorkspaceRouteHref(workspaceId, 'integrations')}?section=${encodeURIComponent(item.section)}`,
  })), [workspaceId]);
  const sageProjectLinks = useMemo<AssistantProjectLink[]>(() => {
    const links: AssistantProjectLink[] = [{
      id: 'studio-agents',
      label: 'Agent Studio',
      detail: 'Build and manage agents',
      href: studioHref,
      icon: LayoutGrid,
    }];
    studioAgents
      .filter((agent) => {
        const agentId = readString(agent.id);
        const state = readString(agent.deployment_state, 'draft').toLowerCase();
        return Boolean(agentId) && !['archived', 'deleted', 'removed'].includes(state);
      })
      .slice(0, 6)
      .forEach((agent) => {
        const agentId = readString(agent.id);
        links.push({
          id: `agent:${agentId}`,
          label: readString(agent.name, agentId || 'Agent'),
          detail: 'Studio agent',
          href: buildStudioAgentHref(workspaceId, searchParams, agentId),
          icon: Bot,
        });
      });
    studioConnectedExternalAgents.slice(0, 4).forEach((agent) => {
      const agentId = readString(agent.id);
      if (!agentId) {
        return;
      }
      links.push({
        id: `external-agent:${agentId}`,
        label: readString(agent.name ?? agent.label, agentId || 'Connected agent'),
        detail: 'Connected agent',
        href: buildStudioExternalAgentHref(workspaceId, searchParams, agentId),
        icon: Link2,
      });
    });
    studioAgentComputers.slice(0, 4).forEach((computer) => {
      const computerId = readRuntimeAttachmentId(computer);
      if (!computerId) {
        return;
      }
      links.push({
        id: `agent-computer:${computerId}`,
        label: readString(computer.label, computerId || 'Agent Computer'),
        detail: 'Agent Computer',
        href: buildStudioAgentComputerHref(workspaceId, searchParams, computerId),
        icon: Cpu,
      });
    });
    if (links.length === 1) {
      links.push({
        id: 'agent-templates',
        label: 'Agent templates',
        detail: 'Discover starting points',
        href: buildMarketplaceCategoryHref(workspaceId, 'agent_template'),
        icon: Compass,
      });
    }
    return links.slice(0, 10);
  }, [searchParams, studioAgentComputers, studioAgents, studioConnectedExternalAgents, studioHref, workspaceId]);
  const contextRoutes = useMemo(() => {
    if (activeDestinationId === 'sage') {
      return [];
    }
    const routeIds = CONTEXT_ROUTE_IDS_BY_DESTINATION[activeDestinationId];
    return routeIds.flatMap((routeId) => {
      const route = routeManifest.routeIndex[routeId];
      if (!route) {
        return [];
      }
      return [route];
    });
  }, [activeDestinationId, routeManifest.routeIndex]);
  const sageMobileDrawerRoutes = useMemo(
    () => SAGE_MOBILE_DRAWER_ROUTE_IDS.flatMap((entry) => {
      const route = routeManifest.routeIndex[entry.routeId];
      if (!route) {
        return [];
      }
      return [{ ...entry, href: route.href }];
    }),
    [routeManifest.routeIndex],
  );

  useEffect(() => {
    return subscribeStudioPaneCache((updatedWorkspaceId) => {
      if (updatedWorkspaceId === workspaceId) {
        setStudioCacheRevision((current) => current + 1);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    setPanelCollapsed(readPanelCollapsedPreference());
    setPanelPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!panelPreferenceLoaded) {
      return;
    }
    writePanelCollapsedPreference(panelCollapsed);
  }, [panelCollapsed, panelPreferenceLoaded]);

  useEffect(() => {
    if (activeDestinationId !== 'studio') {
      return;
    }
    const selectedStudioObjectLevel = studioSelectionLevelFromQuery({
      selectedAgentId: selectedStudioAgentId,
      selectedExternalAgentId: selectedStudioExternalAgentId,
      selectedAgentComputerId: selectedStudioAgentComputerId,
    });
    setPanelTransitionDirection(selectedStudioObjectLevel ? 'forward' : 'back');
    setPanelStack((current) => {
      const currentLevel = current[current.length - 1] ?? 'root';
      if (selectedStudioObjectLevel) {
        return currentLevel === selectedStudioObjectLevel ? current : ['studio', selectedStudioObjectLevel];
      }
      return currentLevel === 'studio' ? current : ['studio'];
    });
  }, [activeDestinationId, selectedStudioAgentComputerId, selectedStudioAgentId, selectedStudioExternalAgentId]);

  const isContextRouteActive = (routeId: WorkspaceRouteId): boolean => {
    if (routeId === activeRouteId) {
      return true;
    }
    if (routeId === 'chat' && activeDestinationId === 'sage') {
      return pathname !== null && /\/(sage|chat)$/.test(pathname);
    }
    return false;
  };
  const marketplaceFilter = normalizeMarketplaceTitlebarFilter(searchParams.get('category'));
  const activeDiscoverFilter = marketplaceFilter;
  const activePanelDestinationId: WorkspaceNavDestinationId = activeDestinationId;
  const activePrimaryTabId: PrimaryShellTabId | null = SHELL_PRIMARY_TABS.some((tab) => tab.id === activePanelDestinationId)
    ? activePanelDestinationId as PrimaryShellTabId
    : null;
  const panelLevel = panelStack[panelStack.length - 1] ?? 'root';
  const studioAgentDetailActive = activeDestinationId === 'studio' && Boolean(
    selectedStudioAgentId || selectedStudioExternalAgentId || selectedStudioAgentComputerId,
  );
  const pushPanelLevel = (level: PanelStackLevel) => {
    setPanelTransitionDirection('forward');
    setPanelStack((current) => [...current, level]);
  };
  const replacePanelStack = (levels: PanelStackLevel[]) => {
    setPanelTransitionDirection('forward');
    setPanelStack(levels);
  };
  const popPanelLevel = () => {
    setPanelTransitionDirection('back');
    setPanelStack((current) => current.length > 1 ? current.slice(0, -1) : ['root']);
  };
  const clearStudioObjectSelection = () => {
    setPanelTransitionDirection('back');
    setPanelStack(['studio']);
    router.push(buildWorkspaceRouteHref(workspaceId, 'studio'));
  };
  const handlePanelBack = () => {
    if (studioObjectLevelKind(panelLevel)) {
      clearStudioObjectSelection();
      return;
    }
    popPanelLevel();
  };
  const openAssistantPanel = () => {
    replacePanelStack(['assistant']);
    router.push(chatHref);
  };
  const openStudioPanel = () => {
    pushPanelLevel('studio');
    router.push(studioHref);
  };
  const openDiscoverPanel = () => {
    pushPanelLevel('discover');
    router.push(marketplaceHref);
  };
  const openApplicationsPanel = () => {
    replacePanelStack(['root']);
    router.push(buildWorkspaceRouteHref(workspaceId, 'applications'));
  };
  const titlebarNavigation = activeDestinationId === 'sage'
    ? null
    : activeDestinationId === 'marketplace'
      ? null
    : activeDestinationId === 'studio'
      ? null
    : activeDestinationId === 'applications'
      ? APPLICATION_TITLEBAR_TABS.map((tab) => (
        <Link
          key={tab.id}
          href={buildApplicationTabHref(workspaceId, tab.id, searchParams)}
          prefetch
          aria-current="page"
          className={joinClassNames(
            'workstation-titlebar__link',
            'workstation-titlebar__link--active',
          )}
        >
          <span>{tab.label}</span>
        </Link>
      ))
    : contextRoutes.length > 0
      ? contextRoutes.map((route) => (
        <Link
          key={route.id}
          href={route.href}
          prefetch
          aria-current={isContextRouteActive(route.id) ? 'page' : undefined}
          className={joinClassNames(
            'workstation-titlebar__link',
            isContextRouteActive(route.id) && 'workstation-titlebar__link--active',
          )}
        >
          <span>{route.id === 'chat' ? 'Chat' : route.label}</span>
        </Link>
      ))
      : null;

  return (
    <div
      data-workstation-shell="kernel"
      data-workstation-main-layout="single-pane"
      data-workstation-route={activeRouteId ?? 'unknown'}
      data-workstation-destination={activeDestinationId}
      data-workstation-shell-section={activePrimaryTabId ?? activePanelDestinationId}
      data-workstation-shell-sidebar="unified"
      className={joinClassNames(
        'workstation-shell',
        activeDestinationId === 'sage' && 'workstation-shell--sage',
        isSidebarOpen && 'workstation-shell--mobile-sidebar-open',
        studioAgentDetailActive && 'workstation-shell--studio-agent-detail',
        activeRouteId === 'chat' && 'workstation-shell--chat',
        panelCollapsed && 'workstation-shell--panel-collapsed',
      )}
    >
      <aside className="workstation-shell-left-panel" aria-label="Workspace navigation" data-panel-collapsed={panelCollapsed ? 'true' : 'false'}>
        {panelCollapsed ? (
        <div className="workstation-shell-left-panel__collapsed-rail">
          <button
            type="button"
            className="workstation-shell-left-panel__icon-button"
            aria-label="Expand left panel"
            aria-expanded={false}
            title="Expand"
            onClick={() => setPanelCollapsed(false)}
          >
            <Menu size={17} aria-hidden="true" />
          </button>
          <nav className="workstation-shell-left-panel__icon-nav" aria-label="Primary sections collapsed">
            {SHELL_PRIMARY_TABS.map((tab) => {
              const href = routeManifest.routeIndex[tab.routeId]?.href
                ?? buildWorkspaceRouteHref(workspaceId, tab.routeId);
              const active = activePrimaryTabId === tab.id;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.id}
                  href={href}
                  prefetch
                  aria-current={active ? 'page' : undefined}
                  title={tab.label}
                  onClick={() => {
                    if (tab.id === 'sage') {
                      replacePanelStack(['assistant']);
                    } else if (tab.id === 'studio') {
                      replacePanelStack(['studio']);
                    } else if (tab.id === 'marketplace') {
                      replacePanelStack(['discover']);
                    } else {
                      replacePanelStack(['root']);
                    }
                  }}
                  className={joinClassNames(
                    'workstation-shell-left-panel__icon-link',
                    active && 'workstation-shell-left-panel__icon-link--active',
                  )}
                >
                  <Icon size={17} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </div>
        ) : null}

        {!panelCollapsed ? (
        <div className="workstation-shell-left-panel__inner" data-panel-level={panelLevel}>
          <ShellPanelHeader
            level={panelLevel}
            title={panelLevel === 'studio'
              ? 'Studio'
              : panelLevel === 'discover'
              ? 'Discover'
              : studioObjectLevelKind(panelLevel)
              ? activeStudioAgentName
              : 'Empyralis'}
            onBack={handlePanelBack}
            onCollapse={() => setPanelCollapsed(true)}
          />

          <div
            key={panelLevel}
            className="workstation-shell-left-panel__content"
            data-panel-direction={panelTransitionDirection}
          >
            {panelLevel === 'root' ? (
              <RootPanelContent
                onOpenAssistant={openAssistantPanel}
                onOpenApps={openApplicationsPanel}
                onOpenStudio={openStudioPanel}
                onOpenDiscover={openDiscoverPanel}
              />
            ) : panelLevel === 'assistant' ? (
              <AssistantPanelContent
                chatHref={chatHref}
                client={services.client}
                navigationItems={sageSidebarLinks}
                projectLinks={sageProjectLinks}
                setupItems={sageSetupLinks}
                workspaceId={workspaceId}
              />
            ) : panelLevel === 'studio' ? (
              <StudioPanelContent
                agents={studioAgents}
                connectedExternalAgents={studioConnectedExternalAgents}
                agentComputers={studioAgentComputers}
                selectedAgentId={selectedStudioAgentId}
                selectedExternalAgentId={selectedStudioExternalAgentId}
                selectedAgentComputerId={selectedStudioAgentComputerId}
                isAgentListPriming={isStudioAgentListPriming}
                isAgentListUnavailable={isStudioAgentListUnavailable}
                searchParams={searchParams}
                onPushAgentDetail={(agentId) => pushPanelLevel(`agent:${agentId}`)}
                onPushExternalAgentDetail={(agentId) => pushPanelLevel(`external-agent:${agentId}`)}
                onPushAgentComputerDetail={(computerId) => pushPanelLevel(`agent-computer:${computerId}`)}
                workspaceId={workspaceId}
              />
            ) : panelLevel === 'discover' ? (
              <DiscoverPanelContent
                activeFilter={activeDiscoverFilter}
                workspaceId={workspaceId}
              />
            ) : panelLevel.startsWith('agent:') ? (
              <StudioObjectDetailPanelContent
                activeTab={activeAgentDetailTab}
                items={AGENT_DETAIL_NAV_ITEMS}
                buildHref={(tabId) => buildStudioAgentTabHref(
                  workspaceId,
                  searchParams,
                  panelLevel.slice('agent:'.length),
                  tabId,
                )}
              />
            ) : panelLevel.startsWith('external-agent:') ? (
              <StudioObjectDetailPanelContent
                activeTab={activeExternalAgentDetailTab}
                items={activeExternalAgentDetailTabs}
                buildHref={(tabId) => buildStudioExternalAgentTabHref(
                  workspaceId,
                  searchParams,
                  panelLevel.slice('external-agent:'.length),
                  tabId,
                )}
              />
            ) : panelLevel.startsWith('agent-computer:') ? (
              <StudioObjectDetailPanelContent
                activeTab="overview"
                items={AGENT_COMPUTER_DETAIL_NAV_ITEMS}
                buildHref={() => buildStudioAgentComputerHref(
                  workspaceId,
                  searchParams,
                  panelLevel.slice('agent-computer:'.length),
                )}
              />
            ) : (
              <div className="workstation-shell-panel__placeholder">
                <span>Open a workspace section</span>
              </div>
            )}
          </div>

          <div className="workstation-shell-left-panel__footer">
            <ShellAccountBlock
              displayName={accountDisplayName}
              email={accountEmail}
              planLabel={accountPlanLabel}
              creditsHref={creditsHref}
              settingsHref={settingsHref}
            />
          </div>
        </div>
        ) : null}
      </aside>

      <div className="workstation-shell__main-column" data-workstation-shell-zone="main-canvas">
        <div className="workstation-shell__topbar" data-workstation-main-pane="topbar">
          <WorkstationTitlebar
            surfaceLabel=""
            surfaceControl={activeDestinationId === 'sage' ? (
              <span className="workstation-titlebar__mobile-surface-label">Sage</span>
            ) : (
              <span className="workstation-titlebar__surface-empty" aria-hidden="true" />
            )}
            diagnosticsVisible={false}
            onToggleDiagnostics={() => {}}
            leftAction={(
              <button
                type="button"
                className="workstation-titlebar__mobile-menu-trigger"
                aria-label="Open sidebar"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu size={20} />
              </button>
            )}
            actions={(
              <>
                <WorkstationHardwareStatus
                  runtimeTargets={bootstrap.runtime.runtimeTargets}
                  settingsHref={settingsHref}
                />
                {activeDestinationId === 'studio' ? (
                  <Link
                    href={buildStudioCreateAgentHref(workspaceId, searchParams)}
                    className="workstation-titlebar__link"
                    title="Add Business Agent"
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>Add agent</span>
                  </Link>
                ) : activeDestinationId === 'applications' ? (
                  <Link
                    href={buildApplicationTabHref(workspaceId, 'my_apps', searchParams)}
                    className="workstation-titlebar__link workstation-titlebar__link--icon"
                    title="Create app"
                    aria-label="Create app"
                  >
                    <Plus size={16} aria-hidden="true" />
                  </Link>
                ) : null}
              </>
            )}
            navigation={titlebarNavigation}
          />
        </div>

        <AppDrawer
          open={isSidebarOpen}
          onOpenChange={setIsSidebarOpen}
          title={activeDestinationId === 'sage' ? 'Sage' : workspaceLabel}
          className="workstation-mobile-sidebar"
        >
          {isSidebarOpen && (
            <div
              className={joinClassNames(
                'workstation-mobile-sidebar__content',
                activeDestinationId === 'sage' && 'workstation-mobile-sidebar__content--sage',
              )}
            >
              {activeDestinationId === 'sage' ? (
                <>
                  <nav className="workstation-mobile-sidebar__sage-nav" aria-label="Sage navigation">
                    {sageMobileDrawerRoutes.map((route) => (
                      <Link
                        key={route.routeId}
                        href={route.href}
                        prefetch
                        aria-current={isContextRouteActive(route.routeId) ? 'page' : undefined}
                        className={joinClassNames(
                          'workstation-mobile-sidebar__sage-link',
                          isContextRouteActive(route.routeId) && 'workstation-mobile-sidebar__sage-link--active',
                        )}
                        onClick={() => setIsSidebarOpen(false)}
                      >
                        <route.icon size={20} aria-hidden="true" />
                        <span>{route.label}</span>
                      </Link>
                    ))}
                  </nav>
                  <MainAgentMobileHistoryList
                    chatHref={chatHref}
                    client={services.client}
                    workspaceId={workspaceId}
                    onNavigate={() => setIsSidebarOpen(false)}
                  />
                </>
              ) : null}
              {activeDestinationId === 'sage' ? null : <AccountTenantSwitcher />}
            </div>
          )}
        </AppDrawer>

        <div className="workstation-shell__body" data-workstation-main-pane="content-body">
          <div
            className="workstation-layout"
            data-workstation-destination={activeDestinationId}
            data-workstation-main-zone="main"
          >
            <section
              className="workstation-primary-canvas"
              data-workstation-focus-surface={activeRouteId ?? 'unknown'}
              data-workstation-main-pane="content"
            >
              {children}
            </section>
          </div>
        </div>

        <nav className="workstation-mobile-bottom-nav" aria-label="Main navigation">
          {MOBILE_DESTINATION_NAV.map((destination) => (
            <Link
              key={destination.id}
              href={buildWorkspaceRouteHref(workspaceId, destination.defaultRouteId)}
              prefetch
              aria-current={activeMobileDestinationId === destination.id ? 'page' : undefined}
              className={joinClassNames(
                'workstation-mobile-bottom-nav__link',
                activeMobileDestinationId === destination.id && 'workstation-mobile-bottom-nav__link--active',
              )}
            >
              <destination.icon size={20} aria-hidden="true" />
              <span className="workstation-mobile-bottom-nav__label">{destination.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
