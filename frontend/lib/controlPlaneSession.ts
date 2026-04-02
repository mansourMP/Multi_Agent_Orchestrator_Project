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

function isSignInRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return String(window.location.pathname || '').startsWith('/sign-in');
}

export function controlPlaneSignInUrl(): string {
  if (typeof window === 'undefined') return '/sign-in';
  let returnTo = currentReturnPath();
  if (isSignInRoute()) {
    const existing = new URL(window.location.href).searchParams.get('returnTo') || '';
    if (existing.startsWith('/') && !existing.startsWith('//')) {
      returnTo = existing;
    } else {
      returnTo = '/';
    }
  }
  const params = new URLSearchParams({
    returnTo,
  });
  if (getDesktopBridge()?.desktop) {
    params.set('desktop', '1');
  }
  return `${window.location.origin}/sign-in?${params.toString()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function consumeDesktopControlPlaneAuthHandoff(): Promise<boolean> {
  const response = await fetch('/api/control-plane/auth/desktop/consume', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
  }).catch(() => null);

  if (!response) {
    return false;
  }

  if (response.status === 204) {
    return false;
  }

  if (response.ok) {
    clearControlPlaneFailure();
    return true;
  }

  const payload = await response.json().catch(() => null);
  const detail =
    payload && typeof payload.detail === 'string' && payload.detail.trim()
      ? payload.detail.trim()
      : 'Browser sign-in could not be completed.';
  throw new Error(detail);
}

export async function waitForDesktopControlPlaneSignIn(): Promise<void> {
  const deadline = Date.now() + (60 * 1000 * 3);
  while (Date.now() < deadline) {
    const consumed = await consumeDesktopControlPlaneAuthHandoff();
    if (consumed) {
      return;
    }
    await sleep(1000);
  }
  throw new Error('Browser sign-in did not reach the app yet.');
}

async function openControlPlaneBrowserSignIn(): Promise<void> {
  if (!controlPlaneBrowserSignInPromise) {
    controlPlaneBrowserSignInPromise = (async () => {
      const target = controlPlaneSignInUrl();
      const desktopBridge = getDesktopBridge();

      if (desktopBridge?.desktop) {
        window.location.assign(target);
        return;
      }

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

export async function promptControlPlaneSignIn(): Promise<void> {
  clearControlPlaneFailure();
  return openControlPlaneBrowserSignIn();
}

export function readControlPlaneFailure(): { message: string; at: number } | null {
  return lastControlPlaneFailure;
}

export async function ensureControlPlaneSession(options?: { forcePrompt?: boolean }): Promise<void> {
  if (typeof window === 'undefined') return;
  const forcePrompt = Boolean(options?.forcePrompt);
  const desktopBridge = getDesktopBridge();

  if (
    !forcePrompt
    && lastControlPlaneFailure
    && Date.now() - lastControlPlaneFailure.at < CONTROL_PLANE_RETRY_COOLDOWN_MS
  ) {
    throw new Error(lastControlPlaneFailure.message);
  }

  if (!controlPlaneSessionPromise) {
    controlPlaneSessionPromise = (async () => {
      if (desktopBridge?.desktop) {
        const consumed = await consumeDesktopControlPlaneAuthHandoff();
        if (consumed) {
          return;
        }
      }

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
        const desktopMode = Boolean(desktopBridge?.desktop);
        const message = desktopMode ? 'Sign in required.' : 'Continue in your browser to sign in.';
        rememberControlPlaneFailure(message);
        if (desktopMode) {
          if (!isSignInRoute()) {
            window.location.assign(controlPlaneSignInUrl());
          }
          throw new Error(message);
        }
        if (forcePrompt) {
          await openControlPlaneBrowserSignIn();
          if (desktopBridge?.desktop) {
            await waitForDesktopControlPlaneSignIn();
            return;
          }
        }
        throw new Error(message);
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
