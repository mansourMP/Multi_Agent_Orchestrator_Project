import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { AccountTenantSwitcher } from '@/app/(account)/AccountTenantSwitcher';
import { loadAccountShellSessionSafely } from '@/lib/server/load-account-shell-session';
import { resolvePrimaryReadyWorkspaceId } from '@/lib/shell/workspace-membership-model';
import {
  WorkspaceBootstrapError,
  loadWorkspaceBootstrap,
} from '@/lib/workspace/server-workspace-bootstrap';
import { DesktopStartupScreen } from '@/lib/workspace/desktop-startup-screen';
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
  let bootstrap;
  try {
    bootstrap = await loadWorkspaceBootstrap(workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceBootstrapError) {
      if (error.status === 401) {
        redirect('/login');
      }
      if (error.status === 403) {
        redirect('/');
      }
      if (error.status === 404) {
        notFound();
      }
    }
    throw error;
  }

  if (bootstrap.shellHints.requiresOnboarding) {
    const session = await loadAccountShellSessionSafely();
    const readyWorkspaceId = session
      ? resolvePrimaryReadyWorkspaceId(session.workspaceMemberships)
      : null;
    if (readyWorkspaceId && readyWorkspaceId !== bootstrap.workspace.id) {
      redirect(`/w/${encodeURIComponent(readyWorkspaceId)}/sage`);
    }
    redirect(`/onboarding?workspaceId=${encodeURIComponent(bootstrap.workspace.id)}`);
  }

  const resolvedWorkspaceId = bootstrap.workspace.id;

  return (
    <>
      <DesktopStartupScreen workspaceLabel={bootstrap.workspace.label} />
      <WorkstationShellFrame
        switcherPane={<AccountTenantSwitcher />}
        kernelPane={(
          <WorkspaceBoundary workspaceId={resolvedWorkspaceId} bootstrap={bootstrap}>
            <WorkstationKernelShell>
              {children}
            </WorkstationKernelShell>
          </WorkspaceBoundary>
        )}
      />
    </>
  );
}
