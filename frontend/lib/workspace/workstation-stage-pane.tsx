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

function buildWorkspaceAreaCatalog(
  routeManifest: ReturnType<typeof useWorkspaceBoundary>['routeManifest'],
): StageCatalogEntry[] {
  const items: StageCatalogEntry[] = [];
  const sageRoute = routeManifest.routeIndex.chat ?? null;
  const servicesRoute = routeManifest.routeIndex.deploy ?? null;
  const studioRoute = routeManifest.routeIndex.studio ?? null;
  const integrationsRoute = routeManifest.routeIndex.channels ?? null;

  if (sageRoute) {
    items.push({
      source: 'roster',
      kind: 'workspace_area',
      id: 'workspace_area:sage',
      label: 'Sage',
      subtitle: 'Primary personal agent',
      description: servicesRoute
        ? 'Sage owns chat, memory, approvals, runs, and structured Sage services.'
        : 'Sage owns chat, memory, approvals, and runs.',
      href: sageRoute.href,
      metadata: {
        areaId: 'sage',
        routeId: sageRoute.id,
        primarySurface: sageRoute.label,
        supportingRoutes: ['Home', 'Chat', 'Runs', 'Approvals', 'Artifacts', 'Notifications', 'Activity'],
        requiredCapabilities: [...new Set([...(sageRoute.requiredCapabilities ?? []), ...(servicesRoute?.requiredCapabilities ?? [])])],
      },
    });
  }

  if (studioRoute) {
    items.push({
      source: 'roster',
      kind: 'workspace_area',
      id: 'workspace_area:studio',
      label: 'Studio',
      subtitle: 'Telegram specialist agents',
      description: integrationsRoute
        ? 'Studio creates, binds, deploys, and monitors specialist agents with explicit Telegram readiness.'
        : 'Studio creates and monitors specialist agents for this workspace.',
      href: studioRoute.href,
      metadata: {
        areaId: 'studio',
        routeId: studioRoute.id,
        primarySurface: studioRoute.label,
        supportingRoutes: ['Agents', 'Channels', 'Inbox', 'Deploy'],
        requiredCapabilities: [...new Set([...(studioRoute.requiredCapabilities ?? []), ...(integrationsRoute?.requiredCapabilities ?? [])])],
      },
    });
  }

  return items;
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
  if (kind === 'workspace_area_detail') {
    return 'Workspace area';
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

  if (selection.kind === 'workspace_area') {
    const capabilities = Array.isArray(metadata.requiredCapabilities)
      ? metadata.requiredCapabilities as unknown[]
      : [];
    return (
      <>
        <StageDetailSection title="Area routing">
          <StageDetailFieldGrid>
            {'areaId' in metadata ? (
              <StageDetailField label="Product" value={String(metadata.areaId ?? '—')} />
            ) : null}
            {'primarySurface' in metadata ? (
              <StageDetailField label="Primary surface" value={String(metadata.primarySurface ?? '—')} />
            ) : null}
            <StageDetailField label="Availability" value={selection.href ? 'Ready to open in the workspace' : 'Inspector detail only'} />
          </StageDetailFieldGrid>
        </StageDetailSection>
        {Array.isArray(metadata.supportingRoutes) && metadata.supportingRoutes.length > 0 ? (
          <StageDetailSection title="Supporting surfaces">
            <div className="app-inline-actions app-inline-actions--tight">
              {(metadata.supportingRoutes as unknown[]).map((route) => (
                <span key={String(route)} className="app-data-badge app-data-badge--neutral">
                  {String(route)}
                </span>
              ))}
            </div>
          </StageDetailSection>
        ) : null}
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

function resolveWorkspaceAreaForRoute(
  routeId: WorkspaceRouteId | null,
  items: StageSelection[],
): StageSelection | null {
  if (!routeId) {
    return null;
  }

  const routeToAreaId =
    routeId === 'studio' || routeId === 'channels' || routeId === 'inbox' || routeId === 'deploy'
      ? 'studio'
      : routeId === 'chat'
        || routeId === 'runs'
        || routeId === 'approvals'
        || routeId === 'artifacts'
        || routeId === 'notifications'
        || routeId === 'activity'
          ? 'sage'
          : null;

  if (!routeToAreaId) {
    return null;
  }

  return items.find((item) => item.metadata?.['areaId'] === routeToAreaId) ?? null;
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
  const { bootstrap, routeManifest, workspaceId } = useWorkspaceBoundary();
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

  const workspaceAreaCatalog = useMemo(
    () => buildWorkspaceAreaCatalog(routeManifest),
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

    const workspaceAreaSelection = (() => {
      if (stageRouteState?.source === 'roster' && stageRouteState.kind === 'workspace_area') {
        return resolveSelectionFromCatalog(
          workspaceAreaCatalog,
          stageRouteState,
          'workspace_area',
        );
      }

      const routeSelection = resolveWorkspaceAreaForRoute(routeId, workspaceAreaCatalog);
      return {
        activeSelection: routeSelection,
        blockedMessage: null,
      };
    })();

    if (workspaceAreaSelection.activeSelection || workspaceAreaCatalog.length > 0) {
      applyState({
        isLoading: false,
        statusMessage: workspaceAreaCatalog.length === 0 ? 'No workspace product detail is available for this workspace.' : null,
        blockedMessage: workspaceAreaSelection.blockedMessage,
        activeView: workspaceAreaSelection.activeSelection ? 'workspace_area_detail' : null,
        activeSelection: workspaceAreaSelection.activeSelection,
        items: workspaceAreaCatalog,
      });
      return () => {
        cancelled = true;
      };
    }

    applyState({
      isLoading: false,
      statusMessage: 'Select Sage, Studio, or a runtime target to populate the inspector.',
      blockedMessage: null,
      activeView: null,
      activeSelection: null,
      items: [],
    });

    return () => {
      cancelled = true;
    };
  }, [
    intent,
    pathname,
    routeId,
    router,
    runtimeTargetCatalog,
    searchParams,
    stageRouteState,
    workspaceAreaCatalog,
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
