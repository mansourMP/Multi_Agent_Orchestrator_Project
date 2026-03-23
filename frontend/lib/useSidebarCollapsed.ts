'use client';

import { useCallback, useEffect, useState } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'empyralist:sidebar-collapsed';
const SIDEBAR_COLLAPSED_EVENT = 'empyralist:sidebar-collapsed-change';

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(next: boolean): void {
  if (typeof window === 'undefined') return;
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
    setCollapsedState(readSidebarCollapsed());

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== SIDEBAR_COLLAPSED_KEY) return;
      setCollapsedState(readSidebarCollapsed());
    };

    const handleCustom = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      setCollapsedState(typeof next === 'boolean' ? next : readSidebarCollapsed());
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
