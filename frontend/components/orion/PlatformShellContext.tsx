'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SETUP_STORAGE_KEYS } from '@/app/page.catalog';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

export type PlatformAccessMode = 'default' | 'full';

export type PlatformRunDetailContract = {
  provider_model?: {
    requested_provider?: string | null;
    effective_provider?: string | null;
    requested_model?: string | null;
    effective_model?: string | null;
    provider_overridden?: boolean;
    model_overridden?: boolean;
    fallback_used?: boolean;
    fallback_reason?: string | null;
  } | null;
  approval_outcome?: {
    status?: string | null;
    label?: string | null;
  } | null;
  connector_mutation?: {
    binding?: {
      label?: string | null;
      connector?: string | null;
      channel?: string | null;
      identity_label?: string | null;
      routing_scope?: string | null;
    } | null;
    action?: Record<string, unknown> | null;
    execution_label?: string | null;
    action_label?: string | null;
    system_label?: string | null;
    target_label?: string | null;
    result_label?: string | null;
  } | null;
  evidence_items?: Array<{
    id?: string | null;
    label?: string | null;
    value?: string | null;
  }> | null;
} | null;

export type PlatformInspectState = {
  runId: string | null;
  status: string | null;
  runDetailContract: PlatformRunDetailContract;
} | null;

type PlatformShellStatus = {
  setupReady: boolean;
  setupProgressCount: number;
  runtimeHealthy: boolean | null;
  onlineWorkers: number;
  machineCount: number;
  localRuntimeOnline: boolean;
  pendingApprovals: number;
};

type PlatformShellContextValue = {
  accessMode: PlatformAccessMode;
  setAccessMode: (mode: PlatformAccessMode) => void;
  status: PlatformShellStatus;
  inspectPanelOpen: boolean;
  setInspectPanelOpen: (open: boolean) => void;
  inspectState: PlatformInspectState;
  setInspectState: (state: PlatformInspectState) => void;
};

const ACCESS_MODE_STORAGE_KEY = 'orion.platform.access.mode.v1';
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
  machineCount: 0,
  localRuntimeOnline: false,
  pendingApprovals: 0,
};

function areShellStatusEqual(left: PlatformShellStatus, right: PlatformShellStatus): boolean {
  return left.setupReady === right.setupReady
    && left.setupProgressCount === right.setupProgressCount
    && left.runtimeHealthy === right.runtimeHealthy
    && left.onlineWorkers === right.onlineWorkers
    && left.machineCount === right.machineCount
    && left.localRuntimeOnline === right.localRuntimeOnline
    && left.pendingApprovals === right.pendingApprovals;
}

export function PlatformShellProvider({ children }: { children: React.ReactNode }) {
  const [accessMode, setAccessMode] = useState<PlatformAccessMode>('default');
  const [status, setStatus] = useState<PlatformShellStatus>(INITIAL_STATUS);
  const [inspectPanelOpen, setInspectPanelOpen] = useState(false);
  const [inspectState, setInspectState] = useState<PlatformInspectState>(null);

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
      setStatus((current) => {
        const updated = {
          ...current,
          setupReady: next.setupReady,
          setupProgressCount: next.setupProgressCount,
        };
        return areShellStatusEqual(current, updated) ? current : updated;
      });
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
        await ensureControlPlaneSession();
        const res = await fetch('/api/platform/shell-status', { cache: 'no-store' });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            payload && typeof payload.detail === 'string' && payload.detail.trim()
              ? payload.detail.trim()
              : 'Platform shell status is unavailable.',
          );
        }

        if (alive) {
          setStatus((current) => {
            const next = {
              ...current,
              runtimeHealthy:
                typeof payload?.runtimeHealthy === 'boolean'
                  ? payload.runtimeHealthy
                  : null,
              onlineWorkers: Number(payload?.onlineWorkers || 0),
              machineCount: Number(payload?.machineCount || 0),
              localRuntimeOnline: Boolean(payload?.localRuntimeOnline),
              pendingApprovals: Number(payload?.pendingApprovals || 0),
            };
            return areShellStatusEqual(current, next) ? current : next;
          });
        }
      } catch {
        if (alive) {
          setStatus((current) => {
            const next = {
              ...current,
              runtimeHealthy: null,
              onlineWorkers: 0,
              machineCount: 0,
              localRuntimeOnline: false,
            };
            return areShellStatusEqual(current, next) ? current : next;
          });
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
      inspectPanelOpen,
      setInspectPanelOpen,
      inspectState,
      setInspectState,
    }),
    [accessMode, inspectPanelOpen, inspectState, status],
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
