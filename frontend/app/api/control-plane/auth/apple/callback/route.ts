import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  clearPendingControlPlaneOauth,
  issueAdminBrowserIdentityResponse,
  readPendingControlPlaneOauth,
} from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get('token') || '').trim();
  const state = String(request.nextUrl.searchParams.get('state') || '').trim();
  const pending = readPendingControlPlaneOauth(request);

  if (!pending || !state || pending.state !== state) {
    const response = NextResponse.redirect(new URL('/sign-in?error=oauth_state', request.nextUrl.origin));
    clearPendingControlPlaneOauth(response, request);
    return response;
  }

  if (!token) {
    const failure = NextResponse.redirect(new URL(`/sign-in?error=oauth_missing_token&returnTo=${encodeURIComponent(pending.returnTo)}`, request.nextUrl.origin));
    clearPendingControlPlaneOauth(failure, request);
    return failure;
  }

  const response = await issueAdminBrowserIdentityResponse(request, token, pending.returnTo);
  if (!(response instanceof NextResponse)) {
    return response;
  }

  clearPendingControlPlaneOauth(response, request);
  return response;
}
