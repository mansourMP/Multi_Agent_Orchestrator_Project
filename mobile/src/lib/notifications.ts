import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { mobileApi } from "./api";
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

function buildLocalDeviceId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  const nextId = buildLocalDeviceId();
  await persist({ ...state, deviceId: nextId, updatedAt: Date.now() });
  return nextId;
}

export async function configureNotificationChannelAsync() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("agent-alerts", {
    name: "Agent alerts",
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

export async function syncRuntimeNotifications(session: MobileSession): Promise<number> {
  let permission = await getStoredNotificationState();
  if (permission.permissionStatus !== "granted") {
    return 0;
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
  for (const item of fresh) {
    const id = String(item?.id ?? "");
    if (id) delivered.add(id);
  }

  await persistRuntimeSyncState({
    deliveredIds: [...delivered],
    lastSyncedAt: Date.now(),
  });
  return fresh.length;
}

export function getNotificationHref(data: NotificationRouteData | undefined | null) {
  if (!data) return null;
  if (typeof data.url === "string" && data.url.trim()) return data.url.trim();
  if (typeof data.path === "string" && data.path.trim()) return data.path.trim().startsWith("/") ? data.path.trim() : `/${data.path.trim()}`;
  if (typeof data.agentId === "string" && data.agentId.trim()) return "/kin";
  if (typeof data.screen === "string" && data.screen.trim()) {
    const screen = data.screen.trim().toLowerCase();
    if (screen === "today" || screen === "home") return "/home";
    if (screen === "spaces" || screen === "inbox") return "/inbox";
    if (screen === "apps") return "/apps";
    if (screen === "chats" || screen === "kin") return "/kin";
    if (screen === "profile" || screen === "settings") return "/profile";
  }
  if (typeof data.tab === "string" && data.tab.trim()) {
    const normalized = data.tab.trim().toLowerCase();
    if (normalized === "today") return "/home";
    if (normalized === "spaces") return "/inbox";
    if (normalized === "chats") return "/kin";
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
      title: options?.title || "KIN",
      body: options?.body || "Test notification from KIN. Tap to open the conversation.",
      data: {
        url: options?.path || (options?.agentId ? "/kin" : "/home"),
        agentId: options?.agentId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
    },
  });
}
