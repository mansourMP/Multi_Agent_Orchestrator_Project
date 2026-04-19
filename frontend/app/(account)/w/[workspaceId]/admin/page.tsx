import { notFound } from 'next/navigation';

export default async function WorkspaceAdminPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
