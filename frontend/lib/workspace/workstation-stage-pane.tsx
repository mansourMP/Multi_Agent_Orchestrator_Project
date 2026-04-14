'use client';

import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { AppButton, AppNotice } from '@/lib/ui/primitives';
import { WorkstationApprovalDetail } from '@/lib/workspace/workstation-approval-detail';
import { WorkstationArtifactViewer } from '@/lib/workspace/workstation-artifact-viewer';
import { WorkstationRunDetail } from '@/lib/workspace/workstation-run-detail';
import { WorkstationTraceDetail } from '@/lib/workspace/workstation-trace-detail';
import {
  StageDetailField,
  StageDetailFieldGrid,
  StageDetailLayout,
  StageDetailSection,
} from '@/lib/workspace/stage-detail-layout';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
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
        role,
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
      description: 'Document-heavy routing is enabled for this workspace.',
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
      description: 'Administrative controls are available for this workspace.',
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
        subtitle: group.label,
        description: `Dedicated workstation surface for ${route.label}.`,
        href: route.href,
        metadata: {
          groupLabel: group.label,
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
      ? 'Available for workstation execution.'
      : 'Currently unavailable.',
    metadata: {
      runtimeTargetId: target.id,
      kind: target.kind,
      online: target.online,
      preferred: target.preferred,
    },
  }));
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
    return 'Run';
  }
  if (kind === 'trace_detail') {
    return 'Trace';
  }
  if (kind === 'approval_detail') {
    return 'Approval';
  }
  if (kind === 'artifact_document') {
    return 'Artifact';
  }
  if (kind === 'agent_detail') {
    return 'Agent';
  }
  if (kind === 'application_detail') {
    return 'Surface';
  }
  if (kind === 'runtime_target_detail') {
    return 'Runtime target';
  }
  return 'Inspector';
}

function boolLabel(value: unknown): string {
  return value === true ? 'Yes' : value === false ? 'No' : '—';
}

function renderSelectionSpecificSections(selection: StageSelection) {
  const metadata = selection.metadata ?? {};

  if (selection.kind === 'agent') {
    return (
      <StageDetailSection title="Operational context">
        <StageDetailFieldGrid>
          {'role' in metadata ? (
            <StageDetailField label="Role" value={String(metadata.role ?? '—')} />
          ) : null}
          {'operatingMode' in metadata ? (
            <StageDetailField label="Operating mode" value={String(metadata.operatingMode ?? '—')} />
          ) : null}
          {'complianceMode' in metadata ? (
            <StageDetailField label="Compliance mode" value={String(metadata.complianceMode ?? '—')} />
          ) : null}
          {'documentHeavy' in metadata ? (
            <StageDetailField label="Document-heavy" value={boolLabel(metadata.documentHeavy)} />
          ) : null}
          {'adminHeavy' in metadata ? (
            <StageDetailField label="Admin-heavy" value={boolLabel(metadata.adminHeavy)} />
          ) : null}
        </StageDetailFieldGrid>
      </StageDetailSection>
    );
  }

  if (selection.kind === 'application') {
    const capabilities = Array.isArray(metadata.requiredCapabilities)
      ? metadata.requiredCapabilities as unknown[]
      : [];
    return (
      <>
        <StageDetailSection title="Surface routing">
          <StageDetailFieldGrid>
            {'groupLabel' in metadata ? (
              <StageDetailField label="Navigation group" value={String(metadata.groupLabel ?? '—')} />
            ) : null}
            <StageDetailField label="Surface" value={selection.label} />
            <StageDetailField label="Availability" value={selection.href ? 'Ready to open in the workstation' : 'Inspector detail only'} />
          </StageDetailFieldGrid>
        </StageDetailSection>
        {capabilities.length > 0 ? (
          <StageDetailSection title="Required capabilities">
            <div className="app-inline-actions app-inline-actions--tight">
              {capabilities.map((capability) => (
                <span key={String(capability)} className="app-data-badge app-data-badge--neutral">
                  {String(capability)}
                </span>
              ))}
            </div>
          </StageDetailSection>
        ) : null}
      </>
    );
  }

  if (selection.kind === 'runtime_target') {
    return (
      <StageDetailSection title="Runtime availability">
        <StageDetailFieldGrid>
          {'kind' in metadata ? (
            <StageDetailField label="Kind" value={String(metadata.kind ?? '—')} />
          ) : null}
          {'online' in metadata ? (
            <StageDetailField
              label="Online"
              value={boolLabel(metadata.online)}
              tone={metadata.online === true ? 'success' : 'warning'}
            />
          ) : null}
          {'preferred' in metadata ? (
            <StageDetailField label="Preferred" value={boolLabel(metadata.preferred)} />
          ) : null}
        </StageDetailFieldGrid>
      </StageDetailSection>
    );
  }

  return null;
}

function renderSelectionSwitcher(
  items: StageSelection[],
  activeSelectionId: string | null,
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
  router: ReturnType<typeof useRouter>,
) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <StageDetailSection title="Available selections">
      <div className="app-stack-3">
        {items.map((item) => {
          const isActive = item.id === activeSelectionId;
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
              className={`app-card-button${isActive ? ' app-card-button--selected' : ''}`}
            >
              <strong className="app-card-button__title">{item.label}</strong>
              <span className="app-card-button__subtitle">{item.subtitle}</span>
            </button>
          );
        })}
      </div>
    </StageDetailSection>
  );
}

export function WorkstationStagePane() {
  const { bootstrap, routeManifest, shellProfile, workspaceId } = useWorkspaceBoundary();
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
        statusMessage: applicationCatalog.length === 0 ? 'No workspace surface detail is available for this workspace.' : null,
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
      if (stageRouteState?.kind === 'run' || stageRouteState?.kind === 'trace') {
        const selection: StageSelection = {
          source: 'route',
          kind: stageRouteState.kind,
          id: stageRouteState.id,
          label: stageRouteState.id,
          subtitle: stageRouteState.kind === 'trace' ? 'Trace detail' : 'Run detail',
          description: stageRouteState.kind === 'trace'
            ? `Canonical replay for trace ${stageRouteState.id}.`
            : `Canonical detail for run ${stageRouteState.id}.`,
        };
        applyState({
          isLoading: false,
          statusMessage: null,
          blockedMessage: null,
          activeView: stageRouteState.kind === 'trace' ? 'trace_detail' : 'run_detail',
          activeSelection: selection,
          items: [selection],
        });
      } else {
        applyState({
          isLoading: false,
          statusMessage: 'Select a run or trace to inspect detail.',
          blockedMessage: null,
          activeView: null,
          activeSelection: null,
          items: [],
        });
      }
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'approvals') {
      if (stageRouteState?.kind === 'approval') {
        const selection: StageSelection = {
          source: 'route',
          kind: 'approval',
          id: stageRouteState.id,
          label: stageRouteState.id,
          subtitle: 'Approval detail',
          description: `Canonical detail for approval ${stageRouteState.id}.`,
        };
        applyState({
          isLoading: false,
          statusMessage: null,
          blockedMessage: null,
          activeView: 'approval_detail',
          activeSelection: selection,
          items: [selection],
        });
      } else {
        applyState({
          isLoading: false,
          statusMessage: 'Select an approval to inspect detail.',
          blockedMessage: null,
          activeView: null,
          activeSelection: null,
          items: [],
        });
      }
      return () => {
        cancelled = true;
      };
    }

    if (routeId === 'artifacts') {
      if (stageRouteState?.kind === 'artifact') {
        const selection: StageSelection = {
          source: 'route',
          kind: 'artifact',
          id: stageRouteState.id,
          label: stageRouteState.id,
          subtitle: 'Artifact detail',
          description: `Canonical detail for artifact ${stageRouteState.id}.`,
        };
        applyState({
          isLoading: false,
          statusMessage: null,
          blockedMessage: null,
          activeView: 'artifact_document',
          activeSelection: selection,
          items: [selection],
        });
      } else {
        applyState({
          isLoading: false,
          statusMessage: 'Select an artifact to inspect detail.',
          blockedMessage: null,
          activeView: null,
          activeSelection: null,
          items: [],
        });
      }
      return () => {
        cancelled = true;
      };
    }

    applyState({
      isLoading: false,
      statusMessage: 'Select an item from the workspace inventory or open a run, approval, or artifact to populate the inspector.',
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
    stageRouteState,
  ]);

  if (state.activeSelection && state.activeView === 'run_detail') {
    return <WorkstationRunDetail runId={state.activeSelection.id} />;
  }

  if (state.activeSelection && state.activeView === 'trace_detail') {
    return <WorkstationTraceDetail traceId={state.activeSelection.id} />;
  }

  if (state.activeSelection && state.activeView === 'approval_detail') {
    return <WorkstationApprovalDetail approvalId={state.activeSelection.id} />;
  }

  if (state.activeSelection && state.activeView === 'artifact_document') {
    return <WorkstationArtifactViewer artifactId={state.activeSelection.id} />;
  }

  if (!state.activeSelection) {
    return (
      <div data-workstation-stage="pane" className="app-stack-4">
        {state.blockedMessage ? (
          <AppNotice tone="warning">{state.blockedMessage}</AppNotice>
        ) : null}
        <StageDetailLayout
          eyebrow="Inspector"
          title="No active selection"
          subtitle={state.statusMessage ?? 'Select an item to inspect detail.'}
        >
          {renderSelectionSwitcher(state.items, null, pathname, searchParams, router)}
        </StageDetailLayout>
      </div>
    );
  }

  return (
    <div data-workstation-stage="pane" className="app-stack-4">
      <StageDetailLayout
        eyebrow={viewTitle(state.activeView)}
        title={state.activeSelection.label}
        subtitle={state.activeSelection.subtitle}
        notice={state.blockedMessage
          ? { tone: 'warning', message: state.blockedMessage }
          : state.statusMessage
            ? { tone: 'neutral', message: state.statusMessage }
            : null}
        actions={state.activeSelection.href ? (
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              router.push(state.activeSelection?.href ?? routeManifest.defaultRoute);
            }}
          >
            Open surface
          </AppButton>
        ) : undefined}
      >
        {renderSelectionSwitcher(
          state.items,
          state.activeSelection.id,
          pathname,
          searchParams,
          router,
        )}

        <StageDetailSection title="Overview" description={state.activeSelection.description}>
          <StageDetailFieldGrid>
            <StageDetailField label="Workspace" value={bootstrap.workspace.label} />
            <StageDetailField label="Category" value={state.activeSelection.kind.replace(/_/g, ' ')} />
            <StageDetailField label="Context" value={state.activeSelection.subtitle} />
            <StageDetailField
              label="Availability"
              value={state.activeSelection.href ? 'Workspace surface available from this view' : 'Inspector detail only'}
            />
          </StageDetailFieldGrid>
        </StageDetailSection>

        {renderSelectionSpecificSections(state.activeSelection)}
      </StageDetailLayout>
    </div>
  );
}
