import { redirect } from 'next/navigation';

export default async function WorkspaceSkillsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/integrations`);
}
