export function createAccountSessionSurface(accountState) {
  const currentWorkspace = accountState.workspaceMemberships.find(
    (membership) => membership.workspace.id === accountState.activeWorkspaceId,
  ) ?? null;

  return {
    status: accountState.status,
    connectionMode: accountState.session?.connectionMode ?? null,
    account: accountState.account,
    activeWorkspaceId: accountState.activeWorkspaceId,
    workspaceCount: accountState.workspaceMemberships.length,
    currentWorkspace: currentWorkspace
      ? {
          workspaceId: currentWorkspace.workspace.id,
          label: currentWorkspace.workspace.label,
          kind: currentWorkspace.workspace.kind,
          role: currentWorkspace.role,
          defaultRouteId: currentWorkspace.defaultRoute,
        }
      : null,
    sessionSummary: {
      apiBaseUrl: accountState.session?.apiBaseUrl ?? null,
      deviceId: accountState.session?.deviceId ?? null,
      connectionMode: accountState.session?.connectionMode ?? null,
    },
    workspaces: accountState.workspaceMemberships.map((membership) => ({
      workspaceId: membership.workspace.id,
      label: membership.workspace.label,
      kind: membership.workspace.kind,
      role: membership.role,
      defaultRouteId: membership.defaultRoute,
      isActive: membership.workspace.id === accountState.activeWorkspaceId,
    })),
    lastVisitedWorkspaceRouteIdById: {
      ...accountState.lastVisitedWorkspaceRouteIdById,
    },
  };
}
