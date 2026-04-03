'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Edit3 } from 'lucide-react';
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
          <div className="orion-shellbar-page">
            <div className="orion-shellbar-page-row">
              <span className="orion-shellbar-title">{routeTitle(pathname)}</span>
            </div>
          </div>
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
          {chatTopControls ? (
            <>
              <button type="button" className="orion-shellbar-status-inline is-runtime is-neutral" onClick={chatTopControls.onOpenContext}>
                {chatTopControls.assistantLabel}
              </button>
              {chatTopControls.artifactCount > 0 ? (
                <button
                  type="button"
                  className={`orion-shellbar-status-inline is-runtime${chatTopControls.artifactsOpen ? ' is-accent' : ' is-neutral'}`}
                  onClick={chatTopControls.onToggleArtifacts}
                >
                  {chatTopControls.artifactsOpen ? 'Hide artifacts' : `Artifacts ${chatTopControls.artifactCount}`}
                </button>
              ) : null}
              {chatTopControls.notices.map((notice) => (
                <div
                  key={notice.id}
                  className={`orion-shellbar-status-inline is-runtime ${
                    notice.tone === 'error'
                      ? 'is-warn'
                      : notice.tone === 'warn'
                        ? 'is-warn'
                        : notice.tone === 'accent'
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
                    <span style={{ fontWeight: 600 }}>{notice.label}</span>
                    {notice.detail ? <span style={{ color: 'var(--text-secondary)' }}> {notice.detail}</span> : null}
                  </span>
                  {notice.actions && notice.actions.length > 0 ? (
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'nowrap' }}>
                      {notice.actions.map((action) => (
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
              ))}
            </>
          ) : null}
        </div>
        <div className="orion-shellbar-section orion-shellbar-section-right">
          <button type="button" className="orion-shellbar-icon-btn" aria-label="Notifications">
            <Bell size={18} strokeWidth={2.2} />
          </button>
          <button type="button" className="orion-shellbar-action" onClick={handleNewChat}>
            <Edit3 size={13} />
            <span>New chat</span>
          </button>
        </div>
      </div>
    </header>
  );
}
