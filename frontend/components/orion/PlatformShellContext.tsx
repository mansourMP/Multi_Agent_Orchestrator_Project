'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensureControlPlaneSession, readControlPlaneFailure } from '@/lib/controlPlaneSession';
import { fetchSetupReadiness } from '@/lib/setupReadiness';

export type PlatformAccessMode = 'default' | 'full';

export type PlatformWorkspaceAccess = {
  workspaceId: string;
  tenantId: string;
  role: 'viewer' | 'member' | 'owner';
  label: string;
};

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
  notices: Array<{
    id: string;
    tone: 'neutral' | 'accent' | 'warn' | 'error';
    label: string;
    detail?: string | null;
    actions?: Array<{
      id: string;
      label: string;
      tone?: 'default' | 'primary' | 'danger';
      disabled?: boolean;
      onClick: () => void;
    }>;
  }>;
} | null;

type PlatformShellContextValue = {
  accessMode: PlatformAccessMode;
  setAccessMode: (mode: PlatformAccessMode) => void;
  status: PlatformShellStatus;
  activeWorkspaceId: string;
  activeTenantId: string;
  workspaceAccess: PlatformWorkspaceAccess[];
  workspaceLoading: boolean;
  inspectPanelOpen: boolean;
  setInspectPanelOpen: (open: boolean) => void;
  inspectState: PlatformInspectState;
  setInspectState: (state: PlatformInspectState) => void;
  chatTopControls: PlatformChatTopControls;
  setChatTopControls: (state: PlatformChatTopControls) => void;
};

const ACCESS_MODE_STORAGE_KEY = 'orion.platform.access.mode.v1';
const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_TENANT_ID = 'default';
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
  if (left.notices.length !== right.notices.length) return false;
  for (let index = 0; index < left.notices.length; index += 1) {
    const leftNotice = left.notices[index]!;
    const rightNotice = right.notices[index]!;
    if (
      leftNotice.id !== rightNotice.id
      || leftNotice.tone !== rightNotice.tone
      || leftNotice.label !== rightNotice.label
      || leftNotice.detail !== rightNotice.detail
    ) {
      return false;
    }
    const leftActions = leftNotice.actions || [];
    const rightActions = rightNotice.actions || [];
    if (leftActions.length !== rightActions.length) return false;
    for (let actionIndex = 0; actionIndex < leftActions.length; actionIndex += 1) {
      const leftAction = leftActions[actionIndex]!;
      const rightAction = rightActions[actionIndex]!;
      if (
        leftAction.id !== rightAction.id
        || leftAction.label !== rightAction.label
        || leftAction.tone !== rightAction.tone
        || Boolean(leftAction.disabled) !== Boolean(rightAction.disabled)
      ) {
        return false;
      }
    }
  }
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
  const [workspaceAccess, setWorkspaceAccess] = useState<PlatformWorkspaceAccess[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [activeTenantId, setActiveTenantId] = useState(DEFAULT_TENANT_ID);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [inspectPanelOpen, setInspectPanelOpen] = useState(false);
  const [inspectState, setInspectState] = useState<PlatformInspectState>(null);
  const [chatTopControls, setRawChatTopControls] = useState<PlatformChatTopControls>(null);

  const setChatTopControls = useCallback((next: PlatformChatTopControls) => {
    setRawChatTopControls((current) => (areChatTopControlsEqual(current, next) ? current : next));
  }, [activeWorkspaceId]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACCESS_MODE_STORAGE_KEY);
      if (stored === 'default' || stored === 'full') {
        setAccessMode(stored);
      }
    } catch {
      // ignore local storage read issues
    }
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
        const [shellRes, profileRes] = await Promise.all([
          fetch('/api/platform/shell-status', { cache: 'no-store' }),
          fetch('/api/control-plane/auth/me', { cache: 'no-store' }),
        ]);
        const payload = await shellRes.json().catch(() => null);
        const profilePayload = await profileRes.json().catch(() => null);
        const accessItems = Array.isArray(profilePayload?.workspace_access)
          ? profilePayload.workspace_access
              .map((item: unknown): PlatformWorkspaceAccess | null => {
                if (!item || typeof item !== 'object') return null;
                const workspaceId = String((item as { workspace_id?: unknown }).workspace_id || '').trim();
                if (!workspaceId) return null;
                const tenantId = String((item as { tenant_id?: unknown }).tenant_id || '').trim() || DEFAULT_TENANT_ID;
                const role = String((item as { role?: unknown }).role || 'viewer').trim().toLowerCase();
                return {
                  workspaceId,
                  tenantId,
                  role: role === 'owner' || role === 'member' ? role : 'viewer',
                  label: String((item as { workspace_label?: unknown }).workspace_label || workspaceId).trim() || workspaceId,
                };
              })
              .filter((item: PlatformWorkspaceAccess | null): item is PlatformWorkspaceAccess => Boolean(item))
          : [];
        const nextActiveWorkspaceId = accessItems[0]?.workspaceId || DEFAULT_WORKSPACE_ID;
        const nextActiveTenantId = accessItems.find((item: PlatformWorkspaceAccess) => item.workspaceId === nextActiveWorkspaceId)?.tenantId
          || accessItems[0]?.tenantId
          || DEFAULT_TENANT_ID;
        if (!shellRes.ok) {
          throw new Error(
            payload && typeof payload.detail === 'string' && payload.detail.trim()
              ? payload.detail.trim()
              : 'Platform shell status is unavailable.',
          );
        }
        if (!profileRes.ok) {
          throw new Error(
            profilePayload && typeof profilePayload.detail === 'string' && profilePayload.detail.trim()
              ? profilePayload.detail.trim()
              : 'Control-plane profile is unavailable.',
          );
        }

        if (alive) {
          const nextSelectedWorkspaceId = accessItems.some((item: PlatformWorkspaceAccess) => item.workspaceId === activeWorkspaceId)
            ? activeWorkspaceId
            : nextActiveWorkspaceId;
          setWorkspaceAccess(accessItems);
          setActiveWorkspaceId(nextSelectedWorkspaceId);
          setActiveTenantId(
            accessItems.find((item: PlatformWorkspaceAccess) => item.workspaceId === nextSelectedWorkspaceId)?.tenantId
              || nextActiveTenantId,
          );
          setWorkspaceLoading(false);
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
          setWorkspaceLoading(false);
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
      activeWorkspaceId,
      activeTenantId,
      workspaceAccess,
      workspaceLoading,
      inspectPanelOpen,
      setInspectPanelOpen,
      inspectState,
      setInspectState,
      chatTopControls,
      setChatTopControls,
    }),
    [accessMode, activeTenantId, activeWorkspaceId, chatTopControls, inspectPanelOpen, inspectState, status, workspaceAccess, workspaceLoading],
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
