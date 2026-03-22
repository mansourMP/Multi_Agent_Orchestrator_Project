'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    GitBranch,
    Workflow,
    Activity,
    FileStack,
    Key,
    MessageSquare,
    Boxes,
    Settings,
    UserRound,
} from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { API_BASE } from '@/lib/config';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { safeNavigate } from '@/lib/safeNavigate';
import {
    CHAT_SESSION_SELECT_EVENT,
    CHAT_STORE_STORAGE_KEY,
    CHAT_STORE_UPDATED_EVENT,
    sanitizeChatStore,
    type ChatSessionRecord,
} from '@/components/orion/chat/chatSchema';
import type { ComponentType, CSSProperties } from 'react';

type NavItem = {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;
    appGlyph?: string;
    badge?: number;
};

const CORE_NAV_ITEMS: NavItem[] = [
    { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    { label: 'Assistant', href: '/workspace', icon: MessageSquare },
    { label: 'Builder', href: '/builder', icon: GitBranch },
    { label: 'Automations', href: '/workflows', icon: Workflow },
    { label: 'Activity', href: '/executions', icon: Activity },
    { label: 'Files', href: '/artifacts', icon: FileStack },
    { label: 'Connections', href: '/credentials', icon: Key },
    { label: 'Solutions', href: '/solutions', icon: Boxes },
];

export default function Sidebar() {
    const pathname = usePathname();
    const chatSessionsRef = useRef<HTMLDivElement | null>(null);
    const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
    const [chatSessionsOpen, setChatSessionsOpen] = useState(false);
    const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([]);
    const [selectedChatSessionId, setSelectedChatSessionId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const runtimeKey = readRuntimeApiKeyFromStorage('replace-with-strong-key');
        const headers: HeadersInit = { 'X-API-Key': runtimeKey };

        const refreshAttention = async () => {
            try {
                const res = await fetch(`${API_BASE}/history/runs?limit=40&workspace_id=default`, { headers });
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                const items = Array.isArray(payload?.items) ? payload.items : [];
                const count = items.filter((item: unknown) => {
                    const record = item as Record<string, unknown>;
                    return String(record?.status || '').toLowerCase() === 'waiting_for_input';
                }).length;
                if (alive) setPendingApprovalsCount(count);
            } catch {
                // keep previous badge value
            }
        };

        void refreshAttention();
        const timer = window.setInterval(() => {
            void refreshAttention();
        }, 12000);
        return () => {
            alive = false;
            window.clearInterval(timer);
        };
    }, []);

    const coreNavItems = useMemo(
        () =>
            CORE_NAV_ITEMS.map((item) => {
                return item.href === '/executions' && pendingApprovalsCount > 0
                    ? { ...item, badge: pendingApprovalsCount }
                    : item;
            }),
        [pendingApprovalsCount],
    );

    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--sidebar-width', '68px');
    }, []);

    useEffect(() => {
        const loadChatSessions = () => {
            try {
                const raw = window.localStorage.getItem(CHAT_STORE_STORAGE_KEY);
                if (!raw) {
                    setChatSessions([]);
                    setSelectedChatSessionId(null);
                    return;
                }
                const parsed = sanitizeChatStore(JSON.parse(raw));
                if (!parsed) {
                    setChatSessions([]);
                    setSelectedChatSessionId(null);
                    return;
                }
                setChatSessions(
                    [...parsed.sessions]
                        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
                        .slice(0, 8),
                );
                setSelectedChatSessionId(parsed.selectedSessionId);
            } catch {
                setChatSessions([]);
                setSelectedChatSessionId(null);
            }
        };

        loadChatSessions();
        window.addEventListener('storage', loadChatSessions);
        window.addEventListener(CHAT_STORE_UPDATED_EVENT, loadChatSessions as EventListener);
        window.addEventListener('focus', loadChatSessions);
        return () => {
            window.removeEventListener('storage', loadChatSessions);
            window.removeEventListener(CHAT_STORE_UPDATED_EVENT, loadChatSessions as EventListener);
            window.removeEventListener('focus', loadChatSessions);
        };
    }, []);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!chatSessionsRef.current?.contains(event.target as Node)) {
                setChatSessionsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setChatSessionsOpen(false);
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const isNavItemActive = (item: NavItem): boolean => {
        if (item.href === '/') return pathname === '/';
        if (item.href === '/builder') return pathname === '/builder';
        if (item.href === '/workflows') return pathname === '/workflows' || pathname.startsWith('/workflows/');
        if (item.href === '/executions') return pathname === '/executions' || pathname.startsWith('/runs/');
        if (item.href === '/solutions') return pathname === '/solutions' || pathname.startsWith('/solutions/');
        return pathname === item.href;
    };

    return (
        <aside className="sidebar" style={{
            width: 'var(--sidebar-width)',
            transition: 'width 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <div
                className="sidebar-header"
                style={{
                    marginBottom: '2px',
                    padding: '8px 4px 6px 4px',
                    justifyContent: 'center',
                }}
            >
                <div
                    className="sidebar-brandmark"
                    title={BRAND.company}
                    aria-label={BRAND.company}
                >
                    <span className="sidebar-brandmark-text">{BRAND.company}</span>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '0 6px 8px', display: 'grid', gap: 8, flexShrink: 0 }}>
                    <div className="sidebar-rail-group">
                        {coreNavItems.map((item) => {
                            const isActive = isNavItemActive(item);
                            const isChatItem = item.href === '/workspace';
                            const isSecondaryItem = item.href === '/executions' || item.href === '/credentials' || item.href === '/artifacts';
                            return (
                                <div
                                    key={`workspace:${item.href}:${item.label}`}
                                    className="sidebar-rail-entry"
                                    ref={isChatItem ? chatSessionsRef : undefined}
                                >
                                    <button
                                        onClick={() => {
                                            if (isChatItem && pathname === '/workspace') {
                                                setChatSessionsOpen((current) => !current);
                                                return;
                                            }
                                            safeNavigate(item.href);
                                        }}
                                        className={`btn-ghost sidebar-nav-btn is-rail${isSecondaryItem ? ' is-secondary' : ''}${isActive ? ' is-active' : ''}`}
                                        style={isActive ? {
                                            backgroundColor: 'var(--sidebar-active-bg, #7c3aed)',
                                            color: '#ffffff',
                                            border: 'none',
                                            boxShadow: 'none',
                                        } : undefined}
                                        title={item.label}
                                        aria-label={item.label}
                                        aria-expanded={isChatItem ? chatSessionsOpen : undefined}
                                    >
                                        <item.icon size={17} strokeWidth={isActive ? 2.5 : 2} style={{ opacity: isActive ? 1 : 0.72, flexShrink: 0 }} />
                                        {typeof item.badge === 'number' && item.badge > 0 ? (
                                            <span className="sidebar-icon-badge" aria-hidden>
                                                {item.badge > 99 ? '99+' : item.badge}
                                            </span>
                                        ) : null}
                                    </button>

                                    {isChatItem && pathname === '/workspace' && chatSessionsOpen ? (
                                        <div className="sidebar-flyout sidebar-chat-history" role="dialog" aria-label="Chat sessions">
                                            <div className="sidebar-flyout-header">
                                                <div className="sidebar-flyout-title">Recent chats</div>
                                                <div className="sidebar-flyout-copy">
                                                    Sessions stay in the left rail. Start a new chat from the header.
                                                </div>
                                            </div>
                                            <div className="sidebar-flyout-list">
                                                {chatSessions.map((session) => {
                                                    const updatedAtLabel = Number.isFinite(Date.parse(session.updatedAt))
                                                        ? new Date(session.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                                        : '';
                                                    const preview = session.messages.find((message) => message.role === 'user')?.content || 'Empty chat';
                                                    const isSelected = session.id === selectedChatSessionId;
                                                    return (
                                                        <button
                                                            key={session.id}
                                                            type="button"
                                                            className={`sidebar-flyout-item sidebar-chat-history-item${isSelected ? ' is-active' : ''}`}
                                                            onClick={() => {
                                                                window.dispatchEvent(
                                                                    new CustomEvent(CHAT_SESSION_SELECT_EVENT, {
                                                                        detail: { sessionId: session.id },
                                                                    }),
                                                                );
                                                                setChatSessionsOpen(false);
                                                                safeNavigate('/workspace');
                                                            }}
                                                        >
                                                            <span className="sidebar-chat-history-text">
                                                                <span className="sidebar-flyout-label">{session.title}</span>
                                                                <span className="sidebar-chat-history-preview">
                                                                    {preview.length > 56 ? `${preview.slice(0, 53).trimEnd()}...` : preview}
                                                                </span>
                                                            </span>
                                                            <span className="sidebar-chat-history-date">{updatedAtLabel}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                </div>

                <div style={{ flex: 1 }} />
            </div>

            <div
                className="sidebar-account-dock"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 8,
                }}
            >
                <button
                    type="button"
                    className={`btn-ghost sidebar-account-btn${pathname === '/settings' ? ' is-active' : ''}`}
                    style={pathname === '/settings' ? {
                        backgroundColor: 'var(--sidebar-active-bg, #7c3aed)',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: 'none',
                    } : undefined}
                    onClick={() => safeNavigate('/settings')}
                    title="Settings"
                    aria-label="Settings"
                >
                    <span className="sidebar-account-avatar" aria-hidden>
                        <Settings size={14} strokeWidth={2.1} />
                    </span>
                </button>
                <button
                    type="button"
                    className={`btn-ghost sidebar-account-btn${pathname === '/account' ? ' is-active' : ''}`}
                    style={pathname === '/account' ? {
                        backgroundColor: 'var(--sidebar-active-bg, #7c3aed)',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: 'none',
                    } : undefined}
                    onClick={() => safeNavigate('/account')}
                    title="Account"
                    aria-label="Account"
                >
                    <span className="sidebar-account-avatar" aria-hidden>
                        <UserRound size={14} strokeWidth={2.1} />
                    </span>
                </button>
            </div>
        </aside>
    );
}
