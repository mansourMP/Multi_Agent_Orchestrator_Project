import { Redirect } from 'expo-router';

import { resolveWorkspaceHomeScreen, useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';

export default function WorkspaceIndexScreen() {
  const state = useMobileRuntimeState();

  if (state.workspaceState !== 'ready') {
    return null;
  }

  return <Redirect href={resolveWorkspaceHomeScreen(state)} />;
}
