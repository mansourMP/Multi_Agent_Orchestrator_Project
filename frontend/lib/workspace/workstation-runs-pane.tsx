'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationActivityVersion } from '@/lib/workspace/workspace-services';
import {
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type ThreadTurnRecord = Record<string, unknown> & {
  role?: string | null;
  content?: string | null;
  created_at?: string | null;
};

type ThreadRecord = Record<string, unknown> & {
  id?: string | null;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_turn_at?: string | null;
  turns?: ThreadTurnRecord[] | null;
};

type ThreadListItem = {
  id: string;
  preview: string;
  occurredAt: string | null;
};

type ActivityProofType = 'chat' | 'tool' | 'approval' | 'channel' | 'gateway' | 'provider' | 'file' | 'outcome';

type ActivityProofItem = {
  id: string;
  type: ActivityProofType;
  title: string;
  summary: string;
  occurredAt: string | null;
  source: string;
  threadId: string | null;
};

type ActivityFilterId = 'all' | ActivityProofType;

const ACTIVE_THREAD_STORAGE_PREFIX = 'empyralis.chat.active-thread.v1';
const HISTORY_PAGE_SIZE = 50;
const threadsPaneCache = new Map<string, ThreadListItem[]>();
const activityPaneCache = new Map<string, ActivityProofItem[]>();

const ACTIVITY_FILTERS: Array<{ id: ActivityFilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'tool', label: 'Tools' },
  { id: 'approval', label: 'Approvals' },
  { id: 'channel', label: 'Channels' },
  { id: 'gateway', label: 'Gateway' },
  { id: 'provider', label: 'Providers' },
  { id: 'file', label: 'Files' },
  { id: 'outcome', label: 'Outcomes' },
];

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function activeThreadStorageKey(workspaceId: string): string {
  return `${ACTIVE_THREAD_STORAGE_PREFIX}:${workspaceId}`;
}

function persistActiveThread(workspaceId: string, threadId: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  const normalizedThreadId = readString(threadId);
  if (!normalizedThreadId) {
    return;
  }
  try {
    window.localStorage.setItem(activeThreadStorageKey(workspaceId), normalizedThreadId);
  } catch {
    // Ignore storage failures in constrained environments.
  }
}

function readPersistedActiveThread(workspaceId: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const value = window.localStorage.getItem(activeThreadStorageKey(workspaceId));
    const threadId = readString(value);
    return threadId || null;
  } catch {
    return null;
  }
}

function normalizeThreadItems(payload: unknown): ThreadRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is ThreadRecord => Boolean(item) && typeof item === 'object')
    : [];
}

function normalizeRecordItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function parseTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function isPlaceholderTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return normalized === '' || normalized === 'new chat' || normalized === 'chat' || normalized === 'primary thread';
}

function compactHumanText(value: unknown, fallback: string): string {
  const text = readString(value, fallback).replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  if (/^\s*[{[]/.test(text) || /activity_event_id|trace_id|raw_|stacktrace|debug/i.test(text)) {
    return fallback;
  }
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text;
}

function threadPreviewLabel(thread: ThreadRecord): string {
  const title = readString(thread.title);
  if (title && !isPlaceholderTitle(title)) {
    return title;
  }
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const firstUserTurn = turns.find((turn) => readString(turn.role).toLowerCase() === 'user');
  const firstContent = readString(firstUserTurn?.content);
  if (firstContent) {
    return firstContent;
  }
  return title || 'Conversation';
}

function eventProofType(event: Record<string, unknown>): ActivityProofType {
  const eventClass = readString(event.event_class).toLowerCase();
  const action = readString(event.action).toLowerCase();
  const channel = readString(event.channel).toLowerCase();
  const status = readString(event.status).toLowerCase();
  const text = `${eventClass} ${action} ${channel} ${readString(event.title)} ${readString(event.summary)}`.toLowerCase();

  if (eventClass.includes('approval') || eventClass.includes('blocked') || action.includes('approval')) {
    return 'approval';
  }
  if (channel || /telegram|whatsapp|gmail|email|signal|slack|discord/.test(text)) {
    return 'channel';
  }
  if (/gateway|reconnect|pairing|device|companion/.test(text)) {
    return 'gateway';
  }
  if (/provider|model|deepseek|gemini|openai|anthropic|ollama|quota|credit/.test(text)) {
    return 'provider';
  }
  if (/file|shell|browser|screenshot|clipboard|artifact/.test(text)) {
    return /file/.test(text) ? 'file' : 'tool';
  }
  if (eventClass.includes('run_status') || status === 'completed' || status === 'failed' || /done|completed|failed|final/.test(text)) {
    return 'outcome';
  }
  return 'tool';
}

function eventTitle(type: ActivityProofType, event: Record<string, unknown>): string {
  const explicit = compactHumanText(event.title, '');
  if (explicit) {
    return explicit;
  }
  const action = readString(event.action).replace(/_/g, ' ');
  const channel = readString(event.channel);
  if (channel) {
    return `${channel.charAt(0).toUpperCase()}${channel.slice(1)} activity`;
  }
  if (action) {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }
  const fallbackByType: Record<ActivityProofType, string> = {
    chat: 'Conversation',
    tool: 'Tool activity',
    approval: 'Approval decision',
    channel: 'Channel activity',
    gateway: 'Gateway activity',
    provider: 'Provider activity',
    file: 'File activity',
    outcome: 'Final outcome',
  };
  return fallbackByType[type];
}

function eventSummary(type: ActivityProofType, event: Record<string, unknown>): string {
  const fallbackByType: Record<ActivityProofType, string> = {
    chat: 'Conversation activity was recorded.',
    tool: 'A governed tool action was recorded.',
    approval: 'A user approval or blocked action was recorded.',
    channel: 'A communication channel action was recorded.',
    gateway: 'This Computer connection activity was recorded.',
    provider: 'AI provider state changed or failed.',
    file: 'A file, shell, or browser action was recorded.',
    outcome: 'A run or task reached an outcome.',
  };
  const summary = compactHumanText(event.summary, fallbackByType[type]);
  const status = readString(event.status).replace(/_/g, ' ');
  return status ? `${summary} · ${status}` : summary;
}

function proofItemsFromActivity(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((event, index) => {
    const type = eventProofType(event);
    return {
      id: readString(event.id, `activity-${index}`),
      type,
      title: eventTitle(type, event),
      summary: eventSummary(type, event),
      occurredAt: readString(event.created_at) || readString(event.ts) || null,
      source: 'Activity',
      threadId: readString(event.thread_id) || null,
    };
  });
}

function proofItemsFromThreads(threads: ThreadRecord[]): ActivityProofItem[] {
  return toThreadListItems(threads).map((thread) => ({
    id: `chat-${thread.id}`,
    type: 'chat',
    title: 'Chat history',
    summary: thread.preview,
    occurredAt: thread.occurredAt,
    source: 'Chat',
    threadId: thread.id,
  }));
}

function proofItemsFromRuns(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((run, index) => {
    const status = readString(run.status, 'recorded').replace(/_/g, ' ');
    const title = readString(run.title) || readString(run.name) || readString(run.kind);
    const summary = readString(run.summary) || readString(run.result_summary) || readString(run.error);
    return {
      id: `run-${readString(run.id, String(index))}`,
      type: status === 'completed' || status === 'failed' ? 'outcome' : 'tool',
      title: compactHumanText(title, 'Run recorded'),
      summary: compactHumanText(summary, `Run status: ${status}`),
      occurredAt: readString(run.updated_at) || readString(run.created_at) || null,
      source: 'Run',
      threadId: readString(run.thread_id) || null,
    };
  });
}

function proofItemsFromApprovals(payload: unknown): ActivityProofItem[] {
  return normalizeRecordItems(payload).map((approval, index) => {
    const id = readString(approval.approval_id) || readString(approval.id, String(index));
    const summary = readString(approval.prompt) || readString(approval.summary) || readString(approval.reason);
    return {
      id: `approval-${id}`,
      type: 'approval',
      title: 'Needs your OK',
      summary: compactHumanText(summary, 'A request is waiting for approval.'),
      occurredAt: readString(approval.created_at) || readString(approval.updated_at) || null,
      source: 'Approval',
      threadId: readString(approval.thread_id) || null,
    };
  });
}

function mergeProofItems(items: ActivityProofItem[]): ActivityProofItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.id || `${item.type}:${item.title}:${item.occurredAt ?? ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function toThreadListItems(threads: ThreadRecord[]): ThreadListItem[] {
  return threads
    .map((thread, index) => ({
      id: readString(thread.id, `thread-${index}`),
      preview: threadPreviewLabel(thread),
      occurredAt: readString(thread.last_turn_at) || readString(thread.updated_at) || readString(thread.created_at) || null,
    }))
    .filter((thread) => thread.id && thread.preview)
    .sort((left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt));
}

function formatHistoryDate(value: string | null): string {
  if (!value) {
    return '';
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
  const diffWeeks = Math.round(diffDays / 7);
  if (Math.abs(diffWeeks) < 5) {
    return formatter.format(diffWeeks, 'week');
  }
  const date = new Date(parsed);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export function WorkstationRunsPane() {
  const router = useRouter();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const cachedThreads = threadsPaneCache.get(workspaceId) ?? null;
  const cachedActivity = activityPaneCache.get(workspaceId) ?? null;
  const [hadInitialCache] = useState(() => cachedThreads !== null && cachedActivity !== null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => readPersistedActiveThread(workspaceId));
  const [threads, setThreads] = useState<ThreadListItem[]>(() => cachedThreads ?? []);
  const [activityItems, setActivityItems] = useState<ActivityProofItem[]>(() => cachedActivity ?? []);
  const [activeFilter, setActiveFilter] = useState<ActivityFilterId>('all');
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(() => cachedThreads === null || cachedActivity === null);
  const [error, setError] = useState<string | null>(null);

  const chatHref = useMemo(
    () => routeManifest.routeIndex.chat?.href ?? `/w/${encodeURIComponent(workspaceId)}/chat`,
    [routeManifest.routeIndex.chat, workspaceId],
  );

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const [threadsPayload, activityPayload, runsPayload, approvalsPayload] = await Promise.all([
      services.client.listThreads({ includeTurns: true, limit: 200 }),
      services.client.listActivityTimeline({ limit: 200 }).catch(() => ({ items: [] })),
      services.client.listRuns({ limit: 80 }).catch(() => ({ items: [] })),
      services.client.listApprovals({ limit: 80 }).catch(() => ({ items: [] })),
    ]);
    const threadRecords = normalizeThreadItems(threadsPayload);
    const nextThreads = toThreadListItems(threadRecords);
    const nextActivityItems = mergeProofItems([
      ...proofItemsFromActivity(activityPayload),
      ...proofItemsFromThreads(threadRecords),
      ...proofItemsFromRuns(runsPayload),
      ...proofItemsFromApprovals(approvalsPayload),
    ]);
    threadsPaneCache.set(workspaceId, nextThreads);
    activityPaneCache.set(workspaceId, nextActivityItems);
    setThreads(nextThreads);
    setActivityItems(nextActivityItems);
    setVisibleCount(HISTORY_PAGE_SIZE);
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(!hadInitialCache).catch((loadError) => {
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
  }, [hadInitialCache, services.client, workspaceId]);

  useEffect(() => {
    if (activityVersion === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
      setIsLoading(false);
    });
  }, [activityVersion, workspaceId]);

  const filteredActivityItems = useMemo(
    () => activeFilter === 'all'
      ? activityItems
      : activityItems.filter((item) => item.type === activeFilter),
    [activeFilter, activityItems],
  );
  const visibleActivityItems = useMemo(
    () => filteredActivityItems.slice(0, visibleCount),
    [filteredActivityItems, visibleCount],
  );
  const hasMoreItems = visibleCount < filteredActivityItems.length;
  const approvalCount = activityItems.filter((item) => item.type === 'approval').length;
  const channelCount = activityItems.filter((item) => item.type === 'channel').length;
  const providerCount = activityItems.filter((item) => item.type === 'provider').length;

  return (
    <WorkstationSurfaceRoot surface="activity">
      <main className="app-runs-minimal-page" data-workstation-surface="activity-proof">
        {error ? <div className="app-surface-inline-status">Activity could not refresh. Try again when ready.</div> : null}
        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
          </div>
        ) : activityItems.length === 0 ? (
          <EmptyPanel
            title="No activity yet"
            body="Chat, tool runs, approvals, channels, gateway reconnects, provider failures, and final outcomes will appear here."
          />
        ) : (
          <div className="app-stack-4">
            <WorkstationSurfaceNotice tone="neutral">
              Activity is the proof timeline for chat history, tool runs, approvals, channel sends, gateway reconnects, provider failures, file/shell/browser events, and final outcomes.
            </WorkstationSurfaceNotice>

            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat label="Proof events" value={activityItems.length} hint="Human summaries only" />
              <WorkstationSurfaceStat label="Chat history" value={threads.length} hint="Conversation entries included" />
              <WorkstationSurfaceStat label="Approvals" value={approvalCount} hint="Needs your OK and decisions" />
              <WorkstationSurfaceStat label="Channels/providers" value={channelCount + providerCount} hint="External sends and AI state" />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="What happened?"
              description="Compact proof rows. Raw debug blobs and hidden reasoning stay out of this surface."
            >
              <div className="app-runs-minimal-list app-runs-minimal-list--flat" aria-label="Activity filters">
                <div className="app-filter-pill-row" role="tablist" aria-label="Activity type filters">
                  {ACTIVITY_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`app-filter-pill${activeFilter === filter.id ? ' app-filter-pill--active' : ''}`}
                      onClick={() => {
                        setActiveFilter(filter.id);
                        setVisibleCount(HISTORY_PAGE_SIZE);
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {visibleActivityItems.length > 0 ? (
                  <div className="app-runs-minimal-list app-runs-minimal-list--flat" aria-label="Activity proof timeline">
                    {visibleActivityItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`app-runs-minimal-row app-runs-minimal-row--flat${selectedThreadId === item.threadId ? ' app-runs-minimal-row--selected' : ''}`}
                        onClick={() => {
                          if (!item.threadId) {
                            return;
                          }
                          persistActiveThread(workspaceId, item.threadId);
                          setSelectedThreadId(item.threadId);
                          router.push(chatHref);
                        }}
                      >
                        <span className="app-runs-minimal-row__preview" title={`${item.title}: ${item.summary}`}>
                          {item.title} · {item.summary}
                        </span>
                        <span className="app-runs-minimal-row__time">{item.source} · {formatHistoryDate(item.occurredAt)}</span>
                      </button>
                    ))}
                    {hasMoreItems ? (
                      <button
                        type="button"
                        className="app-runs-minimal-load-more"
                        onClick={() => {
                          setVisibleCount((current) => Math.min(current + HISTORY_PAGE_SIZE, filteredActivityItems.length));
                        }}
                      >
                        Load more
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <WorkstationSurfaceNotice tone="neutral">
                    No proof rows match this filter yet.
                  </WorkstationSurfaceNotice>
                )}
              </div>
            </WorkstationSurfaceCard>
          </div>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
