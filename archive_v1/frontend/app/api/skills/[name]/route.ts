import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ name: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  const rejection = enforceBffRouteGuard(request, { methods: ['PUT'] });
  if (rejection) return rejection;

  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const params = await context.params;
  const rawBody = await request.text();
  try {
    return await runtimeProxyResponse(`/skills/${encodeURIComponent(params.name)}`, {
      method: 'PUT',
      body: rawBody || undefined,
      headers: rawBody ? { 'Content-Type': request.headers.get('content-type') || 'application/json' } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update skill.';
    return Response.json({ detail: message }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rejection = enforceBffRouteGuard(request, { methods: ['DELETE'] });
  if (rejection) return rejection;

  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const params = await context.params;
  try {
    return await runtimeProxyResponse(`/skills/${encodeURIComponent(params.name)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to uninstall skill.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
