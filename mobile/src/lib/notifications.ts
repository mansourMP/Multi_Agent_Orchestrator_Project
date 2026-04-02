import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

const STORAGE_KEY = "empyralis.mobile.notifications.v1";

export type StoredNotificationState = {
  permissionStatus: Notifications.PermissionStatus | "undetermined";
  expoPushToken?: string;
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

export async function registerForPushNotificationsAsync(): Promise<StoredNotificationState> {
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
        error: "Expo projectId is missing. Add EAS project configuration before requesting a push token.",
        updatedAt: Date.now(),
      };
      await persist(noProjectId);
      return noProjectId;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const nextState: StoredNotificationState = {
      permissionStatus: finalStatus,
      expoPushToken: token,
      updatedAt: Date.now(),
    };
    await persist(nextState);
    return nextState;
  } catch (error) {
    const failedState: StoredNotificationState = {
      permissionStatus: finalStatus,
      error: error instanceof Error ? error.message : "Could not fetch Expo push token.",
      updatedAt: Date.now(),
    };
    await persist(failedState);
    return failedState;
  }
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
