'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';

export function WorkspaceScope({
  workspaceId,
  surface,
  routeKind,
}: {
  workspaceId: string;
  surface: WorkspaceRouteId | 'workspace_root';
  routeKind: 'workspace_root' | 'workspace_surface';
}) {
  const pathname = usePathname();
  const { actions, state } = useAccountShell();
  const {
    boundaryKey,
    bootstrap,
    shellProfile,
    shellProfileId,
    routeManifest,
    hasCapability,
    canAccessRoute,
  } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const routeId = surface === 'workspace_root' ? null : surface;

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
            shellProfile,
            routeDerivedWorkspaceId: state.selectedWorkspaceId,
            membershipFromBoundary: bootstrap.membership,
            workspaceFromBoundary: bootstrap.workspace,
            shellHints: bootstrap.shellHints,
            routeManifest,
            routeAllowed: routeId ? canAccessRoute(routeId) : true,
            capabilitySnapshot: {
              documentWorkstation: hasCapability('document_workstation_enabled'),
              workspaceAdmin: hasCapability('workspace_admin_enabled'),
              billingRead: hasCapability('billing_read_enabled'),
              routingRead: hasCapability('routing_read_enabled'),
              artifacts: hasCapability('artifacts_enabled'),
            },
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
