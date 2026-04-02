'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensureControlPlaneSession, readControlPlaneFailure } from '@/lib/controlPlaneSession';
import { fetchSetupReadiness } from '@/lib/setupReadiness';

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
  setupLoading: boolean;
  setupError: string | null;
  runtimeHealthy: boolean | null;
  onlineWorkers: number;
  machineCount: number;
  localRuntimeOnline: boolean;
  pendingApprovals: number;
  authRequired: boolean;
  authMessage: string | null;
};

export type PlatformChatTopControls = {
  assistantLabel: string;
  onOpenContext: () => void;
  artifactCount: number;
  artifactsOpen: boolean;
  onToggleArtifacts: () => void;
} | null;

type PlatformShellContextValue = {
  accessMode: PlatformAccessMode;
  setAccessMode: (mode: PlatformAccessMode) => void;
  status: PlatformShellStatus;
  inspectPanelOpen: boolean;
  setInspectPanelOpen: (open: boolean) => void;
  inspectState: PlatformInspectState;
  setInspectState: (state: PlatformInspectState) => void;
  chatTopControls: PlatformChatTopControls;
  setChatTopControls: (state: PlatformChatTopControls) => void;
};

const ACCESS_MODE_STORAGE_KEY = 'orion.platform.access.mode.v1';
const PlatformShellContext = createContext<PlatformShellContextValue | null>(null);

const INITIAL_STATUS: PlatformShellStatus = {
  setupReady: false,
  setupProgressCount: 0,
  setupLoading: true,
  setupError: null,
  runtimeHealthy: null,
  onlineWorkers: 0,
  machineCount: 0,
  localRuntimeOnline: false,
  pendingApprovals: 0,
  authRequired: false,
  authMessage: null,
};

function areShellStatusEqual(left: PlatformShellStatus, right: PlatformShellStatus): boolean {
  return left.setupReady === right.setupReady
    && left.setupProgressCount === right.setupProgressCount
    && left.setupLoading === right.setupLoading
    && left.setupError === right.setupError
    && left.runtimeHealthy === right.runtimeHealthy
    && left.onlineWorkers === right.onlineWorkers
    && left.machineCount === right.machineCount
    && left.localRuntimeOnline === right.localRuntimeOnline
    && left.pendingApprovals === right.pendingApprovals
    && left.authRequired === right.authRequired
    && left.authMessage === right.authMessage;
}

function areChatTopControlsEqual(left: PlatformChatTopControls, right: PlatformChatTopControls): boolean {
  if (left === right) return true;
  if (!left || !right) return left === right;
  return left.assistantLabel === right.assistantLabel
    && left.artifactCount === right.artifactCount
    && left.artifactsOpen === right.artifactsOpen
    && left.onOpenContext === right.onOpenContext
    && left.onToggleArtifacts === right.onToggleArtifacts;
}

function isAuthRequiredError(message: string): boolean {
  const lower = String(message || '').trim().toLowerCase();
  if (!lower) return false;
  return lower.includes('sign in') || lower.includes('requires login') || lower.includes('continue in your browser');
}

export function PlatformShellProvider({ children }: { children: React.ReactNode }) {
  const [accessMode, setAccessMode] = useState<PlatformAccessMode>('default');
  const [status, setStatus] = useState<PlatformShellStatus>(INITIAL_STATUS);
  const [inspectPanelOpen, setInspectPanelOpen] = useState(false);
  const [inspectState, setInspectState] = useState<PlatformInspectState>(null);
  const [chatTopControls, setRawChatTopControls] = useState<PlatformChatTopControls>(null);

  const setChatTopControls = useCallback((next: PlatformChatTopControls) => {
    setRawChatTopControls((current) => (areChatTopControlsEqual(current, next) ? current : next));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCESS_MODE_STORAGE_KEY, accessMode);
    } catch {
      // ignore local storage write issues
    }
  }, [accessMode]);

  useEffect(() => {
    let alive = true;

    const refreshSetup = async () => {
      setStatus((current) => {
        const next = {
          ...current,
          setupLoading: true,
          setupError: null,
        };
        return areShellStatusEqual(current, next) ? current : next;
      });
      try {
        const readiness = await fetchSetupReadiness();
        if (!alive) return;
        setStatus((current) => {
          const next = {
            ...current,
            setupReady: readiness.complete,
            setupProgressCount: [readiness.hasAiModel, readiness.hasIntegration].filter(Boolean).length,
            setupLoading: false,
            setupError: null,
          };
          return areShellStatusEqual(current, next) ? current : next;
        });
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message.trim() : 'Failed to load setup readiness.';
        setStatus((current) => {
          const next = {
            ...current,
            setupReady: false,
            setupProgressCount: 0,
            setupLoading: false,
            setupError: message || 'Failed to load setup readiness.',
          };
          return areShellStatusEqual(current, next) ? current : next;
        });
      }
    };

    void refreshSetup();
    const timer = window.setInterval(() => {
      void refreshSetup();
    }, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshSetup();
      }
    };
    window.addEventListener('focus', refreshSetup);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshSetup);
      document.removeEventListener('visibilitychange', handleVisibility);
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
              authRequired: false,
              authMessage: null,
            };
            return areShellStatusEqual(current, next) ? current : next;
          });
        }
      } catch (error) {
        const remembered = readControlPlaneFailure();
        const detail = String(
          remembered?.message || (error instanceof Error ? error.message : ''),
        ).trim();
        const authRequired = isAuthRequiredError(detail);
        if (alive) {
          setStatus((current) => {
            const next = {
              ...current,
              runtimeHealthy: null,
              onlineWorkers: 0,
              machineCount: 0,
              localRuntimeOnline: false,
              authRequired,
              authMessage: authRequired ? detail : null,
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
      chatTopControls,
      setChatTopControls,
    }),
    [accessMode, chatTopControls, inspectPanelOpen, inspectState, status],
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
