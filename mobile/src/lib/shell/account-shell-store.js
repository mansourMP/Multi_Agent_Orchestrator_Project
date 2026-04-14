import {
  getWorkspaceMembership,
  indexWorkspaceMemberships,
  resolvePrimaryWorkspaceId,
  resolveRouteWorkspaceId,
  sanitizeWorkspaceRoute,
} from './workspace-membership-model.js';

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Mobile account shell is missing required string field: ${field}`);
  }
  return value;
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Mobile platform session requires a public apiBaseUrl.');
  }
  return value.replace(/\/+$/, '');
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry) => typeof entry === 'string').sort();
}

export function createWorkspaceRouteStateKey({
  membershipVersion,
  defaultRoute,
  permissions,
}) {
  const version = typeof membershipVersion === 'string' && membershipVersion.trim()
    ? membershipVersion
    : 'unknown';
  return `${version}:${defaultRoute}:${permissions.join(',')}`;
}

function normalizeWorkspaceMembership(membership) {
  if (!membership || typeof membership !== 'object') {
    return null;
  }

  const workspace = membership.workspace;
  if (!workspace || typeof workspace !== 'object') {
    return null;
  }

  const workspaceId = requireString(workspace.id, 'workspaceMembership.workspace.id');
  const membershipVersion = String(
    membership.version
    ?? membership.membershipVersion
    ?? `membership:${workspaceId}`,
  );
  const permissions = normalizePermissions(membership.permissions);
  const defaultRoute = sanitizeWorkspaceRoute(
    membership.defaultRoute,
    'chat',
    workspaceId,
  );

  return {
    ...membership,
    workspace: {
      id: workspaceId,
      tenantId: requireString(workspace.tenantId ?? `tenant-${workspaceId}`, 'workspaceMembership.workspace.tenantId'),
      label: requireString(workspace.label ?? workspaceId, 'workspaceMembership.workspace.label'),
      kind: requireString(workspace.kind ?? 'workspace', 'workspaceMembership.workspace.kind'),
    },
    role: requireString(membership.role ?? 'member', 'workspaceMembership.role'),
    permissions,
    version: membershipVersion,
    defaultRoute,
    routeStateKey: createWorkspaceRouteStateKey({
      membershipVersion,
      defaultRoute,
      permissions,
    }),
  };
}

function createWorkspaceRouteStateMap(workspaceMemberships) {
  return workspaceMemberships.reduce((accumulator, membership) => {
    accumulator[membership.workspace.id] = membership.routeStateKey;
    return accumulator;
  }, {});
}

function restoreRememberedRoutes(workspaceMemberships, persistedSnapshot) {
  if (!persistedSnapshot || typeof persistedSnapshot !== 'object') {
    return {};
  }

  const rememberedRoutes =
    persistedSnapshot.lastVisitedWorkspaceRouteIdById
    ?? persistedSnapshot.lastVisitedWorkspaceRouteById
    ?? {};
  const persistedRouteState = persistedSnapshot.workspaceRouteStateById ?? {};

  return workspaceMemberships.reduce((accumulator, membership) => {
    if (persistedRouteState[membership.workspace.id] !== membership.routeStateKey) {
      return accumulator;
    }

    const rememberedRoute = sanitizeWorkspaceRoute(
      rememberedRoutes[membership.workspace.id],
      membership.defaultRoute,
      membership.workspace.id,
    );
    if (rememberedRoute === membership.defaultRoute) {
      return accumulator;
    }

    accumulator[membership.workspace.id] = rememberedRoute;
    return accumulator;
  }, {});
}

export function normalizePlatformSession(session, { fallbackAccountId = null } = {}) {
  if (!session || typeof session !== 'object') {
    throw new Error('Mobile platform session must be an object.');
  }

  return {
    accountId: requireString(session.accountId ?? fallbackAccountId, 'session.accountId'),
    apiBaseUrl: normalizeApiBaseUrl(session.apiBaseUrl ?? session.platformBaseUrl),
    accessToken: typeof session.accessToken === 'string' ? session.accessToken : null,
    refreshToken: typeof session.refreshToken === 'string' ? session.refreshToken : null,
    deviceId: typeof session.deviceId === 'string' ? session.deviceId : null,
    connectionMode: 'platform_first',
  };
}

export function createInitialAccountShellState() {
  return {
    status: 'anonymous',
    session: null,
    account: null,
    workspaceMemberships: [],
    workspaceMembershipIndex: {},
    activeWorkspaceId: null,
    lastVisitedWorkspaceRouteIdById: {},
    workspaceRouteStateById: {},
  };
}

export function reduceAccountShellState(state, action) {
  switch (action.type) {
    case 'hydrate_session': {
      if (!action.payload) {
        return createInitialAccountShellState();
      }

      const session = normalizePlatformSession(action.payload.session, {
        fallbackAccountId: action.payload.account?.id ?? action.persistedSnapshot?.accountId ?? null,
      });
      const workspaceMemberships = (action.payload.workspaceMemberships ?? [])
        .map(normalizeWorkspaceMembership)
        .filter(Boolean);
      const workspaceMembershipIndex = indexWorkspaceMemberships(workspaceMemberships);
      const routeStateById = createWorkspaceRouteStateMap(workspaceMemberships);
      const accountMatches = action.persistedSnapshot?.accountId === action.payload.account.id;
      const activeWorkspaceId =
        accountMatches && workspaceMembershipIndex[action.persistedSnapshot.activeWorkspaceId]
          ? action.persistedSnapshot.activeWorkspaceId
          : resolvePrimaryWorkspaceId(workspaceMemberships);

      return {
        status: 'authenticated',
        session,
        account: action.payload.account,
        workspaceMemberships,
        workspaceMembershipIndex,
        activeWorkspaceId,
        lastVisitedWorkspaceRouteIdById: accountMatches
          ? restoreRememberedRoutes(workspaceMemberships, action.persistedSnapshot)
          : {},
        workspaceRouteStateById: routeStateById,
      };
    }
    case 'sync_workspace_from_route': {
      const activeWorkspaceId = resolveRouteWorkspaceId(state.workspaceMemberships, action.workspaceId);
      if (!activeWorkspaceId || state.activeWorkspaceId === activeWorkspaceId) {
        return state;
      }

      return {
        ...state,
        activeWorkspaceId,
      };
    }
    case 'remember_workspace_route': {
      const membership = getWorkspaceMembership(state.workspaceMembershipIndex, action.workspaceId);
      if (!membership) {
        return state;
      }

      const route = sanitizeWorkspaceRoute(action.route, membership.defaultRoute, action.workspaceId);
      if (state.lastVisitedWorkspaceRouteIdById[action.workspaceId] === route) {
        return state;
      }

      return {
        ...state,
        lastVisitedWorkspaceRouteIdById: {
          ...state.lastVisitedWorkspaceRouteIdById,
          [action.workspaceId]: route,
        },
      };
    }
    case 'clear_session':
      return createInitialAccountShellState();
    default:
      return state;
  }
}

export function createAccountShellSnapshot(state) {
  return {
    accountId: state.account?.id ?? null,
    apiBaseUrl: state.session?.apiBaseUrl ?? null,
    activeWorkspaceId: state.activeWorkspaceId,
    lastVisitedWorkspaceRouteIdById: state.lastVisitedWorkspaceRouteIdById,
    workspaceRouteStateById: state.workspaceRouteStateById,
  };
}

export function resolveWorkspaceNavigationTarget(state, workspaceId) {
  const membership = getWorkspaceMembership(state.workspaceMembershipIndex, workspaceId);
  if (!membership) {
    return null;
  }

  return sanitizeWorkspaceRoute(
    state.lastVisitedWorkspaceRouteIdById[workspaceId],
    membership.defaultRoute,
    workspaceId,
  );
}
