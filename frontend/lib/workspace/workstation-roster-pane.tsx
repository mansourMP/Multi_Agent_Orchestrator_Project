'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { useWorkstationStageIntentState, type WorkstationStageIntentKind } from '@/lib/workspace/workstation-stage-intent';

type WorkstationRosterFilter = 'all' | WorkstationStageIntentKind;

type WorkstationRosterUiState = {
  filter: WorkstationRosterFilter;
  showOfflineRuntimeTargets: boolean;
};

type WorkstationRosterItem = {
  id: string;
  kind: WorkstationStageIntentKind;
  label: string;
  subtitle: string;
  description: string;
  badgeLabel: string;
  href?: string | null;
  statusLabel?: string | null;
  metadata?: Record<string, unknown>;
};

type WorkstationRosterSection = {
  id: WorkstationStageIntentKind;
  label: string;
  items: WorkstationRosterItem[];
};

const WORKSTATION_ROSTER_UI_KEY = 'pane:roster:v1';
const DEFAULT_ROSTER_UI_STATE: WorkstationRosterUiState = {
  filter: 'all',
  showOfflineRuntimeTargets: true,
};

function normalizeRosterUiState(
  value: Partial<WorkstationRosterUiState> | null | undefined,
): WorkstationRosterUiState {
  const filter = value?.filter;
  return {
    filter:
      filter === 'workspace_area' || filter === 'runtime_target' || filter === 'all'
        ? filter
        : DEFAULT_ROSTER_UI_STATE.filter,
    showOfflineRuntimeTargets:
      typeof value?.showOfflineRuntimeTargets === 'boolean'
        ? value.showOfflineRuntimeTargets
        : DEFAULT_ROSTER_UI_STATE.showOfflineRuntimeTargets,
  };
}

function buildWorkspaceAreaItems(
  routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest'],
): WorkstationRosterItem[] {
  const items: WorkstationRosterItem[] = [];
  const sageRoute = routeManifest.routeIndex.chat ?? null;
  const servicesRoute = routeManifest.routeIndex.deploy ?? null;
  const studioRoute = routeManifest.routeIndex.studio ?? null;
  const integrationsRoute = routeManifest.routeIndex.channels ?? null;

  if (sageRoute) {
    items.push({
      id: 'workspace_area:sage',
      kind: 'workspace_area',
      label: 'Sage',
      subtitle: 'Primary personal agent',
      description: servicesRoute
        ? 'Chat, memory, approvals, runs, and Sage services live in one continuous workspace relationship.'
        : 'Chat, memory, approvals, and runs live in one continuous workspace relationship.',
      badgeLabel: 'Sage',
      href: sageRoute.href,
      metadata: {
        routeId: sageRoute.id,
        areaId: 'sage',
        supportingRoutes: ['chat', 'runs', 'approvals', 'artifacts', 'notifications', 'activity'],
        servicesRouteId: servicesRoute?.id ?? null,
      },
    });
  }

  if (studioRoute) {
    items.push({
      id: 'workspace_area:studio',
      kind: 'workspace_area',
      label: 'Studio',
      subtitle: 'Telegram specialist agents',
      description: integrationsRoute
        ? 'Create, deploy, and monitor specialist agents with explicit Telegram channel readiness.'
        : 'Create, deploy, and monitor specialist agents for the current workspace.',
      badgeLabel: 'Studio',
      href: studioRoute.href,
      metadata: {
        routeId: studioRoute.id,
        areaId: 'studio',
        supportingRoutes: ['studio', 'channels', 'inbox', 'deploy'],
        integrationsRouteId: integrationsRoute?.id ?? null,
      },
    });
  }

  return items;
}

function buildRuntimeTargetItems(
  runtimeTargets: ReturnType<typeof useWorkspaceBoundary>['bootstrap']['runtime']['runtimeTargets'],
): WorkstationRosterItem[] {
  return runtimeTargets.map((target) => {
    const statusLabel =
      typeof target.statusLabel === 'string' && target.statusLabel.trim()
        ? target.statusLabel
        : target.online
          ? 'online'
          : 'offline';

    return {
      id: `runtime_target:${target.id}`,
      kind: 'runtime_target',
      label: target.label,
      subtitle: `${target.kind}${target.preferred ? ' · preferred' : ''}`,
      description:
        typeof target.statusReason === 'string' && target.statusReason.trim()
          ? target.statusReason
          : target.online
            ? 'Available for workstation execution.'
            : 'Currently unavailable.',
      badgeLabel: 'Runtime',
      statusLabel,
      metadata: {
        runtimeTargetId: target.id,
        kind: target.kind,
        online: target.online,
        preferred: target.preferred,
        healthy: target.healthy,
        status: target.status ?? null,
        statusReason: target.statusReason ?? null,
        trustTier: target.trustTier ?? null,
        approvalMode: target.approvalMode ?? null,
        executionTarget: target.executionTarget ?? null,
      },
    };
  });
}

function buildRosterSections({
  bootstrap,
  routeManifest,
}: {
  bootstrap: ReturnType<typeof useWorkspaceBoundary>['bootstrap'];
  routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest'];
}): WorkstationRosterSection[] {
  return [
    {
      id: 'workspace_area',
      label: 'Products',
      items: buildWorkspaceAreaItems(routeManifest),
    },
    {
      id: 'runtime_target',
      label: 'Runtime readiness',
      items: buildRuntimeTargetItems(bootstrap.runtime.runtimeTargets),
    },
  ];
}

export function WorkstationRosterPane() {
  const pathname = usePathname();
  const router = useRouter();
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const { intent, setIntent, clearIntent } = useWorkstationStageIntentState();
  const [uiState, setUiState] = useState<WorkstationRosterUiState>(() =>
    normalizeRosterUiState(
      services.persistence.getJson<WorkstationRosterUiState>(WORKSTATION_ROSTER_UI_KEY),
    ),
  );

  useEffect(() => {
    services.persistence.setJson(WORKSTATION_ROSTER_UI_KEY, uiState);
  }, [services, uiState]);

  const sections = useMemo(
    () => buildRosterSections({
      bootstrap,
      routeManifest,
    }),
    [bootstrap, routeManifest],
  );

  useEffect(() => {
    services.queryClient.set('workstation:roster:sections', sections);
  }, [sections, services]);

  const activeRouteId = useMemo(
    () => resolveRouteIdFromHref(workspaceId, pathname),
    [pathname, workspaceId],
  );

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => {
        let items = section.items;
        if (uiState.filter !== 'all' && section.id !== uiState.filter) {
          items = [];
        }
        if (section.id === 'runtime_target' && !uiState.showOfflineRuntimeTargets) {
          items = items.filter((item) => item.metadata?.['online'] !== false);
        }
        return {
          ...section,
          items,
        };
      })
      .filter((section) => section.items.length > 0);
  }, [sections, uiState.filter, uiState.showOfflineRuntimeTargets]);

  const totalItemCount = sections.reduce((count, section) => count + section.items.length, 0);

  return (
    <div data-workstation-roster="pane" className="app-stack-4">
      <section className="workstation-diagnostics">
        <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
          <div className="app-stack-1">
            <strong className="workstation-pane__title">Workspace context</strong>
            <span className="app-meta-value app-meta-value--secondary">
              {totalItemCount} active references · {streamState.notifications.unreadCount} unread · {streamState.activity.totalCount} recent events
            </span>
          </div>

          {intent ? (
            <AppButton
              type="button"
              tone="ghost"
              onClick={() => {
                clearIntent();
              }}
            >
              Clear selection
            </AppButton>
          ) : null}
        </div>

        <div className="app-inline-actions app-inline-actions--tight">
          {[
            ['all', 'All'],
            ['workspace_area', 'Products'],
            ['runtime_target', 'Runtime'],
          ].map(([value, label]) => {
            const active = uiState.filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setUiState((current) => ({
                    ...current,
                    filter: value as WorkstationRosterFilter,
                  }));
                }}
                className={`workstation-command-bar__link${active ? ' workstation-command-bar__link--active' : ''}`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setUiState((current) => ({
                ...current,
                showOfflineRuntimeTargets: !current.showOfflineRuntimeTargets,
              }));
            }}
            className="workstation-command-bar__link"
          >
            {uiState.showOfflineRuntimeTargets ? 'Hide offline runtime targets' : 'Show offline runtime targets'}
          </button>
        </div>
      </section>

      {visibleSections.map((section) => (
        <section key={section.id} className="app-stack-3">
          <div className="app-stack-1">
            <strong className="workstation-pane__title">{section.label}</strong>
            <span className="app-card-button__meta">
              {section.items.length} visible
            </span>
          </div>

          <div className="app-stack-3">
            {section.items.map((item) => {
              const itemRouteId =
                typeof item.metadata?.['routeId'] === 'string'
                  ? String(item.metadata.routeId)
                  : null;
              const routeSelected = itemRouteId === activeRouteId;
              const isSelected = routeSelected || intent?.id === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-current={routeSelected ? 'page' : undefined}
                  data-workstation-roster-item={item.id}
                  onClick={() => {
                    setIntent({
                      sourcePane: 'roster',
                      kind: item.kind,
                      id: item.id,
                      label: item.label,
                      subtitle: item.subtitle,
                      description: item.description,
                      href: item.href ?? null,
                      metadata: item.metadata,
                    });
                    if (item.href && itemRouteId && itemRouteId !== activeRouteId) {
                      router.push(item.href);
                    }
                  }}
                  className={`app-card-button${isSelected ? ' app-card-button--selected' : ''}`}
                >
                  <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                    <div className="app-stack-1">
                      <strong className="app-card-button__title">{item.label}</strong>
                      <span className="app-card-button__subtitle">{item.subtitle}</span>
                    </div>
                    <span className="app-data-badge app-data-badge--neutral">
                      {item.badgeLabel}
                    </span>
                  </div>

                  <span className="app-card-button__subtitle">
                    {item.description}
                  </span>

                  {(item.statusLabel || item.href) ? (
                    <div className="app-inline-actions app-inline-actions--tight">
                      {item.statusLabel ? (
                        <span className={`app-card-button__meta${item.statusLabel === 'online' || item.statusLabel === 'ready' ? ' workstation-desktop-status__detail--ready' : ''}`}>
                          {item.statusLabel}
                        </span>
                      ) : null}
                      {item.href ? (
                        <span className="app-card-button__meta">
                          {item.href}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
