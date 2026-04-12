'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  resolvePrimaryWorkspaceId,
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
    return 'Document Workstation';
  }
  if (profileId === 'operations_admin_shell') {
    return 'Operations Admin';
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
  const suggestedWorkspaceId = resolvePrimaryWorkspaceId(state.workspaceMemberships);
  const routeWorkspaceId = extractRouteWorkspaceId(pathname);

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

  return (
    <aside
      data-workstation-switcher="rail"
      style={{
        height: '100%',
        padding: '1.25rem 1rem',
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(0, 1fr)',
        alignContent: 'start',
        gap: '1rem',
        background:
          'linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(241,245,249,0.98) 100%)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gap: '0.45rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(255, 255, 255, 0.88)',
        }}
      >
        <span
          style={{
            width: 'fit-content',
            padding: '0.22rem 0.55rem',
            borderRadius: '999px',
            background: '#dbeafe',
            color: '#1d4ed8',
            fontSize: '0.74rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Pane 1
        </span>
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Workspace Switcher</h1>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.5, fontSize: '0.9rem' }}>
            Route-only switching. The rail never mutates kernel state directly.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '0.55rem',
          padding: '0.95rem 1rem',
          borderRadius: '1rem',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          background: 'rgba(255, 255, 255, 0.7)',
        }}
      >
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            Active route workspace
          </span>
          <strong style={{ color: '#0f172a' }}>{routeWorkspaceId ?? 'none'}</strong>
        </div>
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>
            Current path
          </span>
          <span style={{ color: '#334155', fontSize: '0.86rem', wordBreak: 'break-word' }}>{pathname ?? '/'}</span>
        </div>
      </div>

      <nav
        aria-label="Workspace switcher"
        style={{
          display: 'grid',
          gap: '0.8rem',
          alignContent: 'start',
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        {state.workspaceMemberships.map((membership) => {
          const workspaceId = membership.workspace.id;
          const isActive = routeWorkspaceId === workspaceId;
          const entryHref = workspaceEntryHref(workspaceId);
          const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
          const targetHref = resolveSafeWorkspaceHref(membership, rememberedRoute);
          const shellProfile = shellProfileLabel(membership.preferredShellProfileId);
          const isUsingFallback = rememberedRoute !== targetHref;

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
                gap: '0.6rem',
                padding: '0.95rem 1rem',
                borderRadius: '1rem',
                border: isActive ? '1px solid #0f172a' : '1px solid rgba(148, 163, 184, 0.45)',
                background: isActive ? '#e2e8f0' : 'rgba(255, 255, 255, 0.92)',
                color: '#0f172a',
                textDecoration: 'none',
                boxShadow: isActive ? '0 16px 32px rgba(15, 23, 42, 0.12)' : '0 12px 24px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: '0.18rem', minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.96rem' }}>{membership.workspace.label}</span>
                  <span style={{ fontSize: '0.82rem', color: '#475569', overflowWrap: 'anywhere' }}>
                    tenant {membership.workspace.tenantId}
                  </span>
                </div>
                <span
                  style={{
                    padding: '0.18rem 0.55rem',
                    borderRadius: '999px',
                    background: isActive ? '#0f172a' : '#e2e8f0',
                    color: isActive ? '#ffffff' : '#334155',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {membership.role}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '0.55rem',
                }}
              >
                <div style={{ display: 'grid', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Shell
                  </span>
                  <span style={{ fontSize: '0.84rem', color: '#0f172a' }}>{shellProfile}</span>
                </div>
                <div style={{ display: 'grid', gap: '0.15rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Kind
                  </span>
                  <span style={{ fontSize: '0.84rem', color: '#0f172a' }}>{membership.workspace.kind}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.3rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                  Route-safe entry
                </span>
                <span style={{ fontSize: '0.82rem', color: '#0f172a', overflowWrap: 'anywhere' }}>
                  {targetHref}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', overflowWrap: 'anywhere' }}>
                  remembered: {rememberedRoute ?? 'none'}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', overflowWrap: 'anywhere' }}>
                  fallback: {entryHref !== membership.defaultRoute ? membership.defaultRoute : entryHref}
                </span>
                <span style={{ fontSize: '0.78rem', color: isUsingFallback ? '#b45309' : '#64748b' }}>
                  {isUsingFallback ? 'invalid remembered route fell back safely' : 'remembered route is safe'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.45rem',
                }}
              >
                {[
                  ['Runs', 'slot'],
                  ['Approvals', 'slot'],
                  ['Activity', 'slot'],
                ].map(([label, value]) => (
                  <span
                    key={label}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.28rem 0.55rem',
                      borderRadius: '999px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#475569',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                    }}
                  >
                    {label}
                    <span style={{ color: '#94a3b8' }}>{value}</span>
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
