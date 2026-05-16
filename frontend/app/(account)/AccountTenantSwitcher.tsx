'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  Compass,
  LayoutGrid,
  Monitor,
  Moon,
  Settings2,
  SunMedium,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

import { joinClassNames } from '@/lib/ui/primitives';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import { createWorkstationClient } from '@/lib/workspace/workstation-client';
import {
  resolvePrimaryProductWorkspaceId,
  resolveRouteWorkspaceId,
} from '@/lib/shell/workspace-membership-model';
import {
  buildWorkspaceRouteHref,
  getWorkspaceNavRouteDefinition,
  resolveWorkspaceRouteIdFromSegment,
  type WorkspaceRouteId,
} from '../../../shared/nav-manifest';
import { useAppTheme } from '@/lib/ui/app-theme';
import { APP_THEME_ATTRIBUTE } from '@/lib/ui/tokens';

type RailDestinationId = 'chat' | 'studio' | 'gateway' | 'marketplace' | 'activity' | 'settings';

type RailDestination = {
  id: RailDestinationId;
  label: string;
  defaultRouteId: WorkspaceRouteId;
  icon: LucideIcon;
  dataLinkId?: string;
};

const PRIMARY_DESTINATIONS: RailDestination[] = [
  { id: 'chat', label: 'Sage', defaultRouteId: 'chat', icon: Bot, dataLinkId: 'sage' },
  { id: 'studio', label: 'Agents', defaultRouteId: 'studio', icon: LayoutGrid },
  { id: 'gateway', label: 'Computers', defaultRouteId: 'gateway', icon: Waypoints },
  { id: 'marketplace', label: 'Discover', defaultRouteId: 'marketplace', icon: Compass },
  { id: 'activity', label: 'Activity', defaultRouteId: 'activity', icon: Activity },
];

const SECONDARY_DESTINATIONS: RailDestination[] = [
  { id: 'settings', label: 'Settings', defaultRouteId: 'settings', icon: Settings2 },
];

const ACTIVITY_ROUTE_IDS = new Set<WorkspaceRouteId>([
  'activity',
  'approvals',
  'notifications',
]);

function buildDestinationHref(
  workspaceId: string,
  destination: { defaultRouteId: WorkspaceRouteId },
): string {
  return buildWorkspaceRouteHref(workspaceId, destination.defaultRouteId);
}

function extractRouteWorkspaceId(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'w' || !segments[1]) {
    return null;
  }

  return decodeURIComponent(segments[1]);
}

function extractActiveRouteId(pathname: string | null): WorkspaceRouteId | null {
  if (!pathname) {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'w' || segments.length < 3) {
    return null;
  }

  return resolveWorkspaceRouteIdFromSegment(segments.slice(2).join('/'));
}

function extractActiveRailId(pathname: string | null): RailDestinationId {
  const routeId = extractActiveRouteId(pathname);
  if (!routeId) {
    return 'chat';
  }
  if (ACTIVITY_ROUTE_IDS.has(routeId)) {
    return 'activity';
  }

  const destinationId = getWorkspaceNavRouteDefinition(routeId).destinationId;
  if (destinationId === 'studio' || destinationId === 'gateway' || destinationId === 'marketplace' || destinationId === 'settings') {
    return destinationId;
  }
  return 'chat';
}

export function AccountTenantSwitcher() {
  const pathname = usePathname();
  const { state, actions } = useAccountShell();
  const { resolvedTheme } = useAppTheme();
  const [usageCost, setUsageCost] = useState<number | null>(null);
  const routeWorkspaceId = resolveRouteWorkspaceId(
    state.workspaceMemberships,
    extractRouteWorkspaceId(pathname),
  );
  const activeRailId = extractActiveRailId(pathname);
  const activeWorkspaceId =
    routeWorkspaceId
    ?? state.selectedWorkspaceId
    ?? resolvePrimaryProductWorkspaceId(state.workspaceMemberships)
    ?? state.workspaceMemberships[0]?.workspace.id
    ?? null;
  const activeMembership = state.workspaceMemberships.find((item) => item.workspace.id === activeWorkspaceId) ?? null;
  const activeTenantId = activeMembership?.workspace.tenantId ?? state.workspaceMemberships[0]?.workspace.tenantId ?? '';
  const currentTheme = state.globalTheme;
  const accountInitial = String(state.account?.displayName || state.account?.email || 'You').trim().charAt(0).toUpperCase() || 'Y';
  const nextTheme = currentTheme === 'system'
    ? 'light'
    : currentTheme === 'light'
      ? 'dark'
      : 'system';
  const themeLabel = currentTheme === 'system'
    ? 'Theme: System'
    : currentTheme === 'light'
      ? 'Theme: Light'
      : 'Theme: Dark';
  const ThemeIcon = currentTheme === 'system'
    ? Monitor
    : currentTheme === 'light'
      ? SunMedium
      : Moon;
  const usageClient = useMemo(() => {
    if (!activeWorkspaceId || !activeTenantId) {
      return null;
    }
    const cache = new Map<string, unknown>();
    return createWorkstationClient({
      scope: {
        workspaceId: activeWorkspaceId,
        tenantId: activeTenantId,
        kernelKey: `rail-usage:${activeWorkspaceId}`,
      },
      transport: {
        request: (path, init) => fetch(path, {
          ...init,
          credentials: 'same-origin',
          cache: 'no-store',
        }),
      },
      queryClient: {
        peek: <T,>(key: string) => (cache.get(key) as T | undefined) ?? null,
        set: <T,>(key: string, value: T) => {
          cache.set(key, value);
          return value;
        },
      },
      realtime: {
        trackEventSource: <T extends EventSource>(source: T) => source,
      },
      getApiBaseUrl: () => '',
    });
  }, [activeTenantId, activeWorkspaceId]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const isLightTheme = resolvedTheme === 'light';

    root.setAttribute(APP_THEME_ATTRIBUTE, resolvedTheme);
    root.style.colorScheme = resolvedTheme;
    body.setAttribute(APP_THEME_ATTRIBUTE, resolvedTheme);
    body.style.colorScheme = resolvedTheme;
    body.classList.toggle('theme-light', isLightTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    let cancelled = false;

    if (!usageClient) {
      setUsageCost(null);
      return () => {
        cancelled = true;
      };
    }

    void usageClient.getUsageSummary({ period: 'month' })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const rawCost = typeof payload.total_cost_usd === 'number'
          ? payload.total_cost_usd
          : Number(payload.total_cost_usd);
        setUsageCost(Number.isFinite(rawCost) && rawCost > 0 ? rawCost : null);
      })
      .catch(() => {
        if (!cancelled) {
          setUsageCost(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [usageClient]);

  return (
    <aside data-workstation-switcher="rail" className="account-switcher">
      <div className="account-switcher__cluster account-switcher__cluster--upper">
        <nav aria-label="Primary destinations" className="account-switcher__nav account-switcher__nav--primary">
          {PRIMARY_DESTINATIONS.map((destination) => (
            <Link
              key={destination.id}
              href={activeWorkspaceId ? buildDestinationHref(activeWorkspaceId, destination) : '/'}
              prefetch
              aria-current={activeRailId === destination.id ? 'page' : undefined}
              data-workstation-destination-link={destination.dataLinkId ?? destination.id}
              className={joinClassNames(
                'account-switcher__link',
                activeRailId === destination.id && 'account-switcher__link--active',
              )}
              aria-label={destination.label}
              title={destination.label}
            >
              <destination.icon aria-hidden="true" />
              <span className="account-switcher__link-label">{destination.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="account-switcher__spacer" />
      <div className="account-switcher__cluster account-switcher__cluster--lower">
        {typeof usageCost === 'number' ? (
          <div
            className="account-switcher__usage-indicator"
            title="Usage this month"
            aria-label={`Usage this month ${usageCost.toFixed(2)} dollars`}
          >
            ${usageCost.toFixed(2)}
          </div>
        ) : null}
        <button
          type="button"
          className="account-switcher__link account-switcher__theme-toggle"
          aria-label={`${themeLabel}. Click to switch to ${nextTheme}.`}
          title={`${themeLabel}. Click to switch to ${nextTheme}.`}
          onClick={() => {
            actions.setGlobalTheme(nextTheme);
          }}
        >
          <ThemeIcon aria-hidden="true" />
        </button>
        <nav aria-label="Settings destination" className="account-switcher__nav account-switcher__nav--secondary">
          {SECONDARY_DESTINATIONS.map((destination) => (
            <Link
              key={destination.id}
              href={activeWorkspaceId ? buildWorkspaceRouteHref(activeWorkspaceId, destination.defaultRouteId) : '/'}
              prefetch
              aria-current={activeRailId === destination.id ? 'page' : undefined}
              data-workstation-destination-link={destination.dataLinkId ?? destination.id}
              className={joinClassNames(
                'account-switcher__link',
                activeRailId === destination.id && 'account-switcher__link--active',
              )}
              aria-label={destination.label}
              title={destination.label}
            >
              <destination.icon aria-hidden="true" />
              <span className="account-switcher__link-label">{destination.label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href="/settings/account"
          prefetch
          className="account-switcher__link account-switcher__avatar"
          aria-label="Account"
          title={state.account?.displayName || state.account?.email || 'Account'}
        >
          {accountInitial}
        </Link>
      </div>
    </aside>
  );
}
