'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, SquarePen } from 'lucide-react';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { usePlatformShell } from './PlatformShellContext';
import { resolveProductRoute } from '@/lib/productArchitecture';

export const EMPYRALIS_NEW_CHAT_EVENT = 'empyralis:new-chat';

type ShellNotificationItem = {
  id?: string | null;
  ts?: string | null;
  text?: string | null;
  action?: string | null;
  channel?: string | null;
  read_at?: string | null;
  run_id?: string | null;
};

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { chatTopControls } = usePlatformShell();
  const showRouteTitle = pathname !== '/';
  const route = resolveProductRoute(pathname);
  const showSectionLabel = route.section.label !== route.title;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState<ShellNotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const notificationsRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!notificationsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (!notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [notificationsOpen]);

  const refreshNotifications = async () => {
    setNotificationsLoading(true);
    setNotificationsError('');
    try {
      const response = await fetch('/api/notifications?limit=8', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.detail === 'string'
            ? payload.detail
            : 'Failed to load notifications.',
        );
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setNotificationItems(items);
    } catch (error) {
      setNotificationsError(error instanceof Error ? error.message : 'Failed to load notifications.');
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    void refreshNotifications();
    const interval = window.setInterval(() => {
      void refreshNotifications();
    }, 20000);
    return () => window.clearInterval(interval);
  }, []);

  const unreadNotifications = useMemo(
    () => notificationItems.filter((item) => !String(item.read_at || '').trim()),
    [notificationItems],
  );

  const markNotificationsRead = async (notificationIds?: string[]) => {
    const ids = Array.isArray(notificationIds)
      ? notificationIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (ids.length === 0 && unreadNotifications.length === 0) return;
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids.length > 0 ? { notification_ids: ids } : { mark_all: true }),
    });
    await refreshNotifications();
  };

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
                {showSectionLabel ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {route.section.label}
                  </span>
                ) : null}
                <span className="orion-shellbar-title">{route.title}</span>
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
          <div ref={notificationsRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="orion-shellbar-icon-btn"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen((value) => !value)}
              style={{ position: 'relative' }}
            >
              <Bell size={16} strokeWidth={2.1} />
              {unreadNotifications.length > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 999,
                    paddingInline: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--accent-solid)',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                </span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <div
                className="orion-glass-card"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 360,
                  maxWidth: 'calc(100vw - 24px)',
                  display: 'grid',
                  gap: 12,
                  zIndex: 40,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Notifications</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {unreadNotifications.length} unread
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 34, paddingInline: 10 }}
                      onClick={() => void markNotificationsRead()}
                      disabled={unreadNotifications.length === 0}
                    >
                      Mark all read
                    </button>
                    <Link href="/notifications" className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 10 }}>
                      Open feed
                    </Link>
                  </div>
                </div>
                {notificationsLoading ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading notifications…</div>
                ) : notificationsError ? (
                  <div style={{ color: 'var(--warning-fg)', fontSize: 13 }}>{notificationsError}</div>
                ) : notificationItems.length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No notifications yet.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {notificationItems.map((item) => {
                      const unread = !String(item.read_at || '').trim();
                      return (
                        <article
                          key={String(item.id || `${item.ts || ''}:${item.run_id || ''}:${item.action || ''}`)}
                          style={{
                            display: 'grid',
                            gap: 6,
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: unread ? '1px solid var(--accent-faint-border)' : '1px solid var(--border-subtle)',
                            background: unread ? 'var(--accent-faint-bg)' : 'var(--bg-element)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong style={{ fontSize: 13 }}>{item.action || item.channel || 'Notification'}</strong>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {item.text || 'A new runtime event was recorded.'}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {item.run_id ? `Run ${item.run_id}` : item.channel || 'Runtime'}
                            </span>
                            {unread ? (
                              <button
                                type="button"
                                className="orion-btn orion-btn-ghost"
                                style={{ minHeight: 30, paddingInline: 10 }}
                                onClick={() => void markNotificationsRead(item.id ? [item.id] : [])}
                              >
                                Mark read
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>
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
