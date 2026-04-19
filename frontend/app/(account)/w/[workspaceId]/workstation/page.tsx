import { notFound } from 'next/navigation';

export default async function WorkspaceWorkstationPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  await params;
  notFound();
}
