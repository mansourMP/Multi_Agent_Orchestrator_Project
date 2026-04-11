import {
  assertWorkspaceRouteAvailable,
  loadWorkspaceSurfaceResource,
  normalizeListPayload,
  resolveMobileWorkspaceApiPaths,
} from './shared.js';

function normalizeArtifactsPayload(payload) {
  return normalizeListPayload(payload, ['artifacts', 'items', 'data']);
}

export function createArtifactsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const route = assertWorkspaceRouteAvailable(foundation, 'artifacts', 'artifacts');

  return {
    route: route.href,
    async loadArtifacts({ refresh = false } = {}) {
      return loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'artifacts',
        queryKey: 'artifacts:list',
        persistenceKey: 'artifacts:list',
        path: paths.artifacts,
        emptyValue: [],
        transform: normalizeArtifactsPayload,
        scopeLabel: 'artifacts',
        refresh,
      });
    },
    trackPreviewUrl(url) {
      return foundation.services.disposableRegistry.trackObjectUrl(url);
    },
  };
}
