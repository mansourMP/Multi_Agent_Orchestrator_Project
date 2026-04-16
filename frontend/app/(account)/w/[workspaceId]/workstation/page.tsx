import { redirect } from 'next/navigation';

export default async function WorkspaceWorkstationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/sage`);
}
