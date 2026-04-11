import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

async function proxyWorkflowDetail(
  request: NextRequest,
  { params }: Params,
  method: 'GET' | 'PUT' | 'DELETE',
) {
  const rejection = enforceBffRouteGuard(request, { methods: [method] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { id } = await params;
  const workflowId = encodeURIComponent(String(id || '').trim());
  const rawBody = method === 'PUT' ? await request.text() : '';

  try {
    const { status, payload } = await runtimeJsonRequest(`/workflows/${workflowId}`, {
      method,
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow detail proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function GET(request: NextRequest, context: Params) {
  return proxyWorkflowDetail(request, context, 'GET');
}

export async function PUT(request: NextRequest, context: Params) {
  return proxyWorkflowDetail(request, context, 'PUT');
}

export async function DELETE(request: NextRequest, context: Params) {
  return proxyWorkflowDetail(request, context, 'DELETE');
}
