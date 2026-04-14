import { redirect } from 'next/navigation';

import { OnboardingClient } from '@/app/onboarding/OnboardingClient';
import { loadAccountShellSession } from '@/lib/server/load-account-shell-session';
import type { WorkspaceMembershipRecord } from '@/lib/shell/workspace-membership-model';

function resolveOnboardingWorkspaceId(
  workspaceMemberships: WorkspaceMembershipRecord[],
  requestedWorkspaceId: string | null,
): string | null {
  if (requestedWorkspaceId) {
    const matched = workspaceMemberships.find((item) => item.workspace.id === requestedWorkspaceId);
    return matched?.workspace.id ?? null;
  }

  const incompletePersonal = workspaceMemberships.find(
    (item) => item.workspace.kind === 'personal' && item.requiresOnboarding,
  );
  if (incompletePersonal) {
    return incompletePersonal.workspace.id;
  }

  const personal = workspaceMemberships.find((item) => item.workspace.kind === 'personal');
  if (personal) {
    return personal.workspace.id;
  }

  return workspaceMemberships[0]?.workspace.id ?? null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const session = await loadAccountShellSession();
  if (!session) {
    redirect('/login');
  }

  const { workspaceId } = await searchParams;
  const targetWorkspaceId = resolveOnboardingWorkspaceId(
    session.workspaceMemberships,
    typeof workspaceId === 'string' ? workspaceId : null,
  );

  if (!targetWorkspaceId && session.workspaceMemberships.length === 0) {
    redirect('/workspaces/new');
  }

  return (
    <OnboardingClient
      targetWorkspaceId={targetWorkspaceId}
      requestedWorkspaceId={typeof workspaceId === 'string' ? workspaceId : null}
    />
  );
}
