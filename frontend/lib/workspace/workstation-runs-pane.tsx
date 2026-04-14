'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { DataBadge, DataTable, DataTableCell, DataTableHeader, DataTableHeaderCell, DataTableRow } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { WorkstationTraceDetail } from '@/lib/workspace/workstation-trace-detail';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  readWorkstationStageRouteState,
  writeWorkstationStageRouteState,
} from '@/lib/workspace/workstation-stage-router';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type RunRecord = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  result_summary?: string | null;
};

type TraceRecord = Record<string, unknown> & {
  id?: string | null;
  root_agent_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  outcome?: string | null;
  runtime_target?: string | null;
  provider?: string | null;
  model?: string | null;
};

type WorkItemRecord =
  | {
      kind: 'run';
      id: string;
      title: string;
      subtitle: string;
      status: string;
      recordedAt: string | null;
      sortAt: string;
      run: RunRecord;
    }
  | {
      kind: 'trace';
      id: string;
      title: string;
      subtitle: string;
      status: string;
      recordedAt: string | null;
      sortAt: string;
      trace: TraceRecord;
    };

function normalizeRunItems(payload: unknown): RunRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is RunRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeTraceItems(payload: unknown): TraceRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is TraceRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'No timestamp recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function itemTimestampValue(item: WorkItemRecord): string {
  return item.sortAt;
}

function sortWorkItems(items: WorkItemRecord[]): WorkItemRecord[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(itemTimestampValue(left));
    const rightTime = Date.parse(itemTimestampValue(right));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) {
      return Number.isFinite(rightTime) ? 1 : -1;
    }
    return right.id.localeCompare(left.id);
  });
}

function runTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'running' || status === 'queued' || status === 'queued_local') {
    return 'accent';
  }
  if (status === 'waiting_for_input') {
    return 'warning';
  }
  if (status === 'completed') {
    return 'success';
  }
  if (status === 'failed' || status === 'rejected' || status === 'aborted' || status === 'canceled' || status === 'cancelled') {
    return 'danger';
  }
  return 'neutral';
}

function traceTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'success' || normalized === 'completed') {
    return 'success';
  }
  if (normalized === 'failed' || normalized === 'error') {
    return 'danger';
  }
  if (normalized === 'partial' || normalized === 'needs_input') {
    return 'warning';
  }
  if (normalized === 'running' || normalized === 'open') {
    return 'accent';
  }
  return 'neutral';
}

function summarizeTrace(trace: TraceRecord): string {
  const rootAgentId = readString(trace.root_agent_id, 'sage');
  const rootAgentLabel =
    rootAgentId === 'sage'
      ? 'Sage'
      : rootAgentId.startsWith('specialist:')
        ? 'Specialist'
        : rootAgentId.startsWith('deployed:')
          ? 'Deployed agent'
          : 'Agent';
  const runtime = readString(trace.runtime_target, 'runtime');
  const provider = readString(trace.provider, 'provider');
  const model = readString(trace.model, 'model');
  return `${rootAgentLabel} trace · ${runtime} · ${provider} · ${model}`;
}

function toWorkItems(runs: RunRecord[], traces: TraceRecord[]): WorkItemRecord[] {
  const runItems: WorkItemRecord[] = runs.map((run, index) => {
    const runId = String(run.run_id ?? '').trim() || `run-${index}`;
    return {
      kind: 'run',
      id: runId,
      title: runId,
      subtitle: readString(run.result_summary, 'Canonical run record'),
      status: readString(run.status, 'unknown'),
      recordedAt: typeof run.created_at === 'string' ? run.created_at : null,
      sortAt: typeof run.created_at === 'string' ? run.created_at : '',
      run,
    };
  });
  const traceItems: WorkItemRecord[] = traces.map((trace, index) => {
    const traceId = String(trace.id ?? '').trim() || `trace-${index}`;
    const recordedAt = typeof trace.started_at === 'string'
      ? trace.started_at
      : typeof trace.finished_at === 'string'
        ? trace.finished_at
        : null;
    return {
      kind: 'trace',
      id: traceId,
      title: traceId,
      subtitle: summarizeTrace(trace),
      status: readString(trace.outcome, 'replay'),
      recordedAt,
      sortAt: recordedAt ?? '',
      trace,
    };
  });
  return sortWorkItems([...traceItems, ...runItems]);
}

function RunSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Queue" title="Loading run history">
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
          <SkeletonBlock height="2.8rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading run detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationRunsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stageRouteState = useMemo(() => readWorkstationStageRouteState(searchParams), [searchParams]);
  const [items, setItems] = useState<WorkItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const [runsPayload, tracesPayload] = await Promise.all([
      services.client.listRuns({ limit: 80 }),
      services.client.listTraces({ limit: 80 }),
    ]);
    setItems(toWorkItems(
      normalizeRunItems(runsPayload),
      normalizeTraceItems(tracesPayload),
    ));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true)
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Run history is unavailable.');
          setIsLoading(false);
        }
      });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Run history is unavailable.');
          setIsLoading(false);
        }
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Run history is unavailable.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  const selectedRun = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    if (stageRouteState?.kind === 'run' || stageRouteState?.kind === 'trace') {
      return items.find((item) => item.kind === stageRouteState.kind && item.id === stageRouteState.id) ?? items[0];
    }
    return items[0];
  }, [items, stageRouteState]);

  const selectedRunId = selectedRun?.id ?? '';
  const inspectorFocused = (
    (stageRouteState?.kind === 'run' || stageRouteState?.kind === 'trace')
    && stageRouteState.id === selectedRunId
    && stageRouteState.kind === selectedRun?.kind
  );

  const focusItem = (item: WorkItemRecord) => {
    router.replace(
      writeWorkstationStageRouteState(pathname, searchParams, {
        source: 'route',
        kind: item.kind,
        id: item.id,
      }),
      { scroll: false },
    );
  };

  return (
    <WorkstationSurfaceRoot surface="runs">
      <ListDetailShell
        title="Runs"
        subtitle="Canonical execution history and current run focus for this workspace."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {error ? (
          <StateBanner
            tone="danger"
            title="Run history is degraded"
            detail="The queue could not be fully refreshed from canonical runtime state."
          >
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <RunSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <ListDetailPanel
                eyebrow="Queue"
                title="Execution history"
                subtitle={`${items.length} tracked runs and traces in the canonical workspace queue.`}
              >
                {items.length === 0 ? (
                  <EmptyPanel
                    title="No work recorded"
                    body="Runs and trace replays will populate here once the first workspace turn launches work."
                  />
                ) : (
                  <DataTable>
                    <DataTableHeader columns="minmax(0, 1.25fr) minmax(0, 0.6fr) minmax(0, 0.7fr) minmax(0, 0.9fr) auto">
                      <DataTableHeaderCell>Item</DataTableHeaderCell>
                      <DataTableHeaderCell>Type</DataTableHeaderCell>
                      <DataTableHeaderCell>Status</DataTableHeaderCell>
                      <DataTableHeaderCell>Recorded</DataTableHeaderCell>
                      <DataTableHeaderCell align="end">Focus</DataTableHeaderCell>
                    </DataTableHeader>
                    {items.map((item, index) => {
                      const workId = item.id || `work-${index}`;
                      const selected = workId === selectedRunId && item.kind === selectedRun?.kind;
                      return (
                        <DataTableRow
                          key={`${item.kind}:${workId}`}
                          columns="minmax(0, 1.25fr) minmax(0, 0.6fr) minmax(0, 0.7fr) minmax(0, 0.9fr) auto"
                          selected={selected}
                          onClick={() => {
                            focusItem(item);
                          }}
                        >
                          <DataTableCell
                            primary={workId}
                            secondary={item.subtitle}
                            mono
                          />
                          <DataTableCell
                            primary={(
                              <DataBadge tone={item.kind === 'trace' ? 'accent' : 'neutral'}>
                                {item.kind}
                              </DataBadge>
                            )}
                          />
                          <DataTableCell
                            primary={(
                              <DataBadge tone={item.kind === 'trace' ? traceTone(item.status) : runTone(item.status)}>
                                {item.status}
                              </DataBadge>
                            )}
                          />
                          <DataTableCell primary={formatTimestamp(item.recordedAt)} />
                          <DataTableCell
                            align="end"
                            primary={selected ? <DataBadge tone="accent">Selected</DataBadge> : <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.78rem' }}>Inspect</span>}
                          />
                        </DataTableRow>
                      );
                    })}
                  </DataTable>
                )}
              </ListDetailPanel>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={selectedRunId || 'No work selected'}
                subtitle={selectedRun ? selectedRun.subtitle : 'Choose a run or trace from the queue to focus the inspector.'}
                actions={selectedRunId ? (
                  <AppButton
                    type="button"
                    tone={inspectorFocused ? 'secondary' : 'primary'}
                    onClick={() => {
                      if (selectedRun) {
                        focusItem(selectedRun);
                      }
                    }}
                  >
                    {inspectorFocused ? 'Inspector focused' : 'Focus in inspector'}
                  </AppButton>
                ) : undefined}
              >
                {!selectedRun ? (
                  <EmptyPanel
                    title="No selected work item"
                    body="As soon as execution history is available, the first run or trace will be surfaced here for quick context."
                  />
                ) : selectedRun.kind === 'trace' ? (
                  <>
                    <StateBanner
                      tone={traceTone(selectedRun.status) === 'accent' ? 'neutral' : traceTone(selectedRun.status) as 'neutral' | 'success' | 'warning' | 'danger'}
                      title={selectedRun.status}
                      detail={formatTimestamp(selectedRun.recordedAt)}
                    >
                      {selectedRun.subtitle}
                    </StateBanner>
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                      <div style={{ display: 'grid', gap: '0.18rem' }}>
                        <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650 }}>Trace id</span>
                        <span style={{ color: 'var(--app-text-primary)', fontFamily: 'var(--app-font-mono)', overflowWrap: 'anywhere' }}>{selectedRunId}</span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.18rem' }}>
                        <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650 }}>Root agent</span>
                        <span style={{ color: 'var(--app-text-secondary)' }}>{readString(selectedRun.trace.root_agent_id, 'sage')}</span>
                      </div>
                    </div>
                    <WorkstationTraceDetail traceId={selectedRunId} embedded />
                  </>
                ) : (
                  <>
                    <StateBanner
                      tone={runTone(selectedRun.status) === 'accent' ? 'neutral' : runTone(selectedRun.status) as 'neutral' | 'success' | 'warning' | 'danger'}
                      title={selectedRun.status}
                      detail={formatTimestamp(selectedRun.recordedAt)}
                    >
                      {selectedRun.subtitle}
                    </StateBanner>
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                      <div style={{ display: 'grid', gap: '0.18rem' }}>
                        <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650 }}>Run id</span>
                        <span style={{ color: 'var(--app-text-primary)', fontFamily: 'var(--app-font-mono)', overflowWrap: 'anywhere' }}>{selectedRunId}</span>
                      </div>
                      <div style={{ display: 'grid', gap: '0.18rem' }}>
                        <span style={{ color: 'var(--app-text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650 }}>Recorded</span>
                        <span style={{ color: 'var(--app-text-secondary)' }}>{formatTimestamp(selectedRun.recordedAt)}</span>
                      </div>
                    </div>
                  </>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
