import { Redirect, Tabs } from 'expo-router';

import { mobileAppRuntime, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { AppErrorState, AppLoadingState } from '../../src/ui/primitives';
import { appTokens } from '../../src/ui/tokens';
import { WORKSPACE_MOBILE_BOTTOM_TABS } from '../../../shared/nav-manifest';

function routeEnabled(state, routeId) {
  return Boolean(state.foundation?.routeManifest?.routeIndex?.[routeId]);
}

export default function WorkspaceLayout() {
  const state = useMobileRuntimeState();

  if (state.authState === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  if (state.workspaceState === 'restoring') {
    return (
      <AppLoadingState
        title="Restoring workspace"
        body="Loading the native workspace shell, route manifest, and cached session state."
      />
    );
  }

  if (state.workspaceState === 'error') {
    return (
      <AppErrorState
        title="Workspace unavailable"
        body={state.error ?? 'The last workspace could not be restored on this device.'}
        primaryActionLabel="Retry restore"
        onPrimaryAction={() => {
          void mobileAppRuntime.retryWorkspaceRestore();
        }}
        secondaryActionLabel="Sign out"
        onSecondaryAction={() => {
          mobileAppRuntime.signOut();
        }}
      />
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: appTokens.colors.panel,
          borderTopColor: appTokens.colors.border,
        },
        tabBarActiveTintColor: appTokens.colors.accentStrong,
        tabBarInactiveTintColor: appTokens.colors.textMuted,
        sceneStyle: {
          backgroundColor: appTokens.colors.canvas,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      {WORKSPACE_MOBILE_BOTTOM_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.routeId}
          name={tab.screenName}
          options={{ title: tab.label, href: routeEnabled(state, tab.routeId) ? undefined : null }}
          listeners={{
            tabPress: () => {
              mobileAppRuntime.rememberRoute(tab.routeId);
            },
            focus: () => {
              mobileAppRuntime.rememberRoute(tab.routeId);
            },
          }}
        />
      ))}
      <Tabs.Screen name="account" options={{ title: 'Account', href: null }} />
      <Tabs.Screen name="switcher" options={{ href: null }} />
    </Tabs>
  );
}
