'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { WorkstationSageHeartbeatRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationSurfaceCard,
  WorkstationSurfaceList,
  WorkstationSurfaceListItem,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type HeartbeatScheduleItem = {
  id: string;
  name: string;
  scheduleKind: string;
  nextRunAt: string | null;
  wakeMode: string;
  delivery: string;
  pendingHeartbeat: boolean;
  timezone: string;
};

type LaneQueueItem = {
  id: string;
  label: string;
  status: string;
  runId: string | null;
  summary: string | null;
};

type LaneQueueLaneSnapshot = {
  concurrency: number;
  pendingCount: number;
  activeCount: number;
  pending: LaneQueueItem[];
  active: LaneQueueItem[];
};

type ProductLaneId = 'now' | 'waiting' | 'scheduled' | 'needs_ok' | 'done';

type ProductQueueItem = {
  id: string;
  label: string;
  lane: string | null;
  status: string;
  statusLabel: string;
  summary: string | null;
  scheduledFor: string | null;
  runId: string | null;
};

type ProductQueueOverview = {
  queuedCount: number;
  runningNowCount: number;
  blockedOnApprovalCount: number;
  doneCount: number;
  quietHours: {
    active: boolean;
    label: string;
    nextAllowedAt: string | null;
  };
  lanes: Record<ProductLaneId, ProductQueueItem[]>;
};

type HeartbeatSnapshot = {
  recurringResponsibility: string;
  bootstrapComplete: boolean;
  progressLabel: string;
  quietHoursLabel: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  pendingWakeups: number;
  claimedWakeups: number;
  planTier: string;
  exactJobs: HeartbeatScheduleItem[];
  nextAction: HeartbeatScheduleItem | null;
  laneQueue: {
    running: boolean;
    acceptingNewWork: boolean;
    draining: boolean;
    pendingCount: number;
    activeCount: number;
    maxTotalConcurrency: number;
    lanes: Record<string, LaneQueueLaneSnapshot>;
  };
  queueOverview: ProductQueueOverview;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeHeartbeatSnapshot(payload: unknown): HeartbeatSnapshot {
  const record = payload && typeof payload === 'object' ? payload as WorkstationSageHeartbeatRecord : {};
  const profile = record.profile && typeof record.profile === 'object' ? record.profile as Record<string, unknown> : {};
  const bootstrap = record.bootstrap && typeof record.bootstrap === 'object' ? record.bootstrap as Record<string, unknown> : {};
  const quietHours = record.quiet_hours && typeof record.quiet_hours === 'object' ? record.quiet_hours as Record<string, unknown> : {};
  const reminders = record.reminders && typeof record.reminders === 'object' ? record.reminders as Record<string, unknown> : {};
  const nextActionRecord = record.next_scheduled_action && typeof record.next_scheduled_action === 'object'
    ? record.next_scheduled_action as Record<string, unknown>
    : null;
  const wakeQueue = record.wake_queue && typeof record.wake_queue === 'object' ? record.wake_queue as Record<string, unknown> : {};
  const laneQueue = record.lane_queue && typeof record.lane_queue === 'object' ? record.lane_queue as Record<string, unknown> : {};
  const queueOverview = record.queue_overview && typeof record.queue_overview === 'object'
    ? record.queue_overview as Record<string, unknown>
    : {};
  const policy = record.policy && typeof record.policy === 'object' ? record.policy as Record<string, unknown> : {};
  const items = Array.isArray(reminders.items)
    ? reminders.items.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const candidate = item as Record<string, unknown>;
      return [{
        id: readString(candidate.id),
        name: readString(candidate.name) || 'Scheduled action',
        scheduleKind: readString(candidate.schedule_kind) || 'cron',
        nextRunAt: readString(candidate.next_run_at) || null,
        wakeMode: readString(candidate.wake_mode) || 'now',
        delivery: readString(candidate.delivery) || 'announce',
        pendingHeartbeat: Boolean(candidate.pending_heartbeat),
        timezone: readString(candidate.timezone) || 'local',
      }];
    })
    : [];
  const nextAction = nextActionRecord
    ? {
      id: readString(nextActionRecord.id),
      name: readString(nextActionRecord.name) || 'Scheduled action',
      scheduleKind: readString(nextActionRecord.schedule_kind) || 'cron',
      nextRunAt: readString(nextActionRecord.next_run_at) || null,
      wakeMode: readString(nextActionRecord.wake_mode) || 'now',
      delivery: readString(nextActionRecord.delivery) || 'announce',
      pendingHeartbeat: Boolean(nextActionRecord.pending_heartbeat),
      timezone: readString(nextActionRecord.timezone) || 'local',
    }
    : null;
  const laneEntries = ['main', 'cron', 'subagent', 'system'].reduce<Record<string, LaneQueueLaneSnapshot>>((acc, lane) => {
    const laneRecord = laneQueue.lanes && typeof laneQueue.lanes === 'object'
      ? (laneQueue.lanes as Record<string, unknown>)[lane]
      : null;
    const lanePayload = laneRecord && typeof laneRecord === 'object' ? laneRecord as Record<string, unknown> : {};
    const normalizeItems = (value: unknown): LaneQueueItem[] => (
      Array.isArray(value)
        ? value.flatMap((item) => {
          if (!item || typeof item !== 'object') {
            return [];
          }
          const recordItem = item as Record<string, unknown>;
          return [{
            id: readString(recordItem.id),
            label: readString(recordItem.label) || 'Queued work',
            status: readString(recordItem.status) || 'queued',
            runId: readString(recordItem.run_id) || null,
            summary: readString(recordItem.summary) || null,
          }];
        })
        : []
    );
    acc[lane] = {
      concurrency: readNumber(lanePayload.concurrency, 1),
      pendingCount: readNumber(lanePayload.pending_count, 0),
      activeCount: readNumber(lanePayload.active_count, 0),
      pending: normalizeItems(lanePayload.pending),
      active: normalizeItems(lanePayload.active),
    };
    return acc;
  }, {});
  const normalizeProductItems = (value: unknown): ProductQueueItem[] => (
    Array.isArray(value)
      ? value.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return [];
        }
        const recordItem = item as Record<string, unknown>;
        return [{
          id: readString(recordItem.id),
          label: readString(recordItem.label) || 'Queued work',
          lane: readString(recordItem.lane) || null,
          status: readString(recordItem.status) || 'queued',
          statusLabel: readString(recordItem.status_label) || 'Waiting',
          summary: readString(recordItem.summary) || null,
          scheduledFor: readString(recordItem.scheduled_for) || null,
          runId: readString(recordItem.run_id) || null,
        }];
      })
      : []
  );
  const overviewLanes = queueOverview.lanes && typeof queueOverview.lanes === 'object'
    ? queueOverview.lanes as Record<string, unknown>
    : {};
  return {
    recurringResponsibility: readString(profile.recurring_responsibility),
    bootstrapComplete: Boolean(bootstrap.complete),
    progressLabel: readString(bootstrap.progress_label) || '0/5',
    quietHoursLabel: readString(quietHours.label) || '22:00–07:00',
    quietHoursStart: readNumber(quietHours.start_hour, 22),
    quietHoursEnd: readNumber(quietHours.end_hour, 7),
    pendingWakeups: readNumber(wakeQueue.pending_count),
    claimedWakeups: readNumber(wakeQueue.claimed_count),
    planTier: readString(policy.plan_tier) || 'default',
    exactJobs: items,
    nextAction,
    laneQueue: {
      running: Boolean(laneQueue.running),
      acceptingNewWork: laneQueue.accepting_new_work !== false,
      draining: Boolean(laneQueue.draining),
      pendingCount: readNumber(laneQueue.pending_count, 0),
      activeCount: readNumber(laneQueue.active_count, 0),
      maxTotalConcurrency: readNumber(laneQueue.max_total_concurrency, 4),
      lanes: laneEntries,
    },
    queueOverview: {
      queuedCount: readNumber(queueOverview.queued_count, 0),
      runningNowCount: readNumber(queueOverview.running_now_count, 0),
      blockedOnApprovalCount: readNumber(queueOverview.blocked_on_approval_count, 0),
      doneCount: readNumber(queueOverview.done_count, 0),
      quietHours: {
        active: Boolean(queueOverview.quiet_hours && typeof queueOverview.quiet_hours === 'object' && (queueOverview.quiet_hours as Record<string, unknown>).active),
        label: (() => {
          const label = readString(
            queueOverview.quiet_hours && typeof queueOverview.quiet_hours === 'object'
              ? (queueOverview.quiet_hours as Record<string, unknown>).label
              : '',
          );
          return label || 'Background work can run now';
        })(),
        nextAllowedAt: readString(
          queueOverview.quiet_hours && typeof queueOverview.quiet_hours === 'object'
            ? (queueOverview.quiet_hours as Record<string, unknown>).next_allowed_at
            : '',
        ) || null,
      },
      lanes: {
        now: normalizeProductItems(overviewLanes.now),
        waiting: normalizeProductItems(overviewLanes.waiting),
        scheduled: normalizeProductItems(overviewLanes.scheduled),
        needs_ok: normalizeProductItems(overviewLanes.needs_ok),
        done: normalizeProductItems(overviewLanes.done),
      },
    },
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'No next run scheduled';
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function WorkstationSageHeartbeatPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [snapshot, setSnapshot] = useState<HeartbeatSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activityRefreshTimerRef = useRef<number | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const payload = await services.client.getSageHeartbeat();
    setSnapshot(normalizeHeartbeatSnapshot(payload));
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Tasks are unavailable right now.');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    if (activityRefreshTimerRef.current !== null) {
      window.clearTimeout(activityRefreshTimerRef.current);
    }
    activityRefreshTimerRef.current = window.setTimeout(() => {
      activityRefreshTimerRef.current = null;
      void refresh(false).catch(() => {});
    }, 750);
    return () => {
      if (activityRefreshTimerRef.current !== null) {
        window.clearTimeout(activityRefreshTimerRef.current);
        activityRefreshTimerRef.current = null;
      }
    };
  }, [services.client, streamState.activity.version]);

  const upcomingItems = useMemo(
    () => snapshot?.exactJobs ?? [],
    [snapshot],
  );
  const queueSummaryRows = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const laneCopy: Array<{ id: ProductLaneId; title: string; empty: string }> = [
      { id: 'now', title: 'Now', empty: 'Nothing is running right now.' },
      { id: 'waiting', title: 'Waiting', empty: 'No queued work is waiting.' },
      { id: 'scheduled', title: 'Scheduled', empty: 'No recurring work is scheduled yet.' },
      { id: 'needs_ok', title: 'Needs your OK', empty: 'No actions are blocked on approval.' },
      { id: 'done', title: 'Done', empty: 'No recent governed work yet.' },
    ];
    return laneCopy.map(({ id, title, empty }) => {
      const items = snapshot.queueOverview.lanes[id] ?? [];
      const preview = items.slice(0, 2).map((item) => {
        const detail = item.summary || item.statusLabel || (item.runId ? `Run ${item.runId}` : '');
        return detail ? `${item.label} — ${detail}` : item.label;
      });
      return {
        id,
        title,
        count: items.length,
        subtitle: items.length === 1 ? '1 work item' : `${items.length} work items`,
        description: preview.length > 0 ? preview.join(' · ') : empty,
      };
    });
  }, [snapshot]);

  return (
    <WorkstationSurfaceRoot surface="sage-tasks">
      <main className="app-stack-4">
        {error ? <WorkstationSurfaceNotice tone="warning">{error}</WorkstationSurfaceNotice> : null}

        {isLoading || !snapshot ? (
          <div className="app-stack-3">
            <SkeletonBlock height="7rem" />
            <SkeletonBlock height="10rem" />
            <SkeletonBlock height="14rem" />
          </div>
        ) : (
          <>
            <WorkstationSurfaceNotice tone="neutral">
              Tasks is where Sage shows heartbeat, reminders, recurring responsibilities, quiet hours, scheduled jobs, and governed work lanes.
            </WorkstationSurfaceNotice>

            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat
                label="Recurring responsibility"
                value={snapshot.recurringResponsibility || 'Not set'}
                hint={snapshot.bootstrapComplete ? 'Carried into normal Sage sessions' : `Bootstrap ${snapshot.progressLabel}`}
              />
              <WorkstationSurfaceStat
                label="Running now"
                value={snapshot.queueOverview.runningNowCount}
                hint={snapshot.queueOverview.lanes.now[0]?.label || 'Nothing active right now.'}
              />
              <WorkstationSurfaceStat
                label="Waiting"
                value={snapshot.queueOverview.queuedCount}
                hint={`${snapshot.queueOverview.blockedOnApprovalCount} need your OK`}
              />
              <WorkstationSurfaceStat
                label="Next scheduled action"
                value={snapshot.nextAction ? formatTimestamp(snapshot.nextAction.nextRunAt) : 'None'}
                hint={snapshot.nextAction?.name || 'No recurring work scheduled yet.'}
              />
              <WorkstationSurfaceStat
                label="Quiet hours"
                value={snapshot.queueOverview.quietHours.active ? 'Active' : snapshot.quietHoursLabel}
                hint={snapshot.queueOverview.quietHours.label}
              />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="Next scheduled task"
              description="The next governed reminder, heartbeat, or recurring job Sage is already carrying."
            >
              {snapshot.nextAction ? (
                <WorkstationSurfaceList>
                  <WorkstationSurfaceListItem
                    title={snapshot.nextAction.name}
                    subtitle={formatTimestamp(snapshot.nextAction.nextRunAt)}
                    description={`${snapshot.nextAction.scheduleKind} · ${snapshot.nextAction.wakeMode} · ${snapshot.nextAction.delivery} · ${snapshot.nextAction.timezone}`}
                  />
                </WorkstationSurfaceList>
              ) : (
                <WorkstationSurfaceNotice tone="neutral">
                  No scheduled actions yet. Add a recurring responsibility or schedule to make Sage proactively follow up.
                </WorkstationSurfaceNotice>
              )}
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Reminders and recurring responsibilities"
              description={`Scheduled jobs, reminders, and heartbeat wakeups. Plan tier ${snapshot.planTier}. ${snapshot.queueOverview.quietHours.label}`}
            >
              {upcomingItems.length > 0 ? (
                <WorkstationSurfaceList>
                  {upcomingItems.map((item) => (
                    <WorkstationSurfaceListItem
                      key={item.id || `${item.name}-${item.nextRunAt ?? 'none'}`}
                      title={item.name}
                      subtitle={formatTimestamp(item.nextRunAt)}
                      description={`${item.scheduleKind} · ${item.wakeMode} · ${item.delivery}${item.pendingHeartbeat ? ' · waiting for next heartbeat' : ''}`}
                    />
                  ))}
                </WorkstationSurfaceList>
              ) : (
                <WorkstationSurfaceNotice tone="neutral">
                  No reminders or recurring schedules are active yet.
                </WorkstationSurfaceNotice>
              )}
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Task lanes"
              description={snapshot.laneQueue.draining
                ? 'Governed work is draining for shutdown.'
                : snapshot.laneQueue.acceptingNewWork
                  ? 'Now, Waiting, Scheduled, Needs your OK, and Done show what Sage is doing now and what happens later.'
                  : 'Queue is not accepting new work right now.'}
            >
              {queueSummaryRows.some((row) => row.count > 0) ? (
                <WorkstationSurfaceList>
                  {queueSummaryRows.map((row) => (
                    <WorkstationSurfaceListItem
                      key={row.id}
                      title={row.title}
                      subtitle={row.subtitle}
                      description={row.description}
                    />
                  ))}
                </WorkstationSurfaceList>
              ) : (
                <WorkstationSurfaceNotice tone="neutral">
                  No task work is active right now. When Sage has live work, waiting work, approvals, scheduled jobs, or finished recurring actions, they will appear here.
                </WorkstationSurfaceNotice>
              )}
            </WorkstationSurfaceCard>
          </>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
