import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

function resolveGithubInstallUrl(): string {
  const explicit = String(
    process.env.GITHUB_APP_INSTALL_URL
      || process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL
      || '',
  ).trim();
  if (explicit) return explicit;
  const slug = String(
    process.env.GITHUB_APP_SLUG
      || process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
      || '',
  ).trim();
  if (!slug) return '';
  return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const installUrl = resolveGithubInstallUrl();
  if (!installUrl) {
    return Response.json({ detail: 'GitHub App install URL is not configured.' }, { status: 503 });
  }

  return NextResponse.redirect(installUrl);
}
