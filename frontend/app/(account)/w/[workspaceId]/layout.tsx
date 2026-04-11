import type { ReactNode } from 'react';

export default async function WorkspaceRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  return (
    <div data-workspace-route={workspaceId}>
      {children}
    </div>
  );
}
