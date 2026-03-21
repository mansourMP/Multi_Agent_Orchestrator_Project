'use client';

import { usePathname } from 'next/navigation';
import { Command, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { EMPYRALIS_COMMAND_PALETTE_OPEN_EVENT } from '@/components/orion/GlobalCommandPalette';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { useTheme } from '@/components/ThemeProvider';
import { resolveShellRouteMeta } from '@/lib/shellRoutes';
import { safeNavigate } from '@/lib/safeNavigate';

type ShellStatusPill = {
  label: string;
  tone: 'neutral' | 'ok' | 'warn' | 'error';
  href?: string;
};

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

function isUserSurface(pathname: string): boolean {
  return pathname === '/' || pathname === '/workspace' || pathname.startsWith('/solutions/');
}

function buildStatusPills(pathname: string, status: ReturnType<typeof usePlatformShell>['status']): ShellStatusPill[] {
  const items: ShellStatusPill[] = [];
  const userSurface = isUserSurface(pathname);

  if (!status.setupReady) {
    items.push({
      label: userSurface ? 'Finish setup' : `Setup ${status.setupProgressCount}/3`,
      tone: userSurface ? 'neutral' : 'warn',
      href: '/setup',
    });
  }

  if (!userSurface && status.runtimeHealthy === false) {
    items.push({
      label: 'Runtime attention',
      tone: 'error',
      href: '/health',
    });
  }

  if (!userSurface && status.runtimeHealthy === true && status.onlineWorkers <= 0) {
    items.push({
      label: 'Workers offline',
      tone: 'warn',
      href: '/health',
    });
  }

  if (!userSurface && status.pendingApprovals > 0) {
    items.push({
      label: `Approvals ${status.pendingApprovals}`,
      tone: 'warn',
      href: '/approvals',
    });
  }

  return items;
}

function toneClass(tone: ShellStatusPill['tone']): string {
  if (tone === 'ok') return 'is-ok';
  if (tone === 'warn') return 'is-warn';
  if (tone === 'error') return 'is-error';
  return 'is-neutral';
}

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const isChatRoute = pathname === '/';
  const meta = useMemo(() => resolveShellRouteMeta(pathname), [pathname]);
  const { status } = usePlatformShell();
  const { theme, setTheme } = useTheme();
  const statusPills = useMemo(() => buildStatusPills(pathname, status), [pathname, status]);

  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-height', isChatRoute ? '56px' : '68px');
    return () => {
      document.documentElement.style.setProperty('--topbar-height', '68px');
    };
  }, [isChatRoute]);

  if (isChatRoute) {
    return (
      <header className="orion-shellbar is-chat-home">
        <div className="orion-shellbar-section orion-shellbar-section-left">
          <div className="orion-shellbar-page">
            <div className="orion-shellbar-page-row">
              <div className="orion-shellbar-title">Chat</div>
              <span className="orion-shellbar-slot">Describe the outcome you want</span>
            </div>
          </div>
        </div>

        <div className="orion-shellbar-section orion-shellbar-section-right">
          <button
            type="button"
            className="orion-shellbar-status-pill is-neutral"
            onClick={() => window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT))}
          >
            New chat
          </button>
          {statusPills.slice(0, 1).map((item) =>
            item.href ? (
              <button
                key={`${item.label}:${item.href}`}
                type="button"
                onClick={() => safeNavigate(item.href as string)}
                className={`orion-shellbar-status-pill ${toneClass(item.tone)}`}
              >
                {item.label}
              </button>
            ) : (
              <span key={item.label} className={`orion-shellbar-status-pill ${toneClass(item.tone)}`}>
                {item.label}
              </span>
            ),
          )}

          <div className="orion-shellbar-theme" aria-label="Theme mode">
            <span className={`orion-shellbar-theme-orb is-${theme}`} aria-hidden />
            <button
              type="button"
              className={`orion-shellbar-theme-btn${theme === 'light' ? ' is-active' : ''}`}
              onClick={() => setTheme('light')}
              aria-label="Light mode"
            >
              <Sun size={14} />
            </button>
            <button
              type="button"
              className={`orion-shellbar-theme-btn${theme === 'dark' ? ' is-active' : ''}`}
              onClick={() => setTheme('dark')}
              aria-label="Dark mode"
            >
              <Moon size={14} />
            </button>
            <button
              type="button"
              className={`orion-shellbar-theme-btn${theme === 'system' ? ' is-active' : ''}`}
              onClick={() => setTheme('system')}
              aria-label="System theme"
            >
              <Monitor size={14} />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="orion-shellbar">
      <div className="orion-shellbar-section orion-shellbar-section-left">
        <div className="orion-shellbar-page">
          <div className="orion-shellbar-breadcrumb">{meta.breadcrumb}</div>
          <div className="orion-shellbar-page-row">
            <div className="orion-shellbar-title">{meta.title}</div>
            <span className="orion-shellbar-slot">{meta.slotLabel}</span>
          </div>
        </div>
      </div>

      <div className="orion-shellbar-section orion-shellbar-section-center">
        <button
          type="button"
          className="orion-shellbar-command"
          onClick={() => window.dispatchEvent(new Event(EMPYRALIS_COMMAND_PALETTE_OPEN_EVENT))}
        >
          <Search size={15} />
          <span>Search commands, pages, and operations</span>
          <span className="orion-shellbar-command-kbd">
            <Command size={11} />
            K
          </span>
        </button>
      </div>

      <div className="orion-shellbar-section orion-shellbar-section-right">
        {statusPills.length > 0 ? (
          <div className="orion-shellbar-status">
            {statusPills.map((item) =>
              item.href ? (
                <button
                  key={`${item.label}:${item.href}`}
                  type="button"
                  onClick={() => safeNavigate(item.href as string)}
                  className={`orion-shellbar-status-pill ${toneClass(item.tone)}`}
                >
                  {item.label}
                </button>
              ) : (
                <span key={item.label} className={`orion-shellbar-status-pill ${toneClass(item.tone)}`}>
                  {item.label}
                </span>
              ),
            )}
          </div>
        ) : null}

        <div className="orion-shellbar-theme" aria-label="Theme mode">
          <span className={`orion-shellbar-theme-orb is-${theme}`} aria-hidden />
          <button
            type="button"
            className={`orion-shellbar-theme-btn${theme === 'light' ? ' is-active' : ''}`}
            onClick={() => setTheme('light')}
            aria-label="Light mode"
          >
            <Sun size={14} />
          </button>
          <button
            type="button"
            className={`orion-shellbar-theme-btn${theme === 'dark' ? ' is-active' : ''}`}
            onClick={() => setTheme('dark')}
            aria-label="Dark mode"
          >
            <Moon size={14} />
          </button>
          <button
            type="button"
            className={`orion-shellbar-theme-btn${theme === 'system' ? ' is-active' : ''}`}
            onClick={() => setTheme('system')}
            aria-label="System theme"
          >
            <Monitor size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
