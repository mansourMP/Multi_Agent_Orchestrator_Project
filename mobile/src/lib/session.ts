import * as SecureStore from "expo-secure-store";

import type { MobileSession } from "./types";

const SESSION_KEY = "empyralis.mobile.session.v1";

export async function getSession(): Promise<MobileSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MobileSession;
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
