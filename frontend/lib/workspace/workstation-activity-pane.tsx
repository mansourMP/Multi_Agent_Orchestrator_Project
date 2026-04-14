'use client';

import { useEffect, useMemo, useState } from 'react';

import { AppButton } from '@/lib/ui/primitives';
import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type ActivityRecord = Record<string, unknown> & {
  id?: string | null;
  title?: string | null;
  summary?: string | null;
  action?: string | null;
  event_class?: string | null;
  created_at?: string | null;
};

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

function eventTone(value: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'accent' {
  const eventClass = String(value ?? '').trim().toLowerCase();
  if (eventClass.includes('error') || eventClass.includes('failure')) {
    return 'danger';
  }
  if (eventClass.includes('approval') || eventClass.includes('operator')) {
    return 'warning';
  }
  if (eventClass.includes('run') || eventClass.includes('execution')) {
    return 'accent';
  }
  return 'neutral';
}

function ActivitySkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <ListDetailPanel eyebrow="Feed" title="Loading activity timeline">
          <SkeletonBlock height="4.8rem" />
          <SkeletonBlock height="4.8rem" />
          <SkeletonBlock height="4.8rem" />
        </ListDetailPanel>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Focus" title="Loading activity detail">
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
          <SkeletonBlock height="3.2rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationActivityPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [items, setItems] = useState<ActivityRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const payload = await services.client.listActivityTimeline({ limit: 80 });
    setItems(normalizeActivityItems(payload));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Activity is unavailable.');
        setIsLoading(false);
      }
    });
    const unsubscribe = subscribeWorkstationApprovalResolved(() => {
      void refresh(false).catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Activity is unavailable.');
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
      setError(loadError instanceof Error ? loadError.message : 'Activity is unavailable.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && items.some((item) => String(item.id ?? '').trim() === selectedId)) {
      return;
    }
    setSelectedId(String(items[0].id ?? '').trim() || null);
  }, [items, selectedId]);

  const selectedActivity = useMemo(
    () => items.find((item) => String(item.id ?? '').trim() === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <WorkstationSurfaceRoot surface="activity">
      <ListDetailShell
        title="Activity"
        subtitle="Live workspace event feed with canonical timeline refresh and focused event context."
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
        <StateBanner
          title="Activity stream"
          detail={`Connection ${streamState.activity.connectionState} · ${streamState.activity.totalCount} recent events tracked`}
        >
          The timeline stays in sync with canonical activity reloads and approval-driven refreshes.
        </StateBanner>
        {error ? (
          <StateBanner tone="danger" title="Activity feed is degraded">
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <ActivitySkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <ListDetailPanel
                eyebrow="Feed"
                title="Workspace timeline"
                subtitle={`${items.length} canonical events currently visible in the timeline.`}
              >
                {items.length === 0 ? (
                  <EmptyPanel
                    title="No activity recorded"
                    body="As runs, approvals, and system events occur, they will surface here in chronological order."
                  />
                ) : (
                  <div className="app-stack-3">
                    {items.map((item, index) => {
                      const id = String(item.id ?? `activity-${index}`).trim();
                      const selected = id === selectedId;
                      const tone = eventTone(item.event_class);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSelectedId(id)}
                          className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}
                        >
                          <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                            <strong className="app-card-button__title">
                              {readString(item.title ?? item.action, 'Activity')}
                            </strong>
                            <DataBadge tone={tone}>{readString(item.event_class, 'event')}</DataBadge>
                          </div>
                          <span className="app-card-button__subtitle">
                            {readString(item.summary, 'No activity summary is available.')}
                          </span>
                          <span className="app-card-button__meta">
                            {formatTimestamp(item.created_at)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ListDetailPanel>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Focus"
                title={selectedActivity ? readString(selectedActivity.title ?? selectedActivity.action, 'Activity') : 'No activity selected'}
                subtitle={selectedActivity ? readString(selectedActivity.event_class, 'event') : 'Choose a timeline entry to inspect the current event focus.'}
              >
                {!selectedActivity ? (
                  <EmptyPanel
                    title="No selected activity"
                    body="Select an event from the timeline to inspect its summary and recorded timestamp."
                  />
                ) : (
                  <>
                    <StateBanner
                      tone={eventTone(selectedActivity.event_class) === 'accent' ? 'neutral' : eventTone(selectedActivity.event_class) as 'neutral' | 'warning' | 'danger'}
                      title={readString(selectedActivity.event_class, 'event')}
                      detail={formatTimestamp(selectedActivity.created_at)}
                    >
                      {readString(selectedActivity.summary, 'No activity summary is available.')}
                    </StateBanner>
                    <div className="app-meta-list">
                      <div className="app-meta-item">
                        <span className="app-meta-label">Event id</span>
                        <span className="app-meta-value app-meta-value--mono">{readString(selectedActivity.id, 'No identifier recorded')}</span>
                      </div>
                      <div className="app-meta-item">
                        <span className="app-meta-label">Summary</span>
                        <span className="app-meta-value app-meta-value--body">{readString(selectedActivity.summary, 'No activity summary is available.')}</span>
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
