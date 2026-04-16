'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { CommandSheet } from '@/lib/ui/command-sheet';
import { WorkstationDiagnostics } from '@/lib/workspace/workstation-diagnostics';
import { WorkstationRosterPane } from '@/lib/workspace/workstation-roster-pane';
import { WorkstationStagePane } from '@/lib/workspace/workstation-stage-pane';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import { getWorkspaceNavRouteDefinition, type WorkspaceNavDestinationId, type WorkspaceRouteId } from '../../../shared/nav-manifest';

const CONTEXT_ROUTE_IDS_BY_DESTINATION: Record<WorkspaceNavDestinationId, readonly WorkspaceRouteId[]> = {
  sage: [],
  studio: ['studio', 'channels', 'inbox', 'deploy'],
  settings: ['settings'],
};

function resolveRouteLabel(
  pathname: string,
  workspaceId: string,
  routeIndex: ReturnType<typeof useWorkspaceBoundary>['routeManifest']['routeIndex'],
) {
  const routeId = resolveRouteIdFromHref(workspaceId, pathname);
  return routeId ? routeIndex[routeId]?.label ?? 'Workspace' : 'Workspace';
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showWorkspaceContext, setShowWorkspaceContext] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  const currentRouteLabel = useMemo(
    () => resolveRouteLabel(pathname, workspaceId, routeManifest.routeIndex),
    [pathname, routeManifest.routeIndex, workspaceId],
  );
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
  const contextRoutes = useMemo(() => {
    if (activeDestinationId === 'sage') {
      const memoryRoute = routeManifest.routeIndex.activity;
      const appsRoute = routeManifest.routeIndex.channels;
      return [
        memoryRoute
          ? { ...memoryRoute, label: 'Memory' as const }
          : null,
        appsRoute
          ? { ...appsRoute, label: 'Apps' as const }
          : null,
      ].filter((route): route is NonNullable<typeof route> => Boolean(route));
    }

    const routeIds = CONTEXT_ROUTE_IDS_BY_DESTINATION[activeDestinationId];
    return routeIds.flatMap((routeId) => {
      const route = routeManifest.routeIndex[routeId];
      return route ? [route] : [];
    });
  }, [activeDestinationId, routeManifest.routeIndex]);

  useEffect(() => {
    setShowWorkspaceContext(false);
    setShowInspector(false);
  }, [pathname]);

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
          surfaceLabel={currentRouteLabel}
          diagnosticsVisible={showDiagnostics}
          onToggleDiagnostics={() => {
            setShowDiagnostics((current) => !current);
          }}
          navigation={contextRoutes.length > 1 ? contextRoutes.map((route) => (
            <Link
              key={route.id}
              href={route.href}
              prefetch
              aria-current={route.id === activeRouteId ? 'page' : undefined}
              className={joinClassNames(
                'workstation-titlebar__link',
                route.id === activeRouteId && 'workstation-titlebar__link--active',
              )}
            >
              {route.label}
            </Link>
          )) : null}
          actions={(
            <>
              <AppButton
                type="button"
                tone={showWorkspaceContext ? 'secondary' : 'ghost'}
                className="workstation-titlebar__action"
                onClick={() => {
                  setShowWorkspaceContext((current) => !current);
                  setShowInspector(false);
                }}
              >
                Workspace
              </AppButton>
              <AppButton
                type="button"
                tone={showInspector ? 'secondary' : 'ghost'}
                className="workstation-titlebar__action"
                onClick={() => {
                  setShowInspector((current) => !current);
                  setShowWorkspaceContext(false);
                }}
              >
                Details
              </AppButton>
            </>
          )}
        />
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

      <CommandSheet
        open={showDiagnostics}
        title="Diagnostics"
        description="Internal shell and stream state for debugging only."
        onClose={() => {
          setShowDiagnostics(false);
        }}
      >
        <WorkstationDiagnostics onClose={() => setShowDiagnostics(false)} />
      </CommandSheet>

      <CommandSheet
        open={showWorkspaceContext}
        title="Workspace info"
        description="Recent activity and workspace details."
        onClose={() => {
          setShowWorkspaceContext(false);
        }}
      >
        <WorkstationRosterPane />
      </CommandSheet>

      <CommandSheet
        open={showInspector}
        title={`${currentRouteLabel} details`}
        description="More details and actions for this view."
        onClose={() => {
          setShowInspector(false);
        }}
      >
        <WorkstationStagePane />
      </CommandSheet>
    </div>
  );
}
