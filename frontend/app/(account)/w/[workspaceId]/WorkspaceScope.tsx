'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

export function WorkspaceScope({
  workspaceId,
  surface,
  routeKind,
}: {
  workspaceId: string;
  surface: string;
  routeKind: 'workspace_root' | 'workspace_surface';
}) {
  const pathname = usePathname();
  const { actions, state } = useAccountShell();
  const { boundaryKey, bootstrap, shellProfileId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();

  useEffect(() => {
    if (pathname) {
      actions.rememberWorkspaceRoute(workspaceId, pathname);
    }
  }, [actions, pathname, workspaceId]);

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2rem 3rem',
        display: 'grid',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Workspace Route Tree Active</h1>
        <p style={{ margin: 0, maxWidth: '52rem', lineHeight: 1.6 }}>
          This page is mounted under <code>/w/[workspaceId]/*</code>. Active workspace selection is derived
          from the current route, not from a global mutable workspace toggle.
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
            routeKind,
            surface,
            pathname,
            workspaceId,
            boundaryKey,
            shellProfileId,
            routeDerivedWorkspaceId: state.selectedWorkspaceId,
            membershipFromBoundary: bootstrap.membership,
            workspaceFromBoundary: bootstrap.workspace,
            shellHints: bootstrap.shellHints,
            runtime: bootstrap.runtime,
            serviceSnapshot: services.snapshot(),
          },
          null,
          2,
        )}
      </pre>
    </main>
  );
}
