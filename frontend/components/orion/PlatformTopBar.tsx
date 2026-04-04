'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, SquarePen } from 'lucide-react';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { usePlatformShell } from './PlatformShellContext';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

function routeTitle(pathname: string): string {
  if (pathname === '/') return 'Chat';
  if (pathname === '/home') return 'Home';
  if (pathname === '/agents') return 'Agents';
  if (pathname === '/library' || pathname === '/skills') return 'Library';
  if (pathname === '/connectors' || pathname === '/credentials' || pathname === '/connect-ai') return 'Integrations';
  if (pathname === '/usage') return 'Usage';
  if (pathname === '/settings') return 'Settings';
  if (pathname === '/account') return 'Account';

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'Chat';
  return segments[segments.length - 1]!
    .split('-')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { chatTopControls } = usePlatformShell();
  const showRouteTitle = pathname !== '/';
  const topNotice = chatTopControls?.notices.find(
    (notice) => notice.id !== 'provider'
      && (notice.tone === 'warn' || notice.tone === 'error')
      && Boolean(notice.actions && notice.actions.length > 0),
  ) || null;

  useEffect(() => {
    document.documentElement.style.setProperty('--topbar-height', hideShellChrome ? '0px' : '56px');
    return () => {
      document.documentElement.style.setProperty('--topbar-height', '56px');
    };
  }, [hideShellChrome]);

  if (hideShellChrome) {
    return null;
  }

  const handleNewChat = () => {
    const dispatch = () => window.dispatchEvent(new Event(EMPYRALIS_NEW_CHAT_EVENT));
    if (pathname !== '/') {
      router.push('/');
      window.setTimeout(dispatch, 180);
      return;
    }
    dispatch();
  };

  return (
    <header
      className="orion-shellbar"
      onWheel={forwardWheelToMainScroll}
      style={{ minHeight: 56 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          minHeight: 56,
          gap: 12,
        }}
      >
        <div className="orion-shellbar-section orion-shellbar-section-left">
          {showRouteTitle ? (
            <div className="orion-shellbar-page">
              <div className="orion-shellbar-page-row">
                <span className="orion-shellbar-title">{routeTitle(pathname)}</span>
              </div>
            </div>
          ) : null}
          {pathname === '/' ? (
            <button
              type="button"
              className="orion-shellbar-action orion-shellbar-history-btn"
              onClick={() => window.dispatchEvent(new Event('orion:open-history'))}
            >
              History
            </button>
          ) : null}
        </div>
        <div
          className="orion-shellbar-section orion-shellbar-section-center"
          style={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {topNotice ? (
                <div
                  key={topNotice.id}
                  className={`orion-shellbar-status-inline is-runtime ${
                    topNotice.tone === 'error'
                      ? 'is-warn'
                      : topNotice.tone === 'warn'
                        ? 'is-warn'
                        : topNotice.tone === 'accent'
                          ? 'is-accent'
                          : 'is-neutral'
                  }`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'nowrap',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ fontWeight: 600 }}>{topNotice.label}</span>
                    {topNotice.detail ? <span style={{ color: 'var(--text-secondary)' }}> {topNotice.detail}</span> : null}
                  </span>
                  {topNotice.actions && topNotice.actions.length > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'nowrap' }}>
                      {topNotice.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          className={`orion-shellbar-action${action.tone === 'primary' ? ' is-active' : ''}`}
                          onClick={action.onClick}
                          disabled={Boolean(action.disabled)}
                          style={{
                            minHeight: 34,
                            padding: '0 10px',
                            borderColor: action.tone === 'danger' ? 'var(--warning-border)' : undefined,
                            color: action.tone === 'danger' ? 'var(--warning-fg)' : undefined,
                          }}
                        >
                          <span>{action.label}</span>
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
          ) : null}
        </div>
        <div className="orion-shellbar-section orion-shellbar-section-right">
          <button type="button" className="orion-shellbar-icon-btn" aria-label="Notifications">
            <Bell size={16} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="orion-shellbar-icon-btn is-compose"
            aria-label="New chat"
            onClick={handleNewChat}
            title="New chat"
          >
            <SquarePen size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}
