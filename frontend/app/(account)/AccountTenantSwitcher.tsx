'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SettingsIcon, SparkIcon, StudioIcon } from '@/lib/ui/icons';
import { joinClassNames } from '@/lib/ui/primitives';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  resolvePrimaryProductWorkspaceId,
  resolveRouteWorkspaceId,
} from '@/lib/shell/workspace-membership-model';
import { getWorkspaceNavRouteDefinition, resolveWorkspaceRouteIdFromSegment } from '../../../shared/nav-manifest';

const PRIMARY_DESTINATIONS = [
  { id: 'sage', label: 'Sage', segment: 'sage', icon: SparkIcon },
  { id: 'studio', label: 'Studio', segment: 'studio', icon: StudioIcon },
  { id: 'settings', label: 'Settings', segment: 'settings', icon: SettingsIcon },
] as const;

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

function extractActiveDestinationId(pathname: string | null): typeof PRIMARY_DESTINATIONS[number]['id'] {
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
  const { state } = useAccountShell();
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

  return (
    <aside data-workstation-switcher="rail" className="account-switcher">
      <div className="account-switcher__brand" aria-hidden="true">
        <SparkIcon size={18} />
      </div>

      <nav aria-label="Primary destinations" className="account-switcher__nav">
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
    </aside>
  );
}
