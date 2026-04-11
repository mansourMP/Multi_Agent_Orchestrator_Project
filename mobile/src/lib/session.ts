import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MobileSession } from "./types";

const SESSION_KEY = "empyralis.mobile.session.v1";
const LEGACY_RUNTIME_URL_KEY = "runtimeUrl";
const LEGACY_RUNTIME_KEY_KEY = "runtimeKey";

function trimString(value?: string | null) {
  return String(value || "").trim();
}

function normalizeWorkspaceAccess(
  value: MobileSession["workspaceAccess"],
): NonNullable<MobileSession["workspaceAccess"]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => (entry && typeof entry === "object" ? entry : null))
    .filter((entry): entry is NonNullable<MobileSession["workspaceAccess"]>[number] => Boolean(entry))
    .map((entry) => ({
      ...entry,
      workspace_id: trimString(entry.workspace_id),
      tenant_id: trimString(entry.tenant_id || "") || undefined,
      role: trimString(entry.role || "") || undefined,
      trusted_owner_machine_ids: Array.isArray(entry.trusted_owner_machine_ids)
        ? entry.trusted_owner_machine_ids.map((item) => trimString(item)).filter(Boolean)
        : undefined,
    }))
    .filter((entry) => entry.workspace_id);
  return items.length > 0 ? items : undefined;
}

export function resolvePreferredWorkspaceId(
  requestedWorkspaceId: string | undefined,
  workspaceAccess: MobileSession["workspaceAccess"],
  options?: {
    currentWorkspaceId?: string | null;
    defaultWorkspaceId?: string | null;
  },
) {
  const access = normalizeWorkspaceAccess(workspaceAccess);
  const requested = trimString(requestedWorkspaceId);
  if (requested && Array.isArray(access) && access.some((item) => item.workspace_id === requested)) {
    return requested;
  }
  const currentWorkspaceId = trimString(options?.currentWorkspaceId);
  if (currentWorkspaceId && Array.isArray(access) && access.some((item) => item.workspace_id === currentWorkspaceId)) {
    return currentWorkspaceId;
  }
  const defaultWorkspaceId = trimString(options?.defaultWorkspaceId);
  if (defaultWorkspaceId && Array.isArray(access) && access.some((item) => item.workspace_id === defaultWorkspaceId)) {
    return defaultWorkspaceId;
  }
  return access?.[0]?.workspace_id || requested || defaultWorkspaceId || currentWorkspaceId || "default";
}

function normalizeSessionRecovery(
  value: MobileSession["sessionRecovery"],
): MobileSession["sessionRecovery"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const refreshToken = trimString(
    typeof raw.refreshToken === "string" ? raw.refreshToken : typeof raw.refresh_token === "string" ? raw.refresh_token : "",
  );
  const issuedAt = typeof raw.issued_at === "number" ? raw.issued_at : typeof raw.issuedAt === "number" ? raw.issuedAt : undefined;
  const updatedAt = typeof raw.updated_at === "number" ? raw.updated_at : typeof raw.updatedAt === "number" ? raw.updatedAt : undefined;
  const refreshExpiresAt = typeof raw.refresh_expires_at === "number"
    ? raw.refresh_expires_at
    : typeof raw.refreshExpiresAt === "number"
      ? raw.refreshExpiresAt
      : undefined;
  const rotatedAt = typeof raw.rotated_at === "number" ? raw.rotated_at : typeof raw.rotatedAt === "number" ? raw.rotatedAt : undefined;
  const revokedAt = typeof raw.revoked_at === "number" ? raw.revoked_at : typeof raw.revokedAt === "number" ? raw.revokedAt : undefined;
  return {
    session_id: trimString(typeof raw.session_id === "string" ? raw.session_id : typeof raw.sessionId === "string" ? raw.sessionId : "") || undefined,
    issued_at: issuedAt,
    updated_at: updatedAt,
    refreshToken: refreshToken || undefined,
    refresh_expires_at: refreshExpiresAt,
    rotated_at: rotatedAt,
    revoked_at: revokedAt,
    revoked_reason: trimString(typeof raw.revoked_reason === "string" ? raw.revoked_reason : typeof raw.revokedReason === "string" ? raw.revokedReason : "") || undefined,
    active: typeof raw.active === "boolean" ? raw.active : undefined,
    needsReauth: typeof raw.needsReauth === "boolean" ? raw.needsReauth : undefined,
    recoveryReason: trimString(typeof raw.recoveryReason === "string" ? raw.recoveryReason : "") || undefined,
  };
}

function normalizeSession(parsed?: Partial<MobileSession> | null, legacyRuntimeUrl?: string | null, legacyRuntimeKey?: string | null): MobileSession | null {
  const workspaceAccess = normalizeWorkspaceAccess(parsed?.workspaceAccess);
  const runtimeUrl = trimString(legacyRuntimeUrl) || trimString(parsed?.runtimeUrl);
  const runtimeKey = trimString(legacyRuntimeKey) || trimString(parsed?.runtimeKey);
  const authToken = trimString(parsed?.authToken);
  const sessionRecovery = normalizeSessionRecovery(parsed?.sessionRecovery);
  const currentWorkspaceId = trimString(parsed?.currentWorkspaceId);
  const defaultWorkspaceId = trimString(parsed?.defaultWorkspaceId);
  const workspaceId = resolvePreferredWorkspaceId(parsed?.workspaceId, workspaceAccess, {
    currentWorkspaceId,
    defaultWorkspaceId,
  });
  const currentWorkspaceEntry = workspaceAccess?.find((entry) => entry.workspace_id === (currentWorkspaceId || workspaceId));
  const defaultWorkspaceEntry = workspaceAccess?.find((entry) => entry.workspace_id === (defaultWorkspaceId || workspaceId));

  if (!parsed && !runtimeUrl && !runtimeKey && !authToken && !sessionRecovery?.refreshToken) return null;

  return {
    authMode: authToken || sessionRecovery?.refreshToken ? "platform_account" : "runtime_key",
    runtimeUrl,
    runtimeKey,
    workspaceId,
    currentWorkspaceId: currentWorkspaceId || workspaceId,
    defaultWorkspaceId: defaultWorkspaceId || workspaceId,
    currentTenantId: trimString(parsed?.currentTenantId) || trimString(currentWorkspaceEntry?.tenant_id) || undefined,
    defaultTenantId: trimString(parsed?.defaultTenantId) || trimString(defaultWorkspaceEntry?.tenant_id) || trimString(currentWorkspaceEntry?.tenant_id) || undefined,
    authToken: authToken || undefined,
    user: parsed?.user && typeof parsed.user === "object" ? parsed.user : undefined,
    workspaceAccess,
    tenantAccess: Array.isArray(parsed?.tenantAccess) ? parsed?.tenantAccess : undefined,
    authSession: parsed?.authSession && typeof parsed.authSession === "object" ? parsed.authSession : undefined,
    deviceLink: parsed?.deviceLink && typeof parsed.deviceLink === "object" ? parsed.deviceLink : undefined,
    sessionRecovery,
    identityBoundary: parsed?.identityBoundary && typeof parsed.identityBoundary === "object" ? parsed.identityBoundary : undefined,
    enterpriseSecurity: parsed?.enterpriseSecurity && typeof parsed.enterpriseSecurity === "object" ? parsed.enterpriseSecurity : undefined,
    platformUrl: trimString(parsed?.platformUrl) || undefined,
    platformKey: trimString(parsed?.platformKey) || undefined,
    pairingMethod: parsed?.pairingMethod,
    pairedAt: trimString(parsed?.pairedAt) || undefined,
    pairingId: trimString(parsed?.pairingId) || undefined,
    pairingExpiresAt: trimString(parsed?.pairingExpiresAt) || undefined,
    pairingLabel: trimString(parsed?.pairingLabel) || undefined,
    deviceId: trimString(parsed?.deviceId) || undefined,
    sessionLinkedAt: trimString(parsed?.sessionLinkedAt) || undefined,
  };
}

export function sessionUsesPlatformAccount(session?: Partial<MobileSession> | null) {
  return trimString(session?.authToken) !== ""
    || trimString(session?.sessionRecovery?.refreshToken) !== ""
    || String(session?.authMode || "").trim() === "platform_account";
}

export function sessionHasRuntimeAccess(session?: Partial<MobileSession> | null): session is MobileSession {
  return trimString(session?.runtimeUrl) !== ""
    && trimString(session?.workspaceId) !== ""
    && (
      sessionUsesPlatformAccount(session) || trimString(session?.runtimeKey) !== ""
    );
}

export function sessionAuthHeaders(session?: Partial<MobileSession> | null): Record<string, string> | undefined {
  const authToken = trimString(session?.authToken);
  if (authToken) {
    return { Authorization: `Bearer ${authToken}` };
  }
  const runtimeKey = trimString(session?.runtimeKey);
  if (runtimeKey) {
    return { "X-API-Key": runtimeKey };
  }
  return undefined;
}

export function sessionNeedsPlatformRefresh(
  session?: Partial<MobileSession> | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
) {
  if (!sessionUsesPlatformAccount(session)) return false;
  if (session?.sessionRecovery?.needsReauth) return false;
  if (trimString(session?.sessionRecovery?.refreshToken) === "") return false;
  if (trimString(session?.authToken) === "") return true;
  const expiresAt = Number(session?.authSession?.expires_at || 0);
  if (!expiresAt) return true;
  const refreshWindowSeconds = 60 * 60 * 24 * 7;
  return expiresAt - nowSeconds <= refreshWindowSeconds;
}

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

  const next = normalizeSession(parsed, legacyRuntimeUrl, legacyRuntimeKey);
  if (!next) return null;

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
    SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(normalizeSession(session) ?? session)),
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
