import {
  assertWorkspaceRouteAvailable,
  combineSurfaceResults,
  loadWorkspaceSurfaceResource,
  normalizeSurfaceRecord,
  normalizeListPayload,
  pickFirstString,
  resolveMobileWorkspaceApiPaths,
  writeWorkspaceSurfaceResource,
} from './shared.js';

function normalizeRunsPayload(payload) {
  return normalizeListPayload(payload, ['runs', 'items', 'data']).map((run) => {
    const normalized = normalizeSurfaceRecord(run, {
      titleKeys: ['title', 'name', 'task', 'summary', 'id'],
      subtitleKeys: ['objective', 'kind', 'route', 'type'],
      statusKeys: ['status', 'state'],
    });

    return {
      ...normalized,
      detailLines: [
        {
          label: 'Run ID',
          value: normalized.id,
        },
        {
          label: 'Status',
          value: normalized.status ?? 'Unknown',
        },
        {
          label: 'Requested by',
          value: pickFirstString(run, ['requested_by', 'requestedBy', 'actor', 'owner'], 'Unknown'),
        },
        {
          label: 'Updated',
          value: normalized.timestamp ?? 'Unavailable',
        },
      ],
      kind: 'run',
    };
  });
}

function normalizeTracesPayload(payload) {
  return normalizeListPayload(payload, ['traces', 'items', 'data']).map((trace) => {
    const normalized = normalizeSurfaceRecord(trace, {
      titleKeys: ['id', 'trace_id'],
      subtitleKeys: ['root_agent_id', 'runtime_target', 'provider', 'model'],
      statusKeys: ['outcome'],
      timestampKeys: ['started_at', 'finished_at', 'created_at'],
    });

    return {
      ...normalized,
      subtitle: [
        pickFirstString(trace, ['root_agent_id'], 'sage'),
        pickFirstString(trace, ['runtime_target'], 'runtime'),
        pickFirstString(trace, ['provider'], 'provider'),
      ].join(' · '),
      detailLines: [
        {
          label: 'Trace ID',
          value: normalized.id,
        },
        {
          label: 'Root agent',
          value: pickFirstString(trace, ['root_agent_id'], 'sage'),
        },
        {
          label: 'Outcome',
          value: normalized.status ?? 'Replay',
        },
        {
          label: 'Recorded',
          value: normalized.timestamp ?? 'Unavailable',
        },
      ],
      kind: 'trace',
      raw: trace,
    };
  });
}

function normalizeApprovalsPayload(payload) {
  return normalizeListPayload(payload, ['approvals', 'items', 'data']).map((approval) => {
    const normalized = normalizeSurfaceRecord(approval, {
      titleKeys: ['title', 'summary', 'action', 'kind', 'id'],
      subtitleKeys: ['reason', 'request', 'scope', 'run_id'],
      statusKeys: ['status', 'decision', 'state'],
    });

    return {
      ...normalized,
      runId: pickFirstString(approval, ['run_id', 'runId'], null),
      detailLines: [
        {
          label: 'Approval ID',
          value: normalized.id,
        },
        {
          label: 'Status',
          value: normalized.status ?? 'Pending',
        },
        {
          label: 'Run',
          value: pickFirstString(approval, ['run_id', 'runId'], 'Unavailable'),
        },
        {
          label: 'Requested',
          value: normalized.timestamp ?? 'Unavailable',
        },
      ],
    };
  });
}

export function createRunsApprovalsSurface({
  foundation,
  apiPaths = {},
}) {
  const paths = resolveMobileWorkspaceApiPaths(foundation.bootstrap.workspace.id, apiPaths);
  const runsRoute = assertWorkspaceRouteAvailable(foundation, 'runs', 'runs');
  const approvalsRoute = foundation.routeManifest.routeIndex.approvals ?? null;

  return {
    route: runsRoute.screen,
    approvalsAvailable: Boolean(approvalsRoute),
    async loadRuns({ refresh = false } = {}) {
      return loadWorkspaceSurfaceResource({
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
    },
    async loadTraces({ refresh = false } = {}) {
      return loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'runs',
        queryKey: 'traces:list',
        persistenceKey: 'traces:list',
        path: paths.agentTraces,
        emptyValue: [],
        transform: normalizeTracesPayload,
        scopeLabel: 'traces',
        refresh,
      });
    },
    async loadWorkItems({ refresh = false } = {}) {
      const runsResult = await this.loadRuns({ refresh });
      const tracesResult = await this.loadTraces({ refresh });
      const data = [...(tracesResult.data ?? []), ...(runsResult.data ?? [])].sort((left, right) => {
        const leftTime = Date.parse(left?.timestamp ?? '');
        const rightTime = Date.parse(right?.timestamp ?? '');
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) {
          return Number.isFinite(rightTime) ? 1 : -1;
        }
        return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
      });
      const combined = combineSurfaceResults([runsResult, tracesResult]);
      return {
        ...combined,
        data,
        sources: {
          runs: runsResult.source,
          traces: tracesResult.source,
        },
      };
    },
    async getTraceReplay({ traceId }) {
      const payload = await foundation.services.transport.requestJson(paths.agentTraceDetail(traceId));
      return payload ?? null;
    },
    async loadApprovals({ refresh = false } = {}) {
      if (!approvalsRoute) {
        return {
          status: 'ready',
          statusMessage: null,
          source: 'not_applicable',
          data: [],
        };
      }

      return loadWorkspaceSurfaceResource({
        foundation,
        routeId: 'approvals',
        queryKey: 'approvals:list',
        persistenceKey: 'approvals:list',
        path: paths.approvals,
        emptyValue: [],
        transform: normalizeApprovalsPayload,
        scopeLabel: 'approvals',
        refresh,
      });
    },
    async loadOverview({ refresh = false } = {}) {
      const runsResult = await this.loadRuns({ refresh });
      const tracesResult = await this.loadTraces({ refresh });
      const approvalsResult = await this.loadApprovals({ refresh });

      const combined = combineSurfaceResults([runsResult, tracesResult, approvalsResult]);
      return {
        ...combined,
        runs: runsResult.data,
        traces: tracesResult.data,
        approvals: approvalsResult.data,
        sources: {
          runs: runsResult.source,
          traces: tracesResult.source,
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
      const resolvedApproval = currentApprovals.find((approval) => approval?.id === approvalId) ?? null;
      const nextApprovals = currentApprovals.filter((approval) => approval?.id !== approvalId);
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
        resolvedApproval: resolvedApproval
          ? {
              ...resolvedApproval,
              status: decision,
              decision,
            }
          : {
              id: approvalId,
              status: decision,
              decision,
            },
        approvals: nextApprovals,
      };
    },
  };
}
