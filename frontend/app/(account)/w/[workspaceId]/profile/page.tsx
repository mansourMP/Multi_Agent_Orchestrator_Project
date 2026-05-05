import { WorkspaceSurfacePage } from '@/app/(account)/w/[workspaceId]/WorkspaceSurfacePage';

export default async function WorkspaceProfilePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceSurfacePage workspaceId={workspaceId} surface="profile" />;
}
