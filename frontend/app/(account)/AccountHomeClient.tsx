'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import {
  getWorkspaceMembership,
  isWorkspaceReadyForProduct,
  resolvePrimaryProductWorkspaceId,
  sanitizeWorkspaceRoute,
} from '@/lib/shell/workspace-membership-model';

function canonicalSageHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/sage`;
}

export function AccountHomeClient() {
  const router = useRouter();
  const { state, actions } = useAccountShell();
  const selectedMembership = getWorkspaceMembership(
    state.workspaceMembershipIndex,
    state.selectedWorkspaceId,
  );
  const selectedReadyWorkspaceId =
    selectedMembership && isWorkspaceReadyForProduct(selectedMembership)
      ? selectedMembership.workspace.id
      : null;
  const selectedWorkspaceId =
    selectedReadyWorkspaceId ?? resolvePrimaryProductWorkspaceId(state.workspaceMemberships);
  const selectedWorkspaceMembership = getWorkspaceMembership(
    state.workspaceMembershipIndex,
    selectedWorkspaceId,
  );
  const suggestedHref = selectedWorkspaceMembership
    ? isWorkspaceReadyForProduct(selectedWorkspaceMembership)
      ? (() => {
          const workspaceId = selectedWorkspaceMembership.workspace.id;
          const fallbackHref = canonicalSageHref(workspaceId);
          const rememberedHref = sanitizeWorkspaceRoute(
            actions.resolveWorkspaceHref(workspaceId),
            fallbackHref,
          );
          return rememberedHref === `/w/${encodeURIComponent(workspaceId)}/chat`
            ? fallbackHref
            : rememberedHref;
        })()
      : `/onboarding?workspaceId=${encodeURIComponent(selectedWorkspaceMembership.workspace.id)}`
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
