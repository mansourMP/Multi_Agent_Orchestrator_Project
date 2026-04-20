'use client';

import type { PropsWithChildren } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { joinClassNames } from '@/lib/ui/primitives';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import {
  getWorkspaceNavRouteDefinition,
  type WorkspaceNavDestinationId,
  type WorkspaceRouteId,
} from '../../../shared/nav-manifest';

const CONTEXT_ROUTE_IDS_BY_DESTINATION: Record<WorkspaceNavDestinationId, readonly WorkspaceRouteId[]> = {
  sage: [],
  studio: ['studio', 'inbox', 'deploy', 'studioIntegrations'],
  marketplace: [],
  settings: ['settings'],
};

type SageTitlebarCounts = {
  recentRuns: number;
  memoryItems: number;
};

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [sageCounts, setSageCounts] = useState<SageTitlebarCounts>({
    recentRuns: 0,
    memoryItems: 0,
  });

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
      const historyRoute = routeManifest.routeIndex.runs;
      const memoryRoute = routeManifest.routeIndex.activity;
      const integrationsRoute = routeManifest.routeIndex.integrations;
      const filesRoute = routeManifest.routeIndex.artifacts;
      return [
        chatRoute
          ? { ...chatRoute, label: 'Chat' as const }
          : null,
        historyRoute
          ? { ...historyRoute, label: 'History' as const }
          : null,
        memoryRoute
          ? { ...memoryRoute, label: 'Memory' as const }
          : null,
        integrationsRoute
          ? { ...integrationsRoute, label: 'Integrations' as const }
          : null,
        filesRoute
          ? { ...filesRoute, label: 'Files' as const }
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

  useEffect(() => {
    let cancelled = false;
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    void Promise.all([
      services.client.listRuns({ limit: 120 }),
      services.client.listSageMemory(),
    ]).then(([runsPayload, memoryPayload]) => {
      if (cancelled) {
        return;
      }
      const runItems = runsPayload && typeof runsPayload === 'object' && Array.isArray((runsPayload as Record<string, unknown>).items)
        ? (runsPayload as Record<string, unknown>).items as Array<Record<string, unknown>>
        : [];
      const recentRuns = runItems.filter((item) => {
        const createdAt = readString(item.created_at);
        if (!createdAt) {
          return false;
        }
        const parsed = Date.parse(createdAt);
        return Number.isFinite(parsed) && parsed >= cutoff;
      }).length;
      const memorySummary = memoryPayload && typeof memoryPayload === 'object'
        ? (memoryPayload as Record<string, unknown>).summary
        : null;
      const memoryItems = memorySummary && typeof memorySummary === 'object'
        ? Number((memorySummary as Record<string, unknown>).total_count ?? 0)
        : Array.isArray((memoryPayload as Record<string, unknown> | null)?.items)
          ? (((memoryPayload as Record<string, unknown>).items as unknown[]).length)
          : 0;
      setSageCounts({
        recentRuns,
        memoryItems: Number.isFinite(memoryItems) ? memoryItems : 0,
      });
    }).catch(() => {
      if (!cancelled) {
        setSageCounts({
          recentRuns: 0,
          memoryItems: 0,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services.client, streamState.activity.version]);

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
                isContextRouteActive(route.id) && 'workstation-titlebar__link--active',
              )}
            >
              <span>{route.label}</span>
              {route.id === 'runs' && sageCounts.recentRuns > 0 ? (
                <span className="workstation-titlebar__link-meta">· {sageCounts.recentRuns}</span>
              ) : null}
              {route.id === 'activity' && sageCounts.memoryItems > 0 ? (
                <span className="workstation-titlebar__link-meta">· {sageCounts.memoryItems}</span>
              ) : null}
            </Link>
          )) : null}
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
    </div>
  );
}
