'use client';

import {
  type PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { usePathname } from 'next/navigation';

import {
  type AccountShellBootstrap,
  type AccountShellState,
  createAccountShellSnapshot,
  createInitialAccountShellState,
  reduceAccountShellState,
  resolveWorkspaceNavigationTarget,
} from '@/lib/shell/account-shell-store';
import {
  clearAccountShellSnapshot,
  readAccountShellSnapshot,
  writeAccountShellSnapshot,
} from '@/lib/shell/account-shell-storage';

type AccountShellContextValue = {
  state: AccountShellState;
  actions: {
    rememberWorkspaceRoute: (workspaceId: string, route: string) => void;
    setGlobalTheme: (theme: AccountShellState['globalTheme']) => void;
    setTenantSwitcherCollapsed: (collapsed: boolean) => void;
    replaceSession: (session: AccountShellBootstrap | null) => void;
    clearSession: () => void;
    resolveWorkspaceHref: (workspaceId: string) => string | null;
  };
};

const AccountShellContext = createContext<AccountShellContextValue | null>(null);

function extractWorkspaceIdFromPathname(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'w' || !segments[1]) {
    return null;
  }

  return decodeURIComponent(segments[1]);
}

export function AccountShellProvider({
  children,
  initialSession = null,
}: PropsWithChildren<{ initialSession?: AccountShellBootstrap | null }>) {
  const persistedSnapshotRef = useRef<ReturnType<typeof readAccountShellSnapshot> | null>(null);

  if (persistedSnapshotRef.current === null && typeof window !== 'undefined') {
    persistedSnapshotRef.current = readAccountShellSnapshot();
  }

  const [state, dispatch] = useReducer(
    reduceAccountShellState,
    undefined,
    createInitialAccountShellState,
  );

  const pathname = usePathname();

  useEffect(() => {
    dispatch({
      type: 'hydrate_session',
      payload: initialSession,
      persistedSnapshot: persistedSnapshotRef.current,
    });
  }, [initialSession]);

  useEffect(() => {
    const workspaceId = extractWorkspaceIdFromPathname(pathname);
    dispatch({ type: 'sync_workspace_from_route', workspaceId });
  }, [pathname]);

  useEffect(() => {
    if (state.status === 'anonymous') {
      clearAccountShellSnapshot();
      return;
    }

    writeAccountShellSnapshot(createAccountShellSnapshot(state));
  }, [state]);

  const actions = useMemo<AccountShellContextValue['actions']>(
    () => ({
      rememberWorkspaceRoute(workspaceId, route) {
        dispatch({ type: 'remember_workspace_route', workspaceId, route });
      },
      setGlobalTheme(theme) {
        dispatch({ type: 'set_global_theme', theme });
      },
      setTenantSwitcherCollapsed(collapsed) {
        dispatch({ type: 'set_tenant_switcher_collapsed', collapsed });
      },
      replaceSession(session) {
        dispatch({
          type: 'hydrate_session',
          payload: session,
          persistedSnapshot: readAccountShellSnapshot(),
        });
      },
      clearSession() {
        dispatch({ type: 'clear_session' });
      },
      resolveWorkspaceHref(workspaceId) {
        return resolveWorkspaceNavigationTarget(state, workspaceId);
      },
    }),
    [state],
  );

  const value = useMemo<AccountShellContextValue>(
    () => ({
      state,
      actions,
    }),
    [actions, state],
  );

  return <AccountShellContext.Provider value={value}>{children}</AccountShellContext.Provider>;
}

export function useAccountShell(): AccountShellContextValue {
  const context = useContext(AccountShellContext);
  if (!context) {
    throw new Error('useAccountShell must be used inside AccountShellProvider');
  }
  return context;
}
