export const SHELL_PROFILE_DEFINITIONS = {
  personal_shell: {
    id: 'personal_shell',
    label: 'Personal Shell',
    description: 'General-purpose personal workspace layout.',
    homeRouteId: 'chat',
  },
  document_workstation_shell: {
    id: 'document_workstation_shell',
    label: 'Document Workstation Shell',
    description: 'Document-heavy split workstation layout.',
    homeRouteId: 'workstation',
  },
  operations_admin_shell: {
    id: 'operations_admin_shell',
    label: 'Operations Admin Shell',
    description: 'Admin-first operations shell for billing, routing, and governance.',
    homeRouteId: 'admin',
  },
};

const ROUTE_DEFINITIONS = [
  { id: 'chat', label: 'Chat', groupId: 'primary', href: (workspaceId) => `/w/${workspaceId}/chat` },
  {
    id: 'workstation',
    label: 'Workstation',
    groupId: 'primary',
    href: (workspaceId) => `/w/${workspaceId}/workstation`,
    requiredCapabilities: ['document_workstation_enabled'],
    profileIds: ['document_workstation_shell'],
  },
  { id: 'runs', label: 'Runs', groupId: 'primary', href: (workspaceId) => `/w/${workspaceId}/runs` },
  {
    id: 'approvals',
    label: 'Approvals',
    groupId: 'primary',
    href: (workspaceId) => `/w/${workspaceId}/approvals`,
    requiredCapabilities: ['approvals_enabled'],
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    groupId: 'workspace',
    href: (workspaceId) => `/w/${workspaceId}/artifacts`,
    requiredCapabilities: ['artifacts_enabled'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    groupId: 'workspace',
    href: (workspaceId) => `/w/${workspaceId}/notifications`,
  },
  {
    id: 'applications',
    label: 'Applications',
    groupId: 'workspace',
    href: (workspaceId) => `/w/${workspaceId}/applications`,
  },
  { id: 'agents', label: 'Agents', groupId: 'workspace', href: (workspaceId) => `/w/${workspaceId}/agents` },
  { id: 'activity', label: 'Activity', groupId: 'workspace', href: (workspaceId) => `/w/${workspaceId}/activity` },
  {
    id: 'integrations',
    label: 'Integrations',
    groupId: 'workspace',
    href: (workspaceId) => `/w/${workspaceId}/integrations`,
  },
  { id: 'settings', label: 'Settings', groupId: 'workspace', href: (workspaceId) => `/w/${workspaceId}/settings` },
  {
    id: 'admin',
    label: 'Admin',
    groupId: 'operations',
    href: (workspaceId) => `/w/${workspaceId}/admin`,
    requiredCapabilities: ['workspace_admin_enabled'],
    profileIds: ['operations_admin_shell'],
  },
  {
    id: 'admin/billing',
    label: 'Billing',
    groupId: 'operations',
    href: (workspaceId) => `/w/${workspaceId}/admin/billing`,
    requiredCapabilities: ['billing_read_enabled'],
    profileIds: ['operations_admin_shell'],
  },
  {
    id: 'admin/routing',
    label: 'Routing',
    groupId: 'operations',
    href: (workspaceId) => `/w/${workspaceId}/admin/routing`,
    requiredCapabilities: ['routing_read_enabled'],
    profileIds: ['operations_admin_shell'],
  },
  {
    id: 'admin/members',
    label: 'Members',
    groupId: 'operations',
    href: (workspaceId) => `/w/${workspaceId}/admin/members`,
    requiredCapabilities: ['workspace_admin_enabled'],
    profileIds: ['operations_admin_shell'],
  },
  {
    id: 'admin/policies',
    label: 'Policies',
    groupId: 'operations',
    href: (workspaceId) => `/w/${workspaceId}/admin/policies`,
    requiredCapabilities: ['workspace_admin_enabled'],
    profileIds: ['operations_admin_shell'],
  },
];

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
  if (groupId === 'operations') {
    return 'Operations';
  }
  if (groupId === 'workspace') {
    return 'Workspace';
  }
  return 'Primary';
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

export function resolveRouteIdFromHref(workspaceId, href) {
  if (!href) {
    return null;
  }

  const prefix = `/w/${workspaceId}/`;
  if (!href.startsWith(prefix)) {
    return null;
  }

  const routeId = href.slice(prefix.length);
  return ROUTE_DEFINITIONS.some((definition) => definition.id === routeId) ? routeId : null;
}

export function buildRouteManifest(shellProfile, bootstrap) {
  const workspaceId = bootstrap.workspace.id;
  const allowedRoutes = ROUTE_DEFINITIONS.flatMap((definition) => {
    if (!routeMatchesProfile(definition, shellProfile.id)) {
      return [];
    }
    if (!routeMatchesCapabilities(definition, bootstrap)) {
      return [];
    }

    return [{
      id: definition.id,
      label: definition.label,
      href: definition.href(workspaceId),
      groupId: definition.groupId,
      requiredCapabilities: [...(definition.requiredCapabilities ?? [])],
    }];
  });

  const routeIndex = allowedRoutes.reduce((accumulator, route) => {
    accumulator[route.id] = route;
    return accumulator;
  }, {});

  const preferredDefaultRouteId =
    resolveRouteIdFromHref(workspaceId, bootstrap.shellHints.defaultRoute) ?? shellProfile.homeRouteId;
  const defaultRoute =
    routeIndex[preferredDefaultRouteId]?.href
    ?? routeIndex[shellProfile.homeRouteId]?.href
    ?? allowedRoutes[0]?.href
    ?? `/w/${workspaceId}/chat`;

  const navGroups = Array.from(
    allowedRoutes.reduce((accumulator, route) => {
      const groupRoutes = accumulator.get(route.groupId) ?? [];
      groupRoutes.push(route);
      accumulator.set(route.groupId, groupRoutes);
      return accumulator;
    }, new Map()),
  ).map(([groupId, routes]) => ({
    id: groupId,
    label: groupLabel(groupId),
    routes,
  }));

  return {
    shellProfileId: shellProfile.id,
    defaultRoute,
    routeIds: allowedRoutes.map((route) => route.id),
    routeIndex,
    navGroups,
  };
}
