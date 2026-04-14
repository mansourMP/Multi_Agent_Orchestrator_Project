'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  getWorkspaceMembership,
  resolvePrimaryWorkspaceId,
} from '@/lib/shell/workspace-membership-model';

export function AccountHomeClient() {
  const router = useRouter();
  const { state, actions } = useAccountShell();
  const selectedWorkspaceId = state.selectedWorkspaceId ?? resolvePrimaryWorkspaceId(state.workspaceMemberships);
  const selectedMembership = getWorkspaceMembership(
    state.workspaceMembershipIndex,
    selectedWorkspaceId,
  );
  const suggestedHref = selectedMembership
    ? selectedMembership.requiresOnboarding
      ? `/onboarding?workspaceId=${encodeURIComponent(selectedMembership.workspace.id)}`
      : actions.resolveWorkspaceHref(selectedMembership.workspace.id)
          ?? `/w/${encodeURIComponent(selectedMembership.workspace.id)}`
    : '/onboarding';

  useEffect(() => {
    if (state.status !== 'authenticated') {
      return;
    }
    router.replace(suggestedHref);
  }, [router, state.status, suggestedHref]);

  return (
    <main className="app-page-message">
      <div className="app-page-message__content">
        <h1 className="app-page-message__title">Redirecting to your workspace</h1>
        <p className="app-page-message__body">
          Account home resolves to onboarding when the selected workspace still requires setup.
          Otherwise it uses the current account-shell workspace route state.
        </p>
      </div>
    </main>
  );
}
