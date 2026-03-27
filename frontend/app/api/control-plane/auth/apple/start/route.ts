import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { controlPlaneAuthProviders, issuePendingControlPlaneOauthRedirect, sanitizeReturnTo } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

const CONTROL_PLANE_BACKEND_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const providers = controlPlaneAuthProviders();
  if (!providers.apple.enabled) {
    return Response.json({ detail: 'Apple sign-in is not configured.' }, { status: 503 });
  }

  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') || '/');
  const desktopMode = request.nextUrl.searchParams.get('desktop') === '1';
  const backendStartUrl = `${CONTROL_PLANE_BACKEND_URL}/auth/apple`;
  return issuePendingControlPlaneOauthRedirect(request, backendStartUrl, returnTo, { desktopMode });
}
