import { notFound } from 'next/navigation';

export default async function WorkspaceAdminRoutingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
