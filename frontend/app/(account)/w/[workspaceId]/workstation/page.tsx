import { WorkspaceSurfacePage } from '@/app/(account)/w/[workspaceId]/WorkspaceSurfacePage';

export default async function WorkspaceWorkstationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceSurfacePage workspaceId={workspaceId} surface="workstation" />;
}
