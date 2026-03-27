import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { backendJsonRequest } from '@/lib/server/backendControlPlane';

export const dynamic = 'force-dynamic';

async function proxyWorkflowCollection(request: NextRequest, method: 'GET' | 'POST') {
  const rejection = enforceBffRouteGuard(request, { methods: [method] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const query = request.nextUrl.search || '';
  const rawBody = method === 'POST' ? await request.text() : '';

  try {
    const { status, payload } = await backendJsonRequest(`/workflows${query}`, {
      method,
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
    return Response.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow collection proxy failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  return proxyWorkflowCollection(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyWorkflowCollection(request, 'POST');
}
