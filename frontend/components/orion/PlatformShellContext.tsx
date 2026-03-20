'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SETUP_STORAGE_KEYS } from '@/app/page.catalog';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

export type PlatformAccessMode = 'default' | 'full';

type PlatformShellStatus = {
  setupReady: boolean;
  setupProgressCount: number;
  runtimeHealthy: boolean | null;
  onlineWorkers: number;
  pendingApprovals: number;
};

type PlatformShellContextValue = {
  accessMode: PlatformAccessMode;
  setAccessMode: (mode: PlatformAccessMode) => void;
  status: PlatformShellStatus;
};

const ACCESS_MODE_STORAGE_KEY = 'orion.platform.access.mode.v1';
const RUNTIME_URL = process.env.NEXT_PUBLIC_ORION_API_URL || 'http://127.0.0.1:8001';

const PlatformShellContext = createContext<PlatformShellContextValue | null>(null);

function readSetupSnapshot(): { setupReady: boolean; setupProgressCount: number; accessMode: PlatformAccessMode | null } {
  if (typeof window === 'undefined') {
    return { setupReady: false, setupProgressCount: 0, accessMode: null };
  }

  try {
    const raw = SETUP_STORAGE_KEYS
      .map((key) => window.localStorage.getItem(key))
      .find((value) => Boolean(value && value.trim()));
    if (!raw) {
      return { setupReady: false, setupProgressCount: 0, accessMode: null };
    }
    const saved = JSON.parse(raw);
    const runtimeReady = Boolean(saved?.setupStatus?.runtimeReady);
    const accountConnected = Boolean(saved?.setupStatus?.accountConnected);
    const connectionTested = Boolean(saved?.setupStatus?.connectionTested);
    const trustMode = typeof saved?.trustMode === 'string' ? String(saved.trustMode).trim().toLowerCase() : '';
    return {
      setupReady: runtimeReady && accountConnected && connectionTested,
      setupProgressCount: [runtimeReady, accountConnected, connectionTested].filter(Boolean).length,
      accessMode: trustMode === 'auto' ? 'full' : trustMode ? 'default' : null,
    };
  } catch {
    return { setupReady: false, setupProgressCount: 0, accessMode: null };
  }
}

const INITIAL_STATUS: PlatformShellStatus = {
  setupReady: false,
  setupProgressCount: 0,
  runtimeHealthy: null,
  onlineWorkers: 0,
  pendingApprovals: 0,
};

export function PlatformShellProvider({ children }: { children: React.ReactNode }) {
  const [accessMode, setAccessMode] = useState<PlatformAccessMode>('default');
  const [status, setStatus] = useState<PlatformShellStatus>(INITIAL_STATUS);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCESS_MODE_STORAGE_KEY, accessMode);
    } catch {
      // ignore local storage write issues
    }
  }, [accessMode]);

  useEffect(() => {
    const refreshSetup = () => {
      const next = readSetupSnapshot();
      setStatus((current) => ({
        ...current,
        setupReady: next.setupReady,
        setupProgressCount: next.setupProgressCount,
      }));
    };

    const initialRefresh = window.setTimeout(refreshSetup, 0);
    const timer = window.setInterval(refreshSetup, 4000);
    window.addEventListener('focus', refreshSetup);
    document.addEventListener('visibilitychange', refreshSetup);
    window.addEventListener('storage', refreshSetup);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshSetup);
      document.removeEventListener('visibilitychange', refreshSetup);
      window.removeEventListener('storage', refreshSetup);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const refreshRemote = async () => {
      try {
        const headers: HeadersInit = { 'X-API-Key': readRuntimeApiKeyFromStorage('replace-with-strong-key') };
        const [healthRes, workersRes, historyRes] = await Promise.allSettled([
          fetch(`${RUNTIME_URL}/health`, { headers }),
          fetch(`${RUNTIME_URL}/local/workers/status`, { headers }),
          fetch(`${RUNTIME_URL}/history/runs?limit=40&workspace_id=default`, { headers }),
        ]);

        const runtimeHealthy =
          healthRes.status === 'fulfilled'
            ? healthRes.value.ok
            : null;

        const workersPayload =
          workersRes.status === 'fulfilled' && workersRes.value.ok
            ? await workersRes.value.json().catch(() => null)
            : null;
        const onlineWorkers = Number(workersPayload?.summary?.online || 0);

        const historyPayload =
          historyRes.status === 'fulfilled' && historyRes.value.ok
            ? await historyRes.value.json().catch(() => null)
            : null;
        const historyItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
        const pendingApprovals = historyItems.filter((item: unknown) => {
          const record = item as Record<string, unknown>;
          return String(record?.status || '').toLowerCase() === 'waiting_for_input';
        }).length;

        if (alive) {
          setStatus((current) => ({
            ...current,
            runtimeHealthy,
            onlineWorkers,
            pendingApprovals,
          }));
        }
      } catch {
        if (alive) {
          setStatus((current) => ({
            ...current,
            runtimeHealthy: null,
          }));
        }
      }
    };

    void refreshRemote();
    const timer = window.setInterval(() => {
      void refreshRemote();
    }, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const value = useMemo(
    () => ({
      accessMode,
      setAccessMode,
      status,
    }),
    [accessMode, status],
  );

  return <PlatformShellContext.Provider value={value}>{children}</PlatformShellContext.Provider>;
}

export function usePlatformShell() {
  const context = useContext(PlatformShellContext);
  if (!context) {
    throw new Error('usePlatformShell must be used inside PlatformShellProvider');
  }
  return context;
}
