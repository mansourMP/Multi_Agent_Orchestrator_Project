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
