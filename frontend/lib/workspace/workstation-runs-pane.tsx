'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type RunRecord = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  result_summary?: string | null;
  created_at?: string | null;
};

type ActivityRecord = Record<string, unknown> & {
  id?: string | null;
  title?: string | null;
  summary?: string | null;
  action?: string | null;
  event_class?: string | null;
  created_at?: string | null;
};

type SageTaskRecord = {
  id: string;
  kind: 'run' | 'event';
  title: string;
  subtitle: string;
  status: string;
  occurredAt: string | null;
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

function normalizeActivityItems(payload: unknown): ActivityRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ActivityRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
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

function taskTone(task: SageTaskRecord): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const status = task.status.trim().toLowerCase();
  if (task.kind === 'event') {
    if (status.includes('error') || status.includes('failed')) {
      return 'danger';
    }
    if (status.includes('approval')) {
      return 'warning';
    }
    if (status.includes('run')) {
      return 'accent';
    }
    return 'neutral';
  }
  if (status === 'running' || status === 'queued' || status === 'queued_local') {
    return 'accent';
  }
  if (status === 'waiting_for_input' || status === 'pending') {
    return 'warning';
  }
  if (status === 'completed' || status === 'success') {
    return 'success';
  }
  if (status === 'failed' || status === 'rejected' || status === 'aborted' || status === 'canceled' || status === 'cancelled') {
    return 'danger';
  }
  return 'neutral';
}

function toSageTasks(runs: RunRecord[], activity: ActivityRecord[]): SageTaskRecord[] {
  const runTasks = runs.map((run, index): SageTaskRecord => {
    const runId = String(run.run_id ?? '').trim() || `run-${index}`;
    return {
      id: `run:${runId}`,
      kind: 'run',
      title: runId,
      subtitle: readString(run.result_summary, 'Sage task'),
      status: readString(run.status, 'unknown'),
      occurredAt: typeof run.created_at === 'string' ? run.created_at : null,
    };
  });

  const activityTasks = activity.map((item, index): SageTaskRecord => {
    const eventId = String(item.id ?? `event-${index}`).trim();
    return {
      id: `event:${eventId}`,
      kind: 'event',
      title: readString(item.title ?? item.action, 'Activity update'),
      subtitle: readString(item.summary, 'No summary available yet.'),
      status: readString(item.event_class, 'event'),
      occurredAt: typeof item.created_at === 'string' ? item.created_at : null,
    };
  });

  return [...runTasks, ...activityTasks].sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function isActiveRunStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === 'running' || normalized === 'queued' || normalized === 'queued_local' || normalized === 'waiting_for_input';
}

export function WorkstationRunsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const { workspaceId } = useWorkspaceBoundary();
  const router = useRouter();
  const [tasks, setTasks] = useState<SageTaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const [runsPayload, activityPayload] = await Promise.all([
      services.client.listRuns({ limit: 80 }),
      services.client.listActivityTimeline({ limit: 80 }),
    ]);
    setTasks(toSageTasks(normalizeRunItems(runsPayload), normalizeActivityItems(activityPayload)));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (cancelled) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Tasks are unavailable right now.');
      setIsLoading(false);
    });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : 'Tasks are unavailable right now.');
        setIsLoading(false);
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
      setError(loadError instanceof Error ? loadError.message : 'Tasks are unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (selectedTaskId && tasks.some((item) => item.id === selectedTaskId)) {
      return;
    }
    setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, tasks]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const runTaskCount = useMemo(
    () => tasks.filter((task) => task.kind === 'run').length,
    [tasks],
  );
  const eventTaskCount = useMemo(
    () => tasks.filter((task) => task.kind === 'event').length,
    [tasks],
  );
  const activeRunCount = useMemo(
    () => tasks.filter((task) => task.kind === 'run' && isActiveRunStatus(task.status)).length,
    [tasks],
  );

  return (
    <WorkstationSurfaceRoot surface="runs">
      <WorkstationSurfaceCard
        title="Tasks"
        description="Track what Sage is doing and what needs your attention."
        actions={(
          <div className="app-inline-actions">
            <WorkstationActionButton
              type="button"
              tone="secondary"
              onClick={() => {
                void refresh(false);
              }}
            >
              Refresh
            </WorkstationActionButton>
            <WorkstationActionButton
              type="button"
              onClick={() => {
                router.push(`/w/${encodeURIComponent(workspaceId)}/sage`);
              }}
            >
              Open Sage
            </WorkstationActionButton>
          </div>
        )}
      >
        {error ? <WorkstationSurfaceNotice tone="danger">{error}</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="Active tasks"
            value={String(activeRunCount)}
            hint="Running now or waiting for your input"
          />
          <WorkstationSurfaceStat
            label="Task history"
            value={String(runTaskCount)}
            hint="Recent work Sage has handled"
          />
          <WorkstationSurfaceStat
            label="Activity updates"
            value={String(eventTaskCount)}
            hint="Recent updates and notable changes"
          />
        </WorkstationSurfaceStatGrid>

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyPanel
            title="No tasks yet"
            body="Your first message to Sage will create task history here."
          />
        ) : (
          <div className="app-stack-3">
            {tasks.map((task) => {
              const selected = task.id === selectedTaskId;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}
                >
                  <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                    <strong className="app-card-button__title">{task.title}</strong>
                    <div className="app-inline-actions app-inline-actions--tight">
                      <DataBadge tone={task.kind === 'run' ? 'accent' : 'neutral'}>
                        {task.kind === 'run' ? 'Task' : 'Update'}
                      </DataBadge>
                      <DataBadge tone={taskTone(task)}>{task.status}</DataBadge>
                    </div>
                  </div>
                  <span className="app-card-button__subtitle">{task.subtitle}</span>
                  <span className="app-card-button__meta">{formatTimestamp(task.occurredAt)}</span>
                </button>
              );
            })}
          </div>
        )}
      </WorkstationSurfaceCard>

      <WorkstationSurfaceCard
        title={selectedTask ? selectedTask.title : 'Task detail'}
        description={selectedTask ? 'Details for the selected task.' : 'Select a task to view details.'}
      >
        {!selectedTask ? (
          <EmptyPanel
            title="No task selected"
            body="Select a task from the list to see its details."
          />
        ) : (
          <div className="app-meta-list">
            <div className="app-meta-item">
              <span className="app-meta-label">Type</span>
              <span className="app-meta-value app-meta-value--secondary">
                {selectedTask.kind === 'run' ? 'Sage task' : 'Activity update'}
              </span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Status</span>
              <span className="app-meta-value app-meta-value--secondary">{selectedTask.status}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Summary</span>
              <span className="app-meta-value app-meta-value--body">{selectedTask.subtitle}</span>
            </div>
            <div className="app-meta-item">
              <span className="app-meta-label">Recorded</span>
              <span className="app-meta-value app-meta-value--secondary">{formatTimestamp(selectedTask.occurredAt)}</span>
            </div>
          </div>
        )}
      </WorkstationSurfaceCard>
    </WorkstationSurfaceRoot>
  );
}
