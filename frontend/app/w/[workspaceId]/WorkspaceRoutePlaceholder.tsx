'use client';

import { useEffect } from 'react';

import { useAccountShell } from '@/lib/shell/account-shell-context';

export function WorkspaceRoutePlaceholder({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { actions, state } = useAccountShell();
  const membership = state.workspaceMembershipIndex[workspaceId] ?? null;

  useEffect(() => {
    actions.selectWorkspace(workspaceId);
    actions.rememberWorkspaceRoute(workspaceId, `/w/${workspaceId}`);
  }, [actions, workspaceId]);

  return (
    <main
      style={{
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Workspace Boundary Pending</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        The route is now workspace-scoped. This page intentionally mounts only the account-shell
        plumbing until the dedicated workspace boundary lands in the next phase.
      </p>
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
            workspaceId,
            selectedWorkspaceId: state.selectedWorkspaceId,
            membership,
          },
          null,
          2,
        )}
      </pre>
    </main>
  );
}
