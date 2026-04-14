import React from 'react';

import { router } from 'expo-router';
import { View } from 'react-native';

import { mobileAppRuntime, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import {
  AppBadge,
  AppButton,
  AppCaption,
  AppCard,
  AppDivider,
  AppHeading,
  AppScreen,
  AppText,
  AppTitle,
} from '../../src/ui/primitives';
import { SurfaceErrorScreen } from '../../src/ui/state-screens';

export default function AccountScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.account ?? null;

  if (!surface) {
    return (
      <SurfaceErrorScreen
        title="Account unavailable"
        body="The mobile account surface could not be created for this session."
      />
    );
  }

  return (
    <AppScreen scroll>
      <AppCard>
        <AppBadge tone="accent">Account</AppBadge>
        <AppHeading>{surface.account?.displayName ?? surface.account?.email ?? 'Mobile Session'}</AppHeading>
        <AppText muted>
          This device is attached to the platform through a native mobile session with persisted workspace restore.
        </AppText>
      </AppCard>

      <AppCard>
        <AppTitle>Session</AppTitle>
        <AppCaption>Connection</AppCaption>
        <AppText>{surface.sessionSummary.connectionMode ?? 'Unavailable'}</AppText>
        <AppCaption>API Base URL</AppCaption>
        <AppText>{surface.sessionSummary.apiBaseUrl ?? 'Unavailable'}</AppText>
        <AppCaption>Current Workspace</AppCaption>
        <AppText>{surface.currentWorkspace?.label ?? 'No workspace selected'}</AppText>
      </AppCard>

      <AppCard>
        <AppTitle>Workspaces</AppTitle>
        {surface.workspaces.map((workspace, index) => (
          <View key={workspace.workspaceId} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <AppText>{workspace.label}</AppText>
              {workspace.isActive ? <AppBadge tone="success">Current</AppBadge> : null}
            </View>
            <AppCaption>{workspace.role}</AppCaption>
            {index < surface.workspaces.length - 1 ? <AppDivider /> : null}
          </View>
        ))}
      </AppCard>

      <View style={{ gap: 10 }}>
        <AppButton
          label="Switch workspace"
          tone="secondary"
          onPress={() => {
            router.push('/(workspace)/switcher');
          }}
        />
        <AppButton
          label="Sign out"
          tone="danger"
          onPress={() => {
            mobileAppRuntime.signOut();
            router.replace('/(auth)/login');
          }}
        />
      </View>
    </AppScreen>
  );
}
