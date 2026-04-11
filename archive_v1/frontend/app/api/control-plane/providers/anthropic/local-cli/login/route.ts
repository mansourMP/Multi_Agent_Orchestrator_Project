import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    return await runtimeProxyResponse('/providers/anthropic/local-cli/login', { method: 'POST' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claude local CLI login failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
