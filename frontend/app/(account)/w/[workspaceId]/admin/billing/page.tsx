import { permanentRedirect } from 'next/navigation';

export default async function WorkspaceAdminBillingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  permanentRedirect(`/w/${encodeURIComponent(workspaceId)}/settings`);
}
