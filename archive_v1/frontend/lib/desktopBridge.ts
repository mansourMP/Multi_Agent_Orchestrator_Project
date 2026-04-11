'use client';

import { useEffect, useState } from 'react';

export type OpenAiCodexOauthResult = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account_id: string;
  email?: string | null;
  profile_name?: string | null;
};

export type DesktopBridge = {
  desktop?: boolean;
  platform?: string;
  openExternal?: (target: string) => Promise<boolean | string>;
  openPermissionSettings?: (permission: string) => Promise<boolean | string>;
  bootstrapMachineEnrollment?: (intent: unknown) => Promise<unknown>;
  openaiCodexOauthLogin?: () => Promise<OpenAiCodexOauthResult>;
};

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
  return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
}

export function useDesktopShell(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => Boolean(getDesktopBridge()?.desktop));

  useEffect(() => {
    setIsDesktop(Boolean(getDesktopBridge()?.desktop));
  }, []);

  return isDesktop;
}
