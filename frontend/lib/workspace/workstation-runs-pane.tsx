'use client';

import { useEffect, useMemo, useState } from 'react';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type RunRecord = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  result_summary?: string | null;
  created_at?: string | null;
};

type RunListItem = {
  id: string;
  preview: string;
  occurredAt: string | null;
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeRunItems(payload: unknown): RunRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is RunRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function runPreviewLabel(run: RunRecord): string {
  const directCandidates = [
    run.first_user_message,
    run.message,
    run.prompt,
    run.input_preview,
    run.summary,
    run.result_summary,
    run.title,
  ];
  for (const candidate of directCandidates) {
    const value = readString(candidate, '');
    if (value) {
      return value;
    }
  }
  const metadata = run.metadata && typeof run.metadata === 'object' ? run.metadata as Record<string, unknown> : {};
  const metadataCandidates = [
    metadata.first_user_message,
    metadata.message,
    metadata.prompt,
    metadata.input_preview,
    metadata.summary,
  ];
  for (const candidate of metadataCandidates) {
    const value = readString(candidate, '');
    if (value) {
      return value;
    }
  }
  return 'Sage run';
}

function toRunListItems(runs: RunRecord[]): RunListItem[] {
  return runs
    .map((run, index) => ({
      id: readString(run.run_id, `run-${index}`),
      preview: runPreviewLabel(run),
      occurredAt: readString(run.created_at) || null,
    }))
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return 'Just now';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  const diffMinutes = Math.round((parsed - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, 'day');
  }
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateSeparator(value: string | null): string {
  if (!value) {
    return 'Earlier';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function groupRunsByDate(items: RunListItem[]): Array<{ label: string; items: RunListItem[] }> {
  const groups = new Map<string, RunListItem[]>();
  items.forEach((item) => {
    const label = formatDateSeparator(item.occurredAt);
    const nextItems = groups.get(label) ?? [];
    nextItems.push(item);
    groups.set(label, nextItems);
  });
  return Array.from(groups.entries()).map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

export function WorkstationRunsPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const runsPayload = await services.client.listRuns({ limit: 80 });
    setRuns(toRunListItems(normalizeRunItems(runsPayload)));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
        setIsLoading(false);
      }
    });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
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
      setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }
    if (selectedRunId && runs.some((item) => item.id === selectedRunId)) {
      return;
    }
    setSelectedRunId(runs[0].id);
  }, [runs, selectedRunId]);

  const groupedRuns = useMemo(() => groupRunsByDate(runs), [runs]);

  return (
    <WorkstationSurfaceRoot surface="runs">
      <main className="app-runs-minimal-page" data-workstation-surface="runs-minimal">
        {error ? <div className="app-surface-inline-status">{error}</div> : null}
        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="3.5rem" />
            <SkeletonBlock height="3.5rem" />
            <SkeletonBlock height="3.5rem" />
          </div>
        ) : runs.length === 0 ? (
          <EmptyPanel
            title="No runs yet"
            body="Send a message to Sage to start your first run."
          />
        ) : (
          <div className="app-runs-minimal-list">
            {groupedRuns.map((group) => (
              <section key={group.label} className="app-runs-minimal-group">
                <div className="app-runs-minimal-group__label">{group.label}</div>
                {group.items.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={`app-runs-minimal-row${selectedRunId === run.id ? ' app-runs-minimal-row--selected' : ''}`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <span className="app-runs-minimal-row__preview" title={run.preview}>{run.preview}</span>
                    <span className="app-runs-minimal-row__time">{formatRelativeTime(run.occurredAt)}</span>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
