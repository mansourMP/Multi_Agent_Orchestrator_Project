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

const CONTINUE_INTENT_STORAGE_KEY = 'empyralis.continue-intent';

function canonicalSageHref(workspaceId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/sage`;
}

function canonicalStudioHref(workspaceId: string, agentId: string): string {
  return `/w/${encodeURIComponent(workspaceId)}/studio?agent=${encodeURIComponent(agentId)}`;
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
    let cancelled = false;

    async function resolveContinueHref(agentId: string): Promise<string | null> {
      const readyMemberships = state.workspaceMemberships.filter(isWorkspaceReadyForProduct);
      for (const membership of readyMemberships) {
        const workspaceId = membership.workspace.id;
        const response = await fetch(
          `/api/deployed-agents/${encodeURIComponent(agentId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              accept: 'application/json',
            },
          },
        );
        if (response.ok) {
          return canonicalStudioHref(workspaceId, agentId);
        }
        if (response.status !== 404) {
          break;
        }
      }
      return null;
    }

    async function routeToDestination() {
      if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
        router.replace(suggestedHref);
        return;
      }

      const rawIntent = window.sessionStorage.getItem(CONTINUE_INTENT_STORAGE_KEY);
      if (!rawIntent) {
        router.replace(suggestedHref);
        return;
      }

      let agentId = '';
      try {
        const parsed = JSON.parse(rawIntent) as Record<string, unknown>;
        agentId = typeof parsed.agent === 'string' ? parsed.agent.trim() : '';
      } catch {
        window.sessionStorage.removeItem(CONTINUE_INTENT_STORAGE_KEY);
        router.replace(suggestedHref);
        return;
      }

      if (!agentId) {
        window.sessionStorage.removeItem(CONTINUE_INTENT_STORAGE_KEY);
        router.replace(suggestedHref);
        return;
      }

      const continueHref = await resolveContinueHref(agentId);
      if (cancelled) {
        return;
      }

      window.sessionStorage.removeItem(CONTINUE_INTENT_STORAGE_KEY);
      router.replace(continueHref ?? suggestedHref);
    }

    void routeToDestination();

    return () => {
      cancelled = true;
    };
  }, [router, state.status, state.workspaceMemberships, suggestedHref]);

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
