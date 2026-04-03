'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  House,
  MessageSquare,
  Plug,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';

import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 56;

const MAIN_NAV: NavItem[] = [
  { label: 'Home', href: '/home', icon: House },
  { label: 'Chat', href: '/', icon: MessageSquare },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Library', href: '/library', icon: BookOpen },
  { label: 'Integrations', href: '/connectors', icon: Plug },
  { label: 'Usage', href: '/usage', icon: BarChart2 },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Account', href: '/account', icon: User },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/agents') return pathname === '/agents' || pathname === '/builder' || pathname.startsWith('/builder/');
  if (href === '/library') return pathname === '/library' || pathname === '/skills';
  if (href === '/connectors') return pathname === '/connectors' || pathname === '/credentials' || pathname === '/connect-ai';
  return pathname === href;
}

function SidebarLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      style={{
        minHeight: 44,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: collapsed ? '0 0' : '0 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 12,
        color: 'var(--sidebar-foreground)',
        background: active ? 'var(--sidebar-accent)' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 1px var(--sidebar-border)' : 'none',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        transition: 'background 150ms ease, box-shadow 150ms ease',
      }}
    >
      <Icon size={18} strokeWidth={2.5} />
      {!collapsed ? <span>{item.label}</span> : null}
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-sidebar-collapsed', hideShellChrome ? '1' : collapsed ? '1' : '0');
    root.style.setProperty('--shell-sidebar-width', hideShellChrome ? '0px' : `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px`);
  }, [collapsed, hideShellChrome]);

  if (hideShellChrome) return null;

  return (
    <aside
      onWheel={forwardWheelToMainScroll}
      style={{
        position: 'fixed',
        inset: '0 auto 0 0',
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        borderRight: '1px solid var(--sidebar-border)',
        background: 'var(--sidebar)',
        color: 'var(--sidebar-foreground)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 80,
        transition: 'width 150ms ease',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 10px 10px' }}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid var(--sidebar-border)',
            background: 'var(--sidebar-accent)',
            color: 'var(--sidebar-foreground)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {collapsed ? <ChevronRight size={18} strokeWidth={3} /> : <ChevronLeft size={18} strokeWidth={3} />}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '4px 8px 12px' }}>
        <nav aria-label="Main navigation" style={{ display: 'grid', gap: 6 }}>
          {MAIN_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <div
          style={{
            borderTop: '1px solid var(--sidebar-border)',
            marginTop: 12,
            paddingTop: 12,
            display: 'grid',
            gap: 6,
          }}
        >
          {BOTTOM_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </div>
      </div>
    </aside>
  );
}
