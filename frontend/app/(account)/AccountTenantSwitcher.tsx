'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, LayoutGrid, Moon, Settings2, Sun } from 'lucide-react';

import { joinClassNames } from '@/lib/ui/primitives';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import { createWorkstationClient } from '@/lib/workspace/workstation-client';
import {
  resolvePrimaryProductWorkspaceId,
  resolveRouteWorkspaceId,
} from '@/lib/shell/workspace-membership-model';
import { getWorkspaceNavRouteDefinition, resolveWorkspaceRouteIdFromSegment } from '../../../shared/nav-manifest';

const PRIMARY_DESTINATIONS = [
  { id: 'sage', label: 'Sage', segment: 'sage', icon: Bot },
  { id: 'studio', label: 'Studio', segment: 'studio', icon: LayoutGrid },
] as const;

const SECONDARY_DESTINATIONS = [
  { id: 'settings', label: 'Settings', segment: 'settings', icon: Settings2 },
] as const;

type SwitcherDestinationId =
  | typeof PRIMARY_DESTINATIONS[number]['id']
  | typeof SECONDARY_DESTINATIONS[number]['id'];

function destinationHref(workspaceId: string, segment: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/${segment}`;
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

function extractActiveDestinationId(pathname: string | null): SwitcherDestinationId {
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
  if (destinationId === 'studio' || destinationId === 'settings') {
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
              href={activeWorkspaceId ? destinationHref(activeWorkspaceId, destination.segment) : '/'}
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
          onClick={() => {
            actions.setGlobalTheme(isLightTheme ? 'dark' : 'light');
          }}
          aria-label={isLightTheme ? 'Use dark theme' : 'Use light theme'}
          title={isLightTheme ? 'Use dark theme' : 'Use light theme'}
        >
          {isLightTheme ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <nav aria-label="Settings destination" className="account-switcher__nav account-switcher__nav--secondary">
          {SECONDARY_DESTINATIONS.map((destination) => (
            <Link
              key={destination.id}
              href={activeWorkspaceId ? destinationHref(activeWorkspaceId, destination.segment) : '/'}
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
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
