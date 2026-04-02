import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { fetchControlPlaneAuthProviders, issuePendingControlPlaneOauthRedirect, sanitizeReturnTo } from '@/lib/server/controlPlaneSession';
import { API_BASE } from '@/lib/config';

export const dynamic = 'force-dynamic';

const CONTROL_PLANE_AUTH_URL =
  process.env.NEXT_PUBLIC_API_URL || API_BASE;

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const providers = await fetchControlPlaneAuthProviders();
  if (!providers.google.enabled) {
    return Response.json({ detail: 'Google sign-in is not configured.' }, { status: 503 });
  }

  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') || '/');
  const desktopMode = request.nextUrl.searchParams.get('desktop') === '1';
  const backendStartUrl = `${CONTROL_PLANE_AUTH_URL}/auth/google`;
  return await issuePendingControlPlaneOauthRedirect(request, backendStartUrl, returnTo, { desktopMode });
}
