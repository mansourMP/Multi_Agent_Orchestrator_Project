'use client';

import { useEffect, type CSSProperties, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  Home,
  PanelLeft,
  Activity,
  GitBranch,
  MessageSquare,
  Settings,
  UserRound,
} from 'lucide-react';
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;
  badge?: number;
};

const MAIN_NAV: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Chat', href: '/', icon: MessageSquare },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Workflows', href: '/workflows', icon: GitBranch },
  { label: 'Library', href: '/executions', icon: Activity },
];

const PROFILE_NAV_ITEM: NavItem = { label: 'Profile', href: '/account', icon: UserRound };
const BOTTOM_NAV: NavItem[] = [
  PROFILE_NAV_ITEM,
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/home') return pathname === '/home';
  if (href === '/account') return pathname === '/account';
  if (href === '/agents') {
    return pathname === '/agents'
      || pathname === '/builder'
      || pathname.startsWith('/builder/');
  }
  if (href === '/workflows') {
    return pathname === '/workflows' || pathname.startsWith('/workflows/');
  }
  if (href === '/executions') {
    return pathname === '/executions'
      || pathname.startsWith('/runs/')
      || pathname === '/artifacts'
      || pathname.startsWith('/artifacts/')
      || pathname === '/approvals'
      || pathname.startsWith('/approvals/');
  }
  if (href === '/credentials') return pathname === '/credentials' || pathname === '/connect-ai';
  if (href === '/settings') return pathname === '/settings' || pathname === '/machines';
  return pathname === href;
}

export default function Sidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', hideShellChrome ? '0px' : collapsed ? '56px' : '200px');
    return () => {
      root.style.setProperty('--sidebar-width', '200px');
    };
  }, [collapsed, hideShellChrome]);

  if (hideShellChrome) {
    return null;
  }

  return (
    <aside className={`sidebar sidebar-v2${collapsed ? ' is-collapsed' : ''}`} onWheel={forwardWheelToMainScroll}>
      <div className="sidebar-v2-scroll">
        <div className="sidebar-v2-controls">
          <button
            type="button"
            className="sidebar-v2-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeft size={18} strokeWidth={2.15} />
          </button>
        </div>

        <div className="sidebar-v2-list">
          {MAIN_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <button
                key={item.href}
                type="button"
                className={`sidebar-v2-item${active ? ' is-active' : ''}`}
                onClick={() => router.push(item.href)}
                aria-label={item.label}
                title={item.label}
              >
                <item.icon size={16} strokeWidth={active ? 2.2 : 1.9} />
                <span className="sidebar-v2-item-label">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span className="sidebar-v2-badge">{item.badge > 99 ? '99+' : item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sidebar-v2-bottom">
        {BOTTOM_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <button
              key={item.href}
              type="button"
              className={`sidebar-v2-item${active ? ' is-active' : ''}`}
              onClick={() => router.push(item.href)}
              aria-label={item.label}
              title={item.label}
            >
              <item.icon size={16} strokeWidth={active ? 2.2 : 1.9} />
              <span className="sidebar-v2-item-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
