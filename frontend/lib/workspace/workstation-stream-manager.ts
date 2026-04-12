'use client';

import type { WorkstationClient } from '@/lib/workspace/workstation-client';

export type WorkstationStreamCursor = {
  id: string | null;
  ts: string | null;
};

export type WorkstationStreamConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export type WorkstationNotificationItem = Record<string, unknown> & {
  id?: string | null;
  ts?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  read_at?: string | null;
};

export type WorkstationChannelEventItem = Record<string, unknown> & {
  id?: string | null;
  ts?: string | null;
};

export type WorkstationStreamState = {
  notifications: {
    connectionState: WorkstationStreamConnectionState;
    cursor: WorkstationStreamCursor;
    recent: WorkstationNotificationItem[];
    unreadCount: number;
    totalCount: number;
    reconnectCount: number;
    lastHeartbeatAt: string | null;
    lastEventAt: string | null;
  };
  activity: {
    connectionState: WorkstationStreamConnectionState;
    cursor: WorkstationStreamCursor;
    recent: WorkstationChannelEventItem[];
    totalCount: number;
    reconnectCount: number;
    lastHeartbeatAt: string | null;
    lastEventAt: string | null;
  };
};

type StreamListener = () => void;

type WorkstationStreamManagerDependencies = {
  client: Pick<WorkstationClient, 'openNotificationsStream' | 'openChannelEventsStream'>;
  maxRecent?: number;
  reconnectDelayMs?: number;
  nowIso?: () => string;
};

const DEFAULT_STATE: WorkstationStreamState = {
  notifications: {
    connectionState: 'idle',
    cursor: {
      id: null,
      ts: null,
    },
    recent: [],
    unreadCount: 0,
    totalCount: 0,
    reconnectCount: 0,
    lastHeartbeatAt: null,
    lastEventAt: null,
  },
  activity: {
    connectionState: 'idle',
    cursor: {
      id: null,
      ts: null,
    },
    recent: [],
    totalCount: 0,
    reconnectCount: 0,
    lastHeartbeatAt: null,
    lastEventAt: null,
  },
};

function parseMessageEventData(event: MessageEvent): Record<string, unknown> | null {
  const raw = typeof event.data === 'string' ? event.data.trim() : '';
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mergeRecentItems<T extends Record<string, unknown>>(
  current: T[],
  nextItem: T,
  maxRecent: number,
): T[] {
  const nextId = String(nextItem.id ?? '').trim();
  const deduped = current.filter((item) => String(item.id ?? '').trim() !== nextId);
  return [nextItem, ...deduped].slice(0, maxRecent);
}

function notificationCursor(item: WorkstationNotificationItem): WorkstationStreamCursor {
  return {
    id: String(item.id ?? '').trim() || null,
    ts:
      String(item.updated_at ?? item.created_at ?? item.ts ?? '').trim() || null,
  };
}

function channelCursor(item: WorkstationChannelEventItem): WorkstationStreamCursor {
  return {
    id: String(item.id ?? '').trim() || null,
    ts: String(item.ts ?? '').trim() || null,
  };
}

export class WorkstationStreamManager {
  private readonly listeners = new Set<StreamListener>();

  private readonly maxRecent: number;

  private readonly reconnectDelayMs: number;

  private readonly nowIso: () => string;

  private state: WorkstationStreamState = DEFAULT_STATE;

  private started = false;

  private disposed = false;

  private notificationSource: EventSource | null = null;

  private activitySource: EventSource | null = null;

  private notificationReconnectHandle: number | null = null;

  private activityReconnectHandle: number | null = null;

  constructor(private readonly dependencies: WorkstationStreamManagerDependencies) {
    this.maxRecent = Math.max(10, Math.min(dependencies.maxRecent ?? 40, 200));
    this.reconnectDelayMs = Math.max(500, Math.min(dependencies.reconnectDelayMs ?? 1500, 15000));
    this.nowIso = dependencies.nowIso ?? (() => new Date().toISOString());
  }

  getState(): WorkstationStreamState {
    return this.state;
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.started || this.disposed) {
      return;
    }

    this.started = true;
    this.connectNotifications();
    this.connectActivity();
  }

  dispose(): void {
    this.disposed = true;
    this.started = false;
    this.clearReconnect('notifications');
    this.clearReconnect('activity');
    this.closeNotificationSource();
    this.closeActivitySource();
    this.patchState(() => ({
      notifications: {
        ...this.state.notifications,
        connectionState: 'closed',
      },
      activity: {
        ...this.state.activity,
        connectionState: 'closed',
      },
    }));
    this.listeners.clear();
  }

  snapshot() {
    return this.state;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private patchState(
    updater: (current: WorkstationStreamState) => WorkstationStreamState,
  ): void {
    this.state = updater(this.state);
    this.emit();
  }

  private clearReconnect(kind: 'notifications' | 'activity'): void {
    if (kind === 'notifications' && this.notificationReconnectHandle !== null) {
      window.clearTimeout(this.notificationReconnectHandle);
      this.notificationReconnectHandle = null;
    }
    if (kind === 'activity' && this.activityReconnectHandle !== null) {
      window.clearTimeout(this.activityReconnectHandle);
      this.activityReconnectHandle = null;
    }
  }

  private scheduleReconnect(kind: 'notifications' | 'activity'): void {
    if (this.disposed) {
      return;
    }

    this.clearReconnect(kind);

    const handle = window.setTimeout(() => {
      if (this.disposed) {
        return;
      }
      if (kind === 'notifications') {
        this.connectNotifications();
      } else {
        this.connectActivity();
      }
    }, this.reconnectDelayMs);

    if (kind === 'notifications') {
      this.notificationReconnectHandle = handle;
    } else {
      this.activityReconnectHandle = handle;
    }
  }

  private closeNotificationSource(): void {
    if (this.notificationSource) {
      this.notificationSource.close();
      this.notificationSource = null;
    }
  }

  private closeActivitySource(): void {
    if (this.activitySource) {
      this.activitySource.close();
      this.activitySource = null;
    }
  }

  private connectNotifications(): void {
    if (this.disposed) {
      return;
    }

    this.clearReconnect('notifications');
    this.closeNotificationSource();

    const includeBacklog = !this.state.notifications.cursor.id && !this.state.notifications.cursor.ts;
    this.patchState((current) => ({
      ...current,
      notifications: {
        ...current.notifications,
        connectionState: current.notifications.totalCount > 0 ? 'reconnecting' : 'connecting',
      },
    }));

    const source = this.dependencies.client.openNotificationsStream({
      sinceId: this.state.notifications.cursor.id ?? undefined,
      sinceTs: this.state.notifications.cursor.ts ?? undefined,
      includeBacklog,
      limit: this.maxRecent,
    });
    this.notificationSource = source;

    source.onopen = () => {
      this.patchState((current) => ({
        ...current,
        notifications: {
          ...current.notifications,
          connectionState: 'open',
        },
      }));
    };

    source.addEventListener('notification', (event) => {
      const payload = parseMessageEventData(event as MessageEvent);
      if (!payload) {
        return;
      }
      const item = payload as WorkstationNotificationItem;
      const cursor = notificationCursor(item);
      this.patchState((current) => {
        const recent = mergeRecentItems(current.notifications.recent, item, this.maxRecent);
        return {
          ...current,
          notifications: {
            ...current.notifications,
            recent,
            cursor: {
              id: cursor.id ?? current.notifications.cursor.id,
              ts: cursor.ts ?? current.notifications.cursor.ts,
            },
            unreadCount: recent.filter((entry) => !String(entry.read_at ?? '').trim()).length,
            totalCount: recent.length,
            lastEventAt: this.nowIso(),
          },
        };
      });
    });

    source.addEventListener('heartbeat', () => {
      this.patchState((current) => ({
        ...current,
        notifications: {
          ...current.notifications,
          lastHeartbeatAt: this.nowIso(),
        },
      }));
    });

    source.addEventListener('done', () => {
      this.patchState((current) => ({
        ...current,
        notifications: {
          ...current.notifications,
          connectionState: 'reconnecting',
          reconnectCount: current.notifications.reconnectCount + 1,
        },
      }));
      this.scheduleReconnect('notifications');
    });

    source.onerror = () => {
      this.patchState((current) => ({
        ...current,
        notifications: {
          ...current.notifications,
          connectionState: 'reconnecting',
          reconnectCount: current.notifications.reconnectCount + 1,
        },
      }));
      this.scheduleReconnect('notifications');
    };
  }

  private connectActivity(): void {
    if (this.disposed) {
      return;
    }

    this.clearReconnect('activity');
    this.closeActivitySource();

    const includeBacklog = !this.state.activity.cursor.id && !this.state.activity.cursor.ts;
    this.patchState((current) => ({
      ...current,
      activity: {
        ...current.activity,
        connectionState: current.activity.totalCount > 0 ? 'reconnecting' : 'connecting',
      },
    }));

    const source = this.dependencies.client.openChannelEventsStream({
      sinceId: this.state.activity.cursor.id ?? undefined,
      sinceTs: this.state.activity.cursor.ts ?? undefined,
      includeBacklog,
      limit: this.maxRecent,
    });
    this.activitySource = source;

    source.onopen = () => {
      this.patchState((current) => ({
        ...current,
        activity: {
          ...current.activity,
          connectionState: 'open',
        },
      }));
    };

    source.addEventListener('inbox_event', (event) => {
      const payload = parseMessageEventData(event as MessageEvent);
      if (!payload) {
        return;
      }
      const item = payload as WorkstationChannelEventItem;
      const cursor = channelCursor(item);
      this.patchState((current) => {
        const recent = mergeRecentItems(current.activity.recent, item, this.maxRecent);
        return {
          ...current,
          activity: {
            ...current.activity,
            recent,
            cursor: {
              id: cursor.id ?? current.activity.cursor.id,
              ts: cursor.ts ?? current.activity.cursor.ts,
            },
            totalCount: recent.length,
            lastEventAt: this.nowIso(),
          },
        };
      });
    });

    source.addEventListener('heartbeat', () => {
      this.patchState((current) => ({
        ...current,
        activity: {
          ...current.activity,
          lastHeartbeatAt: this.nowIso(),
        },
      }));
    });

    source.addEventListener('done', () => {
      this.patchState((current) => ({
        ...current,
        activity: {
          ...current.activity,
          connectionState: 'reconnecting',
          reconnectCount: current.activity.reconnectCount + 1,
        },
      }));
      this.scheduleReconnect('activity');
    });

    source.onerror = () => {
      this.patchState((current) => ({
        ...current,
        activity: {
          ...current.activity,
          connectionState: 'reconnecting',
          reconnectCount: current.activity.reconnectCount + 1,
        },
      }));
      this.scheduleReconnect('activity');
    };
  }
}

export function createWorkstationStreamManager(
  dependencies: WorkstationStreamManagerDependencies,
): WorkstationStreamManager {
  return new WorkstationStreamManager(dependencies);
}
