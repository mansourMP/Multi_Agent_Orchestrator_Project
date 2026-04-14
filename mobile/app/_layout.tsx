import React, { useEffect } from 'react';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { mobileAppRuntime, useMobileRuntimeState } from '../src/lib/mobile-runtime.js';
import { AppErrorState, AppLoadingState } from '../src/ui/primitives';
import { AppThemeProvider } from '../src/ui/theme';

function RootNavigator() {
  const runtimeState = useMobileRuntimeState();

  useEffect(() => {
    void mobileAppRuntime.hydrate();
  }, []);

  if (runtimeState.bootState === 'booting') {
    return (
      <AppLoadingState
        title="Opening Empyralis"
        body="Restoring the mobile workspace shell and validating the last authenticated session."
      />
    );
  }

  if (runtimeState.bootState === 'error') {
    return (
      <AppErrorState
        title="Mobile shell could not boot"
        body={runtimeState.error ?? 'The mobile runtime failed before navigation was mounted.'}
        primaryActionLabel="Retry boot"
        onPrimaryAction={() => {
          void mobileAppRuntime.hydrate();
        }}
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(workspace)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
