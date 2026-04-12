'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { resolveRouteIdFromHref, type WorkspaceRouteId } from '@/lib/workspace/workspace-shell';
import { useWorkstationStageIntentState } from '@/lib/workspace/workstation-stage-intent';
import {
  clearWorkstationStageRouteState,
  mapStageRouteKindToViewKind,
  readWorkstationStageRouteState,
  writeWorkstationStageRouteState,
  type WorkstationStageRouteKind,
  type WorkstationStageRouteState,
  type WorkstationStageViewKind,
} from '@/lib/workspace/workstation-stage-router';

type StageSelection = {
  source: 'route' | 'roster';
  kind: WorkstationStageRouteKind;
  id: string;
  label: string;
  subtitle: string;
  description: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

type StageCatalogEntry = StageSelection;

type StageRunSummary = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type StageApprovalSummary = Record<string, unknown> & {
  approval_id?: string | null;
  id?: string | null;
  status?: string | null;
  prompt?: string | null;
};

type StageArtifactSummary = Record<string, unknown> & {
  artifact_id?: string | null;
  id?: string | null;
  label?: string | null;
  file_name?: string | null;
  uri?: string | null;
  mime_type?: string | null;
  content_type?: string | null;
  created_at?: string | null;
};

type StagePaneState = {
  isLoading: boolean;
  statusMessage: string | null;
  blockedMessage: string | null;
  activeView: WorkstationStageViewKind | null;
  activeSelection: StageSelection | null;
  items: StageSelection[];
};

const DEFAULT_STAGE_STATE: StagePaneState = {
  isLoading: false,
  statusMessage: null,
  blockedMessage: null,
  activeView: null,
  activeSelection: null,
  items: [],
};

function normalizeRunItems(payload: unknown): StageRunSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is StageRunSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeApprovalItems(payload: unknown): StageApprovalSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is StageApprovalSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeArtifactItems(payload: unknown): StageArtifactSummary[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is StageArtifactSummary => Boolean(item) && typeof item === 'object')
    : [];
}

function buildAgentCatalog({
  workspaceLabel,
  shellProfileLabel,
  role,
  workspaceTraits,
}: {
  workspaceLabel: string;
  shellProfileLabel: string;
  role: string;
  workspaceTraits: Record<string, unknown>;
}): StageCatalogEntry[] {
  const items: StageCatalogEntry[] = [
    {
      source: 'roster',
      kind: 'agent',
      id: 'agent:workspace-operator',
      label: 'Workspace Operator',
      subtitle: `${shellProfileLabel} · ${role}`,
      description: `${workspaceLabel} is operating under the ${shellProfileLabel.toLowerCase()} shell profile.`,
      metadata: {
        operatingMode: workspaceTraits['operatingMode'] ?? null,
        complianceMode: workspaceTraits['complianceMode'] ?? null,
      },
    },
  ];

  if (workspaceTraits['documentHeavy'] === true) {
    items.push({
      source: 'roster',
      kind: 'agent',
      id: 'agent:document-specialist',
      label: 'Document Specialist',
      subtitle: 'Document workstation routing',
      description: 'Bootstrap indicates document-heavy routing for this workspace.',
      metadata: {
        documentHeavy: true,
      },
    });
  }

  if (workspaceTraits['adminHeavy'] === true || role === 'owner' || role === 'admin') {
    items.push({
      source: 'roster',
      kind: 'agent',
      id: 'agent:operations-supervisor',
      label: 'Operations Supervisor',
      subtitle: 'Admin and operations oversight',
      description: 'Bootstrap indicates elevated operations posture for this workspace.',
      metadata: {
        adminHeavy: Boolean(workspaceTraits['adminHeavy']),
        role,
      },
    });
  }

  return items;
}

function buildApplicationCatalog(
  routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest'],
): StageCatalogEntry[] {
  return routeManifest.navGroups.flatMap((group) =>
    group.routes.map((route) => ({
      source: 'roster' as const,
      kind: 'application' as const,
      id: `application:${route.id}`,
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

function buildRuntimeTargetCatalog(
  runtimeTargets: ReturnType<typeof useWorkspaceBoundary>['bootstrap']['runtime']['runtimeTargets'],
): StageCatalogEntry[] {
  return runtimeTargets.map((target) => ({
    source: 'roster',
    kind: 'runtime_target',
    id: `runtime_target:${target.id}`,
    label: target.label,
    subtitle: `${target.kind}${target.preferred ? ' · preferred' : ''}`,
    description: target.online
      ? 'This runtime target is currently available for workstation execution.'
      : 'This runtime target is currently offline.',
    metadata: {
      runtimeTargetId: target.id,
      kind: target.kind,
      online: target.online,
      preferred: target.preferred,
    },
  }));
}

function buildRunSelections(items: StageRunSummary[]): StageSelection[] {
  return items.map((item) => ({
    source: 'route',
    kind: 'run',
    id: String(item.run_id ?? '').trim(),
    label: String(item.run_id ?? 'run'),
    subtitle: String(item.status ?? 'unknown'),
    description: String(item.created_at ?? 'No creation timestamp recorded.'),
    metadata: item,
  })).filter((item) => item.id);
}

function buildApprovalSelections(items: StageApprovalSummary[]): StageSelection[] {
  return items.map((item) => ({
    source: 'route',
    kind: 'approval',
    id: String(item.approval_id ?? item.id ?? '').trim(),
    label: String(item.prompt ?? item.id ?? 'approval'),
    subtitle: String(item.status ?? 'pending'),
    description: `Approval record ${String(item.approval_id ?? item.id ?? 'approval')}.`,
    metadata: item,
  })).filter((item) => item.id);
}

function buildArtifactSelections(items: StageArtifactSummary[]): StageSelection[] {
  return items.map((item) => ({
    source: 'route',
    kind: 'artifact',
    id: String(item.artifact_id ?? item.id ?? '').trim(),
    label: String(item.label ?? item.file_name ?? item.artifact_id ?? item.id ?? 'artifact'),
    subtitle: String(item.mime_type ?? item.content_type ?? 'artifact'),
    description: String(item.uri ?? item.file_name ?? 'Artifact reference unavailable.'),
    metadata: item,
  })).filter((item) => item.id);
}

function resolveSelectionFromCatalog(
  items: StageSelection[],
  routeState: WorkstationStageRouteState | null,
  expectedKind: WorkstationStageRouteKind,
): {
  activeSelection: StageSelection | null;
  blockedMessage: string | null;
} {
  if (items.length === 0) {
    return {
      activeSelection: null,
      blockedMessage: null,
    };
  }

  if (routeState && routeState.kind === expectedKind) {
    const matched = items.find((item) => item.id === routeState.id);
    if (matched) {
      return {
        activeSelection: matched,
        blockedMessage: null,
      };
    }

    return {
      activeSelection: null,
      blockedMessage: `The requested ${expectedKind.replace('_', ' ')} is outside the current workspace scope.`,
    };
  }

  return {
    activeSelection: items[0],
    blockedMessage: null,
  };
}

function viewTitle(kind: WorkstationStageViewKind | null): string {
  if (kind === 'run_detail') {
    return 'Run Detail';
  }
  if (kind === 'approval_detail') {
    return 'Approval Detail';
  }
  if (kind === 'artifact_document') {
    return 'Artifact / Document';
  }
  if (kind === 'agent_detail') {
    return 'Agent Detail';
  }
  if (kind === 'application_detail') {
    return 'Application Detail';
  }
  if (kind === 'runtime_target_detail') {
    return 'Runtime Target';
  }
  return 'Dynamic Stage';
}

export function WorkstationStagePane() {
  const { bootstrap, routeManifest, shellProfile, workspaceId } = useWorkspaceBoundary();
  const services = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const { intent } = useWorkstationStageIntentState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeId = useMemo<WorkspaceRouteId | null>(
    () => resolveRouteIdFromHref(workspaceId, pathname),
    [pathname, workspaceId],
  );
  const stageRouteState = useMemo(
    () => readWorkstationStageRouteState(searchParams),
    [searchParams],
  );
  const [state, setState] = useState<StagePaneState>(DEFAULT_STAGE_STATE);

  const agentCatalog = useMemo(
    () => buildAgentCatalog({
      workspaceLabel: bootstrap.workspace.label,
      shellProfileLabel: shellProfile.label,
      role: bootstrap.membership.role,
      workspaceTraits: bootstrap.workspaceTraits,
    }),
    [bootstrap.membership.role, bootstrap.workspace.label, bootstrap.workspaceTraits, shellProfile.label],
  );
  const applicationCatalog = useMemo(
    () => buildApplicationCatalog(routeManifest),
    [routeManifest],
  );
  const runtimeTargetCatalog = useMemo(
    () => buildRuntimeTargetCatalog(bootstrap.runtime.runtimeTargets),
    [bootstrap.runtime.runtimeTargets],
  );

  useEffect(() => {
    if (intent) {
      const nextHref = writeWorkstationStageRouteState(pathname, searchParams, {
        source: 'roster',
        kind: intent.kind,
        id: intent.id,
      });
      const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      if (nextHref !== currentHref) {
        router.replace(nextHref, { scroll: false });
      }
      return;
    }

    if (stageRouteState?.source === 'roster') {
      const nextHref = clearWorkstationStageRouteState(pathname, searchParams);
      const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      if (nextHref !== currentHref) {
        router.replace(nextHref, { scroll: false });
      }
    }
  }, [intent, pathname, router, searchParams, stageRouteState]);

  useEffect(() => {
    let cancelled = false;

    const applyState = (nextState: StagePaneState) => {
      if (!cancelled) {
        setState(nextState);
      }
    };

    const syncRouteSelection = (selection: StageSelection | null) => {
      if (!selection || selection.source !== 'route') {
        return;
      }
      const currentHref = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const nextHref = writeWorkstationStageRouteState(pathname, searchParams, {
        source: selection.source,
        kind: selection.kind,
        id: selection.id,
      });
      if (nextHref !== currentHref) {
        router.replace(nextHref, { scroll: false });
      }
    };

    if (intent) {
      const selection: StageSelection = {
        source: 'roster',
        kind: intent.kind,
        id: intent.id,
        label: intent.label,
        subtitle: intent.subtitle,
        description: intent.description,
        href: intent.href ?? null,
        metadata: intent.metadata,
      };
      applyState({
        isLoading: false,
        statusMessage: null,
        blockedMessage: null,
        activeView: mapStageRouteKindToViewKind(selection.kind),
        activeSelection: selection,
        items: [selection],
      });
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'agents') {
      const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
        agentCatalog,
        stageRouteState?.source === 'roster' || stageRouteState?.kind === 'agent' ? stageRouteState : null,
        'agent',
      );
      applyState({
        isLoading: false,
        statusMessage: agentCatalog.length === 0 ? 'No agent detail is available for this workspace.' : null,
        blockedMessage,
        activeView: activeSelection ? 'agent_detail' : null,
        activeSelection,
        items: agentCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'applications') {
      const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
        applicationCatalog,
        stageRouteState?.source === 'roster' || stageRouteState?.kind === 'application' ? stageRouteState : null,
        'application',
      );
      applyState({
        isLoading: false,
        statusMessage: applicationCatalog.length === 0 ? 'No application detail is available for this workspace.' : null,
        blockedMessage,
        activeView: activeSelection ? 'application_detail' : null,
        activeSelection,
        items: applicationCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    if (stageRouteState?.source === 'roster' && stageRouteState.kind === 'runtime_target') {
      const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
        runtimeTargetCatalog,
        stageRouteState,
        'runtime_target',
      );
      applyState({
        isLoading: false,
        statusMessage: runtimeTargetCatalog.length === 0 ? 'No runtime targets are available for this workspace.' : null,
        blockedMessage,
        activeView: activeSelection ? 'runtime_target_detail' : null,
        activeSelection,
        items: runtimeTargetCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'runs') {
      applyState({
        ...DEFAULT_STAGE_STATE,
        isLoading: true,
      });
      void services.client.listRuns({ limit: 24 })
        .then(normalizeRunItems)
        .then((items) => {
          const selections = buildRunSelections(items);
          const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
            selections,
            stageRouteState?.kind === 'run' ? stageRouteState : null,
            'run',
          );
          syncRouteSelection(activeSelection);
          applyState({
            isLoading: false,
            statusMessage: selections.length === 0 ? 'No runs are available for this workspace yet.' : null,
            blockedMessage,
            activeView: activeSelection ? 'run_detail' : null,
            activeSelection,
            items: selections,
          });
        })
        .catch((error) => {
          applyState({
            isLoading: false,
            statusMessage: error instanceof Error ? error.message : 'Run detail is unavailable right now.',
            blockedMessage: null,
            activeView: null,
            activeSelection: null,
            items: [],
          });
        });
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'approvals') {
      applyState({
        ...DEFAULT_STAGE_STATE,
        isLoading: true,
      });
      void services.client.listApprovals({ limit: 24 })
        .then(normalizeApprovalItems)
        .then((items) => {
          const selections = buildApprovalSelections(items);
          const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
            selections,
            stageRouteState?.kind === 'approval' ? stageRouteState : null,
            'approval',
          );
          syncRouteSelection(activeSelection);
          applyState({
            isLoading: false,
            statusMessage: selections.length === 0 ? 'No approvals are pending for this workspace.' : null,
            blockedMessage,
            activeView: activeSelection ? 'approval_detail' : null,
            activeSelection,
            items: selections,
          });
        })
        .catch((error) => {
          applyState({
            isLoading: false,
            statusMessage: error instanceof Error ? error.message : 'Approval detail is unavailable right now.',
            blockedMessage: null,
            activeView: null,
            activeSelection: null,
            items: [],
          });
        });
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'artifacts') {
      applyState({
        ...DEFAULT_STAGE_STATE,
        isLoading: true,
      });
      void services.client.listArtifacts({ limit: 24 })
        .then(normalizeArtifactItems)
        .then((items) => {
          const selections = buildArtifactSelections(items);
          const { activeSelection, blockedMessage } = resolveSelectionFromCatalog(
            selections,
            stageRouteState?.kind === 'artifact' ? stageRouteState : null,
            'artifact',
          );
          syncRouteSelection(activeSelection);
          applyState({
            isLoading: false,
            statusMessage: selections.length === 0 ? 'No artifacts are available for this workspace yet.' : null,
            blockedMessage,
            activeView: activeSelection ? 'artifact_document' : null,
            activeSelection,
            items: selections,
          });
        })
        .catch((error) => {
          applyState({
            isLoading: false,
            statusMessage: error instanceof Error ? error.message : 'Artifact detail is unavailable right now.',
            blockedMessage: null,
            activeView: null,
            activeSelection: null,
            items: [],
          });
        });
      return () => {
        cancelled = true;
      };
    }

    applyState({
      isLoading: false,
      statusMessage: 'Select an item from pane 2 or open runs, approvals, or artifacts to populate the stage.',
      blockedMessage: null,
      activeView: null,
      activeSelection: null,
      items: [],
    });

    return () => {
      cancelled = true;
    };
  }, [
    agentCatalog,
    applicationCatalog,
    bootstrap.workspace.label,
    intent,
    pathname,
    routeId,
    router,
    runtimeTargetCatalog,
    searchParams,
    services.client,
    stageRouteState,
  ]);

  const stageTitle = viewTitle(state.activeView);

  return (
    <div
      data-workstation-stage="pane"
      style={{
        display: 'grid',
        gap: '1rem',
        padding: '1rem 1.1rem',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: '0.5rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid #dbeafe',
          background: '#eff6ff',
        }}
      >
        <strong style={{ color: '#1d4ed8' }}>{stageTitle}</strong>
        <span style={{ color: '#1e3a8a', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Pane 4 rebuilds from route-safe selection and kernel-scoped intent only.
        </span>
        <span style={{ color: '#1e3a8a', fontSize: '0.82rem' }}>
          Workspace <code>{workspaceId}</code>
        </span>
        <span style={{ color: '#1e3a8a', fontSize: '0.82rem' }}>
          Streams {streamState.notifications.connectionState}/{streamState.activity.connectionState}
        </span>
      </div>

      {state.blockedMessage ? (
        <div
          data-stage-scope-guard="blocked"
          style={{
            display: 'grid',
            gap: '0.3rem',
            padding: '0.9rem 1rem',
            borderRadius: '0.95rem',
            border: '1px solid #fdba74',
            background: '#fff7ed',
          }}
        >
          <strong style={{ color: '#9a3412' }}>Blocked by workspace scope</strong>
          <span style={{ color: '#9a3412', lineHeight: 1.5 }}>{state.blockedMessage}</span>
        </div>
      ) : null}

      {state.statusMessage ? (
        <div
          style={{
            display: 'grid',
            gap: '0.3rem',
            padding: '0.9rem 1rem',
            borderRadius: '0.95rem',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            color: '#334155',
          }}
        >
          {state.statusMessage}
        </div>
      ) : null}

      {state.items.length > 1 ? (
        <section
          style={{
            display: 'grid',
            gap: '0.6rem',
          }}
        >
          <strong style={{ color: '#0f172a' }}>Stage selection</strong>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {state.items.map((item) => {
              const isActive = item.id === state.activeSelection?.id;
              const href = writeWorkstationStageRouteState(pathname, searchParams, {
                source: item.source,
                kind: item.kind,
                id: item.id,
              });
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    router.replace(href, { scroll: false });
                  }}
                  style={{
                    display: 'grid',
                    gap: '0.2rem',
                    textAlign: 'left',
                    padding: '0.75rem 0.85rem',
                    borderRadius: '0.9rem',
                    border: isActive ? '1px solid #0f172a' : '1px solid #e2e8f0',
                    background: isActive ? '#e2e8f0' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <strong style={{ color: '#0f172a' }}>{item.label}</strong>
                  <span style={{ color: '#475569', fontSize: '0.84rem' }}>{item.subtitle}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {state.activeSelection ? (
        <section
          data-stage-view-kind={state.activeView ?? 'none'}
          style={{
            display: 'grid',
            gap: '0.85rem',
            padding: '1rem',
            borderRadius: '1rem',
            border: '1px solid #cbd5e1',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong style={{ color: '#0f172a' }}>{state.activeSelection.label}</strong>
            <span style={{ color: '#475569' }}>{state.activeSelection.subtitle}</span>
          </div>

          <p style={{ margin: 0, color: '#334155', lineHeight: 1.6 }}>
            {state.activeSelection.description}
          </p>

          <dl
            style={{
              margin: 0,
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <dt style={{ color: '#64748b', fontSize: '0.78rem' }}>Stage Source</dt>
              <dd style={{ margin: 0, color: '#0f172a' }}>{state.activeSelection.source}</dd>
            </div>
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <dt style={{ color: '#64748b', fontSize: '0.78rem' }}>Selection Kind</dt>
              <dd style={{ margin: 0, color: '#0f172a' }}>{state.activeSelection.kind.replace('_', ' ')}</dd>
            </div>
            <div style={{ display: 'grid', gap: '0.15rem' }}>
              <dt style={{ color: '#64748b', fontSize: '0.78rem' }}>Selection ID</dt>
              <dd style={{ margin: 0, color: '#0f172a', overflowWrap: 'anywhere' }}>{state.activeSelection.id}</dd>
            </div>
            {state.activeSelection.href ? (
              <div style={{ display: 'grid', gap: '0.15rem' }}>
                <dt style={{ color: '#64748b', fontSize: '0.78rem' }}>Linked Surface</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={state.activeSelection.href}>{state.activeSelection.href}</Link>
                </dd>
              </div>
            ) : null}
          </dl>

          {state.activeSelection.metadata ? (
            <details>
              <summary style={{ cursor: 'pointer', color: '#0f172a', fontWeight: 600 }}>
                Canonical detail payload
              </summary>
              <pre
                style={{
                  margin: '0.85rem 0 0',
                  padding: '0.85rem',
                  borderRadius: '0.85rem',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  overflow: 'auto',
                  fontSize: '0.78rem',
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(state.activeSelection.metadata, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
