import { NextRequest, NextResponse } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const { status, payload } = await runtimeJsonRequest('/api/v1/builder/manifests/connectors', {
      method: 'GET',
    });
    return NextResponse.json(payload, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connector manifest request failed.';
    return NextResponse.json({ detail: message }, { status: 503 });
  }
}
