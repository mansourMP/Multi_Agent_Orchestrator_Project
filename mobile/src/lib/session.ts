import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobileSession } from "./types";

const SESSION_KEY = "empyralis.mobile.session.v1";
const LEGACY_RUNTIME_URL_KEY = "runtimeUrl";
const LEGACY_RUNTIME_KEY_KEY = "runtimeKey";

export async function getSession(): Promise<MobileSession | null> {
  const [raw, legacyRuntimeUrl, legacyRuntimeKey] = await Promise.all([
    SecureStore.getItemAsync(SESSION_KEY),
    AsyncStorage.getItem(LEGACY_RUNTIME_URL_KEY),
    AsyncStorage.getItem(LEGACY_RUNTIME_KEY_KEY),
  ]);

  let parsed: MobileSession | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as MobileSession;
    } catch {
      parsed = null;
    }
  }

  const runtimeUrl = legacyRuntimeUrl?.trim() || parsed?.runtimeUrl || "";
  const runtimeKey = legacyRuntimeKey?.trim() || parsed?.runtimeKey || "";

  if (!parsed && !runtimeUrl && !runtimeKey) return null;

  const next: MobileSession = {
    runtimeUrl,
    runtimeKey,
    authScheme: parsed?.authScheme || "api_key",
    tenantId: parsed?.tenantId,
    workspaceId: parsed?.workspaceId,
    platformUrl: parsed?.platformUrl,
    platformKey: parsed?.platformKey,
    refreshToken: parsed?.refreshToken,
    refreshExpiresAt: parsed?.refreshExpiresAt,
    authSessionId: parsed?.authSessionId,
    userEmail: parsed?.userEmail,
    userDisplayName: parsed?.userDisplayName,
    pairingMethod: parsed?.pairingMethod,
    pairedAt: parsed?.pairedAt,
    pairingId: parsed?.pairingId,
    pairingExpiresAt: parsed?.pairingExpiresAt,
    pairingLabel: parsed?.pairingLabel,
    deviceId: parsed?.deviceId,
    sessionLinkedAt: parsed?.sessionLinkedAt,
  };

  if (legacyRuntimeUrl || legacyRuntimeKey) {
    await Promise.all([
      SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next)),
      AsyncStorage.removeItem(LEGACY_RUNTIME_URL_KEY),
      AsyncStorage.removeItem(LEGACY_RUNTIME_KEY_KEY),
    ]);
  }

  return next;
}

export async function setSession(session: MobileSession) {
  await Promise.all([
    SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session)),
    AsyncStorage.removeItem(LEGACY_RUNTIME_URL_KEY),
    AsyncStorage.removeItem(LEGACY_RUNTIME_KEY_KEY),
  ]);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_KEY),
    AsyncStorage.removeItem(LEGACY_RUNTIME_URL_KEY),
    AsyncStorage.removeItem(LEGACY_RUNTIME_KEY_KEY),
  ]);
}
