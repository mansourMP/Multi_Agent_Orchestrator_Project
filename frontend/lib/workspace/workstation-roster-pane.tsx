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
      filter === 'agent' || filter === 'application' || filter === 'runtime_target' || filter === 'all'
        ? filter
        : DEFAULT_ROSTER_UI_STATE.filter,
    showOfflineRuntimeTargets:
      typeof value?.showOfflineRuntimeTargets === 'boolean'
        ? value.showOfflineRuntimeTargets
        : DEFAULT_ROSTER_UI_STATE.showOfflineRuntimeTargets,
  };
}

function buildAgentItems({
  role,
  shellProfileLabel,
  workspaceLabel,
  workspaceTraits,
}: {
  role: string;
  shellProfileLabel: string;
  workspaceLabel: string;
  workspaceTraits: Record<string, unknown>;
}): WorkstationRosterItem[] {
  const items: WorkstationRosterItem[] = [
    {
      id: 'agent:workspace-operator',
      kind: 'agent',
      label: 'Workspace Operator',
      subtitle: `${shellProfileLabel} · ${role}`,
      description: `${workspaceLabel} is currently operating under the ${shellProfileLabel.toLowerCase()} shell profile.`,
      metadata: {
        operatingMode: workspaceTraits['operatingMode'] ?? null,
        complianceMode: workspaceTraits['complianceMode'] ?? null,
      },
    },
  ];

  if (workspaceTraits['documentHeavy'] === true) {
    items.push({
      id: 'agent:document-specialist',
      kind: 'agent',
      label: 'Document Specialist',
      subtitle: 'Document workstation routing',
      description: 'Document-heavy work is enabled for this workspace.',
      metadata: {
        documentHeavy: true,
      },
    });
  }

  if (workspaceTraits['adminHeavy'] === true || role === 'owner' || role === 'admin') {
    items.push({
      id: 'agent:operations-supervisor',
      kind: 'agent',
      label: 'Operations Supervisor',
      subtitle: 'Oversight and governance',
      description: 'Administrative and operational controls are available for this workspace.',
      metadata: {
        adminHeavy: Boolean(workspaceTraits['adminHeavy']),
        role,
      },
    });
  }

  return items;
}

function buildApplicationItems(routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest']): WorkstationRosterItem[] {
  return routeManifest.navGroups.flatMap((group) =>
    group.routes.map((route) => ({
      id: `application:${route.id}`,
      kind: 'application' as const,
      label: route.label,
      subtitle: group.label,
      description: `Open ${route.label.toLowerCase()} inside the current workspace surface.`,
      href: route.href,
      metadata: {
        routeId: route.id,
        groupId: group.id,
        requiredCapabilities: route.requiredCapabilities,
      },
    })),
  );
}

function buildRuntimeTargetItems(
  runtimeTargets: ReturnType<typeof useWorkspaceBoundary>['bootstrap']['runtime']['runtimeTargets'],
): WorkstationRosterItem[] {
  return runtimeTargets.map((target) => ({
    id: `runtime_target:${target.id}`,
    kind: 'runtime_target',
    label: target.label,
    subtitle: `${target.kind}${target.preferred ? ' · preferred' : ''}`,
    description: target.online
      ? 'Available for workstation execution.'
      : 'Currently unavailable.',
    statusLabel: target.online ? 'online' : 'offline',
    metadata: {
      runtimeTargetId: target.id,
      kind: target.kind,
      online: target.online,
      preferred: target.preferred,
    },
  }));
}

function buildRosterSections({
  bootstrap,
  routeManifest,
  shellProfileLabel,
}: {
  bootstrap: ReturnType<typeof useWorkspaceBoundary>['bootstrap'];
  routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest'];
  shellProfileLabel: string;
}): WorkstationRosterSection[] {
  return [
    {
      id: 'agent',
      label: 'Agents',
      items: buildAgentItems({
        role: bootstrap.membership.role,
        shellProfileLabel,
        workspaceLabel: bootstrap.workspace.label,
        workspaceTraits: bootstrap.workspaceTraits,
      }),
    },
    {
      id: 'application',
      label: 'Applications',
      items: buildApplicationItems(routeManifest),
    },
    {
      id: 'runtime_target',
      label: 'Runtime targets',
      items: buildRuntimeTargetItems(bootstrap.runtime.runtimeTargets),
    },
  ];
}

export function WorkstationRosterPane() {
  const pathname = usePathname();
  const router = useRouter();
  const { bootstrap, routeManifest, shellProfile, workspaceId } = useWorkspaceBoundary();
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
      shellProfileLabel: shellProfile.label,
    }),
    [bootstrap, routeManifest, shellProfile.label],
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
            <strong className="workstation-pane__title">Inventory</strong>
            <span className="app-meta-value app-meta-value--secondary">
              {totalItemCount} items available · {streamState.notifications.unreadCount} unread · {streamState.activity.totalCount} recent events
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
            ['agent', 'Agents'],
            ['application', 'Applications'],
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
                item.kind === 'application' && typeof item.metadata?.['routeId'] === 'string'
                  ? item.metadata['routeId']
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
                      {item.kind.replace('_', ' ')}
                    </span>
                  </div>

                  <span className="app-card-button__subtitle">
                    {item.description}
                  </span>

                  {(item.statusLabel || item.href) ? (
                    <div className="app-inline-actions app-inline-actions--tight">
                      {item.statusLabel ? (
                        <span className={`app-card-button__meta${item.statusLabel === 'online' ? ' workstation-desktop-status__detail--ready' : ''}`}>
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
