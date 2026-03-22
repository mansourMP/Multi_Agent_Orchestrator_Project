import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobileSession } from "./types";

const SESSION_KEY = "empyralis.mobile.session.v1";
const RUNTIME_URL_KEY = "runtimeUrl";
const RUNTIME_KEY_KEY = "runtimeKey";

export async function getSession(): Promise<MobileSession | null> {
  const [raw, storedRuntimeUrl, storedRuntimeKey] = await Promise.all([
    SecureStore.getItemAsync(SESSION_KEY),
    AsyncStorage.getItem(RUNTIME_URL_KEY),
    AsyncStorage.getItem(RUNTIME_KEY_KEY),
  ]);

  let parsed: MobileSession | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as MobileSession;
    } catch {
      parsed = null;
    }
  }

  const runtimeUrl = storedRuntimeUrl?.trim() || parsed?.runtimeUrl || "";
  const runtimeKey = storedRuntimeKey?.trim() || parsed?.runtimeKey || "";

  if (!parsed && !runtimeUrl && !runtimeKey) return null;

  try {
    return {
      runtimeUrl,
      runtimeKey,
      workspaceId: parsed?.workspaceId || "default",
      platformUrl: parsed?.platformUrl,
      platformKey: parsed?.platformKey,
    } as MobileSession;
  } catch {
    return null;
  }
}

export async function setSession(session: MobileSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
