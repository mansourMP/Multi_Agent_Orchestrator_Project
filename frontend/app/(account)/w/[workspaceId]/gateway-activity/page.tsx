import { WorkspaceSurfacePage } from '@/app/(account)/w/[workspaceId]/WorkspaceSurfacePage';

export default async function WorkspaceGatewayActivityPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceSurfacePage workspaceId={workspaceId} surface="gatewayActivity" />;
}
