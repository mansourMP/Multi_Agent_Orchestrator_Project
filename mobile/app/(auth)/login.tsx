import React, { useMemo, useState } from 'react';

import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { mobileAppRuntime, resolveWorkspaceHomeScreen, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppField,
  AppHeading,
  AppInput,
  AppScreen,
  AppText,
} from '../../src/ui/primitives';

export default function LoginScreen() {
  const state = useMobileRuntimeState();
  const [apiBaseUrl, setApiBaseUrl] = useState(state.accountState.session?.apiBaseUrl ?? 'http://127.0.0.1:8000');
  const [workspaceId, setWorkspaceId] = useState(state.accountState.activeWorkspaceId ?? '');
  const [accessToken, setAccessToken] = useState(state.accountState.session?.accessToken ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() =>
    apiBaseUrl.trim().length > 0 && workspaceId.trim().length > 0 && accessToken.trim().length > 0,
  [accessToken, apiBaseUrl, workspaceId]);

  if (state.authState === 'authenticated' && state.workspaceState === 'ready') {
    return <Redirect href={resolveWorkspaceHomeScreen(state)} />;
  }

  return (
    <AppScreen scroll>
      <AppCard>
        <AppBadge tone="accent">Connect</AppBadge>
        <AppHeading>Attach this device to a workspace</AppHeading>
        <AppText muted>
          Mobile stays token-backed. Provide the control plane URL, workspace ID, and bearer token for this device session.
        </AppText>
      </AppCard>

      <AppCard>
        <AppField label="Control Plane URL">
          <AppInput
            autoCapitalize="none"
            autoCorrect={false}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            placeholder="https://api.empyralis.example"
          />
        </AppField>
        <AppField label="Workspace ID">
          <AppInput
            autoCapitalize="none"
            autoCorrect={false}
            value={workspaceId}
            onChangeText={setWorkspaceId}
            placeholder="ws_123"
          />
        </AppField>
        <AppField label="Access Token">
          <AppInput
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={accessToken}
            onChangeText={setAccessToken}
            placeholder="empyralis_mobile_token"
          />
        </AppField>
        {error ? (
          <View>
            <AppText muted>{error}</AppText>
          </View>
        ) : null}
        <AppButton
          label={submitting ? 'Connecting…' : 'Open workspace'}
          disabled={!canSubmit || submitting}
          onPress={() => {
            setSubmitting(true);
            setError(null);
            void mobileAppRuntime.connectWorkspace({
              apiBaseUrl,
              workspaceId,
              accessToken,
            })
              .then(() => {
                router.replace(resolveWorkspaceHomeScreen(mobileAppRuntime.getState()));
              })
              .catch((connectionError) => {
                setError(connectionError instanceof Error ? connectionError.message : String(connectionError));
              })
              .finally(() => {
                setSubmitting(false);
              });
          }}
        />
      </AppCard>
    </AppScreen>
  );
}
