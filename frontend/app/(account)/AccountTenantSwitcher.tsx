'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { joinClassNames } from '@/lib/ui/primitives';
import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  resolvePrimaryWorkspaceId,
  resolveRouteWorkspaceId,
  sanitizeWorkspaceRoute,
  type WorkspaceMembershipRecord,
} from '@/lib/shell/workspace-membership-model';

function workspaceEntryHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}`;
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

function workspaceStatusLabel(membership: WorkspaceMembershipRecord): string {
  return membership.requiresOnboarding ? 'Setup required' : 'Ready';
}

export function AccountTenantSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, actions } = useAccountShell();
  const suggestedWorkspaceId = resolvePrimaryWorkspaceId(state.workspaceMemberships);
  const routeWorkspaceId = resolveRouteWorkspaceId(
    state.workspaceMemberships,
    extractRouteWorkspaceId(pathname),
  );

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
      <div className="account-switcher__brand">Empyralis</div>

      <nav aria-label="Workspace switcher" className="account-switcher__nav">
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
                'account-switcher__link',
                isActive && 'account-switcher__link--active',
              )}
              onMouseEnter={() => {
                router.prefetch(targetHref);
              }}
              onFocus={() => {
                router.prefetch(targetHref);
              }}
            >
              {membership.workspace.label}
            </Link>
          );
        })}
      </nav>

      <div className="app-stack-2">
        <Link href="/workspaces/new" prefetch className="account-switcher__action">
          Create workspace
        </Link>
        {activeWorkspace ? (
          <div className="account-switcher__meta">
            {shellProfileLabel(activeWorkspace.preferredShellProfileId)} · {activeWorkspace.role} ·{' '}
            {workspaceStatusLabel(activeWorkspace)}
            {suggestedWorkspaceId === activeWorkspace.workspace.id ? ' · Primary' : ''}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
