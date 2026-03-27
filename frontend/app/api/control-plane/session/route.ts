import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import {
  getControlPlaneSession,
  getTrustedDesktopIdentity,
  requireAdminBrowserIdentity,
  issueControlPlaneSessionResponse,
} from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const existingSession = await getControlPlaneSession(request);
  if (existingSession) {
    return Response.json({
      ok: true,
      expires_in: 60 * 30,
      reused: true,
      auth_type: existingSession.authType,
    });
  }
  const trustedDesktopIdentity = getTrustedDesktopIdentity(request);
  if (trustedDesktopIdentity) {
    return issueControlPlaneSessionResponse(request, trustedDesktopIdentity);
  }
  const identity = await requireAdminBrowserIdentity(request);
  if (identity instanceof Response) return identity;
  return issueControlPlaneSessionResponse(request, identity);
}
