'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeft } from 'lucide-react';

import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

type NavItem = {
  label: string;
  href: string;
};

type SidebarIdentity = {
  email: string;
  name: string;
  avatarUrl: string;
};

const SIDEBAR_COLLAPSED_KEY = 'empyralist:sidebar-collapsed';

const MAIN_NAV: NavItem[] = [
  { label: 'Home', href: '/home' },
  { label: 'Chat', href: '/' },
  { label: 'Agents', href: '/agents' },
  { label: 'Library', href: '/library' },
  { label: 'Connectors', href: '/connectors' },
];

const FOOTER_NAV: NavItem[] = [
  { label: 'Usage', href: '/usage' },
  { label: 'Settings', href: '/settings' },
];

const MAIN_BUTTON_CLASS =
  'h-12 rounded-[18px] px-4 text-[13px] font-medium tracking-[-0.01em] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-border)]';

const FOOTER_BUTTON_CLASS =
  'h-12 rounded-[18px] px-4 text-[13px] font-semibold tracking-[-0.01em] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-border)]';

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/home') return pathname === '/home';
  if (href === '/agents') {
    return pathname === '/agents' || pathname === '/builder' || pathname.startsWith('/builder/');
  }
  if (href === '/connectors') {
    return pathname === '/connectors' || pathname === '/credentials' || pathname === '/connect-ai';
  }
  if (href === '/library') {
    return pathname === '/library' || pathname === '/skills';
  }
  if (href === '/settings') {
    return pathname === '/settings' || pathname === '/machines' || pathname === '/health';
  }
  if (href === '/usage') {
    return pathname === '/usage';
  }
  return pathname === href;
}

function syncSidebarRoot(collapsed: boolean, hidden: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-sidebar-collapsed', hidden || collapsed ? '1' : '0');
  root.style.setProperty('--shell-sidebar-width', hidden || collapsed ? '0px' : '228px');
}

function displayName(name: string, email: string): string {
  const explicit = String(name || '').trim();
  if (explicit) return explicit;
  const localPart = String(email || '').trim().split('@')[0] || '';
  if (!localPart) return 'Account';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(value: string): string {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'A';
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('');
}

export default function AppSidebar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { state, setOpen, toggleSidebar } = useSidebar();
  const initializedRef = React.useRef(false);
  const [identity, setIdentity] = React.useState<SidebarIdentity | null>(null);

  React.useEffect(() => {
    if (hideShellChrome || initializedRef.current) return;
    initializedRef.current = true;
    try {
      const collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
      setOpen(!collapsed);
      syncSidebarRoot(collapsed, false);
    } catch {
      setOpen(true);
      syncSidebarRoot(false, false);
    }
  }, [hideShellChrome, setOpen]);

  React.useEffect(() => {
    const collapsed = state !== 'expanded';
    syncSidebarRoot(collapsed, hideShellChrome);
    if (hideShellChrome || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      return;
    }
  }, [hideShellChrome, state]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadIdentity() {
      try {
        const response = await fetch('/api/control-plane/auth/me', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as {
          user?: { email?: string | null; name?: string | null; avatar_url?: string | null } | null;
        } | null;
        if (cancelled || !payload?.user) return;
        setIdentity({
          email: String(payload.user.email || '').trim(),
          name: String(payload.user.name || '').trim(),
          avatarUrl: String(payload.user.avatar_url || '').trim(),
        });
      } catch {
        if (!cancelled) setIdentity(null);
      }
    }
    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hideShellChrome) {
    return null;
  }

  const accountName = displayName(identity?.name || '', identity?.email || '');
  const accountInitials = initials(accountName);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border text-sidebar-foreground [&>[data-sidebar=sidebar]]:bg-sidebar [&>[data-sidebar=sidebar]]:text-sidebar-foreground"
      onWheel={forwardWheelToMainScroll}
    >
      <SidebarHeader className="border-b border-sidebar-border pb-3 pl-5 pr-4 pt-3">
        <div className="flex items-center justify-start pl-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 rounded-xl border-0 bg-transparent text-sidebar-foreground shadow-none hover:bg-sidebar-accent"
            onClick={toggleSidebar}
            aria-label={state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <PanelLeft className="size-[18px]" strokeWidth={2.5} />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden pb-5 pl-5 pr-4 pt-3">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {MAIN_NAV.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={active}
                      size="lg"
                      className={MAIN_BUTTON_CLASS}
                    >
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4 pl-5 pr-4 pt-3">
        <SidebarSeparator className="mb-3.5 bg-sidebar-border" />
        <SidebarMenu className="gap-2.5">
          {FOOTER_NAV.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={active}
                  size="lg"
                  className={FOOTER_BUTTON_CLASS}
                >
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        <div
          style={{
            marginTop: 14,
            borderTop: '1px solid var(--sidebar-border)',
            paddingTop: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {identity?.avatarUrl ? (
              <img
                src={identity.avatarUrl}
                alt={accountName}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '999px',
                  objectFit: 'cover',
                  border: '1px solid var(--sidebar-border)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '999px',
                  display: 'grid',
                  placeItems: 'center',
                  background: 'var(--sidebar-accent)',
                  color: 'var(--sidebar-accent-foreground)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {accountInitials}
              </div>
            )}
            <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--sidebar-foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {accountName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--sidebar-foreground)',
                  opacity: 0.7,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {identity?.email || 'Signed-in account'}
              </div>
            </div>
          </div>
          <Link
            href="/account"
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 44, justifyContent: 'flex-start', paddingInline: 12 }}
          >
            Account
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
