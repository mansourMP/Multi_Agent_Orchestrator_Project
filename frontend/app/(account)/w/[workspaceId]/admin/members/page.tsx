import { notFound } from 'next/navigation';

export default async function WorkspaceAdminMembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
