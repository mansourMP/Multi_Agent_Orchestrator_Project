import { Redirect } from 'expo-router';

import { resolveWorkspaceHomeScreen, useMobileRuntimeState } from '../src/lib/mobile-runtime.js';

export default function IndexScreen() {
  const state = useMobileRuntimeState();

  if (state.bootState !== 'ready') {
    return null;
  }

  if (state.authState === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  if (state.workspaceState === 'ready') {
    return <Redirect href={resolveWorkspaceHomeScreen(state)} />;
  }

  return <Redirect href="/(workspace)/account" />;
}
