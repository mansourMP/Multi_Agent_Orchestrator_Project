import { HostedMiniAppsPane } from '@/lib/workspace/hosted-mini-apps-pane';

export default async function WorkspaceApplicationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <HostedMiniAppsPane workspaceId={workspaceId} />;
}
