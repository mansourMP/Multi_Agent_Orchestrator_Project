'use client';

import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Settings, UserRound } from 'lucide-react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import PwaInstallControl from '@/components/orion/PwaInstallControl';
import { safeNavigate } from '@/lib/safeNavigate';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const isBuilderEditorRoute = pathname.startsWith('/builder/');
  const { status } = usePlatformShell();

  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-height', isBuilderEditorRoute ? '0px' : '48px');
    return () => {
      document.documentElement.style.setProperty('--topbar-height', '48px');
    };
  }, [isBuilderEditorRoute]);

  const isOffline = useMemo(() => {
    if (status.runtimeHealthy === false) return true;
    if (status.runtimeHealthy === true && status.onlineWorkers <= 0) return true;
    return false;
  }, [status.onlineWorkers, status.runtimeHealthy]);

  if (isBuilderEditorRoute) {
    return null;
  }

  return (
    <header className="orion-shellbar">
      <div className="orion-shellbar-section orion-shellbar-section-left">
        <button type="button" className="orion-shellbar-workspace" onClick={() => safeNavigate('/home')}>
          <span>Personal workspace</span>
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="orion-shellbar-section orion-shellbar-section-center" />

      <div className="orion-shellbar-section orion-shellbar-section-right">
        {isOffline ? (
          <button type="button" className="orion-shellbar-status-inline" onClick={() => safeNavigate('/health')}>
            <span className="orion-shellbar-status-dot" aria-hidden />
            <span>Offline</span>
          </button>
        ) : null}
        <PwaInstallControl />
        <button
          type="button"
          className="orion-shellbar-icon-btn"
          onClick={() => safeNavigate('/settings')}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={15} />
        </button>
        <button
          type="button"
          className="orion-shellbar-avatar-btn"
          onClick={() => safeNavigate('/account')}
          aria-label="Profile"
          title="Profile"
        >
          <UserRound size={15} />
        </button>
      </div>
    </header>
  );
}
