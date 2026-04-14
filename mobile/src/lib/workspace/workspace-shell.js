import {
  WORKSPACE_MOBILE_BOTTOM_TABS,
  WORKSPACE_MOBILE_NAV_GROUP_LABELS,
  WORKSPACE_MOBILE_ROUTE_DEFINITIONS,
  WORKSPACE_ROUTE_ID_SET,
  resolveWorkspaceRouteIdFromSegment,
} from '../../../shared/nav-manifest';

export const SHELL_PROFILE_DEFINITIONS = {
  personal_shell: {
    id: 'personal_shell',
    label: 'Personal Shell',
    description: 'General-purpose mobile workspace shell.',
    homeRouteId: 'chat',
  },
  document_workstation_shell: {
    id: 'document_workstation_shell',
    label: 'Document Workstation Shell',
    description: 'Document-heavy workflow shell adapted for mobile.',
    homeRouteId: 'chat',
  },
  operations_admin_shell: {
    id: 'operations_admin_shell',
    label: 'Operations Admin Shell',
    description: 'Admin-first workflow shell adapted for mobile.',
    homeRouteId: 'approvals',
  },
};

function normalizeShellProfileId(value) {
  if (
    value === 'personal_shell'
    || value === 'document_workstation_shell'
    || value === 'operations_admin_shell'
  ) {
    return value;
  }

  return null;
}

function groupLabel(groupId) {
  return WORKSPACE_MOBILE_NAV_GROUP_LABELS[groupId] ?? 'Primary';
}

function isKnownRouteId(value) {
  return WORKSPACE_ROUTE_ID_SET.has(value);
}

function extractRouteIdFromWorkspacePath(workspaceId, candidate) {
  if (!candidate.startsWith('/w/')) {
    return null;
  }

  const segments = candidate.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'w') {
    return null;
  }

  if (workspaceId && segments[1] !== workspaceId) {
    return null;
  }

  return resolveWorkspaceRouteIdFromSegment(segments.slice(2).join('/'));
}

export function hasWorkspaceCapability(bootstrap, capability) {
  return bootstrap.capabilities[capability] === true;
}

export function deriveShellProfile(bootstrap) {
  const preferredProfile = normalizeShellProfileId(bootstrap.shellHints.preferredProfile);
  const prefersDocumentWorkstation = hasWorkspaceCapability(bootstrap, 'document_workstation_enabled');
  const prefersOperations = hasWorkspaceCapability(bootstrap, 'workspace_admin_enabled');

  const candidates = [];
  if (preferredProfile) {
    candidates.push(preferredProfile);
  }
  if (prefersDocumentWorkstation) {
    candidates.push('document_workstation_shell');
  }
  if (prefersOperations) {
    candidates.push('operations_admin_shell');
  }
  candidates.push('personal_shell');

  for (const candidate of candidates) {
    if (candidate === 'document_workstation_shell' && !prefersDocumentWorkstation) {
      continue;
    }
    if (candidate === 'operations_admin_shell' && !prefersOperations) {
      continue;
    }
    return SHELL_PROFILE_DEFINITIONS[candidate];
  }

  return SHELL_PROFILE_DEFINITIONS.personal_shell;
}

function routeMatchesProfile(definition, shellProfileId) {
  if (!definition.profileIds || definition.profileIds.length === 0) {
    return true;
  }
  return definition.profileIds.includes(shellProfileId);
}

function routeMatchesCapabilities(definition, bootstrap) {
  return (definition.requiredCapabilities ?? []).every((capability) =>
    hasWorkspaceCapability(bootstrap, capability),
  );
}

export function resolveRouteIdFromTarget(workspaceId, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return null;
  }

  const normalized = candidate.trim();
  const directRouteId = resolveWorkspaceRouteIdFromSegment(normalized) ?? normalized;
  if (isKnownRouteId(directRouteId)) {
    return directRouteId;
  }

  if (normalized.startsWith('/(workspace)/')) {
    const routeId = resolveWorkspaceRouteIdFromSegment(normalized.slice('/(workspace)/'.length));
    return isKnownRouteId(routeId) ? routeId : null;
  }

  if (normalized.startsWith('/w/')) {
    const routeId = extractRouteIdFromWorkspacePath(workspaceId, normalized);
    return routeId && isKnownRouteId(routeId) ? routeId : null;
  }

  if (normalized.startsWith('/')) {
    const routeId = resolveWorkspaceRouteIdFromSegment(normalized.replace(/^\/+/, ''));
    return isKnownRouteId(routeId) ? routeId : null;
  }

  return null;
}

export function resolveRouteIdFromHref(workspaceId, href) {
  return resolveRouteIdFromTarget(workspaceId, href);
}

export function buildRouteManifest(shellProfile, bootstrap) {
  const allowedRoutes = WORKSPACE_MOBILE_ROUTE_DEFINITIONS.flatMap((definition) => {
    if (!routeMatchesProfile(definition, shellProfile.id)) {
      return [];
    }
    if (!routeMatchesCapabilities(definition, bootstrap)) {
      return [];
    }

    return [{
      id: definition.id,
      label: definition.mobile.tabLabel ?? definition.label,
      screen: definition.mobile.screen,
      groupId: definition.mobile.groupId,
      requiredCapabilities: [...(definition.requiredCapabilities ?? [])],
    }];
  });

  const routeIndex = allowedRoutes.reduce((accumulator, route) => {
    accumulator[route.id] = route;
    return accumulator;
  }, {});

  const preferredDefaultRouteId =
    resolveRouteIdFromTarget(bootstrap.workspace.id, bootstrap.shellHints.defaultRoute)
    ?? shellProfile.homeRouteId;
  const defaultRouteId =
    routeIndex[preferredDefaultRouteId]?.id
    ?? allowedRoutes[0]?.id
    ?? shellProfile.homeRouteId;
  const defaultRoute =
    routeIndex[defaultRouteId]?.screen
    ?? '/(workspace)/chat';

  const navGroups = Object.values(
    allowedRoutes.reduce((accumulator, route) => {
      const existingGroup = accumulator[route.groupId] ?? {
        id: route.groupId,
        label: groupLabel(route.groupId),
        routes: [],
      };
      existingGroup.routes.push(route);
      accumulator[route.groupId] = existingGroup;
      return accumulator;
    }, {}),
  );

  return {
    defaultRouteId,
    defaultRoute,
    routeIds: allowedRoutes.map((route) => route.id),
    routeIndex,
    navGroups,
  };
}

export { WORKSPACE_MOBILE_BOTTOM_TABS };
