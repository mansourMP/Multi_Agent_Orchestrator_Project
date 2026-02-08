'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Workflow,
    Bot,
    Activity,
    Settings,
    Search,
    Brain,
    Database,
    Key,
    Users,
    ChevronsLeft,
    ChevronsRight,
    MoreHorizontal,
    MessageSquare
} from 'lucide-react';

const NAV_ITEMS = [
    { label: 'Overview', href: '/', icon: LayoutDashboard },
    { label: 'Workflows', href: '/workflows', icon: Workflow },
    { label: 'Agents', href: '/agents', icon: Bot },
    { label: 'Executions', href: '/executions', icon: Activity },
    { label: 'Credentials', href: '/credentials', icon: Key },
    { label: 'Variables', href: '/variables', icon: Database },
];

const SECONDARY_ITEMS = [
    { label: 'Command Center', href: '/aesk', icon: Brain },
    { label: 'System Health', href: '/health', icon: Activity },
    { label: 'Feedback', href: '/feedback', icon: MessageSquare },
    { label: 'Settings', href: '/settings', icon: Settings },
    { label: 'Admin Panel', href: '/admin', icon: Users },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const isWorkflowPath = pathname?.startsWith('/workflows');

    useEffect(() => {
        const root = document.documentElement;
        if (isCollapsed) {
            root.style.setProperty('--sidebar-width', '72px');
        } else {
            root.style.setProperty('--sidebar-width', '240px');
        }
    }, [isCollapsed]);

    useEffect(() => {
        setIsCollapsed(Boolean(isWorkflowPath));
    }, [isWorkflowPath]);

    return (
        <aside className="sidebar" style={{
            width: 'var(--sidebar-width)',
            transition: 'width 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-sidebar)'
        }}>
            {/* Brand Header */}
            <div className="sidebar-header" style={{ marginBottom: '8px', padding: isCollapsed ? '0 12px' : '0 20px', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                {!isCollapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 17L12 22L22 17" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 12L12 17L22 12" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            letterSpacing: '-0.02em',
                            whiteSpace: 'nowrap',
                            opacity: isCollapsed ? 0 : 1,
                            transition: 'opacity 0.2s',
                        }}>
                            conductor<span style={{ color: '#ff6d5a' }}>.</span>
                        </span>
                    </div>
                )}

                {!isWorkflowPath && (
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            transition: 'all 0.2s'
                        }}
                        className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        aria-label="Toggle sidebar"
                    >
                        {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
                    </button>
                )}
        </div>

            {/* Scrollable Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Quick Search */}
                <div style={{ padding: isCollapsed ? '0 12px 16px' : '0 20px 16px 20px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: 10,
                        padding: '8px 12px',
                        background: 'var(--bg-app)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        color: 'var(--text-tertiary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        height: '36px',
                        transition: 'all 0.2s'
                    }} className="hover:border-[var(--gray-5)]">
                        <Search size={14} style={{ flexShrink: 0 }} />
                        {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>Search...</span>}
                    </div>
                </div>

                {/* Main Navigation */}
                <nav style={{ padding: '0 8px' }}>
                    {!isCollapsed && (
                        <div style={{ padding: '0 12px 8px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Platform
                        </div>
                    )}
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <button
                                key={item.href}
                                onClick={() => router.push(item.href)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                                    gap: '12px',
                                    padding: '8px 12px',
                                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                    fontWeight: isActive ? 700 : 500,
                                    marginBottom: '2px'
                                }}
                                className={!isActive ? "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" : ""}
                                title={isCollapsed ? item.label : ''}
                            >
                                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }} />
                                {!isCollapsed && <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                <div style={{ height: '24px' }} />

                {/* Secondary Navigation */}
                <nav style={{ padding: '0 8px' }}>
                    {SECONDARY_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <button
                                key={item.href}
                                onClick={() => router.push(item.href)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                                    gap: '12px',
                                    padding: '8px 12px',
                                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                    fontWeight: isActive ? 700 : 500,
                                    marginBottom: '2px'
                                }}
                                className={!isActive ? "hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" : ""}
                                title={isCollapsed ? item.label : ''}
                            >
                                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }} />
                                {!isCollapsed && <span style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Profile Footer */}
            <div style={{ padding: isCollapsed ? '8px' : '16px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'space-between',
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: 'var(--text-primary)'
                    }}
                    className="hover:bg-[var(--bg-hover)]"
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#fff'
                        }}>M</div>
                        {!isCollapsed && (
                            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>Mansur</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Pro Workspace</span>
                            </div>
                        )}
                    </div>
                    {!isCollapsed && <MoreHorizontal size={14} color="var(--text-tertiary)" />}
                </button>
            </div>
        </aside>
    );
}
