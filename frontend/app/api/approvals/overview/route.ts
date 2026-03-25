import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

function normalizePayload(status: number, payload: unknown) {
  if (status >= 200 && status < 300) return payload;
  return { items: [] };
}

export async function GET() {
  try {
    const [pending, history, audit] = await Promise.all([
      runtimeJsonRequest('/approvals?limit=40&workspace_id=default', { method: 'GET' }),
      runtimeJsonRequest('/history/runs?limit=40&workspace_id=default', { method: 'GET' }),
      runtimeJsonRequest('/approvals/audit?limit=30', { method: 'GET' }),
    ]);

    return Response.json({
      pending: normalizePayload(pending.status, pending.payload),
      history: normalizePayload(history.status, history.payload),
      audit: normalizePayload(audit.status, audit.payload),
      partial:
        pending.status < 200 || pending.status >= 300 ||
        history.status < 200 || history.status >= 300 ||
        audit.status < 200 || audit.status >= 300,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approvals overview proxy failed.';
    return Response.json(
      {
        pending: { items: [] },
        history: { items: [] },
        audit: { items: [] },
        partial: true,
        detail: message,
      },
      { status: 503 },
    );
  }
}
