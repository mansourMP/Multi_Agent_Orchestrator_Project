'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { subscribeWorkstationApprovalResolved } from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationActivityVersion } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

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

const ACTIVE_THREAD_STORAGE_PREFIX = 'empyralis.chat.active-thread.v1';
const HISTORY_PAGE_SIZE = 50;
const threadsPaneCache = new Map<string, ThreadListItem[]>();

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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => readPersistedActiveThread(workspaceId));
  const [threads, setThreads] = useState<ThreadListItem[]>(() => cachedThreads ?? []);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(() => cachedThreads === null);
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
    const threadsPayload = await services.client.listThreads({ includeTurns: true, limit: 200 });
    const nextThreads = toThreadListItems(normalizeThreadItems(threadsPayload));
    threadsPaneCache.set(workspaceId, nextThreads);
    setThreads(nextThreads);
    setVisibleCount(HISTORY_PAGE_SIZE);
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(cachedThreads === null).catch((loadError) => {
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
  }, [cachedThreads, services.client, workspaceId]);

  useEffect(() => {
    if (activityVersion === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'History is unavailable right now.');
      setIsLoading(false);
    });
  }, [activityVersion, workspaceId]);

  const visibleThreads = useMemo(
    () => threads.slice(0, visibleCount),
    [threads, visibleCount],
  );
  const hasMoreThreads = visibleCount < threads.length;

  return (
    <WorkstationSurfaceRoot surface="runs">
      <main className="app-runs-minimal-page" data-workstation-surface="runs-minimal">
        {error ? <div className="app-surface-inline-status">{error}</div> : null}
        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
            <SkeletonBlock height="4rem" />
          </div>
        ) : threads.length === 0 ? (
          <EmptyPanel
            title="No conversations yet"
            body="Send a message to Sage to start your first conversation."
          />
        ) : (
          <div className="app-runs-minimal-list app-runs-minimal-list--flat" aria-label="Conversation history">
            {visibleThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`app-runs-minimal-row app-runs-minimal-row--flat${selectedThreadId === thread.id ? ' app-runs-minimal-row--selected' : ''}`}
                onClick={() => {
                  persistActiveThread(workspaceId, thread.id);
                  setSelectedThreadId(thread.id);
                  router.push(chatHref);
                }}
              >
                <span className="app-runs-minimal-row__preview" title={thread.preview}>{thread.preview}</span>
                <span className="app-runs-minimal-row__time">{formatHistoryDate(thread.occurredAt)}</span>
              </button>
            ))}
            {hasMoreThreads ? (
              <button
                type="button"
                className="app-runs-minimal-load-more"
                onClick={() => {
                  setVisibleCount((current) => Math.min(current + HISTORY_PAGE_SIZE, threads.length));
                }}
              >
                Load more
              </button>
            ) : null}
          </div>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
