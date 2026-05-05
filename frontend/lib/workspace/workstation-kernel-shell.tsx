'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

import { joinClassNames } from '@/lib/ui/primitives';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import {
  WORKSPACE_NAV_DESTINATIONS,
  buildWorkspaceRouteHref,
  getWorkspaceNavRouteDefinition,
  type WorkspaceNavDestinationId,
  type WorkspaceRouteId,
} from '../../../shared/nav-manifest';

const CONTEXT_ROUTE_IDS_BY_DESTINATION: Record<WorkspaceNavDestinationId, readonly WorkspaceRouteId[]> = {
  sage: [],
  studio: ['studio', 'inbox', 'deploy', 'studioIntegrations'],
  gateway: ['gateway', 'channels', 'gatewayApprovals', 'gatewayActivity'],
  marketplace: ['marketplace'],
  settings: ['settings'],
};

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();

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
  const workspaceLabel = bootstrap.workspace.label;
  const contextRoutes = useMemo(() => {
    if (activeDestinationId === 'sage') {
      const chatRoute = routeManifest.routeIndex.chat;
      const profileRoute = routeManifest.routeIndex.profile;
      const historyRoute = routeManifest.routeIndex.runs;
      const memoryRoute = routeManifest.routeIndex.activity;
      const heartbeatRoute = routeManifest.routeIndex.heartbeat;
      const skillsRoute = routeManifest.routeIndex.skills;
      const integrationsRoute = routeManifest.routeIndex.integrations;
      return [
        chatRoute
          ? { ...chatRoute, label: 'Chat' as const }
          : null,
        profileRoute
          ? { ...profileRoute, label: 'Profile' as const }
          : null,
        memoryRoute
          ? { ...memoryRoute, label: 'Memory' as const }
          : null,
        historyRoute
          ? { ...historyRoute, label: 'History' as const }
          : null,
        heartbeatRoute
          ? { ...heartbeatRoute, label: 'Heartbeat' as const }
          : null,
        skillsRoute
          ? { ...skillsRoute, label: 'Skills' as const }
          : null,
        integrationsRoute
          ? { ...integrationsRoute, label: 'Connected Apps' as const }
          : null,
      ].filter((route): route is NonNullable<typeof route> => Boolean(route));
    }

    const routeIds = CONTEXT_ROUTE_IDS_BY_DESTINATION[activeDestinationId];
    return routeIds.flatMap((routeId) => {
      const route = routeManifest.routeIndex[routeId];
      return route ? [route] : [];
    });
  }, [activeDestinationId, routeManifest.routeIndex]);

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
      return routeManifest.routeIndex.gateway?.href ?? `/w/${encodeURIComponent(workspaceId)}/gateway`;
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
        <nav className="workstation-mobile-destination-nav" aria-label="Workspace sections">
          {WORKSPACE_NAV_DESTINATIONS.map((destination) => (
            <Link
              key={destination.id}
              href={buildWorkspaceRouteHref(workspaceId, destination.defaultRouteId)}
              prefetch
              aria-current={activeDestinationId === destination.id ? 'page' : undefined}
              className={joinClassNames(
                'workstation-mobile-destination-nav__link',
                activeDestinationId === destination.id && 'workstation-mobile-destination-nav__link--active',
              )}
            >
              {destination.label}
            </Link>
          ))}
        </nav>
      </div>
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
    </div>
  );
}
