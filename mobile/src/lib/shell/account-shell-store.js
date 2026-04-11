import {
  getWorkspaceMembership,
  indexWorkspaceMemberships,
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

export function normalizePlatformSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Mobile platform session must be an object.');
  }

  return {
    accountId: requireString(session.accountId, 'session.accountId'),
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
    lastVisitedWorkspaceRouteById: {},
  };
}

export function reduceAccountShellState(state, action) {
  switch (action.type) {
    case 'hydrate_session': {
      if (!action.payload) {
        return createInitialAccountShellState();
      }

      const session = normalizePlatformSession(action.payload.session);
      const workspaceMemberships = action.payload.workspaceMemberships;
      const workspaceMembershipIndex = indexWorkspaceMemberships(workspaceMemberships);

      return {
        status: 'authenticated',
        session,
        account: action.payload.account,
        workspaceMemberships,
        workspaceMembershipIndex,
        activeWorkspaceId: null,
        lastVisitedWorkspaceRouteById:
          action.persistedSnapshot?.accountId === action.payload.account.id
            ? action.persistedSnapshot.lastVisitedWorkspaceRouteById
            : {},
      };
    }
    case 'sync_workspace_from_route': {
      const activeWorkspaceId = resolveRouteWorkspaceId(state.workspaceMemberships, action.workspaceId);
      if (state.activeWorkspaceId === activeWorkspaceId) {
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

      const route = sanitizeWorkspaceRoute(action.route, membership.defaultRoute);
      if (state.lastVisitedWorkspaceRouteById[action.workspaceId] === route) {
        return state;
      }

      return {
        ...state,
        lastVisitedWorkspaceRouteById: {
          ...state.lastVisitedWorkspaceRouteById,
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
    lastVisitedWorkspaceRouteById: state.lastVisitedWorkspaceRouteById,
  };
}

export function resolveWorkspaceNavigationTarget(state, workspaceId) {
  const membership = getWorkspaceMembership(state.workspaceMembershipIndex, workspaceId);
  if (!membership) {
    return null;
  }

  return sanitizeWorkspaceRoute(
    state.lastVisitedWorkspaceRouteById[workspaceId],
    membership.defaultRoute,
  );
}
