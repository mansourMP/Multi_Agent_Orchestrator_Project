import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_REQUEST_TIMEOUT_MS } from '@/lib/auth/auth-timeouts';
import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';
import {
  decodeGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
  googleOAuthClientId,
  googleOAuthClientSecret,
  googleOAuthConfigured,
  googleOAuthRedirectUri,
  isAllowedAuthOrigin,
  requestOrigin,
  splitCombinedSetCookieHeader,
} from '@/lib/server/google-oauth';

export const dynamic = 'force-dynamic';

type GoogleTokenPayload = {
  id_token?: string;
  error?: string;
  error_description?: string;
};

function logGoogleAuthFailure(message: string, metadata: Record<string, unknown> = {}): void {
  console.error('[auth/google/callback]', message, metadata);
}

function redirectWithError(request: NextRequest, error: string): NextResponse {
  const url = new URL('/login', requestOrigin(request));
  url.searchParams.set('error', error);
  const response = NextResponse.redirect(url);
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

function appendUpstreamCookies(target: NextResponse, sourceHeaders: Headers): void {
  const headersWithCookies = sourceHeaders as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieValues =
    typeof headersWithCookies.getSetCookie === 'function'
      ? headersWithCookies.getSetCookie()
      : splitCombinedSetCookieHeader(sourceHeaders.get('set-cookie') || '');
  for (const cookie of setCookieValues) {
    target.headers.append('set-cookie', cookie);
  }
}

function backendGoogleAuthErrorCode(status: number, detail: string): string {
  const normalized = detail.toLowerCase();
  if (status === 429) {
    return 'google_rate_limited';
  }
  if (
    normalized.includes('authentication is not configured')
    || normalized.includes('audience')
    || normalized.includes('unsupported authentication provider')
  ) {
    return 'google_runtime_not_configured';
  }
  return 'google_auth_failed';
}

async function exchangeGoogleCodeForIdToken(request: NextRequest, code: string): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: googleOAuthClientId(),
        client_secret: googleOAuthClientSecret(),
        redirect_uri: googleOAuthRedirectUri(request),
        grant_type: 'authorization_code',
      }),
    });
    const payload = await tokenResponse.json().catch(() => null) as GoogleTokenPayload | null;
    if (!tokenResponse.ok || !payload?.id_token) {
      throw new Error(payload?.error_description || payload?.error || 'Google token exchange failed.');
    }
    return payload.id_token;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function loginWithGoogleIdentityToken(
  request: NextRequest,
  idToken: string,
  acquisitionToken?: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${controlPlaneBaseUrl()}/api/v1/auth/provider-login`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-forwarded-host': request.headers.get('host') || new URL(requestOrigin(request)).host,
        'x-forwarded-proto': request.nextUrl.protocol.replace(':', '') || 'https',
      },
      body: JSON.stringify({
        provider: 'google',
        identity_token: idToken,
        channel: 'web',
        acquisition_token: acquisitionToken || undefined,
      }),
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function GET(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return redirectWithError(request, 'google_origin_not_allowed');
  }
  if (!googleOAuthConfigured()) {
    return redirectWithError(request, 'google_not_configured');
  }

  const code = String(request.nextUrl.searchParams.get('code') || '').trim();
  const state = String(request.nextUrl.searchParams.get('state') || '').trim();
  const cookieState = decodeGoogleOAuthState(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value);
  const stateAgeMs = Date.now() - Number(cookieState?.createdAt || 0);
  if (!code || !state || !cookieState || cookieState.state !== state || stateAgeMs > GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS * 1000) {
    return redirectWithError(request, 'google_state_invalid');
  }

  try {
    const idToken = await exchangeGoogleCodeForIdToken(request, code);
    const upstream = await loginWithGoogleIdentityToken(request, idToken, cookieState.acquisitionToken);
    if (!upstream.ok) {
      const upstreamText = await upstream.text().catch(() => '');
      logGoogleAuthFailure('Backend provider login failed.', {
        status: upstream.status,
        detail: upstreamText.slice(0, 300),
      });
      return redirectWithError(request, backendGoogleAuthErrorCode(upstream.status, upstreamText));
    }
    const completionUrl = new URL('/auth/complete', requestOrigin(request));
    completionUrl.searchParams.set('provider', 'google');
    completionUrl.searchParams.set('next', '/');
    const response = NextResponse.redirect(completionUrl);
    // Delete state cookie BEFORE appending auth cookies to avoid
    // Next.js cookies.delete() overwriting set-cookie headers.
    response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    appendUpstreamCookies(response, upstream.headers);
    return response;
  } catch (error) {
    logGoogleAuthFailure('Google OAuth callback failed.', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return redirectWithError(request, 'google_auth_failed');
  }
}
