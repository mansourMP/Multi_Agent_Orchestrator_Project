'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2,
  Bot,
  ChevronLeft,
  ChevronRight,
  Home,
  Library,
  MessageSquare,
  PlugZap,
  Settings,
  Terminal,
  User,
  type LucideIcon,
} from 'lucide-react';

import { EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT } from '@/components/ui/CommandPalette';
import { useShellChromeVisibility } from '@/lib/shell/useShellChromeVisibility';
import { forwardWheelToMainScroll } from '@/lib/shell/forwardWheelToMainScroll';
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed';
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
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
};

const MAIN_NAV: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Chat', href: '/', icon: MessageSquare },
  { label: 'Agents', href: '/agents', icon: Bot },
  { label: 'Library', href: '/library', icon: Library },
  { label: 'Connectors', href: '/connectors', icon: PlugZap },
];

const BOTTOM_NAV: NavItem[] = [
  { label: 'Usage', href: '/usage', icon: BarChart2 },
  { label: 'Account', href: '/account', icon: User },
  { label: 'Settings', href: '/settings', icon: Settings },
];

const MAIN_BUTTON_CLASS =
  'h-12 rounded-[18px] px-4 text-[13px] font-medium tracking-[-0.01em] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-border)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden';

const FOOTER_BUTTON_CLASS =
  'h-12 rounded-[18px] px-4 text-[13px] font-semibold tracking-[-0.01em] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-border)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>span]:hidden';

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
  if (href === '/account') {
    return pathname === '/account';
  }
  return pathname === href;
}

export default function AppSidebar() {
  const pathname = usePathname() ?? '/';
  const { hideShellChrome } = useShellChromeVisibility(pathname);
  const { setOpen } = useSidebar();
  const { collapsed, toggleCollapsed } = useSidebarCollapsed();

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--shell-sidebar-width', hideShellChrome ? '0px' : collapsed ? '64px' : '228px');
    setOpen(hideShellChrome ? false : !collapsed);
  }, [collapsed, hideShellChrome, setOpen]);

  const navItems = React.useMemo<NavItem[]>(
    () => [
      ...MAIN_NAV,
      {
        label: 'Commands',
        icon: Terminal,
        onClick: () => window.dispatchEvent(new Event(EMPYRALIS_COMMAND_PALETTE_TOGGLE_EVENT)),
      },
    ],
    [],
  );

  if (hideShellChrome) {
    return null;
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border text-sidebar-foreground [&>[data-sidebar=sidebar]]:bg-sidebar [&>[data-sidebar=sidebar]]:text-sidebar-foreground"
      onWheel={forwardWheelToMainScroll}
    >
      <SidebarHeader className="border-b border-sidebar-border pb-3 pl-5 pr-4 pt-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center justify-start">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 rounded-xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground shadow-none hover:bg-sidebar-accent"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="size-[18px]" strokeWidth={3} /> : <ChevronLeft className="size-[18px]" strokeWidth={3} />}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden pb-5 pl-5 pr-4 pt-3 group-data-[collapsible=icon]:px-2">
        <SidebarGroup className="py-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-2.5">
              {navItems.map((item) => {
                const active = item.href ? isActivePath(pathname, item.href) : false;
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href ?? item.label}>
                    {item.href ? (
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        size="lg"
                        className={MAIN_BUTTON_CLASS}
                      >
                        <Icon className="size-[18px] shrink-0" strokeWidth={2.5} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        type="button"
                        onClick={item.onClick}
                        isActive={active}
                        size="lg"
                        className={MAIN_BUTTON_CLASS}
                      >
                        <Icon className="size-[18px] shrink-0" strokeWidth={2.5} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-4 pl-5 pr-4 pt-3 group-data-[collapsible=icon]:px-2">
        <SidebarSeparator className="mb-3.5 bg-sidebar-border" />
        <SidebarMenu className="gap-2.5">
          {BOTTOM_NAV.map((item) => {
            const active = Boolean(item.href && isActivePath(pathname, item.href));
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.href ?? item.label}>
                <SidebarMenuButton
                  render={<Link href={item.href || '/'} />}
                  isActive={active}
                  size="lg"
                  className={FOOTER_BUTTON_CLASS}
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={2.5} />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
