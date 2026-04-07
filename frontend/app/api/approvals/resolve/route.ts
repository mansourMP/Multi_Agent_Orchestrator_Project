import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneRole, requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

type ApprovalResolveBody = {
  runId?: string;
  approvalId?: string;
  decision?: string;
  note?: string;
  actor?: string;
};

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;
  const roleFailure = await requireControlPlaneRole(request, 'member');
  if (roleFailure) return roleFailure;

  const body = (await request.json().catch(() => null)) as ApprovalResolveBody | null;
  const runId = String(body?.runId || '').trim();
  const approvalId = String(body?.approvalId || '').trim();
  const decision = String(body?.decision || '').trim();
  const note = String(body?.note || '').trim();
  const actor = String(body?.actor || '').trim() || 'user';

  if (!approvalId) {
    return Response.json({ detail: 'Approval ID is required.' }, { status: 400 });
  }
  if (!decision) {
    return Response.json({ detail: 'Decision is required.' }, { status: 400 });
  }

  if (runId) {
    const owned = await requireOwnedRun(request, runId);
    if (owned.response) return owned.response;
  }

  const resolution =
    decision.toLowerCase() === 'proceed' ? 'approved'
      : decision.toLowerCase() === 'hold' ? 'rejected'
      : '';
  if (!resolution) {
    return Response.json({ detail: 'Decision must be Proceed or Hold.' }, { status: 400 });
  }

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/approvals/${encodeURIComponent(approvalId)}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({
          approval_id: approvalId,
          resolution,
          actor,
          reason: note,
        }),
      },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval resolve proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
