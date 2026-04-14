import {
  assertWorkspaceRouteAvailable,
  loadWorkspaceSurfaceResource,
  normalizeSurfaceRecord,
  normalizeListPayload,
  pickFirstString,
  resolveMobileWorkspaceApiPaths,
} from './shared.js';

function normalizeNotificationsPayload(payload) {
  return normalizeListPayload(payload, ['notifications', 'items', 'data']).map((notification) => {
    const normalized = normalizeSurfaceRecord(notification, {
      titleKeys: ['title', 'summary', 'message', 'label', 'id'],
      subtitleKeys: ['body', 'detail', 'source', 'kind'],
      statusKeys: ['level', 'status', 'state'],
    });

    return {
      ...normalized,
      detailLines: [
        {
          label: 'Notification',
          value: normalized.id,
        },
        {
          label: 'Level',
          value: normalized.status ?? 'Info',
        },
        {
          label: 'Source',
          value: pickFirstString(notification, ['source', 'origin', 'kind'], 'Workspace'),
        },
        {
          label: 'Received',
          value: normalized.timestamp ?? 'Unavailable',
        },
      ],
    };
  });
}

export function createNotificationsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const route = assertWorkspaceRouteAvailable(foundation, 'notifications', 'notifications');

  return {
    route: route.screen,
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
