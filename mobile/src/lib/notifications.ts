import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { NotificationItem } from "@shared/api-contract";
import { mobileApi } from "./api";
import {
  ensureMobileDeviceId,
  queuePersonalContextEvent,
  recordNotificationSync,
} from "./mobile-engine";
import type { MobileSession } from "./types";

const STORAGE_KEY = "empyralis.mobile.notifications.v1";
const RUNTIME_SYNC_STORAGE_KEY = "empyralis.mobile.notifications.runtime-sync.v1";

export type StoredNotificationState = {
  permissionStatus: Notifications.PermissionStatus | "undetermined";
  expoPushToken?: string;
  deviceId?: string;
  runtimeRegistration?: {
    status?: string;
    workspaceId?: string;
    tenantId?: string;
    registeredAt?: string;
  };
  error?: string;
  updatedAt?: number;
};

type NotificationRouteData = {
  url?: string;
  path?: string;
  screen?: string;
  agentId?: string;
  tab?: string;
};

type RuntimeSyncState = {
  deliveredIds: string[];
  lastSyncedAt?: number;
};

export type RuntimeNotificationSyncResult = {
  freshCount: number;
  queuedContextEventCount: number;
  highPriorityCount: number;
  lastSyncedAt: number;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function persist(state: StoredNotificationState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function getRuntimeSyncState(): Promise<RuntimeSyncState> {
  const raw = await AsyncStorage.getItem(RUNTIME_SYNC_STORAGE_KEY);
  if (!raw) return { deliveredIds: [] };
  try {
    const parsed = JSON.parse(raw) as RuntimeSyncState;
    return {
      deliveredIds: Array.isArray(parsed.deliveredIds) ? parsed.deliveredIds.map((item) => String(item || "")).filter(Boolean).slice(-200) : [],
      lastSyncedAt: parsed.lastSyncedAt,
    };
  } catch {
    return { deliveredIds: [] };
  }
}

async function persistRuntimeSyncState(state: RuntimeSyncState) {
  await AsyncStorage.setItem(RUNTIME_SYNC_STORAGE_KEY, JSON.stringify({
    deliveredIds: state.deliveredIds.slice(-200),
    lastSyncedAt: state.lastSyncedAt ?? Date.now(),
  }));
}

export async function getStoredNotificationState(): Promise<StoredNotificationState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { permissionStatus: "undetermined" };
  }

  try {
    return JSON.parse(raw) as StoredNotificationState;
  } catch {
    return { permissionStatus: "undetermined" };
  }
}

async function ensureStoredDeviceId(existing?: string): Promise<string> {
  const current = String(existing || "").trim();
  if (current) return current;
  const state = await getStoredNotificationState();
  const fromState = String(state.deviceId || "").trim();
  if (fromState) return fromState;
  const nextId = await ensureMobileDeviceId();
  await persist({ ...state, deviceId: nextId, updatedAt: Date.now() });
  return nextId;
}

export async function configureNotificationChannelAsync() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("agent-alerts", {
    name: "Sage alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#111827",
  });
}

function getProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
}

export async function registerForPushNotificationsAsync(session?: MobileSession | null): Promise<StoredNotificationState> {
  await configureNotificationChannelAsync();

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    const deniedState: StoredNotificationState = {
      permissionStatus: finalStatus,
      error: "Notifications permission not granted.",
      updatedAt: Date.now(),
    };
    await persist(deniedState);
    return deniedState;
  }

  try {
    const projectId = getProjectId();
    if (!projectId) {
      const noProjectId: StoredNotificationState = {
        permissionStatus: finalStatus,
        deviceId: await ensureStoredDeviceId(),
        error: "Expo projectId is missing. Add EAS project configuration before requesting a push token.",
        updatedAt: Date.now(),
      };
      await persist(noProjectId);
      return noProjectId;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const deviceId = await ensureStoredDeviceId();
    const nextState: StoredNotificationState = {
      permissionStatus: finalStatus,
      expoPushToken: token,
      deviceId,
      updatedAt: Date.now(),
    };
    if (session?.runtimeUrl && session?.runtimeKey) {
      try {
        const registration = await mobileApi.registerNotificationDevice(session, {
          device_id: deviceId,
          push_token: token,
          provider: "expo",
          platform: Platform.OS,
          device_name: `${Platform.OS} mobile`,
          app_id: "kin-mobile",
          capabilities: ["push"],
        });
        nextState.runtimeRegistration = {
          status: registration.status,
          workspaceId: registration.workspace_id,
          tenantId: registration.tenant_id ?? undefined,
          registeredAt: registration.registered_at ?? undefined,
        };
      } catch (error) {
        nextState.error = error instanceof Error ? error.message : "Runtime device registration failed.";
      }
    }
    await persist(nextState);
    return nextState;
  } catch (error) {
    const failedState: StoredNotificationState = {
      permissionStatus: finalStatus,
      deviceId: await ensureStoredDeviceId(),
      error: error instanceof Error ? error.message : "Could not fetch Expo push token.",
      updatedAt: Date.now(),
    };
    await persist(failedState);
    return failedState;
  }
}

function parsePriority(item: NotificationItem) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const explicit = Number((metadata as Record<string, unknown>).priority ?? -1);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const action = String(item.action || "").toLowerCase();
  const text = String(item.text || "").toLowerCase();
  if (action.includes("approval") || text.includes("urgent") || text.includes("asap")) return 4;
  if (action.includes("message") || text.includes("reply")) return 3;
  return 2;
}

function isMessageAwaitingReply(item: NotificationItem) {
  const channel = String(item.channel || "").toLowerCase();
  const action = String(item.action || "").toLowerCase();
  const text = String(item.text || "").toLowerCase();
  return (
    channel === "telegram" ||
    channel === "whatsapp" ||
    channel === "email" ||
    channel === "web_chat" ||
    action.includes("message") ||
    text.includes("awaiting reply") ||
    text.includes("needs reply")
  );
}

function isReminderIgnored(item: NotificationItem) {
  const action = String(item.action || "").toLowerCase();
  const text = String(item.text || "").toLowerCase();
  return (
    (action.includes("reminder") || text.includes("reminder")) &&
    (text.includes("ignored") || text.includes("missed") || text.includes("overdue"))
  );
}

async function queueEventsFromNotification(item: NotificationItem) {
  const queued: string[] = [];
  const id = String(item.id || item.message_id || item.trace_id || item.run_id || "").trim();
  const routePayload = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  if (!id) return queued;

  if (isMessageAwaitingReply(item)) {
    await queuePersonalContextEvent({
      sourceApp: "mobile_notifications",
      eventType: "message_awaiting_reply",
      entityId: `notification:${id}`,
      summary: item.text || `A ${item.channel || "customer"} message is waiting for reply.`,
      payload: {
        notification_id: id,
        channel: item.channel,
        session_key: item.session_key,
        route: routePayload,
      },
      priority: Math.max(3, parsePriority(item)),
      scope: { audience: "sage" },
      metadata: { source: "runtime_notification" },
    });
    queued.push("message_awaiting_reply");
  }

  if (isReminderIgnored(item)) {
    await queuePersonalContextEvent({
      sourceApp: "mobile_notifications",
      eventType: "reminder_ignored",
      entityId: `notification:${id}:reminder`,
      summary: item.text || "A reminder looks ignored or overdue.",
      payload: {
        notification_id: id,
        channel: item.channel,
        route: routePayload,
      },
      priority: Math.max(3, parsePriority(item)),
      scope: { audience: "sage" },
      metadata: { source: "runtime_notification" },
    });
    queued.push("reminder_ignored");
  }

  return queued;
}

export async function syncRuntimeNotifications(session: MobileSession): Promise<RuntimeNotificationSyncResult> {
  let permission = await getStoredNotificationState();
  if (permission.permissionStatus !== "granted") {
    return {
      freshCount: 0,
      queuedContextEventCount: 0,
      highPriorityCount: 0,
      lastSyncedAt: Date.now(),
    };
  }
  if (!permission.expoPushToken || !permission.deviceId || !permission.runtimeRegistration?.registeredAt) {
    permission = await registerForPushNotificationsAsync(session);
  }

  const syncState = await getRuntimeSyncState();
  const payload = await mobileApi.getNotifications(session, {
    workspace_id: session.workspaceId,
    include_backlog: true,
    limit: 12,
  });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const delivered = new Set(syncState.deliveredIds);
  const fresh = items.filter((item) => {
    const id = String(item?.id ?? "");
    return id && !delivered.has(id);
  });
  let queuedContextEventCount = 0;
  let highPriorityCount = 0;
  for (const item of fresh) {
    const id = String(item?.id ?? "");
    if (id) delivered.add(id);
    const queued = await queueEventsFromNotification(item);
    queuedContextEventCount += queued.length;
    if (parsePriority(item) >= 3) {
      highPriorityCount += 1;
    }
  }

  const lastSyncedAt = Date.now();
  await persistRuntimeSyncState({
    deliveredIds: [...delivered],
    lastSyncedAt,
  });
  await recordNotificationSync({
    freshCount: fresh.length,
  });
  return {
    freshCount: fresh.length,
    queuedContextEventCount,
    highPriorityCount,
    lastSyncedAt,
  };
}

export function getNotificationHref(data: NotificationRouteData | undefined | null) {
  if (!data) return null;
  if (typeof data.url === "string" && data.url.trim()) return data.url.trim();
  if (typeof data.path === "string" && data.path.trim()) return data.path.trim().startsWith("/") ? data.path.trim() : `/${data.path.trim()}`;
  if (typeof data.agentId === "string" && data.agentId.trim()) return "/chats";
  if (typeof data.screen === "string" && data.screen.trim()) {
    const screen = data.screen.trim().toLowerCase();
    if (screen === "today" || screen === "home") return "/home";
    if (screen === "spaces" || screen === "inbox" || screen === "notifications") return "/inbox";
    if (screen === "apps") return "/apps";
    if (screen === "chats" || screen === "kin" || screen === "chat") return "/chats";
    if (screen === "profile" || screen === "settings") return "/settings";
  }
  if (typeof data.tab === "string" && data.tab.trim()) {
    const normalized = data.tab.trim().toLowerCase();
    if (normalized === "today") return "/home";
    if (normalized === "spaces" || normalized === "notifications") return "/inbox";
    if (normalized === "chats" || normalized === "chat") return "/chats";
    return `/${normalized}`;
  }
  return null;
}

export async function scheduleAgentTestNotification(options?: {
  title?: string;
  body?: string;
  agentId?: string;
  path?: string;
}) {
  await configureNotificationChannelAsync();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: options?.title || "Sage",
      body: options?.body || "Test notification from Sage. Tap to open the conversation.",
      data: {
        url: options?.path || (options?.agentId ? "/chats" : "/home"),
        agentId: options?.agentId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
    },
  });
}
