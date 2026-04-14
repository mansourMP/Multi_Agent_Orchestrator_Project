'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
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
  const { bootstrap, routeManifest, shellProfile } = useWorkspaceBoundary();
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
    <div
      data-workstation-roster="pane"
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem',
      }}
    >
      <section
        style={{
          display: 'grid',
          gap: '0.8rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 78%, var(--app-bg-overlay) 22%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.75rem',
            alignItems: 'start',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: '0.2rem' }}>
            <strong style={{ color: 'var(--app-text-primary)' }}>Inventory</strong>
            <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.5 }}>
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
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
                style={{
                  minHeight: '2rem',
                  padding: '0.34rem 0.72rem',
                  borderRadius: '999px',
                  border: active ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                  background: active
                    ? 'color-mix(in srgb, var(--app-accent-muted) 76%, var(--app-bg-panel) 24%)'
                    : 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                  color: active ? 'var(--app-accent-text)' : 'var(--app-text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 620,
                  cursor: 'pointer',
                }}
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
            style={{
              minHeight: '2rem',
              padding: '0.34rem 0.72rem',
              borderRadius: '999px',
              border: '1px solid var(--app-border-subtle)',
              background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
              color: 'var(--app-text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 620,
              cursor: 'pointer',
            }}
          >
            {uiState.showOfflineRuntimeTargets ? 'Hide offline runtime targets' : 'Show offline runtime targets'}
          </button>
        </div>
      </section>

      {visibleSections.map((section) => (
        <section
          key={section.id}
          style={{
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'grid', gap: '0.18rem' }}>
            <strong style={{ color: 'var(--app-text-primary)' }}>{section.label}</strong>
            <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.8rem' }}>
              {section.items.length} visible
            </span>
          </div>

          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {section.items.map((item) => {
              const isSelected = intent?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isSelected}
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
                  }}
                  style={{
                    display: 'grid',
                    gap: '0.45rem',
                    textAlign: 'left',
                    padding: '0.9rem 0.95rem',
                    borderRadius: '0.95rem',
                    border: isSelected ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                    background: isSelected
                      ? 'color-mix(in srgb, var(--app-accent-muted) 76%, var(--app-bg-panel) 24%)'
                      : 'color-mix(in srgb, var(--app-bg-panel) 88%, var(--app-bg-overlay) 12%)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                      <strong style={{ color: 'var(--app-text-primary)' }}>{item.label}</strong>
                      <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem' }}>{item.subtitle}</span>
                    </div>
                    <span
                      style={{
                        padding: '0.18rem 0.5rem',
                        borderRadius: '999px',
                        border: '1px solid var(--app-border-subtle)',
                        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
                        color: 'var(--app-text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.kind.replace('_', ' ')}
                    </span>
                  </div>

                  <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.86rem', lineHeight: 1.55 }}>
                    {item.description}
                  </span>

                  {(item.statusLabel || item.href) ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                      {item.statusLabel ? (
                        <span
                          style={{
                            color: item.statusLabel === 'online' ? 'var(--app-success)' : 'var(--app-warning)',
                            fontSize: '0.78rem',
                            fontWeight: 620,
                          }}
                        >
                          {item.statusLabel}
                        </span>
                      ) : null}
                      {item.href ? (
                        <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.78rem', overflowWrap: 'anywhere' }}>
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
