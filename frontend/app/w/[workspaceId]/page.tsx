import { WorkspaceRoutePlaceholder } from '@/app/w/[workspaceId]/WorkspaceRoutePlaceholder';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceRoutePlaceholder workspaceId={workspaceId} />;
}
