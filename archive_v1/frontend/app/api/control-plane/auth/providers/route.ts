import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { fetchControlPlaneAuthProviders } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  return Response.json(await fetchControlPlaneAuthProviders());
}
