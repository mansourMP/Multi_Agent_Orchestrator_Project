'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
  WORKSPACE_NAV_DESTINATIONS,
  buildWorkspaceRouteHref,
  getWorkspaceNavRouteDefinition,
  resolveWorkspaceRouteIdFromSegment,
  type WorkspaceNavDestinationId,
} from '../../../shared/nav-manifest';

const DESTINATION_ICON_MAP: Record<WorkspaceNavDestinationId, LucideIcon> = {
  sage: Bot,
  studio: LayoutGrid,
  marketplace: Compass,
  gateway: Waypoints,
  settings: Settings2,
};

const PRIMARY_DESTINATIONS = WORKSPACE_NAV_DESTINATIONS
  .filter((destination) => destination.id !== 'settings' && destination.id !== 'gateway')
  .map((destination) => ({
    id: destination.id,
    label: destination.label,
    defaultRouteId: destination.defaultRouteId,
    icon: DESTINATION_ICON_MAP[destination.id],
  }));

const SECONDARY_DESTINATIONS = WORKSPACE_NAV_DESTINATIONS
  .filter((destination) => destination.id === 'settings')
  .map((destination) => ({
    id: destination.id,
    label: destination.label,
    defaultRouteId: destination.defaultRouteId,
    icon: DESTINATION_ICON_MAP[destination.id],
  }));

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

function extractActiveDestinationId(pathname: string | null): WorkspaceNavDestinationId {
  if (!pathname) {
    return 'sage';
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'w' || segments.length < 3) {
    return 'sage';
  }

  const routeId = resolveWorkspaceRouteIdFromSegment(segments.slice(2).join('/'));
  if (!routeId) {
    return 'sage';
  }

  const destinationId = getWorkspaceNavRouteDefinition(routeId).destinationId;
  if (WORKSPACE_NAV_DESTINATIONS.some((destination) => destination.id === destinationId)) {
    return destinationId;
  }
  return 'sage';
}

export function AccountTenantSwitcher() {
  const pathname = usePathname();
  const { state, actions } = useAccountShell();
  const [usageCost, setUsageCost] = useState<number | null>(null);
  const routeWorkspaceId = resolveRouteWorkspaceId(
    state.workspaceMemberships,
    extractRouteWorkspaceId(pathname),
  );
  const activeDestinationId = extractActiveDestinationId(pathname);
  const activeWorkspaceId =
    routeWorkspaceId
    ?? state.selectedWorkspaceId
    ?? resolvePrimaryProductWorkspaceId(state.workspaceMemberships)
    ?? state.workspaceMemberships[0]?.workspace.id
    ?? null;
  const activeMembership = state.workspaceMemberships.find((item) => item.workspace.id === activeWorkspaceId) ?? null;
  const activeTenantId = activeMembership?.workspace.tenantId ?? state.workspaceMemberships[0]?.workspace.tenantId ?? '';
  const isLightTheme = state.globalTheme === 'light';
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
    document.body.classList.toggle('theme-light', isLightTheme);
  }, [isLightTheme]);

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
              href={activeWorkspaceId ? buildWorkspaceRouteHref(activeWorkspaceId, destination.defaultRouteId) : '/'}
              prefetch
              aria-current={activeDestinationId === destination.id ? 'page' : undefined}
              data-workstation-destination-link={destination.id}
              className={joinClassNames(
                'account-switcher__link',
                activeDestinationId === destination.id && 'account-switcher__link--active',
              )}
              aria-label={destination.label}
              title={destination.label}
            >
              <destination.icon size={18} />
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
          <ThemeIcon size={18} />
          <span className="account-switcher__link-label">{themeLabel}</span>
        </button>
        <nav aria-label="Settings destination" className="account-switcher__nav account-switcher__nav--secondary">
          {SECONDARY_DESTINATIONS.map((destination) => (
            <Link
              key={destination.id}
              href={activeWorkspaceId ? buildWorkspaceRouteHref(activeWorkspaceId, destination.defaultRouteId) : '/'}
              prefetch
              aria-current={activeDestinationId === destination.id ? 'page' : undefined}
              data-workstation-destination-link={destination.id}
              className={joinClassNames(
                'account-switcher__link',
                activeDestinationId === destination.id && 'account-switcher__link--active',
              )}
              aria-label={destination.label}
              title={destination.label}
            >
              <destination.icon size={18} />
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
          <span className="account-switcher__link-label">
            {state.account?.displayName || state.account?.email || 'Account'}
          </span>
        </Link>
      </div>
    </aside>
  );
}
