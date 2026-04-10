import AsyncStorage from "@react-native-async-storage/async-storage";

import { mobileApi } from "./api";
import type { MobileSession } from "./types";

const ENGINE_STORAGE_KEY = "empyralis.mobile.engine.v1";
const SCREEN_TIME_EVENT_THRESHOLD_SECONDS = 180;
const SCREEN_TIME_EVENT_BUCKET_MS = 6 * 60 * 60 * 1000;
const SELF_WAKE_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_QUEUED_CONTEXT_EVENTS = 50;

export type MobileQueuedContextEvent = {
  id: string;
  sourceApp: string;
  eventType: string;
  entityId: string;
  summary?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scope?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  queuedAt: number;
};

export type MobileEngineState = {
  deviceId?: string;
  queuedContextEvents: MobileQueuedContextEvent[];
  lastNotificationSyncAt?: number;
  lastFreshNotificationCount?: number;
  lastContextFlushAt?: number;
  lastWakeRequestAt?: number;
  lastWakeReason?: string;
  lastWakeDueAt?: string;
  lastRouteKey?: string | null;
  lastRouteStartedAt?: number;
  routeSecondsByKey: Record<string, number>;
  screenTimeEventBuckets: Record<string, number>;
  pairing?: {
    pairingId?: string;
    expiresAt?: string;
    label?: string;
    linkedAt?: string;
    method?: string;
    workspaceId?: string;
  };
};

function createDefaultState(): MobileEngineState {
  return {
    queuedContextEvents: [],
    routeSecondsByKey: {},
    screenTimeEventBuckets: {},
  };
}

function sanitizeEvent(event: MobileQueuedContextEvent): MobileQueuedContextEvent {
  return {
    id: String(event.id || "").trim(),
    sourceApp: String(event.sourceApp || "mobile").trim() || "mobile",
    eventType: String(event.eventType || "").trim(),
    entityId: String(event.entityId || "").trim(),
    summary: String(event.summary || "").trim() || undefined,
    payload: event.payload && typeof event.payload === "object" ? event.payload : {},
    priority: typeof event.priority === "number" ? event.priority : undefined,
    scope: event.scope && typeof event.scope === "object" ? event.scope : {},
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {},
    queuedAt: Number(event.queuedAt || Date.now()),
  };
}

async function persist(state: MobileEngineState) {
  await AsyncStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(state));
}

export async function getMobileEngineState(): Promise<MobileEngineState> {
  const raw = await AsyncStorage.getItem(ENGINE_STORAGE_KEY);
  if (!raw) return createDefaultState();
  try {
    const parsed = JSON.parse(raw) as Partial<MobileEngineState>;
    return {
      ...createDefaultState(),
      ...parsed,
      queuedContextEvents: Array.isArray(parsed.queuedContextEvents)
        ? parsed.queuedContextEvents.map((item) => sanitizeEvent(item as MobileQueuedContextEvent)).filter((item) => item.id && item.eventType && item.entityId)
        : [],
      routeSecondsByKey: parsed.routeSecondsByKey && typeof parsed.routeSecondsByKey === "object"
        ? Object.fromEntries(Object.entries(parsed.routeSecondsByKey).map(([key, value]) => [key, Number(value || 0)]))
        : {},
      screenTimeEventBuckets: parsed.screenTimeEventBuckets && typeof parsed.screenTimeEventBuckets === "object"
        ? Object.fromEntries(Object.entries(parsed.screenTimeEventBuckets).map(([key, value]) => [key, Number(value || 0)]))
        : {},
    };
  } catch {
    return createDefaultState();
  }
}

export async function patchMobileEngineState(
  updater: (state: MobileEngineState) => MobileEngineState | Promise<MobileEngineState>,
) {
  const current = await getMobileEngineState();
  const next = await updater(current);
  await persist(next);
  return next;
}

function buildDeviceId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensureMobileDeviceId(existing?: string) {
  const current = String(existing || "").trim();
  if (current) return current;
  const state = await getMobileEngineState();
  const fromState = String(state.deviceId || "").trim();
  if (fromState) return fromState;
  const next = buildDeviceId();
  await persist({
    ...state,
    deviceId: next,
  });
  return next;
}

export async function rememberLinkedSession(session: MobileSession) {
  await patchMobileEngineState((state) => ({
    ...state,
    deviceId: String(session.deviceId || state.deviceId || "").trim() || state.deviceId,
    pairing: {
      pairingId: session.pairingId,
      expiresAt: session.pairingExpiresAt,
      label: session.pairingLabel,
      linkedAt: session.sessionLinkedAt ?? session.pairedAt,
      method: session.pairingMethod,
      workspaceId: session.workspaceId,
    },
  }));
}

function createQueuedEventId(eventType: string, entityId: string) {
  return `${eventType}:${entityId}`;
}

export async function queuePersonalContextEvent(input: Omit<MobileQueuedContextEvent, "id" | "queuedAt"> & { id?: string }) {
  const event = sanitizeEvent({
    ...input,
    id: String(input.id || createQueuedEventId(input.eventType, input.entityId)).trim(),
    queuedAt: Date.now(),
  });
  await patchMobileEngineState((state) => {
    const existing = new Map(state.queuedContextEvents.map((item) => [item.id, item]));
    existing.set(event.id, event);
    return {
      ...state,
      queuedContextEvents: [...existing.values()].slice(-MAX_QUEUED_CONTEXT_EVENTS),
    };
  });
  return event;
}

export async function flushQueuedPersonalContextEvents(session: MobileSession) {
  const state = await getMobileEngineState();
  const queue = [...state.queuedContextEvents];
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0 };
  }
  const remaining: MobileQueuedContextEvent[] = [];
  let flushedCount = 0;
  for (const item of queue) {
    try {
      await mobileApi.publishPersonalContextEvent(session, {
        source_app: item.sourceApp,
        event_type: item.eventType,
        entity_id: item.entityId,
        summary: item.summary,
        payload: item.payload,
        priority: item.priority,
        scope: item.scope,
        metadata: item.metadata,
      });
      flushedCount += 1;
    } catch {
      remaining.push(item);
    }
  }
  await persist({
    ...state,
    queuedContextEvents: remaining,
    lastContextFlushAt: Date.now(),
  });
  return {
    flushedCount,
    remainingCount: remaining.length,
  };
}

export async function recordNotificationSync(result: { freshCount: number }) {
  await patchMobileEngineState((state) => ({
    ...state,
    lastNotificationSyncAt: Date.now(),
    lastFreshNotificationCount: result.freshCount,
  }));
}

export async function proposeBoundedWakeup(
  session: MobileSession,
  input: {
    summary: string;
    reason: string;
    dueAt?: string;
    payload?: Record<string, unknown>;
    policyContext?: Record<string, unknown>;
  },
) {
  const state = await getMobileEngineState();
  const now = Date.now();
  if (state.lastWakeReason === input.reason && state.lastWakeRequestAt && now - state.lastWakeRequestAt < SELF_WAKE_COOLDOWN_MS) {
    return { skipped: true, reason: "cooldown_active" as const };
  }
  await mobileApi.proposeSelfWakeup(session, {
    summary: input.summary,
    reason: input.reason,
    due_at: input.dueAt,
    payload: input.payload,
    policy_context: input.policyContext,
  });
  await persist({
    ...state,
    lastWakeRequestAt: now,
    lastWakeReason: input.reason,
    lastWakeDueAt: input.dueAt,
  });
  return { skipped: false };
}

export async function recordRoutePresence(routeKey: string | null) {
  const now = Date.now();
  await patchMobileEngineState((state) => {
    const nextState: MobileEngineState = {
      ...state,
      routeSecondsByKey: { ...state.routeSecondsByKey },
      screenTimeEventBuckets: { ...state.screenTimeEventBuckets },
      queuedContextEvents: [...state.queuedContextEvents],
    };
    const activeRoute = String(state.lastRouteKey || "").trim();
    if (activeRoute && state.lastRouteStartedAt && now > state.lastRouteStartedAt) {
      const elapsedSeconds = Math.max(1, Math.round((now - state.lastRouteStartedAt) / 1000));
      nextState.routeSecondsByKey[activeRoute] = Number(nextState.routeSecondsByKey[activeRoute] || 0) + elapsedSeconds;
      const bucket = Math.floor(now / SCREEN_TIME_EVENT_BUCKET_MS);
      const lastBucket = Number(nextState.screenTimeEventBuckets[activeRoute] || 0);
      if (nextState.routeSecondsByKey[activeRoute] >= SCREEN_TIME_EVENT_THRESHOLD_SECONDS && lastBucket !== bucket) {
        const eventType = "screen_time_threshold_crossed";
        const entityId = `mobile-screen:${activeRoute}:${bucket}`;
        nextState.queuedContextEvents = [
          ...nextState.queuedContextEvents.filter((item) => item.id !== createQueuedEventId(eventType, entityId)),
          sanitizeEvent({
            id: createQueuedEventId(eventType, entityId),
            sourceApp: "mobile",
            eventType,
            entityId,
            summary: `${activeRoute} stayed open on mobile long enough to trigger a screen-time threshold.`,
            payload: {
              route_key: activeRoute,
              elapsed_seconds: elapsedSeconds,
              total_seconds: nextState.routeSecondsByKey[activeRoute],
              device: "mobile",
            },
            priority: 2,
            scope: { audience: "sage" },
            metadata: { source: "route_presence" },
            queuedAt: now,
          }),
        ].slice(-MAX_QUEUED_CONTEXT_EVENTS);
        nextState.screenTimeEventBuckets[activeRoute] = bucket;
      }
    }
    nextState.lastRouteKey = routeKey;
    nextState.lastRouteStartedAt = routeKey ? now : undefined;
    return nextState;
  });
}
