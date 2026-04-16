import { permanentRedirect } from 'next/navigation';

export default async function WorkspaceIntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  permanentRedirect(`/w/${encodeURIComponent(workspaceId)}/channels`);
}
