import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";

import { clearSession as clearStoredSession, getSession, setSession as persistSession } from "./session";
import {
  getDefaultRuntimeUrl,
  getConfiguredBootstrapSession,
  getDefaultPlatformUrl,
  configureMobileAuthSessionHandlers,
  MobileAuthExpiredError,
  mobileApi,
} from "./api";
import { ensureMobileDeviceId } from "./mobile-engine";
import { useSpacesStore } from "./spaces";
import type { MobileSession } from "./types";

type SessionContextValue = {
  session: MobileSession | null;
  hydrated: boolean;
  saveSession: (next: MobileSession) => Promise<void>;
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function bootstrapSession(existing: MobileSession | null): Promise<MobileSession | null> {
  const platformUrl = getDefaultPlatformUrl() || existing?.platformUrl;
  const directSession = getConfiguredBootstrapSession();
  if (directSession?.runtimeKey) {
    const deviceId = await ensureMobileDeviceId(existing?.deviceId);
    return {
      ...existing,
      ...directSession,
      platformUrl,
      deviceId,
      sessionLinkedAt: existing?.sessionLinkedAt || new Date().toISOString(),
    };
  }
  const runtimeUrl = existing?.runtimeUrl || getDefaultRuntimeUrl();
  if (!runtimeUrl) {
    if (existing?.deviceId) {
      await ensureMobileDeviceId(existing.deviceId);
    }
    return null;
  }

  if (existing?.runtimeKey) {
    const deviceId = await ensureMobileDeviceId(existing.deviceId);
    const restoredSession = {
      ...existing,
      runtimeUrl: existing.runtimeUrl || runtimeUrl,
      platformUrl,
      deviceId,
      sessionLinkedAt: existing.sessionLinkedAt || new Date().toISOString(),
    };
    try {
      await mobileApi.getAccountShell(restoredSession);
      return restoredSession;
    } catch (error) {
      if (error instanceof MobileAuthExpiredError) {
        return null;
      }
      return null;
    }
  }
  if (existing?.deviceId) {
    await ensureMobileDeviceId(existing.deviceId);
  }
  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const loadSpaces = useSpacesStore((state) => state.load);
  const sessionRef = useRef<MobileSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let active = true;

    Promise.all([getSession(), loadSpaces()])
      .then(async ([stored]) => {
        const resolved = await bootstrapSession(stored);
        if (resolved && (!stored || stored.runtimeKey !== resolved.runtimeKey || stored.workspaceId !== resolved.workspaceId)) {
          await persistSession(resolved);
        } else if (!resolved && stored) {
          await clearStoredSession();
        }
        if (!active) return;
        setSessionState(resolved);
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

  useEffect(() => {
    configureMobileAuthSessionHandlers({
      getSession: () => sessionRef.current,
      saveSession: async (next) => {
        await persistSession(next);
        setSessionState(next);
      },
      signOut: async () => {
        await clearStoredSession();
        setSessionState(null);
        router.replace("/login");
      },
    });
    return () => {
      configureMobileAuthSessionHandlers({});
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      hydrated,
      saveSession,
      clearSession,
    }),
    [clearSession, hydrated, saveSession, session],
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
