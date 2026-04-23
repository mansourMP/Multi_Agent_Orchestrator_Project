import { HostedMiniAppSurface } from '@/lib/workspace/hosted-mini-app-surface';

export default async function WorkspaceHostedMiniAppPage({
  params,
}: {
  params: Promise<{ workspaceId: string; appId: string }>;
}) {
  const { workspaceId, appId } = await params;
  return <HostedMiniAppSurface workspaceId={workspaceId} appId={appId} />;
}
