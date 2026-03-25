'use client';

import { useEffect, useMemo, type CSSProperties, type ComponentType } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  GitBranch,
  Home,
  PanelLeft,
  Workflow,
  Activity,
  Server,
  FileStack,
  Key,
  MessageSquare,
  Settings,
  UserRound,
} from 'lucide-react';
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; style?: CSSProperties }>;
  badge?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const PRIMARY_NAV: NavItem[] = [
  { label: 'Chat', href: '/', icon: MessageSquare },
  { label: 'Builder', href: '/builder', icon: GitBranch },
  { label: 'Workflows', href: '/workflows', icon: Workflow },
  { label: 'Runs', href: '/executions', icon: Activity },
  { label: 'Machines', href: '/machines', icon: Server },
  { label: 'Integrations', href: '/credentials', icon: Key },
  { label: 'Usage', href: '/usage', icon: Activity },
];

const SECONDARY_NAV: NavItem[] = [
  { label: 'Assets', href: '/artifacts', icon: FileStack },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Profile', href: '/account', icon: UserRound },
];

const HOME_NAV_ITEM: NavItem = { label: 'Home', href: '/home', icon: Home };

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/home') return pathname === '/home';
  if (href === '/builder') return pathname === '/builder' || pathname.startsWith('/builder/');
  if (href === '/workflows') return pathname === '/workflows' || pathname.startsWith('/workflows/');
  if (href === '/executions') return pathname === '/executions' || pathname.startsWith('/runs/');
  if (href === '/machines') return pathname === '/machines';
  return pathname === href;
}

export default function Sidebar() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const pendingApprovalsCount = 0;
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--sidebar-width', hideShellChrome ? '0px' : collapsed ? '72px' : '200px');
    return () => {
      root.style.setProperty('--sidebar-width', '200px');
    };
  }, [collapsed, hideShellChrome]);

  const primarySections = useMemo<NavSection[]>(
    () => [
      {
        label: 'Create',
        items: PRIMARY_NAV.slice(0, 3),
      },
      {
        label: 'Operate',
        items: PRIMARY_NAV.slice(3).map((item) =>
          item.href === '/executions' && pendingApprovalsCount > 0
            ? { ...item, badge: pendingApprovalsCount }
            : item,
        ),
      },
    ],
    [pendingApprovalsCount],
  );

  if (hideShellChrome) {
    return null;
  }

  return (
    <aside className={`sidebar sidebar-v2${collapsed ? ' is-collapsed' : ''}`}>
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

        <div className="sidebar-v2-home">
          <button
            type="button"
            className={`sidebar-v2-item${isActivePath(pathname, HOME_NAV_ITEM.href) ? ' is-active' : ''}`}
            onClick={() => router.push(HOME_NAV_ITEM.href)}
            aria-label={HOME_NAV_ITEM.label}
            title={HOME_NAV_ITEM.label}
          >
            <HOME_NAV_ITEM.icon size={16} strokeWidth={isActivePath(pathname, HOME_NAV_ITEM.href) ? 2.2 : 1.9} />
            <span className="sidebar-v2-item-label">{HOME_NAV_ITEM.label}</span>
          </button>
        </div>

        {primarySections.map((section, index) => (
          <section key={section.label} className="sidebar-v2-section">
            <div className={`sidebar-v2-section-label${index === 0 ? ' is-first' : ''}`}>{section.label}</div>
            <div className="sidebar-v2-list">
              {section.items.map((item) => {
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
          </section>
        ))}

        <div className="sidebar-v2-divider" aria-hidden />

        <section className="sidebar-v2-section">
          <div className="sidebar-v2-section-label">Resources</div>
          <div className="sidebar-v2-list">
            {SECONDARY_NAV.map((item) => {
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
        </section>
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
