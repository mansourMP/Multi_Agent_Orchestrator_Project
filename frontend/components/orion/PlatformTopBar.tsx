'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Laptop, Server, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { safeNavigate } from '@/lib/safeNavigate';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

const PwaInstallControl = dynamic(() => import('@/components/orion/PwaInstallControl'), {
  ssr: false,
});

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { status } = usePlatformShell();

  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '56px');
    return () => {
      document.documentElement.style.setProperty('--topbar-height', '56px');
    };
  }, [hideShellChrome]);

  const runtimeStatus = useMemo(() => {
    if (status.runtimeHealthy === false) {
      return {
        label: 'Fix runtime',
        href: '/health',
        tone: 'warn' as const,
        icon: Wrench,
      };
    }
    if (status.localRuntimeOnline) {
      return {
        label: 'Local machine online',
        href: '/machines',
        tone: 'ok' as const,
        icon: Laptop,
      };
    }
    if (status.onlineWorkers > 0) {
      return {
        label: 'Cloud runtime online',
        href: '/machines',
        tone: 'neutral' as const,
        icon: Server,
      };
    }
    if (status.machineCount > 0) {
      return {
        label: 'Bring machine online',
        href: '/machines',
        tone: 'warn' as const,
        icon: TriangleAlert,
      };
    }
    return {
      label: 'Connect local machine',
      href: '/machines',
      tone: 'accent' as const,
      icon: Laptop,
    };
  }, [status.localRuntimeOnline, status.machineCount, status.onlineWorkers, status.runtimeHealthy]);

  if (hideShellChrome) {
    return null;
  }

  const RuntimeStatusIcon = runtimeStatus.icon;

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
        <button
          type="button"
          className={`orion-shellbar-status-inline is-runtime is-${runtimeStatus.tone}`}
          onClick={() => safeNavigate(runtimeStatus.href)}
        >
          <RuntimeStatusIcon size={13} />
          <span>{runtimeStatus.label}</span>
        </button>
        <PwaInstallControl />
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
