import {
  assertWorkspaceRouteAvailable,
  formatSurfaceBytes,
  loadWorkspaceSurfaceResource,
  normalizeSurfaceRecord,
  normalizeListPayload,
  pickFirstString,
  pickFirstValue,
  resolveMobileWorkspaceApiPaths,
} from './shared.js';

function normalizeArtifactsPayload(payload) {
  return normalizeListPayload(payload, ['artifacts', 'items', 'data']).map((artifact) => {
    const normalized = normalizeSurfaceRecord(artifact, {
      titleKeys: ['label', 'title', 'filename', 'name', 'id'],
      subtitleKeys: ['kind', 'mime_type', 'mimeType', 'content_type', 'contentType'],
      statusKeys: ['status', 'state'],
    });
    const size = pickFirstValue(artifact, ['size_bytes', 'sizeBytes', 'bytes', 'size'], null);

    return {
      ...normalized,
      mimeType: pickFirstString(artifact, ['mime_type', 'mimeType', 'content_type', 'contentType'], 'Unknown'),
      detailLines: [
        {
          label: 'Artifact ID',
          value: normalized.id,
        },
        {
          label: 'Type',
          value: pickFirstString(artifact, ['kind', 'mime_type', 'mimeType', 'content_type'], 'Unknown'),
        },
        {
          label: 'Size',
          value: formatSurfaceBytes(typeof size === 'number' ? size : null) ?? 'Unavailable',
        },
        {
          label: 'Created',
          value: normalized.timestamp ?? 'Unavailable',
        },
      ],
    };
  });
}

export function createArtifactsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const route = assertWorkspaceRouteAvailable(foundation, 'artifacts', 'artifacts');

  return {
    route: route.screen,
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
