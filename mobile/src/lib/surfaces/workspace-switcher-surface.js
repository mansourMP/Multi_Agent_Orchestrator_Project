import { loadMobileWorkspaceFoundation } from '../mobile-foundation.js';
import { resolveWorkspaceNavigationTarget } from '../shell/account-shell-store.js';
import { getWorkspaceMembership } from '../shell/workspace-membership-model.js';
import { resolveAllowedWorkspaceRoute, resolveAllowedWorkspaceScreen } from './shared.js';

export function createWorkspaceSwitcherSurface({
  accountState,
  currentFoundation = null,
  storage,
  fetchImpl,
}) {
  return {
    activeWorkspaceId: accountState.activeWorkspaceId,
    workspaces: accountState.workspaceMemberships.map((membership) => ({
      workspaceId: membership.workspace.id,
      label: membership.workspace.label,
      kind: membership.workspace.kind,
      role: membership.role,
      defaultRouteId: membership.defaultRoute,
      lastVisitedRouteId: resolveWorkspaceNavigationTarget(accountState, membership.workspace.id),
      isActive: membership.workspace.id === accountState.activeWorkspaceId,
    })),
    async switchWorkspace(workspaceId) {
      const membership = getWorkspaceMembership(accountState.workspaceMembershipIndex, workspaceId);
      if (!membership) {
        throw new Error(`Workspace ${workspaceId} is not available for this mobile account session.`);
      }

      const nextFoundation = await loadMobileWorkspaceFoundation({
        workspaceId,
        session: accountState.session,
        storage,
        fetchImpl,
      });
      const rememberedRoute = resolveWorkspaceNavigationTarget(accountState, workspaceId);
      const targetRouteId = resolveAllowedWorkspaceRoute(nextFoundation, rememberedRoute);
      const targetScreen = resolveAllowedWorkspaceScreen(nextFoundation, rememberedRoute);

      if (currentFoundation && currentFoundation.boundaryKey !== nextFoundation.boundaryKey) {
        currentFoundation.dispose();
      }

      return {
        workspaceId,
        targetRouteId,
        targetScreen,
        shellProfileId: nextFoundation.shellProfile.id,
        foundation: nextFoundation,
      };
    },
  };
}
