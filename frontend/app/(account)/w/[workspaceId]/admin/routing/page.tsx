import { redirect } from 'next/navigation';

export default async function WorkspaceAdminRoutingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/settings?section=devices`);
}
