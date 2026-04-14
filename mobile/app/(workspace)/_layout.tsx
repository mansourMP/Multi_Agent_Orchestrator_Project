import { Redirect, Tabs } from 'expo-router';

import { mobileAppRuntime, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { AppErrorState, AppLoadingState } from '../../src/ui/primitives';
import { appTokens } from '../../src/ui/tokens';

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
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', href: routeEnabled(state, 'chat') ? undefined : null }}
        listeners={{ focus: () => mobileAppRuntime.rememberRoute('chat') }}
      />
      <Tabs.Screen
        name="runs"
        options={{ title: 'Work', href: routeEnabled(state, 'runs') ? undefined : null }}
        listeners={{ focus: () => mobileAppRuntime.rememberRoute('runs') }}
      />
      <Tabs.Screen
        name="approvals"
        options={{ title: 'Approvals', href: routeEnabled(state, 'approvals') ? undefined : null }}
        listeners={{ focus: () => mobileAppRuntime.rememberRoute('approvals') }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Inbox', href: routeEnabled(state, 'notifications') ? undefined : null }}
        listeners={{ focus: () => mobileAppRuntime.rememberRoute('notifications') }}
      />
      <Tabs.Screen
        name="artifacts"
        options={{ title: 'Artifacts', href: routeEnabled(state, 'artifacts') ? undefined : null }}
        listeners={{ focus: () => mobileAppRuntime.rememberRoute('artifacts') }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
      <Tabs.Screen name="switcher" options={{ href: null }} />
    </Tabs>
  );
}
