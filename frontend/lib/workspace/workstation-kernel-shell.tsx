'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { Activity, Bot, Compass, LayoutGrid, Menu, Settings2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { AppDrawer, joinClassNames } from '@/lib/ui/primitives';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationActivityVersion } from '@/lib/workspace/workspace-services';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import {
  buildWorkspaceRouteHref,
  getWorkspaceNavRouteDefinition,
  type WorkspaceNavDestinationId,
  type WorkspaceRouteId,
} from '../../../shared/nav-manifest';

const CONTEXT_ROUTE_IDS_BY_DESTINATION: Record<WorkspaceNavDestinationId, readonly WorkspaceRouteId[]> = {
  sage: ['chat', 'memory', 'integrations', 'heartbeat', 'activity'],
  studio: ['studio'],
  gateway: ['integrations'],
  marketplace: ['marketplace'],
  settings: ['settings'],
};

const MOBILE_DESTINATION_NAV: readonly {
  id: 'chat' | 'studio' | 'marketplace' | 'settings';
  label: string;
  defaultRouteId: WorkspaceRouteId;
  icon: LucideIcon;
}[] = [
  { id: 'chat', label: 'Chat', defaultRouteId: 'chat', icon: Bot },
  { id: 'studio', label: 'Build', defaultRouteId: 'studio', icon: LayoutGrid },
  { id: 'marketplace', label: 'Discover', defaultRouteId: 'marketplace', icon: Compass },
  { id: 'settings', label: 'Settings', defaultRouteId: 'settings', icon: Settings2 },
];

const ACTIVITY_ROUTE_IDS = new Set<WorkspaceRouteId>([
  'activity',
  'heartbeat',
  'runs',
  'approvals',
  'notifications',
]);

function readPendingApprovalCount(payload: unknown): number {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const explicit = Number(record.pending_count);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const items = Array.isArray(record.items) ? record.items : [];
  return items.filter((item) => {
    const approval = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const status = String(approval.status ?? '').trim().toLowerCase();
    return status === 'pending' || status === 'waiting' || status === 'needs_approval';
  }).length;
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const approvalRefreshTimerRef = useRef<number | null>(null);

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
    if (activeRouteId && ACTIVITY_ROUTE_IDS.has(activeRouteId)) {
      return 'activity';
    }
    if (activeDestinationId === 'studio' || activeDestinationId === 'marketplace' || activeDestinationId === 'settings') {
      return activeDestinationId;
    }
    return 'chat';
  }, [activeDestinationId, activeRouteId]);
  const workspaceLabel = bootstrap.workspace.label;
  const contextRoutes = useMemo(() => {
    const routeIds = CONTEXT_ROUTE_IDS_BY_DESTINATION[activeDestinationId];
    return routeIds.flatMap((routeId) => {
      const route = routeManifest.routeIndex[routeId];
      if (!route) {
        return [];
      }
      if (route.id === 'chat') {
        return [{ ...route, label: 'Chat' as const }];
      }
      return [route];
    });
  }, [activeDestinationId, routeManifest.routeIndex]);

  useEffect(() => {
    if (!routeManifest.routeIndex.approvals) {
      if (approvalRefreshTimerRef.current !== null) {
        window.clearTimeout(approvalRefreshTimerRef.current);
        approvalRefreshTimerRef.current = null;
      }
      setPendingApprovalCount(0);
      return;
    }
    let cancelled = false;
    if (approvalRefreshTimerRef.current !== null) {
      window.clearTimeout(approvalRefreshTimerRef.current);
    }
    approvalRefreshTimerRef.current = window.setTimeout(() => {
      approvalRefreshTimerRef.current = null;
      services.client.listApprovals({ limit: 24 })
        .then((payload) => {
          if (!cancelled) {
            setPendingApprovalCount(readPendingApprovalCount(payload));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPendingApprovalCount(0);
          }
        });
    }, activityVersion === 0 ? 0 : 750);
    return () => {
      cancelled = true;
      if (approvalRefreshTimerRef.current !== null) {
        window.clearTimeout(approvalRefreshTimerRef.current);
        approvalRefreshTimerRef.current = null;
      }
    };
  }, [activityVersion, routeManifest.routeIndex.approvals, services.client, workspaceId]);

  const surfaceHomeHref = useMemo(() => {
    if (activeDestinationId === 'sage') {
      return routeManifest.routeIndex.chat?.href ?? `/w/${encodeURIComponent(workspaceId)}/sage`;
    }
    if (activeDestinationId === 'studio') {
      return routeManifest.routeIndex.studio?.href ?? `/w/${encodeURIComponent(workspaceId)}/studio`;
    }
    if (activeDestinationId === 'marketplace') {
      return routeManifest.routeIndex.marketplace?.href ?? `/w/${encodeURIComponent(workspaceId)}/marketplace`;
    }
    if (activeDestinationId === 'gateway') {
      return routeManifest.routeIndex.integrations?.href ?? `/w/${encodeURIComponent(workspaceId)}/integrations`;
    }
    return routeManifest.routeIndex.settings?.href ?? `/w/${encodeURIComponent(workspaceId)}/settings`;
  }, [activeDestinationId, routeManifest.routeIndex, workspaceId]);

  const isContextRouteActive = (routeId: WorkspaceRouteId): boolean => {
    if (routeId === activeRouteId) {
      return true;
    }
    if (routeId === 'chat' && activeDestinationId === 'sage') {
      return pathname !== null && /\/(sage|chat)$/.test(pathname);
    }
    return false;
  };

  return (
    <div
      data-workstation-shell="kernel"
      data-workstation-main-layout="single-pane"
      data-workstation-route={activeRouteId ?? 'unknown'}
      data-workstation-destination={activeDestinationId}
      className={joinClassNames(
        'workstation-shell',
        activeDestinationId === 'sage' && 'workstation-shell--sage',
        activeRouteId === 'chat' && 'workstation-shell--chat',
      )}
    >
      <div className="workstation-shell__topbar" data-workstation-main-pane="topbar">
        <WorkstationTitlebar
          surfaceLabel={workspaceLabel}
          surfaceHref={surfaceHomeHref}
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
          actions={pendingApprovalCount > 0 && routeManifest.routeIndex.heartbeat ? (
            <Link
              href={routeManifest.routeIndex.heartbeat.href}
              className="workstation-titlebar__link workstation-titlebar__link--active"
            >
              Needs your OK · {pendingApprovalCount}
            </Link>
          ) : null}
          navigation={contextRoutes.length > 0 ? contextRoutes.map((route) => (
            <Link
              key={route.id}
              href={route.href}
              prefetch
              aria-current={isContextRouteActive(route.id) ? 'page' : undefined}
              className={joinClassNames(
                'workstation-titlebar__link',
                route.id === 'artifacts' && 'workstation-titlebar__link--muted',
                isContextRouteActive(route.id) && 'workstation-titlebar__link--active',
              )}
            >
              <span>{route.label}</span>
            </Link>
          )) : null}
        />
      </div>

      <AppDrawer
        open={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
        title={workspaceLabel}
        className="workstation-mobile-sidebar"
      >
        <div className="workstation-mobile-sidebar__content">
          <AccountTenantSwitcher />
        </div>
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
