'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { usePlatformShell } from './PlatformShellContext';
import { resolveProductRoute } from '@/lib/productArchitecture';
import {
  DESIGN_TOKENS,
  SHELL_CHROME,
  badgeStyle,
  bodyTextStyle,
  buttonStyle,
  eyebrowStyle,
  iconButtonStyle,
  mergeStyles,
  metaTextStyle,
  pageTitleStyle,
  panelStyle,
} from '@/design-constraints';

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

function chromeButtonStyle(active = false, tone: 'neutral' | 'primary' = 'neutral'): CSSProperties {
  return mergeStyles(buttonStyle({ tone: tone === 'primary' ? 'primary' : active ? 'secondary' : 'ghost', size: 'sm' }), {
    minHeight: 30,
    paddingInline: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: tone === 'primary'
      ? DESIGN_TOKENS.color.textInverse
      : active
        ? DESIGN_TOKENS.color.textPrimary
        : DESIGN_TOKENS.color.textSecondary,
    background: active && tone !== 'primary' ? DESIGN_TOKENS.color.surface : undefined,
    borderColor: active && tone !== 'primary' ? DESIGN_TOKENS.color.borderStrong : undefined,
  });
}

function noticeToneStyle(tone: 'warn' | 'error' | 'accent' | 'neutral'): CSSProperties {
  if (tone === 'warn' || tone === 'error') {
    return {
      borderColor: DESIGN_TOKENS.color.warningSoft,
      background: DESIGN_TOKENS.color.warningSoft,
      color: DESIGN_TOKENS.color.warning,
    };
  }
  if (tone === 'accent') {
    return {
      borderColor: DESIGN_TOKENS.color.accentSoft,
      background: DESIGN_TOKENS.color.accentSoft,
      color: DESIGN_TOKENS.color.accentText,
    };
  }
  return {
    borderColor: DESIGN_TOKENS.color.borderSubtle,
    background: DESIGN_TOKENS.color.surface,
    color: DESIGN_TOKENS.color.textSecondary,
  };
}

export default function PlatformTopBar() {
  const pathname = usePathname() ?? '/';
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
    document.documentElement.style.setProperty('--topbar-height', hideShellChrome ? '0px' : `${SHELL_CHROME.topbarHeight}px`);
    return () => {
      document.documentElement.style.setProperty('--topbar-height', `${SHELL_CHROME.topbarHeight}px`);
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

  return (
    <header
      onWheel={forwardWheelToMainScroll}
      style={{
        position: 'fixed',
        top: 'var(--desktop-titlebar-height)',
        left: 'var(--shell-stage-left)',
        right: 0,
        zIndex: 70,
        minHeight: SHELL_CHROME.topbarHeight,
        padding: `0 ${DESIGN_TOKENS.space[4]}px`,
        borderBottom: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
        background: DESIGN_TOKENS.color.surfaceMuted,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) auto',
          alignItems: 'center',
          minHeight: SHELL_CHROME.topbarHeight,
          gap: DESIGN_TOKENS.space[3],
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[3], minWidth: 0 }}>
          {showRouteTitle ? (
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              {showSectionLabel ? <div style={eyebrowStyle()}>{route.section.label}</div> : null}
              <div
                style={mergeStyles(pageTitleStyle(), {
                  fontSize: DESIGN_TOKENS.type.size.titleSm,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                })}
              >
                {route.title}
              </div>
            </div>
          ) : null}

        </div>

        <div
          style={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: DESIGN_TOKENS.space[2],
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {topNotice ? (
            <div
              style={{
                ...noticeToneStyle(
                  topNotice.tone === 'error'
                    ? 'error'
                    : topNotice.tone === 'warn'
                      ? 'warn'
                      : topNotice.tone === 'accent'
                        ? 'accent'
                        : 'neutral',
                ),
                minHeight: 34,
                padding: `0 ${DESIGN_TOKENS.space[3]}px`,
                borderRadius: DESIGN_TOKENS.radius.pill,
                border: `${DESIGN_TOKENS.border.subtle}px solid`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: DESIGN_TOKENS.space[2],
                maxWidth: '100%',
              }}
            >
              <span
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontSize: DESIGN_TOKENS.type.size.label,
                  fontWeight: DESIGN_TOKENS.type.weight.medium,
                }}
              >
                <span style={{ fontWeight: DESIGN_TOKENS.type.weight.semibold }}>{topNotice.label}</span>
                {topNotice.detail ? ` ${topNotice.detail}` : ''}
              </span>

              {topNotice.actions && topNotice.actions.length > 0 ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  {topNotice.actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={action.onClick}
                      disabled={Boolean(action.disabled)}
                      style={chromeButtonStyle(action.tone === 'primary', action.tone === 'primary' ? 'primary' : 'neutral')}
                    >
                      {action.label}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], justifyContent: 'flex-end' }}>
          <div ref={notificationsRef} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen((value) => !value)}
              style={mergeStyles(iconButtonStyle(), {
                position: 'relative',
              })}
            >
              <Bell size={16} strokeWidth={2.05} />
              {unreadNotifications.length > 0 ? (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    minWidth: 16,
                    height: 16,
                    borderRadius: DESIGN_TOKENS.radius.pill,
                    paddingInline: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: DESIGN_TOKENS.color.accentStrong,
                    color: DESIGN_TOKENS.color.textInverse,
                    fontSize: 10,
                    fontWeight: DESIGN_TOKENS.type.weight.bold,
                  }}
                >
                  {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div
                style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 360,
                  maxWidth: 'calc(100vw - 24px)',
                  display: 'grid',
                  gap: DESIGN_TOKENS.space[3],
                  zIndex: 40,
                })}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[3] }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={mergeStyles(pageTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.titleSm })}>Notifications</div>
                    <p style={metaTextStyle()}>{unreadNotifications.length} unread</p>
                  </div>
                  <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => void markNotificationsRead()}
                      disabled={unreadNotifications.length === 0}
                      style={chromeButtonStyle(false)}
                    >
                      Mark all read
                    </button>
                    <Link href="/notifications" style={chromeButtonStyle(false)}>
                      Open feed
                    </Link>
                  </div>
                </div>

                {notificationsLoading ? (
                  <p style={bodyTextStyle()}>Loading notifications…</p>
                ) : notificationsError ? (
                  <p style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.warning })}>{notificationsError}</p>
                ) : notificationItems.length === 0 ? (
                  <p style={bodyTextStyle()}>No notifications yet.</p>
                ) : (
                  <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
                    {notificationItems.map((item) => {
                      const unread = !String(item.read_at || '').trim();
                      return (
                        <article
                          key={String(item.id || `${item.ts || ''}:${item.run_id || ''}:${item.action || ''}`)}
                          style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[3] }), {
                            display: 'grid',
                            gap: DESIGN_TOKENS.space[2],
                            background: unread ? DESIGN_TOKENS.color.accentSoft : DESIGN_TOKENS.color.surfaceMuted,
                            borderColor: unread ? DESIGN_TOKENS.color.accentSoft : DESIGN_TOKENS.color.borderSubtle,
                          })}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[2] }}>
                            <strong
                              style={{
                                fontSize: DESIGN_TOKENS.type.size.label,
                                fontWeight: DESIGN_TOKENS.type.weight.semibold,
                                color: DESIGN_TOKENS.color.textPrimary,
                              }}
                            >
                              {item.action || item.channel || 'Notification'}
                            </strong>
                            <span style={metaTextStyle()}>
                              {item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p style={bodyTextStyle()}>{item.text || 'A new runtime event was recorded.'}</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[2], alignItems: 'center' }}>
                            <span style={metaTextStyle()}>
                              {item.run_id ? `Run ${item.run_id}` : item.channel || 'Runtime'}
                            </span>
                            {unread ? (
                              <button
                                type="button"
                                onClick={() => void markNotificationsRead(item.id ? [item.id] : [])}
                                style={chromeButtonStyle(false)}
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
        </div>
      </div>
    </header>
  );
}
