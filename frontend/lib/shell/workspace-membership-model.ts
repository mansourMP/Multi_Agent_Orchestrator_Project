export type WorkspaceRole = 'viewer' | 'member' | 'owner' | 'admin';

export type AccountRecord = {
  id: string;
  email: string;
  displayName?: string | null;
};

export type WorkspaceRecord = {
  id: string;
  tenantId: string;
  label: string;
  kind: 'personal' | 'team' | 'enterprise' | 'side_business' | string;
};

export type WorkspaceMembershipRecord = {
  workspace: WorkspaceRecord;
  role: WorkspaceRole;
  permissions: string[];
  membershipVersion: string;
  defaultRoute: string;
  preferredShellProfileId?: string | null;
};

export type WorkspaceMembershipMap = Record<string, WorkspaceMembershipRecord>;

export function indexWorkspaceMemberships(
  memberships: WorkspaceMembershipRecord[],
): WorkspaceMembershipMap {
  return memberships.reduce<WorkspaceMembershipMap>((accumulator, membership) => {
    accumulator[membership.workspace.id] = membership;
    return accumulator;
  }, {});
}

export function resolvePrimaryWorkspaceId(
  memberships: WorkspaceMembershipRecord[],
): string | null {
  if (memberships.length === 0) {
    return null;
  }

  const personalMembership = memberships.find((membership) => membership.workspace.kind === 'personal');
  return personalMembership?.workspace.id ?? memberships[0].workspace.id;
}

export function resolveRouteWorkspaceId(
  memberships: WorkspaceMembershipRecord[],
  routeWorkspaceId: string | null,
): string | null {
  if (!routeWorkspaceId) {
    return null;
  }

  if (memberships.some((membership) => membership.workspace.id === routeWorkspaceId)) {
    return routeWorkspaceId;
  }

  return routeWorkspaceId;
}

export function sanitizeWorkspaceRoute(route: string | null | undefined, fallbackRoute: string): string {
  if (!route || typeof route !== 'string') {
    return fallbackRoute;
  }

  if (!route.startsWith('/')) {
    return fallbackRoute;
  }

  if (route.startsWith('//')) {
    return fallbackRoute;
  }

  return route;
}

export function getWorkspaceMembership(
  memberships: WorkspaceMembershipMap,
  workspaceId: string | null,
): WorkspaceMembershipRecord | null {
  if (!workspaceId) {
    return null;
  }

  return memberships[workspaceId] ?? null;
}
