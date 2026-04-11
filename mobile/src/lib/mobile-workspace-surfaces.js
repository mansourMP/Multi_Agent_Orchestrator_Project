import { createAccountSessionSurface } from './surfaces/account-session-surface.js';
import { createArtifactsSurface } from './surfaces/artifacts-surface.js';
import { createChatSurface } from './surfaces/chat-surface.js';
import { createNotificationsSurface } from './surfaces/notifications-surface.js';
import { createRunsApprovalsSurface } from './surfaces/runs-approvals-surface.js';
import { createWorkspaceSwitcherSurface } from './surfaces/workspace-switcher-surface.js';

export function createMobileWorkspaceSurfaceSet({
  accountState,
  foundation = null,
  storage,
  fetchImpl,
  apiPaths = {},
}) {
  const routeIndex = foundation?.routeManifest?.routeIndex ?? {};

  return {
    account: createAccountSessionSurface(accountState),
    workspaceSwitcher: createWorkspaceSwitcherSurface({
      accountState,
      currentFoundation: foundation,
      storage,
      fetchImpl,
    }),
    chat: foundation && routeIndex.chat ? createChatSurface({ foundation, apiPaths }) : null,
    runsApprovals: foundation && routeIndex.runs ? createRunsApprovalsSurface({ foundation, apiPaths }) : null,
    notifications:
      foundation && routeIndex.notifications ? createNotificationsSurface({ foundation, apiPaths }) : null,
    artifacts: foundation && routeIndex.artifacts ? createArtifactsSurface({ foundation, apiPaths }) : null,
  };
}

function resolveMountedSurface(routeId, surfaces) {
  if (routeId === 'chat') {
    return surfaces.chat;
  }
  if (routeId === 'runs' || routeId === 'approvals') {
    return surfaces.runsApprovals;
  }
  if (routeId === 'notifications') {
    return surfaces.notifications;
  }
  if (routeId === 'artifacts') {
    return surfaces.artifacts;
  }
  return null;
}

export function buildMobileWorkspaceShellModel({
  accountState,
  foundation = null,
  storage,
  fetchImpl,
  apiPaths = {},
}) {
  const surfaces = createMobileWorkspaceSurfaceSet({
    accountState,
    foundation,
    storage,
    fetchImpl,
    apiPaths,
  });

  const tabs = [
    {
      id: 'account',
      label: 'Account',
      route: '/account',
      mounted: Boolean(surfaces.account),
    },
    ...((foundation?.routeManifest?.navGroups ?? []).flatMap((group) =>
      group.routes.map((route) => ({
        id: route.id,
        label: route.label,
        route: route.href,
        groupId: group.id,
        mounted: Boolean(resolveMountedSurface(route.id, surfaces)),
      })),
    )),
  ];

  return {
    surfaces,
    tabs,
    activeWorkspaceId: accountState?.activeWorkspaceId ?? null,
    defaultRoute: foundation?.routeManifest?.defaultRoute ?? null,
    shellProfileId: foundation?.shellProfile?.id ?? null,
  };
}
