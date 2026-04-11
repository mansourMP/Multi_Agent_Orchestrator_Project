import { AppState, Platform } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { mobileApi } from "./api";
import { ensureMobileDeviceId } from "./mobile-engine";
import {
  clearSession as clearStoredSession,
  getSession,
  resolvePreferredWorkspaceId,
  sessionNeedsPlatformRefresh,
  sessionUsesPlatformAccount,
  setSession as persistSession,
} from "./session";
import { useSpacesStore } from "./spaces";
import type { MobileSession } from "./types";

type SessionContextValue = {
  session: MobileSession | null;
  hydrated: boolean;
  saveSession: (next: MobileSession) => Promise<void>;
  clearSession: () => Promise<void>;
  refreshSession: (options?: { force?: boolean }) => Promise<MobileSession | null>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const sessionRef = useRef<MobileSession | null>(null);
  const loadSpaces = useSpacesStore((state) => state.load);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;

    Promise.all([getSession(), loadSpaces()])
      .then(([stored]) => {
        if (!active) return;
        setSessionState(stored);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [loadSpaces]);

  const saveSession = useCallback(async (next: MobileSession) => {
    await persistSession(next);
    setSessionState(next);
  }, []);

  const clearSession = useCallback(async () => {
    await clearStoredSession();
    setSessionState(null);
  }, []);

  const refreshSession = useCallback(async (options?: { force?: boolean }) => {
    const current = sessionRef.current;
    if (!current || !sessionUsesPlatformAccount(current)) return current;
    if (!options?.force && !sessionNeedsPlatformRefresh(current)) return current;
    const refreshToken = String(current.sessionRecovery?.refreshToken || "").trim();
    if (!refreshToken || current.sessionRecovery?.needsReauth) return current;

    try {
      const deviceId = await ensureMobileDeviceId(current.deviceId);
      const payload = await mobileApi.refreshAccountSession({
        runtimeUrl: current.runtimeUrl,
        refreshToken,
        deviceId,
        deviceName: current.deviceLink?.display_name || "Empyralis mobile",
        devicePlatform: current.deviceLink?.platform || Platform.OS,
        workspaceId: current.workspaceId,
      });
      const nextWorkspaceId = resolvePreferredWorkspaceId(
        current.workspaceId,
        payload.workspace_access || current.workspaceAccess,
        {
          currentWorkspaceId: payload.current_workspace_id || current.currentWorkspaceId,
          defaultWorkspaceId: payload.default_workspace_id || current.defaultWorkspaceId,
        },
      );
      const next: MobileSession = {
        ...current,
        authMode: "platform_account",
        authToken: String(payload.token || "").trim() || undefined,
        workspaceId: nextWorkspaceId,
        currentWorkspaceId: payload.current_workspace_id || nextWorkspaceId,
        defaultWorkspaceId: payload.default_workspace_id || current.defaultWorkspaceId || nextWorkspaceId,
        currentTenantId: payload.current_tenant_id || current.currentTenantId,
        defaultTenantId: payload.default_tenant_id || current.defaultTenantId,
        user: payload.user || current.user,
        workspaceAccess: payload.workspace_access || current.workspaceAccess,
        tenantAccess: payload.tenant_access || current.tenantAccess,
        authSession: payload.auth_session || current.authSession,
        deviceLink: payload.device_link || current.deviceLink,
        sessionRecovery: {
          ...(payload.session_recovery || current.sessionRecovery || {}),
          needsReauth: false,
          recoveryReason: undefined,
        },
        identityBoundary: payload.identity_boundary || current.identityBoundary,
        enterpriseSecurity: payload.enterprise_security || current.enterpriseSecurity,
        deviceId,
        sessionLinkedAt: current.sessionLinkedAt || new Date().toISOString(),
      };
      await persistSession(next);
      setSessionState(next);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session recovery failed.";
      const normalized = message.toLowerCase();
      const requiresReauth =
        normalized.includes("refresh token")
        || normalized.includes("session is no longer active")
        || normalized.includes("device trust was revoked")
        || normalized.includes("device is not active")
        || normalized.includes("device is not linked")
        || normalized.includes("must be refreshed")
        || normalized.includes("expired");
      if (!requiresReauth) {
        return current;
      }
      const next: MobileSession = {
        ...current,
        authMode: "platform_account",
        authToken: undefined,
        authSession: current.authSession
          ? {
              ...current.authSession,
              status: "revoked",
            }
          : current.authSession,
        sessionRecovery: {
          ...(current.sessionRecovery || {}),
          refreshToken: undefined,
          needsReauth: true,
          recoveryReason: message,
          active: false,
        },
      };
      await persistSession(next);
      setSessionState(next);
      return next;
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!sessionUsesPlatformAccount(sessionRef.current)) return;
    if (!sessionNeedsPlatformRefresh(sessionRef.current)) return;
    void refreshSession();
  }, [hydrated, refreshSession, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshSession();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshSession]);

  const value = useMemo(
    () => ({
      session,
      hydrated,
      saveSession,
      clearSession,
      refreshSession,
    }),
    [clearSession, hydrated, refreshSession, saveSession, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionState() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSessionState must be used inside SessionProvider");
  }
  return value;
}
