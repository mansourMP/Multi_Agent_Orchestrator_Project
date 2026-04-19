import { notFound } from 'next/navigation';

export default async function WorkspaceAdminPoliciesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
