'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import {
  type WorkspaceNavDestinationId,
  resolveRouteIdFromHref,
} from '@/lib/workspace/workspace-shell';

export function WorkstationCommandBar() {
  const pathname = usePathname();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const activeRouteId = resolveRouteIdFromHref(workspaceId, pathname);
  const [expandedDestinationId, setExpandedDestinationId] = useState<WorkspaceNavDestinationId | null>(null);
  const activeDestination = routeManifest.navGroups.find((group) =>
    group.routes.some((route) => route.id === activeRouteId),
  ) ?? null;
  const visibleDestination = useMemo(
    () =>
      (expandedDestinationId
        ? routeManifest.navGroups.find((group) => group.id === expandedDestinationId) ?? null
        : null) ?? activeDestination,
    [activeDestination, expandedDestinationId, routeManifest.navGroups],
  );

  useEffect(() => {
    setExpandedDestinationId(activeDestination?.id ?? null);
  }, [activeDestination?.id]);

  return (
    <nav
      aria-label="Workstation navigation"
      data-workstation-command-bar="root"
      className="workstation-command-bar"
    >
      <div className="workstation-command-bar__group">
        <span className="workstation-command-bar__label">Destinations</span>

        <div className="workstation-command-bar__routes">
          {routeManifest.navGroups.map((group) => {
            const active = group.id === activeDestination?.id;
            const expanded = group.id === visibleDestination?.id;
            return (
              <Link
                key={group.id}
                href={group.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                aria-expanded={group.direct ? undefined : expanded}
                onClick={() => {
                  setExpandedDestinationId(group.id);
                }}
                onFocus={() => {
                  setExpandedDestinationId(group.id);
                }}
                onMouseEnter={() => {
                  setExpandedDestinationId(group.id);
                }}
                className={joinClassNames(
                  'workstation-command-bar__link',
                  active && 'workstation-command-bar__link--active',
                )}
              >
                {group.label}
              </Link>
            );
          })}
        </div>
      </div>

      {visibleDestination && !visibleDestination.direct && visibleDestination.routes.length > 1 ? (
        <div className="workstation-command-bar__group">
          <span className="workstation-command-bar__label">{visibleDestination.label}</span>

          <div className="workstation-command-bar__routes">
            {visibleDestination.routes.map((route) => {
              const active = route.id === activeRouteId;
              return (
                <Link
                  key={route.id}
                  href={route.href}
                  prefetch
                  aria-current={active ? 'page' : undefined}
                  className={joinClassNames(
                    'workstation-command-bar__link',
                    active && 'workstation-command-bar__link--active',
                  )}
                >
                  {route.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
