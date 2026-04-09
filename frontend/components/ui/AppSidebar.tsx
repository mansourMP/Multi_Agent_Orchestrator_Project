'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Settings,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed';
import {
  PRIMARY_NAV_ITEMS,
  UTILITY_NAV_ITEMS,
  resolveNavigationSection,
  type NavigationSectionId,
} from '@/lib/navigation';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import {
  DESIGN_TOKENS,
  SHELL_CHROME,
  badgeStyle,
  buttonStyle,
  eyebrowStyle,
  mergeStyles,
} from '@/design-constraints';

const MASTER_THREAD_FOCUS_EVENT = 'empyralis:focus-master-thread';

type NavItem = {
  sectionId: NavigationSectionId;
  label: string;
  href: string;
  icon: LucideIcon;
};

const SECTION_ICONS: Record<NavigationSectionId, LucideIcon> = {
  sage: MessageSquare,
  runs: Activity,
  agents: Bot,
  usage: BarChart3,
  account: User,
  settings: Settings,
};

const MAIN_NAV: NavItem[] = PRIMARY_NAV_ITEMS.map((section) => ({
  sectionId: section.id,
  label: section.label,
  href: section.href,
  icon: SECTION_ICONS[section.id],
}));

const BOTTOM_NAV: NavItem[] = UTILITY_NAV_ITEMS.map((section) => {
  return {
    sectionId: section.id,
    label: section.label,
    href: section.href,
    icon: SECTION_ICONS[section.id],
  };
});

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
  onActivate,
  liveState,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onActivate?: (() => void) | null;
  liveState?: {
    active: boolean;
    label: string;
    runId?: string | null;
    sparkline: number[];
  } | null;
}) {
  const active = resolveNavigationSection(pathname) === item.sectionId;
  const Icon = item.icon;
  const isSage = item.sectionId === 'sage';
  const sparkline = (liveState?.sparkline || []).length > 0 ? liveState!.sparkline : [2, 4, 3, 4, 2];

  const content = (
    <>
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
            position: 'relative',
          }}
        >
          <Icon size={16} strokeWidth={2.15} />
          {isSage && liveState?.active ? (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                right: -1,
                top: -1,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: '#34d399',
                boxShadow: '0 0 0 3px rgba(52, 211, 153, 0.18)',
              }}
            />
          ) : null}
        </span>
        {!collapsed ? (
          <span style={{ minWidth: 0, display: 'grid', gap: isSage && liveState?.active ? 3 : 0 }}>
            <span>{item.label}</span>
            {isSage && liveState?.active ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: DESIGN_TOKENS.color.textTertiary,
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1.2,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    color: '#34d399',
                    letterSpacing: DESIGN_TOKENS.type.tracking.wide,
                    textTransform: 'uppercase',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: '#34d399',
                      boxShadow: '0 0 0 3px rgba(52, 211, 153, 0.16)',
                    }}
                  />
                  Live
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'flex-end',
                    gap: 2,
                    height: 12,
                  }}
                >
                  {sparkline.map((value, index) => (
                    <span
                      key={`${item.href}:spark:${index}`}
                      style={{
                        width: 3,
                        height: Math.max(4, value * 3),
                        borderRadius: 999,
                        background: index === sparkline.length - 1 ? '#fafafa' : 'rgba(250,250,250,0.38)',
                      }}
                    />
                  ))}
                </span>
                <span
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 112,
                  }}
                >
                  {liveState.label}
                </span>
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {!collapsed && active ? (
        <span style={badgeStyle('accent')}>
          {isSage && liveState?.active ? 'Live' : 'Open'}
        </span>
      ) : null}
    </>
  );

  if (onActivate) {
    return (
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        onClick={onActivate}
        style={mergeStyles(navLinkStyle(active, collapsed), { cursor: 'pointer' })}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      style={navLinkStyle(active, collapsed)}
    >
      {content}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  collapsed,
  onActivate,
  liveStates,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onActivate?: Partial<Record<NavigationSectionId, () => void>>;
  liveStates?: Partial<Record<NavigationSectionId, { active: boolean; label: string; runId?: string | null; sparkline: number[] } | null>>;
}) {
  return (
    <section style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
      {!collapsed ? <div style={eyebrowStyle()}>{label}</div> : null}
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            onActivate={onActivate?.[item.sectionId] || null}
            liveState={liveStates?.[item.sectionId] || null}
          />
        ))}
      </div>
    </section>
  );
}

export default function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();
  const { chatTopControls, inspectState } = usePlatformShell();

  const sageLiveState = React.useMemo(() => {
    if (chatTopControls?.liveState) return chatTopControls.liveState;
    if (inspectState?.runId && ['queued_local', 'running', 'waiting'].includes(String(inspectState.status || '').trim())) {
      return {
        active: true,
        label: String(inspectState.status || 'running').replace(/_/g, ' '),
        runId: inspectState.runId,
        sparkline: [2, 4, 3, 4, 2],
      };
    }
    return null;
  }, [chatTopControls?.liveState, inspectState]);

  const handleSageActivate = React.useCallback(() => {
    if (resolveNavigationSection(pathname) === 'sage') {
      window.dispatchEvent(new CustomEvent(MASTER_THREAD_FOCUS_EVENT));
      return;
    }
    router.push('/');
  }, [pathname, router]);

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
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-end',
          paddingInline: DESIGN_TOKENS.space[1],
        }}
      >
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
        <NavGroup
          label="Workspace"
          items={MAIN_NAV}
          pathname={pathname}
          collapsed={collapsed}
          onActivate={{ sage: handleSageActivate }}
          liveStates={{ sage: sageLiveState }}
        />

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
