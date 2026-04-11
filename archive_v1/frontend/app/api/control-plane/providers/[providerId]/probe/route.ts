import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeProxyResponse } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ providerId: string }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const { providerId } = await params;
  const normalized = encodeURIComponent(String(providerId || '').trim());
  const search = new URLSearchParams();
  const workspaceId = String(request.nextUrl.searchParams.get('workspace_id') || '').trim();
  const credentialId = String(request.nextUrl.searchParams.get('credential_id') || '').trim();
  const profileId = String(request.nextUrl.searchParams.get('profile_id') || '').trim();
  if (workspaceId) search.set('workspace_id', workspaceId);
  if (credentialId) search.set('credential_id', credentialId);
  if (profileId) search.set('profile_id', profileId);

  try {
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return await runtimeProxyResponse(`/providers/${normalized}/probe${suffix}`, { method: 'POST' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider probe failed.';
    return Response.json({ detail: message }, { status: 503 });
  }
}
