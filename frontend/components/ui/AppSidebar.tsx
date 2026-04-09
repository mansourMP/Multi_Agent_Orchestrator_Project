'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
import { resolveProductSection, type ProductSectionId } from '@/lib/productArchitecture';
import {
  DESIGN_TOKENS,
  SHELL_CHROME,
  badgeStyle,
  bodyTextStyle,
  buttonStyle,
  eyebrowStyle,
  mergeStyles,
  metaTextStyle,
} from '@/design-constraints';

type NavItem = {
  sectionId: ProductSectionId;
  label: string;
  href: string;
  icon: LucideIcon;
};

const MAIN_NAV: NavItem[] = [
  { sectionId: 'home', label: 'Overview', href: '/home', icon: House },
  { sectionId: 'chat', label: 'Sage', href: '/', icon: MessageSquare },
  { sectionId: 'agents', label: 'Agents', href: '/agents', icon: Bot },
  { sectionId: 'library', label: 'Blueprints', href: '/library', icon: BookOpen },
  { sectionId: 'integrations', label: 'Integrations', href: '/connectors', icon: Plug },
];

const BOTTOM_NAV: NavItem[] = [
  { sectionId: 'account', label: 'Account', href: '/account', icon: User },
  { sectionId: 'settings', label: 'Settings', href: '/settings', icon: Settings },
];

function navLinkStyle(active: boolean, collapsed: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'space-between',
    gap: DESIGN_TOKENS.space[3],
    padding: collapsed ? '0' : `0 ${DESIGN_TOKENS.space[3]}px 0 ${DESIGN_TOKENS.space[3]}px`,
    borderRadius: DESIGN_TOKENS.radius.lg,
    border: `${DESIGN_TOKENS.border.subtle}px solid ${
      active ? DESIGN_TOKENS.color.borderStrong : 'transparent'
    }`,
    background: active ? DESIGN_TOKENS.color.surface : 'transparent',
    color: active ? DESIGN_TOKENS.color.textPrimary : DESIGN_TOKENS.color.textSecondary,
    fontSize: DESIGN_TOKENS.type.size.body,
    fontWeight: active ? DESIGN_TOKENS.type.weight.semibold : DESIGN_TOKENS.type.weight.medium,
    letterSpacing: DESIGN_TOKENS.type.tracking.normal,
    transition: [
      `background ${DESIGN_TOKENS.motion.fast}`,
      `border-color ${DESIGN_TOKENS.motion.fast}`,
      `color ${DESIGN_TOKENS.motion.fast}`,
    ].join(', '),
  };
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
  const active = resolveProductSection(pathname) === item.sectionId;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      style={navLinkStyle(active, collapsed)}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[3], minWidth: 0 }}>
        <span
          style={{
            width: 28,
            height: 28,
            minWidth: 28,
            borderRadius: DESIGN_TOKENS.radius.md,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: active ? DESIGN_TOKENS.color.accentSoft : 'transparent',
            color: active ? DESIGN_TOKENS.color.accentText : DESIGN_TOKENS.color.textTertiary,
            transition: `background ${DESIGN_TOKENS.motion.fast}, color ${DESIGN_TOKENS.motion.fast}`,
          }}
        >
          <Icon size={16} strokeWidth={2.15} />
        </span>
        {!collapsed ? <span>{item.label}</span> : null}
      </span>
      {!collapsed && active ? <span style={badgeStyle('accent')}>Open</span> : null}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  collapsed,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <section style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
      {!collapsed ? <div style={eyebrowStyle()}>{label}</div> : null}
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </div>
    </section>
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
    root.style.setProperty(
      '--shell-sidebar-width',
      hideShellChrome ? '0px' : `${collapsed ? SHELL_CHROME.sidebarCollapsed : SHELL_CHROME.sidebarExpanded}px`,
    );
    root.style.setProperty('--shell-stage-left', hideShellChrome ? '0px' : `${SHELL_CHROME.sidebarExpanded}px`);
  }, [collapsed, hideShellChrome]);

  if (hideShellChrome) return null;

  return (
    <aside
      onWheel={forwardWheelToMainScroll}
      style={{
        position: 'fixed',
        inset: '0 auto 0 0',
        width: collapsed ? SHELL_CHROME.sidebarCollapsed : SHELL_CHROME.sidebarExpanded,
        display: 'flex',
        flexDirection: 'column',
        gap: DESIGN_TOKENS.space[4],
        padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[2]}px ${DESIGN_TOKENS.space[4]}px`,
        borderRight: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
        background: DESIGN_TOKENS.color.surfaceMuted,
        color: DESIGN_TOKENS.color.textPrimary,
        zIndex: 80,
        transition: 'width 150ms ease',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'grid',
          gap: DESIGN_TOKENS.space[3],
          paddingInline: collapsed ? 0 : DESIGN_TOKENS.space[2],
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: DESIGN_TOKENS.space[2],
          }}
        >
          {!collapsed ? (
            <div style={{ display: 'grid', gap: 4 }}>
              <div
                style={{
                  color: DESIGN_TOKENS.color.textPrimary,
                  fontSize: DESIGN_TOKENS.type.size.titleSm,
                  fontWeight: DESIGN_TOKENS.type.weight.semibold,
                  lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
                  letterSpacing: DESIGN_TOKENS.type.tracking.tight,
                }}
              >
                Empyralis
              </div>
              <p style={mergeStyles(metaTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
                Operating system for agent work
              </p>
            </div>
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: DESIGN_TOKENS.radius.md,
                border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                background: DESIGN_TOKENS.color.surface,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: DESIGN_TOKENS.color.textPrimary,
                fontSize: DESIGN_TOKENS.type.size.label,
                fontWeight: DESIGN_TOKENS.type.weight.bold,
                letterSpacing: DESIGN_TOKENS.type.tracking.tight,
              }}
            >
              E
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={mergeStyles(buttonStyle({ tone: 'secondary', size: 'icon-md' }), {
              justifyContent: 'center',
              display: 'inline-flex',
              alignItems: 'center',
            })}
          >
            {collapsed ? <ChevronRight size={16} strokeWidth={2.4} /> : <ChevronLeft size={16} strokeWidth={2.4} />}
          </button>
        </div>

        {!collapsed ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: DESIGN_TOKENS.space[2],
              padding: `${DESIGN_TOKENS.space[2]}px ${DESIGN_TOKENS.space[3]}px`,
              borderRadius: DESIGN_TOKENS.radius.lg,
              border: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              background: DESIGN_TOKENS.color.surface,
            }}
          >
            <p style={bodyTextStyle('tertiary')}>Navigation stays dense and task-first.</p>
            <span style={badgeStyle('neutral')}>Core</span>
          </div>
        ) : null}
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: DESIGN_TOKENS.space[4],
          padding: `${DESIGN_TOKENS.space[1]}px ${DESIGN_TOKENS.space[1]}px ${DESIGN_TOKENS.space[2]}px`,
        }}
      >
        <NavGroup label="Workspace" items={MAIN_NAV} pathname={pathname} collapsed={collapsed} />

        <div style={{ flex: 1 }} />

        <div
          style={{
            borderTop: `${DESIGN_TOKENS.border.subtle}px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            paddingTop: DESIGN_TOKENS.space[4],
          }}
        >
          <NavGroup label="Account" items={BOTTOM_NAV} pathname={pathname} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
