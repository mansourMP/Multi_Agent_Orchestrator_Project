import { notFound } from 'next/navigation';

export default async function WorkspaceAdminBillingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
