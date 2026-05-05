'use client';

import { useEffect, useMemo, useState } from 'react';

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
        setError(loadError instanceof Error ? loadError.message : 'Heartbeat is unavailable right now.');
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
    void refresh(false).catch(() => {});
  }, [services.client, streamState.activity.version]);

  const upcomingItems = useMemo(
    () => snapshot?.exactJobs ?? [],
    [snapshot],
  );
  const queueItems = useMemo(
    () => snapshot
      ? ['main', 'cron', 'subagent', 'system'].flatMap((lane) => {
        const laneRecord = snapshot.laneQueue.lanes[lane];
        if (!laneRecord) {
          return [];
        }
        const active = laneRecord.active.map((item) => ({ lane, tone: 'active' as const, ...item }));
        const pending = laneRecord.pending.map((item) => ({ lane, tone: 'pending' as const, ...item }));
        return [...active, ...pending];
      })
      : [],
    [snapshot],
  );

  return (
    <WorkstationSurfaceRoot surface="sage-heartbeat">
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
            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat
                label="Recurring responsibility"
                value={snapshot.recurringResponsibility || 'Not set'}
                hint={snapshot.bootstrapComplete ? 'Projected into HEARTBEAT.md' : `Bootstrap ${snapshot.progressLabel}`}
              />
              <WorkstationSurfaceStat
                label="Quiet hours"
                value={snapshot.quietHoursLabel}
                hint="Self-wakeups shift outside this window."
              />
              <WorkstationSurfaceStat
                label="Scheduled actions"
                value={upcomingItems.length}
                hint={`${snapshot.pendingWakeups} pending · ${snapshot.claimedWakeups} claimed`}
              />
              <WorkstationSurfaceStat
                label="Lane queue"
                value={`${snapshot.laneQueue.activeCount} active`}
                hint={`${snapshot.laneQueue.pendingCount} waiting · max ${snapshot.laneQueue.maxTotalConcurrency}`}
              />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="Next scheduled action"
              description="The next wakeup or recurring job Sage is already carrying."
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
              title="Heartbeat schedule"
              description={`Plan tier ${snapshot.planTier}. Quiet hours run from ${snapshot.quietHoursStart}:00 to ${snapshot.quietHoursEnd}:00.`}
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
              title="Lane queue"
              description={snapshot.laneQueue.draining
                ? 'Background work is draining for shutdown.'
                : snapshot.laneQueue.acceptingNewWork
                  ? 'Background work is routed through the governed runtime lanes.'
                  : 'Queue is not accepting new work right now.'}
            >
              {queueItems.length > 0 ? (
                <WorkstationSurfaceList>
                  {queueItems.map((item) => (
                    <WorkstationSurfaceListItem
                      key={`${item.lane}-${item.id}-${item.tone}`}
                      title={`${item.label} · ${item.lane}`}
                      subtitle={`${item.tone === 'active' ? 'Running' : 'Waiting'} · ${item.status}`}
                      description={item.summary || (item.runId ? `Run ${item.runId}` : 'Queued for governed execution')}
                    />
                  ))}
                </WorkstationSurfaceList>
              ) : (
                <WorkstationSurfaceNotice tone="neutral">
                  No background work is active right now. Main, cron, subagent, and system lanes will appear here as work queues.
                </WorkstationSurfaceNotice>
              )}
            </WorkstationSurfaceCard>
          </>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
