import type { ReactNode } from 'react';

import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';
import { loadWorkspaceBootstrap } from '@/lib/workspace/server-workspace-bootstrap';
import { WorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationKernelShell } from '@/lib/workspace/workstation-kernel-shell';
import { WorkstationShellFrame } from '@/lib/workspace/workstation-shell-frame';

export default async function WorkspaceRouteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const bootstrap = await loadWorkspaceBootstrap(workspaceId);

  return (
    <WorkstationShellFrame
      switcherPane={<AccountTenantSwitcher />}
      kernelPane={(
        <WorkspaceBoundary workspaceId={workspaceId} bootstrap={bootstrap}>
          <WorkstationKernelShell>
            {children}
          </WorkstationKernelShell>
        </WorkspaceBoundary>
      )}
    />
  );
}
