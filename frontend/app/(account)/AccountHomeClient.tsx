'use client';

import Link from 'next/link';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { resolvePrimaryWorkspaceId } from '@/lib/shell/workspace-membership-model';

function workspaceEntryHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}`;
}

export function AccountHomeClient() {
  const { state, actions } = useAccountShell();
  const suggestedWorkspaceId = resolvePrimaryWorkspaceId(state.workspaceMemberships);
  const suggestedHref = suggestedWorkspaceId ? workspaceEntryHref(suggestedWorkspaceId) : null;
  const suggestedRememberedRoute = suggestedWorkspaceId
    ? actions.resolveWorkspaceHref(suggestedWorkspaceId)
    : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem',
        display: 'grid',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Empyralis Account Shell</h1>
        <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
          Workspace routes now live under <code>/w/[workspaceId]/*</code>. This root page is account-global
          only and does not mount any workspace feature surface.
        </p>
      </div>
      <pre
        style={{
          margin: 0,
          padding: '1rem',
          borderRadius: '0.75rem',
          background: '#111827',
          color: '#e5e7eb',
          overflow: 'auto',
        }}
      >
        {JSON.stringify(
          {
            accountStatus: state.status,
            routeWorkspaceId: state.selectedWorkspaceId,
            suggestedWorkspaceId,
            memberships: state.workspaceMemberships.map((membership) => ({
              workspaceId: membership.workspace.id,
              role: membership.role,
              entryHref: workspaceEntryHref(membership.workspace.id),
              rememberedRoute: actions.resolveWorkspaceHref(membership.workspace.id),
              defaultRoute: membership.defaultRoute,
            })),
            suggestedWorkspaceEntryHref: suggestedHref,
            suggestedWorkspaceRememberedRoute: suggestedRememberedRoute,
          },
          null,
          2,
        )}
      </pre>
      {suggestedHref ? (
        <Link href={suggestedHref} style={{ color: '#1d4ed8', fontWeight: 600 }}>
          Open primary workspace entry route
        </Link>
      ) : null}
    </main>
  );
}
