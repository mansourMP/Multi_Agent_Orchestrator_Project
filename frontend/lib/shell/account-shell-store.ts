import {
  type AccountRecord,
  type WorkspaceMembershipMap,
  type WorkspaceMembershipRecord,
  getWorkspaceMembership,
  indexWorkspaceMemberships,
  resolveRouteWorkspaceId,
  sanitizeWorkspaceRoute,
} from '@/lib/shell/workspace-membership-model';

export type GlobalTheme = 'system' | 'light' | 'dark';

export type GlobalChromePreferences = {
  tenantSwitcherCollapsed: boolean;
};

export type AccountShellBootstrap = {
  account: AccountRecord;
  workspaceMemberships: WorkspaceMembershipRecord[];
};

export type AccountShellSnapshot = {
  accountId: string | null;
  selectedWorkspaceId: string | null;
  lastVisitedWorkspaceRouteById: Record<string, string>;
  globalTheme: GlobalTheme;
  globalChromePreferences: GlobalChromePreferences;
};

export type AccountShellState = {
  status: 'anonymous' | 'authenticated';
  account: AccountRecord | null;
  workspaceMemberships: WorkspaceMembershipRecord[];
  workspaceMembershipIndex: WorkspaceMembershipMap;
  selectedWorkspaceId: string | null;
  lastVisitedWorkspaceRouteById: Record<string, string>;
  globalTheme: GlobalTheme;
  globalChromePreferences: GlobalChromePreferences;
};

export type AccountShellAction =
  | {
      type: 'hydrate_session';
      payload: AccountShellBootstrap | null;
      persistedSnapshot?: AccountShellSnapshot | null;
    }
  | {
      type: 'sync_workspace_from_route';
      workspaceId: string | null;
    }
  | {
      type: 'remember_workspace_route';
      workspaceId: string;
      route: string;
    }
  | {
      type: 'set_global_theme';
      theme: GlobalTheme;
    }
  | {
      type: 'set_tenant_switcher_collapsed';
      collapsed: boolean;
    }
  | {
      type: 'clear_session';
    };

export const DEFAULT_GLOBAL_CHROME_PREFERENCES: GlobalChromePreferences = {
  tenantSwitcherCollapsed: false,
};

export function createInitialAccountShellState(): AccountShellState {
  return {
    status: 'anonymous',
    account: null,
    workspaceMemberships: [],
    workspaceMembershipIndex: {},
    selectedWorkspaceId: null,
    lastVisitedWorkspaceRouteById: {},
    globalTheme: 'system',
    globalChromePreferences: DEFAULT_GLOBAL_CHROME_PREFERENCES,
  };
}

export function reduceAccountShellState(
  state: AccountShellState,
  action: AccountShellAction,
): AccountShellState {
  switch (action.type) {
    case 'hydrate_session': {
      if (!action.payload) {
        return {
          ...createInitialAccountShellState(),
          globalTheme: action.persistedSnapshot?.globalTheme ?? 'system',
          globalChromePreferences:
            action.persistedSnapshot?.globalChromePreferences ?? DEFAULT_GLOBAL_CHROME_PREFERENCES,
        };
      }

      const workspaceMemberships = action.payload.workspaceMemberships;
      const workspaceMembershipIndex = indexWorkspaceMemberships(workspaceMemberships);

      return {
        status: 'authenticated',
        account: action.payload.account,
        workspaceMemberships,
        workspaceMembershipIndex,
        selectedWorkspaceId: null,
        lastVisitedWorkspaceRouteById:
          action.persistedSnapshot?.accountId === action.payload.account.id
            ? action.persistedSnapshot.lastVisitedWorkspaceRouteById
            : {},
        globalTheme: action.persistedSnapshot?.globalTheme ?? 'system',
        globalChromePreferences:
          action.persistedSnapshot?.globalChromePreferences ?? DEFAULT_GLOBAL_CHROME_PREFERENCES,
      };
    }
    case 'sync_workspace_from_route': {
      const selectedWorkspaceId = resolveRouteWorkspaceId(state.workspaceMemberships, action.workspaceId);
      if (selectedWorkspaceId === state.selectedWorkspaceId) {
        return state;
      }
      return {
        ...state,
        selectedWorkspaceId,
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
    case 'set_global_theme':
      if (state.globalTheme === action.theme) {
        return state;
      }
      return {
        ...state,
        globalTheme: action.theme,
      };
    case 'set_tenant_switcher_collapsed':
      if (state.globalChromePreferences.tenantSwitcherCollapsed === action.collapsed) {
        return state;
      }
      return {
        ...state,
        globalChromePreferences: {
          ...state.globalChromePreferences,
          tenantSwitcherCollapsed: action.collapsed,
        },
      };
    case 'clear_session':
      return {
        ...createInitialAccountShellState(),
        globalTheme: state.globalTheme,
        globalChromePreferences: state.globalChromePreferences,
      };
    default:
      return state;
  }
}

export function createAccountShellSnapshot(state: AccountShellState): AccountShellSnapshot {
  return {
    accountId: state.account?.id ?? null,
    selectedWorkspaceId: state.selectedWorkspaceId,
    lastVisitedWorkspaceRouteById: state.lastVisitedWorkspaceRouteById,
    globalTheme: state.globalTheme,
    globalChromePreferences: state.globalChromePreferences,
  };
}

export function resolveWorkspaceNavigationTarget(
  state: Pick<AccountShellState, 'workspaceMembershipIndex' | 'lastVisitedWorkspaceRouteById'>,
  workspaceId: string,
): string | null {
  const membership = getWorkspaceMembership(state.workspaceMembershipIndex, workspaceId);
  if (!membership) {
    return null;
  }

  return sanitizeWorkspaceRoute(
    state.lastVisitedWorkspaceRouteById[workspaceId],
    membership.defaultRoute,
  );
}
