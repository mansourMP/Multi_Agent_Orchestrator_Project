import { redirect } from 'next/navigation';

export default async function WorkspaceHeartbeatPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/tasks`);
}
