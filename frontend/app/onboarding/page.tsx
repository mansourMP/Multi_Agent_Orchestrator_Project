import { redirect } from 'next/navigation';

import { OnboardingClient } from '@/app/onboarding/OnboardingClient';
import {
  isDegradedAccountShellSession,
  loadAccountShellSession,
} from '@/lib/server/load-account-shell-session';
import {
  resolvePrimaryReadyWorkspaceId,
  type WorkspaceMembershipRecord,
} from '@/lib/shell/workspace-membership-model';

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

  if (isDegradedAccountShellSession(session)) {
    return (
      <main className="app-page-message">
        <div className="app-page-message__content">
          <h1 className="app-page-message__title">Onboarding is temporarily unavailable</h1>
          <p className="app-page-message__body">
            Empyralis could not load the account shell required to finish workspace setup.
            {session.errorStatus ? ` Bootstrap returned ${session.errorStatus}.` : ''}
          </p>
          <p className="app-page-message__meta">
            Reload this page and try again once the workspace shell is back.
          </p>
        </div>
      </main>
    );
  }

  const { workspaceId } = await searchParams;
  const requestedWorkspaceId = typeof workspaceId === 'string' ? workspaceId : null;
  const readyWorkspaceId = resolvePrimaryReadyWorkspaceId(session.workspaceMemberships);

  if (!requestedWorkspaceId && readyWorkspaceId) {
    redirect(`/w/${encodeURIComponent(readyWorkspaceId)}/sage`);
  }

  const targetWorkspaceId = resolveOnboardingWorkspaceId(
    session.workspaceMemberships,
    requestedWorkspaceId,
  );

  if (!targetWorkspaceId && session.workspaceMemberships.length === 0) {
    redirect('/workspaces/new');
  }

  return (
    <OnboardingClient
      targetWorkspaceId={targetWorkspaceId}
      requestedWorkspaceId={requestedWorkspaceId}
    />
  );
}
