import { normalizePlatformSession } from './shell/account-shell-store.js';
import {
  createWorkspaceBoundaryKey,
  fetchWorkspaceBootstrap,
  parseWorkspaceBootstrapPayload,
} from './workspace/workspace-bootstrap.js';
import { buildRouteManifest, deriveShellProfile } from './workspace/workspace-shell.js';
import { createWorkspaceServiceBundle } from './workspace/workspace-services.js';

function resolveBootstrapSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Mobile platform session must be an object.');
  }

  const apiBaseUrl = typeof session.apiBaseUrl === 'string'
    ? session.apiBaseUrl
    : session.platformBaseUrl;
  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl.trim()) {
    throw new Error('Mobile platform session requires a public apiBaseUrl.');
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    accessToken: typeof session.accessToken === 'string' ? session.accessToken : null,
  };
}

export function createMobileWorkspaceFoundation({
  session,
  bootstrap,
  workspaceId = null,
  storage,
  fetchImpl,
}) {
  const parsedBootstrap = parseWorkspaceBootstrapPayload(bootstrap);
  const normalizedSession = normalizePlatformSession(session, {
    fallbackAccountId: parsedBootstrap.account.id,
  });
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
  const bootstrapSession = resolveBootstrapSession(session);
  const bootstrap = await fetchWorkspaceBootstrap({
    apiBaseUrl: bootstrapSession.apiBaseUrl,
    workspaceId,
    accessToken: bootstrapSession.accessToken,
    fetchImpl,
  });

  return createMobileWorkspaceFoundation({
    session,
    bootstrap,
    workspaceId,
    storage,
    fetchImpl,
  });
}
