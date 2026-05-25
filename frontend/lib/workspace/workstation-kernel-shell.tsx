'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { BookOpen, Bot, Brain, Compass, LayoutGrid, Link2, ListTodo, Menu, MessageSquare, Monitor, Package, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { AppDrawer, joinClassNames } from '@/lib/ui/primitives';
import {
  APPLICATION_TITLEBAR_TABS,
  buildApplicationTabHref,
} from '@/lib/workspace/application-surface-tabs';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationActivityVersion } from '@/lib/workspace/workspace-services';
import { emitWorkstationChatThreadSelected } from '@/lib/workspace/workstation-chat-thread-events';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
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

const SAGE_TITLEBAR_NAV_ROUTE_IDS = new Set<WorkspaceRouteId>([
  'chat',
  'memory',
  'tasks',
  'artifacts',
  'integrations',
  'approvals',
  'activity',
]);

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

const MARKETPLACE_TITLEBAR_FILTERS = [
  { id: 'agent_template', label: 'Agent templates' },
  { id: 'skill', label: 'Tools' },
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

type ComputerConnectionStatus = {
  connectedCount: number;
  onlineCount: number;
};

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

function readComputerConnectionStatus(payload: unknown): ComputerConnectionStatus {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  const onlineCount = items.filter((item) => {
    const status = readString(item.connection_status ?? item.status).toLowerCase();
    return status === 'online' || status === 'connected' || status === 'attached' || status === 'healthy';
  }).length;
  return {
    connectedCount: items.length,
    onlineCount,
  };
}

function readLocalRuntimeConnectionStatus(payload: unknown): ComputerConnectionStatus {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const capabilities = Array.isArray(item.capabilities)
      ? item.capabilities.map((capability: unknown) => readString(capability))
      : [];
    return capabilities.includes('local.worker') || capabilities.includes('shell.execute');
  });
  const onlineCount = items.filter((item) => {
    const status = readString(item.status).toLowerCase();
    return item.online === true || status === 'online' || status === 'connected' || status === 'attached' || status === 'healthy' || status === 'idle';
  }).length;
  return {
    connectedCount: items.length,
    onlineCount,
  };
}

function mergeComputerConnectionStatus(
  primary: ComputerConnectionStatus,
  secondary: ComputerConnectionStatus,
): ComputerConnectionStatus {
  return {
    connectedCount: primary.connectedCount + secondary.connectedCount,
    onlineCount: primary.onlineCount + secondary.onlineCount,
  };
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

function MainAgentHistoryPopover({
  chatHref,
  client,
  workspaceId,
}: {
  chatHref: string;
  client: {
    listThreads: (options?: { includeTurns?: boolean; limit?: number }) => Promise<Record<string, unknown>>;
  };
  workspaceId: string;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => readActiveThreadId(workspaceId));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
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
  }, [client, open, workspaceId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  const openThread = (threadId: string) => {
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    setOpen(false);
    router.push(chatHref);
  };

  const createThread = () => {
    const threadId = `thread-${Date.now()}`;
    persistActiveThread(workspaceId, threadId);
    emitWorkstationChatThreadSelected({ workspaceId, threadId });
    setActiveThreadId(threadId);
    setOpen(false);
    router.push(chatHref);
  };

  return (
    <div className="workstation-history-tab">
      <button
        ref={buttonRef}
        type="button"
        className={joinClassNames(
          'workstation-titlebar__link',
          open && 'workstation-titlebar__link--active',
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span>History</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="workstation-history-popover"
          role="dialog"
          aria-label="Chat history"
        >
          <button
            type="button"
            className="workstation-history-popover__new"
            onClick={createThread}
          >
            <Plus size={20} aria-hidden="true" />
            <span>New Chat</span>
          </button>
          <div className="workstation-history-popover__list" aria-label="Recent chats">
            {isLoading ? (
              <div className="workstation-history-popover__state">Loading history...</div>
            ) : error ? (
              <div className="workstation-history-popover__state">History could not refresh.</div>
            ) : items.length === 0 ? (
              <div className="workstation-history-popover__state">No chat history yet.</div>
            ) : items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={joinClassNames(
                  'workstation-history-popover__row',
                  activeThreadId === item.id && 'workstation-history-popover__row--active',
                )}
                onClick={() => openThread(item.id)}
              >
                <span className="workstation-history-popover__title">{item.title}</span>
                <span className="workstation-history-popover__date">{formatHistoryDate(item.occurredAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
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

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const [computerStatus, setComputerStatus] = useState<ComputerConnectionStatus>({
    connectedCount: 0,
    onlineCount: 0,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
  const contextRoutes = useMemo(() => {
    if (activeDestinationId === 'sage' && (!activeRouteId || !SAGE_TITLEBAR_NAV_ROUTE_IDS.has(activeRouteId))) {
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
  }, [activeDestinationId, activeRouteId, routeManifest.routeIndex]);
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
    if (!routeManifest.routeIndex.gateway) {
      setComputerStatus({ connectedCount: 0, onlineCount: 0 });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 8_000);
    const readJson = async (path: string): Promise<unknown> => {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${path} failed with status ${response.status}`);
      }
      return response.json() as Promise<unknown>;
    };
    Promise.allSettled([
      readJson(`/api/gateway/registrations?workspace_id=${encodeURIComponent(workspaceId)}`),
      readJson('/api/runtime/runtimes/status'),
    ])
      .then(([gatewayResult, runtimeResult]) => {
        if (cancelled) {
          return;
        }
        const gatewayStatus = gatewayResult.status === 'fulfilled'
          ? readComputerConnectionStatus(gatewayResult.value)
          : { connectedCount: 0, onlineCount: 0 };
        const runtimeStatus = runtimeResult.status === 'fulfilled'
          ? readLocalRuntimeConnectionStatus(runtimeResult.value)
          : { connectedCount: 0, onlineCount: 0 };
        setComputerStatus(mergeComputerConnectionStatus(gatewayStatus, runtimeStatus));
      })
      .catch(() => {
        if (!cancelled) {
          setComputerStatus({ connectedCount: 0, onlineCount: 0 });
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activityVersion, routeManifest.routeIndex.gateway, workspaceId]);

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
  const studioAgentDetailActive = activeDestinationId === 'studio' && Boolean(searchParams.get('agent'));
  const titlebarNavigation = activeDestinationId === 'marketplace'
    ? MARKETPLACE_TITLEBAR_FILTERS.map((filter) => (
      <Link
        key={filter.id}
        href={buildMarketplaceCategoryHref(workspaceId, filter.id)}
        prefetch
        aria-current={marketplaceFilter === filter.id ? 'page' : undefined}
        className={joinClassNames(
          'workstation-titlebar__link',
          'workstation-titlebar__link--marketplace-filter',
          marketplaceFilter === filter.id && 'workstation-titlebar__link--active',
        )}
      >
        <span>{filter.label}</span>
      </Link>
      ))
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
        route.id === 'activity' ? (
          <MainAgentHistoryPopover
            key={route.id}
            chatHref={routeManifest.routeIndex.chat?.href ?? `/w/${encodeURIComponent(workspaceId)}/sage`}
            client={services.client}
            workspaceId={workspaceId}
          />
        ) : (
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
        )
      ))
      : null;

  return (
    <div
      data-workstation-shell="kernel"
      data-workstation-main-layout="single-pane"
      data-workstation-route={activeRouteId ?? 'unknown'}
      data-workstation-destination={activeDestinationId}
      className={joinClassNames(
        'workstation-shell',
        activeDestinationId === 'sage' && 'workstation-shell--sage',
        isSidebarOpen && 'workstation-shell--mobile-sidebar-open',
        studioAgentDetailActive && 'workstation-shell--studio-agent-detail',
        activeRouteId === 'chat' && 'workstation-shell--chat',
      )}
    >
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
              ) : routeManifest.routeIndex.gateway ? (
                <Link
                  href={routeManifest.routeIndex.gateway.href}
                  className={joinClassNames(
                    'workstation-titlebar__link',
                    computerStatus.onlineCount > 0 && 'workstation-titlebar__link--active',
                  )}
                  title={
                    computerStatus.connectedCount > 0
                      ? `${computerStatus.onlineCount} of ${computerStatus.connectedCount} connected computers online`
                      : 'No computer connected'
                  }
                >
                  <Monitor size={16} aria-hidden="true" />
                  <span>
                    {computerStatus.onlineCount > 0 ? 'Computer online' : 'Computer offline'}
                  </span>
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
                  chatHref={routeManifest.routeIndex.chat?.href ?? `/w/${encodeURIComponent(workspaceId)}/sage`}
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
  );
}
