import { WorkspaceAppStorePane } from '@/lib/workspace/app-store-pane';
import { WorkstationSurfaceViewport } from '@/lib/workspace/workstation-shell-frame';

export default async function WorkspaceAppStorePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return (
    <WorkstationSurfaceViewport surface="applications">
      <WorkspaceAppStorePane workspaceId={workspaceId} />
    </WorkstationSurfaceViewport>
  );
}
