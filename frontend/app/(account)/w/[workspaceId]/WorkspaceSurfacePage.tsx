import { WorkspaceScope } from '@/app/(account)/w/[workspaceId]/WorkspaceScope';

export function WorkspaceSurfacePage({
  workspaceId,
  surface,
}: {
  workspaceId: string;
  surface: string;
}) {
  return (
    <WorkspaceScope
      workspaceId={workspaceId}
      surface={surface}
      routeKind="workspace_surface"
    />
  );
}
