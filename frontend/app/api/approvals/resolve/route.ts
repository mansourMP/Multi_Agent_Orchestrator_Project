import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';
import { requireOwnedRun } from '@/lib/server/runOwnership';

export const dynamic = 'force-dynamic';

type ApprovalResolveBody = {
  runId?: string;
  approvalId?: string;
  decision?: string;
  note?: string;
};

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const body = (await request.json().catch(() => null)) as ApprovalResolveBody | null;
  const runId = String(body?.runId || '').trim();
  const approvalId = String(body?.approvalId || '').trim();
  const decision = String(body?.decision || '').trim();
  const note = String(body?.note || '').trim();

  if (!runId || !approvalId) {
    return Response.json({ detail: 'Run ID and approval ID are required.' }, { status: 400 });
  }
  if (!decision) {
    return Response.json({ detail: 'Decision is required.' }, { status: 400 });
  }

  const owned = await requireOwnedRun(request, runId);
  if (owned.response) return owned.response;

  try {
    const { status, payload } = await runtimeJsonRequest(
      `/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision,
          note,
        }),
      },
    );
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval resolve proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
