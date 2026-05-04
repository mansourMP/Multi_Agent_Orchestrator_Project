import { redirect } from 'next/navigation';

export default async function WorkspaceAdminBillingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`);
}
