import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { backendJsonRequest } from '@/lib/server/backendControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await params;
  const workflowId = encodeURIComponent(String(id || '').trim());

  try {
    const { status, payload } = await backendJsonRequest(`/workflows/${workflowId}/publish`, {
      method: 'POST',
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow publish proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
