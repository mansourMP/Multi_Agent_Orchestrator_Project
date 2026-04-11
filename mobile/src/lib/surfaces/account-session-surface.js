export function createAccountSessionSurface(accountState) {
  return {
    status: accountState.status,
    connectionMode: accountState.session?.connectionMode ?? null,
    account: accountState.account,
    activeWorkspaceId: accountState.activeWorkspaceId,
    workspaces: accountState.workspaceMemberships.map((membership) => ({
      workspaceId: membership.workspace.id,
      label: membership.workspace.label,
      kind: membership.workspace.kind,
      role: membership.role,
      defaultRoute: membership.defaultRoute,
    })),
    lastVisitedWorkspaceRouteById: {
      ...accountState.lastVisitedWorkspaceRouteById,
    },
  };
}
