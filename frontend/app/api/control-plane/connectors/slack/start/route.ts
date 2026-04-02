import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  issuePendingControlPlaneOauthRedirect,
  requireControlPlaneSession,
  sanitizeReturnTo,
} from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

const DEFAULT_BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'chat:write',
  'files:write',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'im:write',
  'mpim:history',
  'reactions:read',
  'users:read',
];

const DEFAULT_USER_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'mpim:history',
  'reactions:read',
  'users:read',
];

function scopesFromEnv(raw: string, fallback: string[]): string[] {
  const values = (raw || '').replace(/\s+/g, ',').split(',').map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : fallback;
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const clientId = String(process.env.SLACK_CLIENT_ID || process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || '').trim();
  if (!clientId) {
    return Response.json({ detail: 'Slack OAuth is not configured.' }, { status: 503 });
  }

  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get('returnTo') || '/connectors?connector=slack');
  const callbackUrl = new URL('/api/control-plane/connectors/slack/callback', request.nextUrl.origin).toString();
  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set(
    'scope',
    scopesFromEnv(String(process.env.SLACK_BOT_SCOPES || ''), DEFAULT_BOT_SCOPES).join(','),
  );
  authorizeUrl.searchParams.set(
    'user_scope',
    scopesFromEnv(String(process.env.SLACK_USER_SCOPES || ''), DEFAULT_USER_SCOPES).join(','),
  );
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl);

  return await issuePendingControlPlaneOauthRedirect(request, authorizeUrl.toString(), returnTo);
}
