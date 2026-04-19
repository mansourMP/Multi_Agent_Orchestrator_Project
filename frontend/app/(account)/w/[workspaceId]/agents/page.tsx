import { notFound } from 'next/navigation';

export default async function WorkspaceAgentsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
