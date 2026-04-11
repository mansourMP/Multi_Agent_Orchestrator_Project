import { normalizePlatformSession } from './shell/account-shell-store.js';
import {
  createWorkspaceBoundaryKey,
  fetchWorkspaceBootstrap,
  parseWorkspaceBootstrapPayload,
} from './workspace/workspace-bootstrap.js';
import { buildRouteManifest, deriveShellProfile } from './workspace/workspace-shell.js';
import { createWorkspaceServiceBundle } from './workspace/workspace-services.js';

export function createMobileWorkspaceFoundation({
  session,
  bootstrap,
  workspaceId = null,
  storage,
  fetchImpl,
}) {
  const normalizedSession = normalizePlatformSession(session);
  const parsedBootstrap = parseWorkspaceBootstrapPayload(bootstrap);
  const effectiveWorkspaceId = workspaceId ?? parsedBootstrap.workspace.id;

  if (effectiveWorkspaceId !== parsedBootstrap.workspace.id) {
    throw new Error('Mobile workspace foundation received mismatched workspace bootstrap.');
  }
  if (normalizedSession.accountId !== parsedBootstrap.account.id) {
    throw new Error('Mobile platform session account does not match workspace bootstrap account.');
  }

  const shellProfile = deriveShellProfile(parsedBootstrap);
  const routeManifest = buildRouteManifest(shellProfile, parsedBootstrap);
  const boundaryKey = createWorkspaceBoundaryKey(
    parsedBootstrap.workspace.id,
    parsedBootstrap.membership.version,
    shellProfile.id,
  );
  const services = createWorkspaceServiceBundle({
    accountId: parsedBootstrap.account.id,
    workspaceId: parsedBootstrap.workspace.id,
    apiBaseUrl: normalizedSession.apiBaseUrl,
    accessToken: normalizedSession.accessToken,
    storage,
    fetchImpl,
  });

  return {
    session: normalizedSession,
    bootstrap: parsedBootstrap,
    shellProfile,
    routeManifest,
    boundaryKey,
    services,
    connectionMode: 'platform_first',
    dispose() {
      services.dispose();
    },
  };
}

export async function loadMobileWorkspaceFoundation({
  workspaceId,
  session,
  storage,
  fetchImpl,
}) {
  const normalizedSession = normalizePlatformSession(session);
  const bootstrap = await fetchWorkspaceBootstrap({
    apiBaseUrl: normalizedSession.apiBaseUrl,
    workspaceId,
    accessToken: normalizedSession.accessToken,
    fetchImpl,
  });

  return createMobileWorkspaceFoundation({
    session: normalizedSession,
    bootstrap,
    workspaceId,
    storage,
    fetchImpl,
  });
}
