import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { clearSession as clearStoredSession, getSession, setSession as persistSession } from "./session";
import { useSpacesStore } from "./spaces";
import type { MobileSession } from "./types";

type SessionContextValue = {
  session: MobileSession | null;
  hydrated: boolean;
  saveSession: (next: MobileSession) => Promise<void>;
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<MobileSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const loadSpaces = useSpacesStore((state) => state.load);

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
