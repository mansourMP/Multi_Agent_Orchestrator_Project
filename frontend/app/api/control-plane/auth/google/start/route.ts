import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { fetchControlPlaneAuthProviders, issuePendingControlPlaneOauthRedirect, sanitizeReturnTo } from '@/lib/server/controlPlaneSession';
import { resolveControlPlaneAuthStartUrl } from '@/lib/server/controlPlaneAuthRouting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;

  const providers = await fetchControlPlaneAuthProviders();
  if (!providers.google.enabled) {
    return Response.json({ detail: 'Google sign-in is not configured.' }, { status: 503 });
  }

  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') || '/');
  const desktopMode = request.nextUrl.searchParams.get('desktop') === '1';
  const backendStartUrl = resolveControlPlaneAuthStartUrl('google');
  return await issuePendingControlPlaneOauthRedirect(request, backendStartUrl, returnTo, { desktopMode });
}
