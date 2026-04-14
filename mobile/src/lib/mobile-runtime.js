import { useSyncExternalStore } from 'react';

import { loadMobileWorkspaceFoundation } from './mobile-foundation.js';
import { buildMobileWorkspaceShellModel } from './mobile-workspace-surfaces.js';
import {
  createAccountShellSnapshot,
  createInitialAccountShellState,
  reduceAccountShellState,
  resolveWorkspaceNavigationTarget,
} from './shell/account-shell-store.js';
import { createPersistentKeyValueStorage } from './storage/memory-key-value-storage.js';
import { createSecureKeyValueStorage } from './storage/secure-key-value-storage.js';

const ACCOUNT_SNAPSHOT_KEY = 'account-shell';
const SESSION_KEY = 'platform-session';
const WORKSPACE_SESSION_SOURCE = 'mobile_workspace_shell';

const persistentStorage = createPersistentKeyValueStorage();
const secureStorage = createSecureKeyValueStorage();

const listeners = new Set();
let hydratePromise = null;
let state = {
  bootState: 'booting',
  authState: 'anonymous',
  workspaceState: 'idle',
  error: null,
  accountState: createInitialAccountShellState(),
  foundation: null,
  shellModel: null,
};

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(nextState) {
  state = nextState;
  emit();
}

function patchState(partial) {
  updateState({
    ...state,
    ...partial,
  });
}

function readJson(storage, key) {
  const rawValue = storage.getItem(key);
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  if (value == null) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

function serializeError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'Unknown mobile workspace failure.');
}

function createMembershipFromFoundation(foundation) {
  return {
    workspace: {
      ...foundation.bootstrap.workspace,
    },
    role: foundation.bootstrap.membership.role,
    permissions: [...foundation.bootstrap.membership.permissions],
    version: foundation.bootstrap.membership.version,
    defaultRoute: foundation.routeManifest.defaultRouteId,
    source: WORKSPACE_SESSION_SOURCE,
  };
}

function mergeWorkspaceMemberships(existingMemberships, nextMembership) {
  const membershipIndex = new Map();

  for (const membership of existingMemberships ?? []) {
    if (membership?.workspace?.id) {
      membershipIndex.set(membership.workspace.id, membership);
    }
  }

  if (nextMembership?.workspace?.id) {
    membershipIndex.set(nextMembership.workspace.id, nextMembership);
  }

  return Array.from(membershipIndex.values());
}

function rebuildShellModel(accountState, foundation) {
  return buildMobileWorkspaceShellModel({
    accountState,
    foundation,
    storage: persistentStorage,
    fetchImpl: globalThis.fetch,
  });
}

function applyFoundationToState(foundation, persistedSnapshot = readJson(persistentStorage, ACCOUNT_SNAPSHOT_KEY)) {
  const workspaceMembership = createMembershipFromFoundation(foundation);
  const workspaceMemberships = mergeWorkspaceMemberships(
    state.accountState.workspaceMemberships,
    workspaceMembership,
  );
  let accountState = reduceAccountShellState(createInitialAccountShellState(), {
    type: 'hydrate_session',
    payload: {
      session: foundation.session,
      account: foundation.bootstrap.account,
      workspaceMemberships,
    },
    persistedSnapshot,
  });
  accountState = reduceAccountShellState(accountState, {
    type: 'sync_workspace_from_route',
    workspaceId: foundation.bootstrap.workspace.id,
  });

  writeJson(secureStorage, SESSION_KEY, foundation.session);
  writeJson(persistentStorage, ACCOUNT_SNAPSHOT_KEY, createAccountShellSnapshot(accountState));

  return {
    accountState,
    shellModel: rebuildShellModel(accountState, foundation),
  };
}

function disposeFoundation(nextFoundation = null) {
  if (state.foundation && state.foundation !== nextFoundation) {
    state.foundation.dispose();
  }
}

export function resolveWorkspaceHomeScreen(runtimeState = state) {
  const foundation = runtimeState.foundation;
  if (!foundation) {
    return '/(workspace)/account';
  }

  const workspaceId = foundation.bootstrap.workspace.id;
  const routeId =
    resolveWorkspaceNavigationTarget(runtimeState.accountState, workspaceId)
    ?? foundation.routeManifest.defaultRouteId;

  return foundation.routeManifest.routeIndex[routeId]?.screen
    ?? foundation.routeManifest.defaultRoute
    ?? '/(workspace)/account';
}

async function restoreWorkspaceFromSession({ session, persistedSnapshot }) {
  const workspaceId = persistedSnapshot?.activeWorkspaceId;
  if (!workspaceId) {
    const nextAccountState = reduceAccountShellState(createInitialAccountShellState(), {
      type: 'hydrate_session',
      payload: {
        session,
        account: {
          id: session.accountId ?? persistedSnapshot?.accountId ?? 'mobile-session',
          email: 'mobile-session@local',
          displayName: 'Mobile Session',
        },
        workspaceMemberships: [],
      },
      persistedSnapshot,
    });
    updateState({
      bootState: 'ready',
      authState: 'authenticated',
      workspaceState: 'idle',
      error: null,
      accountState: nextAccountState,
      foundation: null,
      shellModel: rebuildShellModel(nextAccountState, null),
    });
    return;
  }

  const foundation = await loadMobileWorkspaceFoundation({
    workspaceId,
    session,
    storage: persistentStorage,
    fetchImpl: globalThis.fetch,
  });
  const nextAccountState = applyFoundationToState(foundation, persistedSnapshot);

  updateState({
    bootState: 'ready',
    authState: 'authenticated',
    workspaceState: 'ready',
    error: null,
    accountState: nextAccountState.accountState,
    foundation,
    shellModel: nextAccountState.shellModel,
  });
}

export const mobileAppRuntime = {
  getState() {
    if (!state.shellModel) {
      return {
        ...state,
        shellModel: rebuildShellModel(state.accountState, state.foundation),
      };
    }

    return state;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async hydrate() {
    if (hydratePromise) {
      return hydratePromise;
    }

    patchState({
      bootState: 'booting',
      workspaceState: state.authState === 'authenticated' ? 'restoring' : 'idle',
      error: null,
    });

    hydratePromise = (async () => {
      try {
        await Promise.all([persistentStorage.ready(), secureStorage.ready()]);

        const session = readJson(secureStorage, SESSION_KEY);
        const persistedSnapshot = readJson(persistentStorage, ACCOUNT_SNAPSHOT_KEY);

        if (!session) {
          disposeFoundation();
          updateState({
            bootState: 'ready',
            authState: 'anonymous',
            workspaceState: 'idle',
            error: null,
            accountState: createInitialAccountShellState(),
            foundation: null,
            shellModel: rebuildShellModel(createInitialAccountShellState(), null),
          });
          return;
        }

        await restoreWorkspaceFromSession({
          session,
          persistedSnapshot,
        });
      } catch (error) {
        updateState({
          bootState: 'error',
          authState: 'anonymous',
          workspaceState: 'error',
          error: serializeError(error),
          accountState: createInitialAccountShellState(),
          foundation: null,
          shellModel: rebuildShellModel(createInitialAccountShellState(), null),
        });
      } finally {
        hydratePromise = null;
      }
    })();

    return hydratePromise;
  },
  async connectWorkspace({
    apiBaseUrl,
    accessToken,
    workspaceId,
  }) {
    patchState({
      bootState: 'ready',
      authState: 'authenticated',
      workspaceState: 'restoring',
      error: null,
    });

    try {
      const foundation = await loadMobileWorkspaceFoundation({
        workspaceId,
        session: {
          apiBaseUrl,
          accessToken,
        },
        storage: persistentStorage,
        fetchImpl: globalThis.fetch,
      });

      disposeFoundation(foundation);
      const nextState = applyFoundationToState(foundation);
      updateState({
        bootState: 'ready',
        authState: 'authenticated',
        workspaceState: 'ready',
        error: null,
        accountState: nextState.accountState,
        foundation,
        shellModel: nextState.shellModel,
      });

      return resolveWorkspaceHomeScreen();
    } catch (error) {
      updateState({
        ...state,
        bootState: 'ready',
        authState: 'anonymous',
        workspaceState: 'error',
        error: serializeError(error),
        foundation: null,
        shellModel: rebuildShellModel(createInitialAccountShellState(), null),
      });
      throw error;
    }
  },
  async switchWorkspace(workspaceId) {
    if (!state.accountState.session) {
      throw new Error('No authenticated mobile session is available.');
    }

    patchState({
      authState: 'authenticated',
      workspaceState: 'restoring',
      error: null,
    });

    try {
      const foundation = await loadMobileWorkspaceFoundation({
        workspaceId,
        session: state.accountState.session,
        storage: persistentStorage,
        fetchImpl: globalThis.fetch,
      });

      disposeFoundation(foundation);
      const nextState = applyFoundationToState(foundation);
      updateState({
        bootState: 'ready',
        authState: 'authenticated',
        workspaceState: 'ready',
        error: null,
        accountState: nextState.accountState,
        foundation,
        shellModel: nextState.shellModel,
      });

      return resolveWorkspaceHomeScreen();
    } catch (error) {
      updateState({
        ...state,
        workspaceState: 'error',
        error: serializeError(error),
      });
      throw error;
    }
  },
  rememberRoute(routeId) {
    if (!state.foundation || !state.accountState.activeWorkspaceId) {
      return;
    }

    const nextAccountState = reduceAccountShellState(state.accountState, {
      type: 'remember_workspace_route',
      workspaceId: state.accountState.activeWorkspaceId,
      route: routeId,
    });

    updateState({
      ...state,
      accountState: nextAccountState,
      shellModel: rebuildShellModel(nextAccountState, state.foundation),
    });
    writeJson(persistentStorage, ACCOUNT_SNAPSHOT_KEY, createAccountShellSnapshot(nextAccountState));
  },
  async retryWorkspaceRestore() {
    const session = readJson(secureStorage, SESSION_KEY);
    const persistedSnapshot = readJson(persistentStorage, ACCOUNT_SNAPSHOT_KEY);
    if (!session) {
      return this.hydrate();
    }

    patchState({
      bootState: 'ready',
      authState: 'authenticated',
      workspaceState: 'restoring',
      error: null,
    });

    try {
      await restoreWorkspaceFromSession({ session, persistedSnapshot });
    } catch (error) {
      updateState({
        ...state,
        workspaceState: 'error',
        error: serializeError(error),
      });
    }
  },
  signOut() {
    disposeFoundation();
    secureStorage.clear();
    persistentStorage.clear();

    const initialState = createInitialAccountShellState();
    updateState({
      bootState: 'ready',
      authState: 'anonymous',
      workspaceState: 'idle',
      error: null,
      accountState: initialState,
      foundation: null,
      shellModel: rebuildShellModel(initialState, null),
    });
  },
};

export function useMobileRuntimeState() {
  return useSyncExternalStore(
    mobileAppRuntime.subscribe.bind(mobileAppRuntime),
    mobileAppRuntime.getState.bind(mobileAppRuntime),
    mobileAppRuntime.getState.bind(mobileAppRuntime),
  );
}
