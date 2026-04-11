import {
  assertWorkspaceRouteAvailable,
  combineSurfaceResults,
  loadWorkspaceSurfaceResource,
  normalizeListPayload,
  resolveMobileWorkspaceApiPaths,
  writeWorkspaceSurfaceResource,
} from './shared.js';

function normalizeRunsPayload(payload) {
  return normalizeListPayload(payload, ['runs', 'items', 'data']);
}

function normalizeApprovalsPayload(payload) {
  return normalizeListPayload(payload, ['approvals', 'items', 'data']);
}

export function createRunsApprovalsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const runsRoute = assertWorkspaceRouteAvailable(foundation, 'runs', 'runs');
  const approvalsRoute = foundation.routeManifest.routeIndex.approvals ?? null;

  return {
    route: runsRoute.href,
    approvalsAvailable: Boolean(approvalsRoute),
    async loadOverview({ refresh = false } = {}) {
      const runsResult = await loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'runs',
        queryKey: 'runs:list',
        persistenceKey: 'runs:list',
        path: paths.runs,
        emptyValue: [],
        transform: normalizeRunsPayload,
        scopeLabel: 'runs',
        refresh,
      });

      const approvalsResult = approvalsRoute
        ? await loadWorkspaceSurfaceResource({
            foundation,
            routeId: 'approvals',
            queryKey: 'approvals:list',
            persistenceKey: 'approvals:list',
            path: paths.approvals,
            emptyValue: [],
            transform: normalizeApprovalsPayload,
            scopeLabel: 'approvals',
            refresh,
          })
        : {
            status: 'ready',
            statusMessage: null,
            source: 'not_applicable',
            data: [],
          };

      const combined = combineSurfaceResults([runsResult, approvalsResult]);
      return {
        ...combined,
        runs: runsResult.data,
        approvals: approvalsResult.data,
        sources: {
          runs: runsResult.source,
          approvals: approvalsResult.source,
        },
      };
    },
    async respondToApproval({ approvalId, decision, note = null }) {
      if (!approvalsRoute) {
        throw new Error('Approvals are not enabled for this mobile workspace.');
      }

      const response = await foundation.services.transport.requestJson(paths.approvalAction(approvalId), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          note,
        }),
      });

      const currentApprovals = foundation.services.queryClient.peek('approvals:list')
        ?? foundation.services.persistence.getJson('approvals:list')
        ?? [];
      const nextApprovals = currentApprovals.map((approval) =>
        approval?.id === approvalId
          ? {
              ...approval,
              status: decision,
              decision,
            }
          : approval,
      );
      writeWorkspaceSurfaceResource({
        foundation,
        queryKey: 'approvals:list',
        persistenceKey: 'approvals:list',
        data: nextApprovals,
      });

      return {
        status: 'ready',
        statusMessage: null,
        source: 'live',
        data: response,
        approvals: nextApprovals,
      };
    },
  };
}
