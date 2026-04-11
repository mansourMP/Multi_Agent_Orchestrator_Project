import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, {
    methods: ['GET'],
    requireLoopbackHost: true,
  });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  try {
    const filePath = path.resolve(process.cwd(), '..', 'WORK_LOG_SUMMARY.md');
    const content = await fs.readFile(filePath, 'utf8');
    return new Response(content, {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  } catch (err) {
    return new Response('Work log not found.', { status: 404 });
  }
}
