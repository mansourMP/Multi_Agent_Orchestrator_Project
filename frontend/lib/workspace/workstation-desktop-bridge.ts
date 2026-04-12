'use client';

import { useMemo } from 'react';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';

type RawEmpyralisDesktopBridge = {
  desktop?: boolean;
  platform?: string;
  openExternal?: (target: string) => Promise<boolean>;
  openPermissionSettings?: (permission: string) => Promise<boolean>;
  bootstrapMachineEnrollment?: (intent: unknown) => Promise<unknown>;
  openaiCodexOauthLogin?: () => Promise<unknown>;
};

type DesktopWindowLike = Window & {
  empyralisDesktop?: RawEmpyralisDesktopBridge;
  orionDesktop?: RawEmpyralisDesktopBridge;
};

export type WorkstationDesktopLocalCompanionState = {
  present: boolean;
  label: string | null;
  online: boolean;
  preferred: boolean;
};

export type WorkstationDesktopBridgeState = {
  available: boolean;
  platform: string | null;
  localCompanion: WorkstationDesktopLocalCompanionState;
  openExternal: (target: string) => Promise<boolean>;
  openPermissionSettings: (permission: 'screen_recording' | 'accessibility' | 'filesystem') => Promise<boolean>;
};

export function resolveWorkstationDesktopBridge(
  targetWindow?: DesktopWindowLike | null,
): RawEmpyralisDesktopBridge | null {
  const candidateWindow = targetWindow ?? (typeof window !== 'undefined' ? window as DesktopWindowLike : null);
  if (!candidateWindow) {
    return null;
  }

  const bridge = candidateWindow.empyralisDesktop ?? candidateWindow.orionDesktop ?? null;
  if (!bridge || bridge.desktop !== true) {
    return null;
  }

  return bridge;
}

function isLocalCompanionTarget(target: { id: string; kind: string }): boolean {
  const id = String(target.id || '').trim().toLowerCase();
  const kind = String(target.kind || '').trim().toLowerCase();
  return id === 'local_companion' || kind === 'local_companion';
}

export function useWorkstationDesktopBridge(): WorkstationDesktopBridgeState {
  const { bootstrap } = useWorkspaceBoundary();

  return useMemo(() => {
    const bridge = resolveWorkstationDesktopBridge();
    const localCompanionTarget = bootstrap.runtime.runtimeTargets.find((target) =>
      isLocalCompanionTarget(target),
    );

    return {
      available: Boolean(bridge),
      platform: typeof bridge?.platform === 'string' ? bridge.platform : null,
      localCompanion: {
        present: Boolean(localCompanionTarget),
        label: localCompanionTarget?.label ?? null,
        online: Boolean(localCompanionTarget?.online),
        preferred: Boolean(localCompanionTarget?.preferred),
      },
      openExternal: async (target: string) => {
        const normalized = target.trim();
        if (!normalized) {
          return false;
        }

        if (bridge && typeof bridge.openExternal === 'function') {
          return Boolean(await bridge.openExternal(normalized));
        }

        if (typeof window !== 'undefined' && /^https?:\/\//.test(normalized)) {
          window.open(normalized, '_blank', 'noopener,noreferrer');
          return true;
        }

        return false;
      },
      openPermissionSettings: async (permission) => {
        if (!bridge || typeof bridge.openPermissionSettings !== 'function') {
          return false;
        }
        return Boolean(await bridge.openPermissionSettings(permission));
      },
    };
  }, [bootstrap.runtime.runtimeTargets]);
}
