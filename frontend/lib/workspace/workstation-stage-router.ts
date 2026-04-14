'use client';

export type WorkstationStageRouteSource = 'route' | 'roster';

export type WorkstationStageRouteKind =
  | 'run'
  | 'trace'
  | 'approval'
  | 'artifact'
  | 'agent'
  | 'application'
  | 'runtime_target';

export type WorkstationStageViewKind =
  | 'run_detail'
  | 'trace_detail'
  | 'approval_detail'
  | 'artifact_document'
  | 'agent_detail'
  | 'application_detail'
  | 'runtime_target_detail';

export type WorkstationStageRouteState = {
  source: WorkstationStageRouteSource;
  kind: WorkstationStageRouteKind;
  id: string;
};

type SearchParamsLike = {
  get: (name: string) => string | null;
  toString: () => string;
};

const STAGE_SOURCE_KEY = 'stage_source';
const STAGE_KIND_KEY = 'stage_kind';
const STAGE_ID_KEY = 'stage_id';

function normalizeStageSource(value: string | null | undefined): WorkstationStageRouteSource | null {
  return value === 'route' || value === 'roster' ? value : null;
}

function normalizeStageKind(value: string | null | undefined): WorkstationStageRouteKind | null {
  if (
    value === 'run'
    || value === 'trace'
    || value === 'approval'
    || value === 'artifact'
    || value === 'agent'
    || value === 'application'
    || value === 'runtime_target'
  ) {
    return value;
  }
  return null;
}

export function readWorkstationStageRouteState(
  searchParams: SearchParamsLike,
): WorkstationStageRouteState | null {
  const source = normalizeStageSource(searchParams.get(STAGE_SOURCE_KEY));
  const kind = normalizeStageKind(searchParams.get(STAGE_KIND_KEY));
  const id = String(searchParams.get(STAGE_ID_KEY) ?? '').trim();

  if (!source || !kind || !id) {
    return null;
  }

  return {
    source,
    kind,
    id,
  };
}

export function clearWorkstationStageRouteState(
  pathname: string,
  searchParams: SearchParamsLike,
): string {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete(STAGE_SOURCE_KEY);
  nextParams.delete(STAGE_KIND_KEY);
  nextParams.delete(STAGE_ID_KEY);
  const nextQuery = nextParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function writeWorkstationStageRouteState(
  pathname: string,
  searchParams: SearchParamsLike,
  nextState: WorkstationStageRouteState,
): string {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.set(STAGE_SOURCE_KEY, nextState.source);
  nextParams.set(STAGE_KIND_KEY, nextState.kind);
  nextParams.set(STAGE_ID_KEY, nextState.id);
  const nextQuery = nextParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function mapStageRouteKindToViewKind(
  kind: WorkstationStageRouteKind,
): WorkstationStageViewKind {
  if (kind === 'run') {
    return 'run_detail';
  }
  if (kind === 'trace') {
    return 'trace_detail';
  }
  if (kind === 'approval') {
    return 'approval_detail';
  }
  if (kind === 'artifact') {
    return 'artifact_document';
  }
  if (kind === 'agent') {
    return 'agent_detail';
  }
  if (kind === 'application') {
    return 'application_detail';
  }
  return 'runtime_target_detail';
}
