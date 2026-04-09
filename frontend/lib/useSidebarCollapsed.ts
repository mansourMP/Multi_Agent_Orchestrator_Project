'use client';

import { useCallback, useEffect, useState } from 'react';
import { SHELL_CHROME } from '@/design-constraints';

const SIDEBAR_COLLAPSED_KEY = 'empyralist:sidebar-collapsed';
const SIDEBAR_COLLAPSED_EVENT = 'empyralist:sidebar-collapsed-change';

function readSidebarCollapsed(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-sidebar-collapsed');
    if (attr === '1') return true;
    if (attr === '0') return false;
  }
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function applySidebarCollapsedToRoot(next: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-sidebar-collapsed', next ? '1' : '0');
  root.style.setProperty('--shell-sidebar-width', next ? `${SHELL_CHROME.sidebarCollapsed}px` : `${SHELL_CHROME.sidebarExpanded}px`);
}

function persistSidebarCollapsed(next: boolean): void {
  if (typeof window === 'undefined') return;
  applySidebarCollapsedToRoot(next);
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent<boolean>(SIDEBAR_COLLAPSED_EVENT, { detail: next }));
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const initial = readSidebarCollapsed();
    applySidebarCollapsedToRoot(initial);
    setCollapsedState(initial);

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== SIDEBAR_COLLAPSED_KEY) return;
      const next = readSidebarCollapsed();
      applySidebarCollapsedToRoot(next);
      setCollapsedState(next);
    };

    const handleCustom = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      const resolved = typeof next === 'boolean' ? next : readSidebarCollapsed();
      applySidebarCollapsedToRoot(resolved);
      setCollapsedState(resolved);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, handleCustom as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, handleCustom as EventListener);
    };
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    persistSidebarCollapsed(next);
    setCollapsedState(next);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  return {
    collapsed,
    setCollapsed,
    toggleCollapsed,
  };
}
