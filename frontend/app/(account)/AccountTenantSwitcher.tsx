'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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
    <aside
      data-workstation-switcher="rail"
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
        gap: '0.95rem',
        padding: '1rem 0.9rem',
        background: 'color-mix(in srgb, var(--app-bg-shell) 92%, var(--app-bg-overlay) 8%)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: '0.35rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-panel) 76%, var(--app-bg-overlay) 24%)',
        }}
      >
        <span
          style={{
            color: 'var(--app-text-tertiary)',
            fontSize: '0.72rem',
            fontWeight: 650,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Empyralis
        </span>
        <h1
          style={{
            margin: 0,
            color: 'var(--app-text-primary)',
            fontSize: '1rem',
            fontWeight: 680,
            letterSpacing: '-0.015em',
          }}
        >
          Workspaces
        </h1>
        <p
          style={{
            margin: 0,
            color: 'var(--app-text-secondary)',
            fontSize: '0.86rem',
            lineHeight: 1.5,
          }}
        >
          Switch operational context without leaving the workstation shell.
        </p>
      </div>

      {activeWorkspace ? (
        <div
          style={{
            display: 'grid',
            gap: '0.55rem',
            padding: '0.95rem 1rem',
            borderRadius: '1rem',
            border: '1px solid var(--app-border-subtle)',
            background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
          }}
        >
          <div style={{ display: 'grid', gap: '0.18rem' }}>
            <span
              style={{
                color: 'var(--app-text-tertiary)',
                fontSize: '0.72rem',
                fontWeight: 650,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Current workspace
            </span>
            <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.96rem' }}>
              {activeWorkspace.workspace.label}
            </strong>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '1.8rem',
                padding: '0.28rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--app-border-subtle)',
                background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                color: 'var(--app-text-secondary)',
                fontSize: '0.76rem',
              }}
            >
              {shellProfileLabel(activeWorkspace.preferredShellProfileId)}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '1.8rem',
                padding: '0.28rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--app-border-subtle)',
                background: 'color-mix(in srgb, var(--app-bg-panel) 84%, var(--app-bg-overlay) 16%)',
                color: 'var(--app-text-secondary)',
                fontSize: '0.76rem',
              }}
            >
              {activeWorkspace.role}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: '1.8rem',
                padding: '0.28rem 0.55rem',
                borderRadius: '999px',
                border: '1px solid var(--app-border-subtle)',
                background: activeWorkspace.requiresOnboarding
                  ? 'color-mix(in srgb, var(--app-warning-muted) 80%, var(--app-bg-panel) 20%)'
                  : 'color-mix(in srgb, var(--app-success-muted) 80%, var(--app-bg-panel) 20%)',
                color: activeWorkspace.requiresOnboarding ? 'var(--app-warning)' : 'var(--app-success)',
                fontSize: '0.76rem',
                fontWeight: 620,
              }}
            >
              {workspaceStatusLabel(activeWorkspace)}
            </span>
          </div>
        </div>
      ) : null}

      <Link
        href="/workspaces/new"
        prefetch
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '2.4rem',
          padding: '0.55rem 0.95rem',
          borderRadius: '999px',
          border: '1px solid var(--app-border-accent)',
          background: 'color-mix(in srgb, var(--app-accent) 18%, var(--app-bg-overlay) 82%)',
          color: 'var(--app-accent-text)',
          textDecoration: 'none',
          fontSize: '0.84rem',
          fontWeight: 640,
        }}
      >
        Create workspace
      </Link>

      <nav
        aria-label="Workspace switcher"
        style={{
          display: 'grid',
          gap: '0.7rem',
          alignContent: 'start',
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        {state.workspaceMemberships.map((membership) => {
          const workspaceId = membership.workspace.id;
          const isActive = routeWorkspaceId === workspaceId;
          const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
          const targetHref = resolveSafeWorkspaceHref(membership, rememberedRoute);
          const shellProfile = shellProfileLabel(membership.preferredShellProfileId);
          const isSuggested = suggestedWorkspaceId === workspaceId;

          return (
            <Link
              key={workspaceId}
              href={targetHref}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              data-workstation-switcher-link={workspaceId}
              onMouseEnter={() => {
                router.prefetch(targetHref);
              }}
              onFocus={() => {
                router.prefetch(targetHref);
              }}
              style={{
                display: 'grid',
                gap: '0.7rem',
                padding: '0.95rem 1rem',
                borderRadius: '1rem',
                border: isActive ? '1px solid var(--app-border-accent)' : '1px solid var(--app-border-subtle)',
                background: isActive
                  ? 'color-mix(in srgb, var(--app-accent-muted) 74%, var(--app-bg-panel) 26%)'
                  : 'color-mix(in srgb, var(--app-bg-panel) 86%, var(--app-bg-overlay) 14%)',
                color: 'var(--app-text-primary)',
                textDecoration: 'none',
                boxShadow: isActive ? 'var(--app-shadow-panel)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: '0.18rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 660, fontSize: '0.94rem', overflowWrap: 'anywhere' }}>
                    {membership.workspace.label}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--app-text-secondary)' }}>
                    {membership.workspace.kind}
                  </span>
                </div>
                <span
                  style={{
                    padding: '0.18rem 0.55rem',
                    borderRadius: '999px',
                    background: isActive
                      ? 'color-mix(in srgb, var(--app-accent) 24%, var(--app-bg-overlay) 76%)'
                      : 'color-mix(in srgb, var(--app-bg-panel-elevated) 80%, var(--app-bg-overlay) 20%)',
                    color: isActive ? 'var(--app-accent-text)' : 'var(--app-text-secondary)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {membership.role}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.45rem',
                }}
              >
                {[shellProfile, workspaceStatusLabel(membership), isSuggested ? 'Primary' : null]
                  .filter(Boolean)
                  .map((label) => (
                    <span
                      key={label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: '1.75rem',
                        padding: '0.22rem 0.5rem',
                        borderRadius: '999px',
                        border: '1px solid var(--app-border-subtle)',
                        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
                        color: 'var(--app-text-secondary)',
                        fontSize: '0.74rem',
                      }}
                    >
                      {label}
                    </span>
                  ))}
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
