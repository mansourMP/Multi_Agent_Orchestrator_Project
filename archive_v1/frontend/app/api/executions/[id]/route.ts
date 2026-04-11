import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { backendJsonRequest } from '@/lib/server/backendControlPlane';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

function normalizeExecutionDetail(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const workflow = record.workflow && typeof record.workflow === 'object'
    ? (record.workflow as Record<string, unknown>)
    : null;
  const definition = workflow?.definition && typeof workflow.definition === 'object'
    ? (workflow.definition as Record<string, unknown>)
    : null;
  const meta = definition?.meta && typeof definition.meta === 'object'
    ? (definition.meta as Record<string, unknown>)
    : null;
  const operator = meta?.operator && typeof meta.operator === 'object'
    ? (meta.operator as Record<string, unknown>)
    : null;
  const output = record.output && typeof record.output === 'object'
    ? (record.output as Record<string, unknown>)
    : null;
  const steps = Array.isArray(record.steps) ? record.steps : [];
  return {
    id: String(record.id || '').trim(),
    source: typeof record.source === 'string' ? record.source : undefined,
    status: typeof record.status === 'string' ? record.status : undefined,
    triggeredBy:
      typeof record.triggeredBy === 'string'
        ? record.triggeredBy
        : typeof record.triggered_by === 'string'
          ? record.triggered_by
          : undefined,
    createdAt:
      typeof record.createdAt === 'string'
        ? record.createdAt
        : typeof record.created_at === 'string'
          ? record.created_at
          : undefined,
    durationMs:
      typeof record.durationMs === 'number'
        ? record.durationMs
        : typeof record.duration_ms === 'number'
          ? record.duration_ms
          : null,
    userGoal:
      typeof record.userGoal === 'string'
        ? record.userGoal
        : typeof record.user_goal === 'string'
          ? record.user_goal
          : null,
    workflow: workflow
      ? {
          name: typeof workflow.name === 'string' ? workflow.name : null,
          definition: {
            meta: {
              operator: {
                agentRole:
                  typeof operator?.agentRole === 'string'
                    ? operator.agentRole
                    : typeof operator?.agent_role === 'string'
                      ? operator.agent_role
                      : null,
              },
            },
          },
        }
      : null,
    steps: steps.map((step, index) => {
      const stepRecord = step && typeof step === 'object' ? (step as Record<string, unknown>) : {};
      const toolCalls = Array.isArray(stepRecord.toolCalls)
        ? stepRecord.toolCalls
        : Array.isArray(stepRecord.tool_calls)
          ? stepRecord.tool_calls
          : [];
      return {
        id: typeof stepRecord.id === 'string' ? stepRecord.id : `step-${index + 1}`,
        nodeType:
          typeof stepRecord.nodeType === 'string'
            ? stepRecord.nodeType
            : typeof stepRecord.node_type === 'string'
              ? stepRecord.node_type
              : undefined,
        status: typeof stepRecord.status === 'string' ? stepRecord.status : undefined,
        output: stepRecord.output,
        toolCalls: toolCalls.map((tool) => {
          const toolRecord = tool && typeof tool === 'object' ? (tool as Record<string, unknown>) : {};
          return {
            toolName:
              typeof toolRecord.toolName === 'string'
                ? toolRecord.toolName
                : typeof toolRecord.tool_name === 'string'
                  ? toolRecord.tool_name
                  : undefined,
          };
        }),
      };
    }),
    output: output
      ? {
          logs: Array.isArray(output.logs)
            ? output.logs.filter((value): value is string => typeof value === 'string')
            : [],
        }
      : null,
    logs: Array.isArray(record.logs)
      ? record.logs.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await context.params;
  const owned = await requireOwnedRun(request, String(id || '').trim());
  if (owned.response) return owned.response;

  try {
    const { status, payload } = await backendJsonRequest(`/executions/${encodeURIComponent(id)}`, { method: 'GET' });
    return Response.json(normalizeExecutionDetail(payload), { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution detail proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
