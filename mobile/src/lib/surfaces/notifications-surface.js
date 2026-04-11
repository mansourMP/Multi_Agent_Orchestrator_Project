import {
  assertWorkspaceRouteAvailable,
  loadWorkspaceSurfaceResource,
  normalizeListPayload,
  resolveMobileWorkspaceApiPaths,
} from './shared.js';

function normalizeNotificationsPayload(payload) {
  return normalizeListPayload(payload, ['notifications', 'items', 'data']);
}

export function createNotificationsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const route = assertWorkspaceRouteAvailable(foundation, 'notifications', 'notifications');

  return {
    route: route.href,
    async loadNotifications({ refresh = false } = {}) {
      return loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'notifications',
        queryKey: 'notifications:list',
        persistenceKey: 'notifications:list',
        path: paths.notifications,
        emptyValue: [],
        transform: normalizeNotificationsPayload,
        scopeLabel: 'notifications',
        refresh,
      });
    },
    startPolling({ intervalMs = 60000, onUpdate } = {}) {
      const pollerId = `notifications:${foundation.bootstrap.workspace.id}:${Date.now()}`;
      foundation.services.realtime.startPoller(pollerId, async () => {
        const result = await this.loadNotifications({ refresh: true });
        if (typeof onUpdate === 'function') {
          onUpdate(result);
        }
      }, intervalMs);

      return () => {
        foundation.services.realtime.stopPoller(pollerId);
      };
    },
  };
}
