import type { NextRequest } from 'next/server';
import type { AgentTurnRequest, AgentTurnResponse } from '@shared/api-contract';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import { stampRunOwnerBody } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function parseRunStartBody(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildCanonicalTurnRequest(payload: Record<string, unknown>): AgentTurnRequest {
  const metadata = asRecord(payload.metadata);
  const workflowId = String(payload.workflow_id || metadata.workflow_id || '').trim();
  const workspaceId = String(payload.workspace_id || metadata.workspace_id || 'default').trim() || 'default';
  const ownerUserId = String(metadata.owner_user_id || '').trim();
  const ownerEmail = String(metadata.owner_email || '').trim();
  const sessionId = String(
    metadata.session_id
      || metadata.thread_id
      || metadata.parent_run_id
      || workflowId
      || `workflow-run-${crypto.randomUUID()}`,
  ).trim();
  const message = String(payload.user_goal || payload.business_plan || metadata.summary || 'Run workflow').trim() || 'Run workflow';
  const executionTarget = String(
    metadata.machine_target
      || metadata.execution_target_selected
      || metadata.execution_target
      || '',
  ).trim();
  const policyContext: Record<string, unknown> = {};
  if (typeof metadata.trust_mode === 'string' && metadata.trust_mode.trim()) policyContext.trust_mode = metadata.trust_mode.trim();
  if (typeof metadata.outcome_pack === 'string' && metadata.outcome_pack.trim()) policyContext.outcome_pack = metadata.outcome_pack.trim();
  if (executionTarget) policyContext.execution_target = executionTarget;
  if (metadata.action_policy && typeof metadata.action_policy === 'object' && !Array.isArray(metadata.action_policy)) {
    policyContext.action_policy = metadata.action_policy;
  }

  return {
    tenant_id: String(metadata.tenant_id || ownerUserId || 'default').trim() || 'default',
    workspace_id: workspaceId,
    session_id: sessionId,
    channel: String(metadata.channel || 'web').trim() || 'web',
    actor: {
      type: 'user',
      id: ownerUserId || 'web-user',
      display_name: ownerEmail || ownerUserId || 'Web user',
    },
    message,
    attachments: [],
    execution_mode: 'durable',
    response_mode: 'artifact',
    machine_target: executionTarget || null,
    context_hints: {
      engine: typeof payload.engine === 'string' ? payload.engine : 'orion',
      workflow_id: workflowId || undefined,
      provider: typeof payload.provider === 'string' ? payload.provider : undefined,
      model: typeof payload.model === 'string' ? payload.model : undefined,
      credential_id: typeof payload.credential_id === 'string' ? payload.credential_id : undefined,
      agent_role: typeof payload.agent_role === 'string' ? payload.agent_role : undefined,
      max_iterations: payload.max_iterations,
      business_plan: typeof payload.business_plan === 'string' ? payload.business_plan : undefined,
      agents: Array.isArray(payload.agents) ? payload.agents : undefined,
      metadata: {
        ...metadata,
        source: typeof metadata.source === 'string' && metadata.source.trim() ? metadata.source.trim() : 'workflow_run',
      },
    },
    policy_context: policyContext,
  };
}

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const rawBody = await request.text();
  const stampedBody = await stampRunOwnerBody(request, rawBody);

  try {
    const parsedBody = parseRunStartBody(stampedBody);
    if (!parsedBody) {
      return Response.json({ detail: 'Invalid workflow run payload.' }, { status: 400 });
    }
    const turnRequest = buildCanonicalTurnRequest(parsedBody);
    const { status, payload } = await runtimeJsonRequest('/turn', {
      method: 'POST',
      body: JSON.stringify(turnRequest),
      headers: { 'Content-Type': 'application/json' },
    });
    const turnPayload = payload as AgentTurnResponse;
    const createdRun = turnPayload?.metadata?.created_run;
    return Response.json(
      (createdRun && typeof createdRun === 'object'
        ? createdRun
        : {
            run_id: turnPayload?.run_id,
            status: turnPayload?.status,
            route: turnPayload?.metadata?.route,
          }),
      { status },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow run proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
