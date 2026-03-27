'use client';

import { useEffect, useState } from 'react';

export type DesktopBridge = {
  desktop?: boolean;
  platform?: string;
  openExternal?: (target: string) => Promise<boolean | string>;
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
