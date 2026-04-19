import { notFound } from 'next/navigation';

export default async function WorkspaceDeployedAgentsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
