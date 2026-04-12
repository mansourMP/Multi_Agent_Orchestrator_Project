'use client';

import { useEffect, useMemo, useState } from 'react';

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
      description: 'Bootstrap indicates document-heavy workspace traits, so document-centric work is enabled.',
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
      subtitle: 'Admin/ops oversight',
      description: 'Bootstrap indicates elevated operations or admin posture for this workspace.',
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
      subtitle: `${group.label} route`,
      description: `Canonical workstation application surface mounted at ${route.href}.`,
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
      ? 'This runtime target is currently available for workstation execution.'
      : 'This runtime target is currently offline.',
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
      label: 'Runtime Targets',
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
        padding: '1rem 1.1rem',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: '0.8rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid #dbeafe',
          background: '#eff6ff',
        }}
      >
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <strong style={{ color: '#1d4ed8' }}>Kernel-scoped roster</strong>
          <span style={{ color: '#1e3a8a', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Pane 2 is built from bootstrap and canonical workstation truth only. Selection drives stage intent and nothing else.
          </span>
          <span style={{ color: '#1e3a8a', fontSize: '0.82rem' }}>
            {streamState.notifications.unreadCount} notifications live, {streamState.activity.totalCount} activity events.
          </span>
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
                  border: active ? '1px solid #1d4ed8' : '1px solid #bfdbfe',
                  borderRadius: '999px',
                  background: active ? '#dbeafe' : '#ffffff',
                  color: active ? '#1d4ed8' : '#334155',
                  padding: '0.35rem 0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', color: '#334155' }}>
          <input
            type="checkbox"
            checked={uiState.showOfflineRuntimeTargets}
            onChange={(event) => {
              setUiState((current) => ({
                ...current,
                showOfflineRuntimeTargets: event.currentTarget.checked,
              }));
            }}
          />
          Show offline runtime targets
        </label>
      </div>

      <div style={{ display: 'grid', gap: '0.55rem' }}>
        <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
          {totalItemCount} roster items from bootstrap/canonical truth
        </span>
        <button
          type="button"
          onClick={() => {
            clearIntent();
          }}
          style={{
            justifySelf: 'start',
            border: '1px solid #cbd5e1',
            borderRadius: '999px',
            background: '#ffffff',
            color: '#334155',
            padding: '0.35rem 0.7rem',
            cursor: 'pointer',
          }}
        >
          Clear stage intent
        </button>
      </div>

      {visibleSections.map((section) => (
        <section
          key={section.id}
          style={{
            display: 'grid',
            gap: '0.7rem',
          }}
        >
          <div style={{ display: 'grid', gap: '0.15rem' }}>
            <strong style={{ color: '#0f172a' }}>{section.label}</strong>
            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
              {section.items.length} visible
            </span>
          </div>

          <div style={{ display: 'grid', gap: '0.7rem' }}>
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
                    border: isSelected ? '1px solid #0f172a' : '1px solid #e2e8f0',
                    background: isSelected ? '#e2e8f0' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'start' }}>
                    <div style={{ display: 'grid', gap: '0.15rem' }}>
                      <strong style={{ color: '#0f172a' }}>{item.label}</strong>
                      <span style={{ color: '#475569', fontSize: '0.84rem' }}>{item.subtitle}</span>
                    </div>
                    <span
                      style={{
                        padding: '0.18rem 0.5rem',
                        borderRadius: '999px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.kind.replace('_', ' ')}
                    </span>
                  </div>

                  <span style={{ color: '#334155', fontSize: '0.88rem', lineHeight: 1.5 }}>
                    {item.description}
                  </span>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {item.statusLabel ? (
                      <span style={{ color: item.statusLabel === 'online' ? '#166534' : '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
                        {item.statusLabel}
                      </span>
                    ) : null}
                    {item.href ? (
                      <span style={{ color: '#64748b', fontSize: '0.8rem', overflowWrap: 'anywhere' }}>
                        {item.href}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
