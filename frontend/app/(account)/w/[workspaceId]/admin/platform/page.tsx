import { notFound } from 'next/navigation';

export default async function WorkspaceAdminPlatformPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
