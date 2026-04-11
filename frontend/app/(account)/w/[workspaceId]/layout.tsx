import type { ReactNode } from 'react';

import { loadWorkspaceBootstrap } from '@/lib/workspace/server-workspace-bootstrap';
import { WorkspaceBoundary } from '@/lib/workspace/workspace-boundary';

export default async function WorkspaceRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const bootstrap = await loadWorkspaceBootstrap(workspaceId);

  return (
    <WorkspaceBoundary workspaceId={workspaceId} bootstrap={bootstrap}>
      {children}
    </WorkspaceBoundary>
  );
}
