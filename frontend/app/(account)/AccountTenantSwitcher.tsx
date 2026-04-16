'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { SettingsIcon, SparkIcon, StudioIcon, WorkspaceIcon } from '@/lib/ui/icons';
import { joinClassNames } from '@/lib/ui/primitives';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  resolvePrimaryWorkspaceId,
  resolveRouteWorkspaceId,
  sanitizeWorkspaceRoute,
  type WorkspaceMembershipRecord,
} from '@/lib/shell/workspace-membership-model';
import { getWorkspaceNavRouteDefinition, resolveWorkspaceRouteIdFromSegment } from '../../../shared/nav-manifest';

const PRIMARY_DESTINATIONS = [
  { id: 'sage', label: 'Sage', segment: 'sage', icon: SparkIcon },
  { id: 'studio', label: 'Studio', segment: 'studio', icon: StudioIcon },
  { id: 'settings', label: 'Settings', segment: 'settings', icon: SettingsIcon },
] as const;

function workspaceEntryHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}`;
}

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

function shellProfileLabel(profileId: string | null | undefined): string {
  if (profileId === 'document_workstation_shell') {
    return 'Document';
  }
  if (profileId === 'operations_admin_shell') {
    return 'Operations';
  }
  if (profileId === 'personal_shell') {
    return 'Personal';
  }
  return 'Default';
}

function resolveSafeWorkspaceHref(
  membership: WorkspaceMembershipRecord,
  rememberedRoute: string | null,
): string {
  return sanitizeWorkspaceRoute(
    rememberedRoute,
    sanitizeWorkspaceRoute(membership.defaultRoute, workspaceEntryHref(membership.workspace.id)),
  );
}

export function AccountTenantSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, actions } = useAccountShell();
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const suggestedWorkspaceId = resolvePrimaryWorkspaceId(state.workspaceMemberships);
  const routeWorkspaceId = resolveRouteWorkspaceId(
    state.workspaceMemberships,
    extractRouteWorkspaceId(pathname),
  );
  const activeDestinationId = extractActiveDestinationId(pathname);
  const activeWorkspaceId = routeWorkspaceId ?? suggestedWorkspaceId ?? state.workspaceMemberships[0]?.workspace.id ?? null;
 
  useEffect(() => {
    const prefetchCandidates = state.workspaceMemberships
      .map((membership) => {
        const workspaceId = membership.workspace.id;
        const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
        return {
          workspaceId,
          targetHref: resolveSafeWorkspaceHref(membership, rememberedRoute),
        };
      })
      .filter((candidate) => candidate.workspaceId === routeWorkspaceId || candidate.workspaceId === suggestedWorkspaceId)
      .slice(0, 2);

    for (const candidate of prefetchCandidates) {
      router.prefetch(candidate.targetHref);
    }
  }, [actions, routeWorkspaceId, router, state.workspaceMemberships, suggestedWorkspaceId]);

  const activeWorkspace = useMemo(
    () => state.workspaceMemberships.find((membership) => membership.workspace.id === routeWorkspaceId) ?? null,
    [routeWorkspaceId, state.workspaceMemberships],
  );

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

      <div className="account-switcher__utilities">
        <button
          type="button"
          data-workstation-switcher-link={activeWorkspaceId ?? undefined}
          onClick={() => {
            setWorkspaceSheetOpen(true);
          }}
          aria-label={activeWorkspace ? `Switch workspace from ${activeWorkspace.workspace.label}` : 'Switch workspace'}
          title={activeWorkspace ? `Workspace: ${activeWorkspace.workspace.label}` : 'Switch workspace'}
          className={joinClassNames(
            'account-switcher__action',
            workspaceSheetOpen && 'account-switcher__action--active',
          )}
        >
          <WorkspaceIcon size={18} />
        </button>
      </div>

      <CommandSheet
        open={workspaceSheetOpen}
        title="Workspaces"
        description="Switch workspace context without leaving the current product destination."
        onClose={() => {
          setWorkspaceSheetOpen(false);
        }}
      >
        <div className="account-switcher-sheet">
          {state.workspaceMemberships.map((membership) => {
            const workspaceId = membership.workspace.id;
            const isActive = routeWorkspaceId === workspaceId;
            const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
            const targetHref = resolveSafeWorkspaceHref(membership, rememberedRoute);

            return (
              <Link
                key={workspaceId}
                href={targetHref}
                prefetch
                aria-current={isActive ? 'page' : undefined}
                data-workstation-switcher-link={workspaceId}
                className={joinClassNames(
                  'account-switcher-sheet__link',
                  isActive && 'account-switcher-sheet__link--active',
                )}
                onMouseEnter={() => {
                  router.prefetch(targetHref);
                }}
                onFocus={() => {
                  router.prefetch(targetHref);
                }}
                onClick={() => {
                  setWorkspaceSheetOpen(false);
                }}
              >
                <span className="account-switcher-sheet__title">{membership.workspace.label}</span>
                <span className="account-switcher-sheet__meta">
                  {shellProfileLabel(membership.preferredShellProfileId)} · {membership.role} · {membership.requiresOnboarding ? 'Setup required' : 'Ready'}
                </span>
              </Link>
            );
          })}

          <Link
            href="/workspaces/new"
            prefetch
            className="account-switcher-sheet__link account-switcher-sheet__link--create"
            onClick={() => {
              setWorkspaceSheetOpen(false);
            }}
          >
            <span className="account-switcher-sheet__title">Create workspace</span>
            <span className="account-switcher-sheet__meta">Start a new workspace with the Sage shell.</span>
          </Link>
        </div>
      </CommandSheet>
    </aside>
  );
}
