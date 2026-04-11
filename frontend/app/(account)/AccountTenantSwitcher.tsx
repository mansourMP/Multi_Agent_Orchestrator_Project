'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { resolvePrimaryWorkspaceId } from '@/lib/shell/workspace-membership-model';

function workspaceEntryHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}`;
}

export function AccountTenantSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, actions } = useAccountShell();
  const suggestedWorkspaceId = resolvePrimaryWorkspaceId(state.workspaceMemberships);

  useEffect(() => {
    const prefetchCandidates = state.workspaceMemberships
      .map((membership) => membership.workspace.id)
      .filter((workspaceId) => workspaceId === state.selectedWorkspaceId || workspaceId === suggestedWorkspaceId)
      .slice(0, 2);

    for (const workspaceId of prefetchCandidates) {
      router.prefetch(workspaceEntryHref(workspaceId));
    }
  }, [router, state.selectedWorkspaceId, state.workspaceMemberships, suggestedWorkspaceId]);

  return (
    <aside
      style={{
        borderRight: '1px solid #e5e7eb',
        padding: '1.25rem 1rem',
        display: 'grid',
        alignContent: 'start',
        gap: '1rem',
        background: '#f8fafc',
      }}
    >
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1rem' }}>Workspaces</h1>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.5, fontSize: '0.9rem' }}>
          Route-only tenant switching. The switcher never mutates the active workspace directly.
        </p>
      </div>

      <nav aria-label="Workspace switcher" style={{ display: 'grid', gap: '0.75rem' }}>
        {state.workspaceMemberships.map((membership) => {
          const workspaceId = membership.workspace.id;
          const isActive = state.selectedWorkspaceId === workspaceId;
          const entryHref = workspaceEntryHref(workspaceId);
          const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);

          return (
            <Link
              key={workspaceId}
              href={entryHref}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              onMouseEnter={() => {
                router.prefetch(entryHref);
              }}
              onFocus={() => {
                router.prefetch(entryHref);
              }}
              style={{
                display: 'grid',
                gap: '0.15rem',
                padding: '0.8rem 0.9rem',
                borderRadius: '0.85rem',
                border: isActive ? '1px solid #0f172a' : '1px solid #cbd5e1',
                background: isActive ? '#e2e8f0' : '#ffffff',
                color: '#0f172a',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontWeight: 700 }}>{membership.workspace.label}</span>
              <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                role: {membership.role}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                entry: {entryHref}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                remembered: {rememberedRoute ?? 'none'}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                current route: {pathname ?? '/'}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
