import React, { useState } from 'react';

import { router } from 'expo-router';
import { View } from 'react-native';

import { mobileAppRuntime, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCaption,
  AppHeading,
  AppScreen,
  AppText,
  AppTitle,
} from '../../src/ui/primitives';
import { SurfaceErrorScreen, SurfaceNoticeCard } from '../../src/ui/state-screens';

export default function WorkspaceSwitcherScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.workspaceSwitcher ?? null;
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);

  if (!surface) {
    return (
      <SurfaceErrorScreen
        title="Workspace switcher unavailable"
        body="The workspace picker is not available for this mobile session."
      />
    );
  }

  return (
    <AppScreen scroll>
      <AppCard>
        <AppBadge tone="accent">Workspaces</AppBadge>
        <AppHeading>Choose workspace</AppHeading>
        <AppText muted>
          Workspace selection is native application state. This picker restores the correct route after the switch completes.
        </AppText>
      </AppCard>
      {switchError ? (
        <SurfaceNoticeCard
          title="Switch failed"
          body={switchError}
          tone="warning"
        />
      ) : null}
      {surface.workspaces.map((workspace) => (
        <AppCard key={workspace.workspaceId}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <AppTitle>{workspace.label}</AppTitle>
            {workspace.isActive ? <AppBadge tone="success">Current</AppBadge> : null}
          </View>
          <AppText muted>{workspace.role}</AppText>
          <AppCaption>
            Default route: {workspace.defaultRouteId}
            {workspace.lastVisitedRouteId ? ` • Last used: ${workspace.lastVisitedRouteId}` : ''}
          </AppCaption>
          <AppButton
            label={
              workspace.workspaceId === switchingWorkspaceId
                ? 'Switching…'
                : workspace.isActive
                  ? 'Open current workspace'
                  : 'Switch workspace'
            }
            tone={workspace.isActive ? 'secondary' : 'primary'}
            disabled={switchingWorkspaceId !== null}
            onPress={() => {
              setSwitchError(null);
              setSwitchingWorkspaceId(workspace.workspaceId);
              void mobileAppRuntime.switchWorkspace(workspace.workspaceId)
                .then((href) => {
                  router.replace(href);
                })
                .catch((error) => {
                  setSwitchError(error instanceof Error ? error.message : String(error));
                })
                .finally(() => {
                  setSwitchingWorkspaceId(null);
                });
            }}
          />
        </AppCard>
      ))}
    </AppScreen>
  );
}
