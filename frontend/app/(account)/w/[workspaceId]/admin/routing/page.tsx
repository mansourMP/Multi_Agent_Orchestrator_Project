import { permanentRedirect } from 'next/navigation';

export default async function WorkspaceAdminRoutingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  permanentRedirect(`/w/${encodeURIComponent(workspaceId)}/settings`);
}
