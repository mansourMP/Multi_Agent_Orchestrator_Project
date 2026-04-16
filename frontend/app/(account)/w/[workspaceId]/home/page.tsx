import { redirect } from 'next/navigation';

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/sage`);
}
