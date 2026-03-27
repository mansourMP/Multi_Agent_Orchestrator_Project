'use client';

import { getDesktopBridge } from '@/lib/desktopBridge';

let controlPlaneSessionPromise: Promise<void> | null = null;
let controlPlaneBrowserSignInPromise: Promise<void> | null = null;
let lastControlPlaneFailure: { message: string; at: number } | null = null;

const CONTROL_PLANE_RETRY_COOLDOWN_MS = 15_000;

function rememberControlPlaneFailure(message: string) {
  lastControlPlaneFailure = {
    message: String(message || 'Control-plane session bootstrap failed.').trim() || 'Control-plane session bootstrap failed.',
    at: Date.now(),
  };
}

function clearControlPlaneFailure() {
  lastControlPlaneFailure = null;
}

function currentReturnPath(): string {
  if (typeof window === 'undefined') return '/';
  const path = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  if (!path.startsWith('/')) return '/';
  if (path.startsWith('//')) return '/';
  return path;
}

function controlPlaneSignInUrl(): string {
  if (typeof window === 'undefined') return '/sign-in';
  const params = new URLSearchParams({
    returnTo: currentReturnPath(),
  });
  return `${window.location.origin}/sign-in?${params.toString()}`;
}

async function openControlPlaneBrowserSignIn(): Promise<void> {
  if (!controlPlaneBrowserSignInPromise) {
    controlPlaneBrowserSignInPromise = (async () => {
      const target = controlPlaneSignInUrl();
      const desktopBridge = getDesktopBridge();

      if (desktopBridge?.openExternal) {
        const opened = await desktopBridge.openExternal(target).catch(() => false);
        if (opened) return;
      }

      window.location.assign(target);
    })().finally(() => {
      controlPlaneBrowserSignInPromise = null;
    });
  }

  return controlPlaneBrowserSignInPromise;
}

export function readControlPlaneFailure(): { message: string; at: number } | null {
  return lastControlPlaneFailure;
}

export async function ensureControlPlaneSession(options?: { forcePrompt?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  const forcePrompt = Boolean(options?.forcePrompt);

  if (
    !forcePrompt
    && lastControlPlaneFailure
    && Date.now() - lastControlPlaneFailure.at < CONTROL_PLANE_RETRY_COOLDOWN_MS
  ) {
    throw new Error(lastControlPlaneFailure.message);
  }

  if (!controlPlaneSessionPromise) {
    controlPlaneSessionPromise = (async () => {
      const res = await fetch('/api/control-plane/session', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (res.ok) {
        clearControlPlaneFailure();
        return;
      }

      const payload = await res.json().catch(() => null);
      const requiresLogin = Boolean(payload && typeof payload === 'object' && (payload as { requires_login?: unknown }).requires_login);
      const detail =
        payload && typeof payload.detail === 'string' && payload.detail.trim()
          ? payload.detail.trim()
          : 'Control-plane session bootstrap failed.';

      if (res.status === 401 && requiresLogin) {
        const browserMessage = 'Continue in your browser to sign in.';
        rememberControlPlaneFailure(browserMessage);
        if (forcePrompt) {
          await openControlPlaneBrowserSignIn();
        }
        throw new Error(browserMessage);
      }

      throw new Error(detail);
    })().catch((error) => {
      rememberControlPlaneFailure(error instanceof Error ? error.message : 'Control-plane session bootstrap failed.');
      controlPlaneSessionPromise = null;
      throw error;
    });
  }

  return controlPlaneSessionPromise;
}
