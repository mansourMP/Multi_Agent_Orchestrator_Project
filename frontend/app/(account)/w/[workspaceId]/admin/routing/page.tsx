import { WorkspaceSurfacePage } from '@/app/(account)/w/[workspaceId]/WorkspaceSurfacePage';

export default async function WorkspaceAdminRoutingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceSurfacePage workspaceId={workspaceId} surface="admin/routing" />;
}
