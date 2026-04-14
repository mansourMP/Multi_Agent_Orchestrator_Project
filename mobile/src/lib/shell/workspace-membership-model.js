import { resolveRouteIdFromTarget } from '../workspace/workspace-shell.js';

export function indexWorkspaceMemberships(memberships) {
  return memberships.reduce((accumulator, membership) => {
    accumulator[membership.workspace.id] = membership;
    return accumulator;
  }, {});
}

export function resolvePrimaryWorkspaceId(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  const personalMembership = memberships.find((membership) => membership.workspace.kind === 'personal');
  return personalMembership?.workspace.id ?? memberships[0].workspace.id;
}

export function resolveRouteWorkspaceId(memberships, routeWorkspaceId) {
  if (!routeWorkspaceId) {
    return null;
  }

  if (memberships.some((membership) => membership.workspace.id === routeWorkspaceId)) {
    return routeWorkspaceId;
  }

  return null;
}

export function sanitizeWorkspaceRoute(route, fallbackRoute, workspaceId = null) {
  const fallbackRouteId = resolveRouteIdFromTarget(workspaceId, fallbackRoute) ?? 'chat';
  return resolveRouteIdFromTarget(workspaceId, route) ?? fallbackRouteId;
}

export function getWorkspaceMembership(memberships, workspaceId) {
  if (!workspaceId) {
    return null;
  }

  return memberships[workspaceId] ?? null;
}
