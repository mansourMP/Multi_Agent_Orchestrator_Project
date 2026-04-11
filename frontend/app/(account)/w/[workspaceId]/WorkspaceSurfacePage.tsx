'use client';

import Link from 'next/link';

import { WorkspaceScope } from '@/app/(account)/w/[workspaceId]/WorkspaceScope';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';

export function WorkspaceSurfacePage({
  workspaceId,
  surface,
}: {
  workspaceId: string;
  surface: WorkspaceRouteId;
}) {
  const { routeManifest, shellProfile } = useWorkspaceBoundary();
  const route = routeManifest.routeIndex[surface];

  if (!route) {
    return (
      <main
        style={{
          minHeight: '100vh',
          padding: '3rem',
          display: 'grid',
          gap: '0.75rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Route Not Available</h1>
        <p style={{ margin: 0, maxWidth: '52rem', lineHeight: 1.6 }}>
          This workspace does not expose <code>{surface}</code> in the active shell profile.
        </p>
        <p style={{ margin: 0 }}>
          Active shell profile: <code>{shellProfile.id}</code>
        </p>
        <p style={{ margin: 0 }}>
          Safe fallback: <Link href={routeManifest.defaultRoute}>{routeManifest.defaultRoute}</Link>
        </p>
      </main>
    );
  }

  return (
    <WorkspaceScope
      workspaceId={workspaceId}
      surface={surface}
      routeKind="workspace_surface"
    />
  );
}
