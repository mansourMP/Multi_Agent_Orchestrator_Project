import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  clearPendingControlPlaneOauth,
  issueDesktopControlPlaneAuthHandoff,
  issueAdminBrowserIdentityResponse,
  readPendingControlPlaneOauth,
} from '@/lib/server/controlPlaneSession';
import { buildDesktopSignInCompletionPath, buildSignInErrorPath } from '@/lib/server/controlPlaneAuthRouting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get('token') || '').trim();
  const state = String(request.nextUrl.searchParams.get('state') || '').trim();
  const pending = await readPendingControlPlaneOauth(request, state);

  if (!pending || !state || pending.state !== state) {
    const response = NextResponse.redirect(new URL(buildSignInErrorPath('oauth_state'), request.nextUrl.origin));
    await clearPendingControlPlaneOauth(response, request, state);
    return response;
  }

  if (!token) {
    const failure = NextResponse.redirect(
      new URL(buildSignInErrorPath('oauth_missing_token', pending.returnTo), request.nextUrl.origin),
    );
    await clearPendingControlPlaneOauth(failure, request, state);
    return failure;
  }

  let response: Response | NextResponse;
  if (pending.desktopMode) {
    const handoffFailure = await issueDesktopControlPlaneAuthHandoff(token, pending.returnTo);
    if (handoffFailure) {
      return handoffFailure;
    }
    response = await issueAdminBrowserIdentityResponse(
      request,
      token,
      buildDesktopSignInCompletionPath(pending.returnTo),
    );
  } else {
    response = await issueAdminBrowserIdentityResponse(request, token, pending.returnTo);
  }
  if (!(response instanceof NextResponse)) {
    return response;
  }

  const next = response;
  await clearPendingControlPlaneOauth(next, request, state);
  return next;
}
