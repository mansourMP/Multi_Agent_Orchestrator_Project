import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  clearPendingControlPlaneOauth,
  readPendingControlPlaneOauth,
} from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = String(request.nextUrl.searchParams.get('code') || '').trim();
  const state = String(request.nextUrl.searchParams.get('state') || '').trim();
  const pending = await readPendingControlPlaneOauth(request, state);

  if (!pending || !state || pending.state !== state) {
    const response = NextResponse.redirect(new URL('/connectors?error=slack_oauth_state', request.nextUrl.origin));
    await clearPendingControlPlaneOauth(response, request, state);
    return response;
  }

  if (!code) {
    const failure = NextResponse.redirect(new URL(`${pending.returnTo}${pending.returnTo.includes('?') ? '&' : '?'}error=slack_oauth_code`, request.nextUrl.origin));
    await clearPendingControlPlaneOauth(failure, request, state);
    return failure;
  }

  const callbackUrl = new URL('/api/control-plane/connectors/slack/callback', request.nextUrl.origin).toString();
  const { status, payload } = await runtimeJsonRequest('/connectors/slack/oauth/callback', {
    method: 'POST',
    body: JSON.stringify({
      code,
      redirect_uri: callbackUrl,
      workspace_id: 'default',
      label: 'Slack',
    }),
  });

  const nextUrl = new URL(pending.returnTo, request.nextUrl.origin);
  if (status >= 400) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload ? String((payload as { detail?: unknown }).detail || '') : '';
    nextUrl.searchParams.set('error', detail ? `slack_${detail}` : 'slack_oauth_failed');
  } else {
    nextUrl.searchParams.set('slack', 'connected');
  }
  const response = NextResponse.redirect(nextUrl);
  await clearPendingControlPlaneOauth(response, request, state);
  return response;
}
