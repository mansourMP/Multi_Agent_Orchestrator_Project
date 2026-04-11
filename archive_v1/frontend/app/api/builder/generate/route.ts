import { NextRequest, NextResponse } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type BuilderGenerateBody = {
  prompt?: string;
  model?: string;
  profile_id?: string;
  workspace_id?: string;
};

export async function POST(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['POST'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const body = (await request.json().catch(() => null)) as BuilderGenerateBody | null;
  const prompt = String(body?.prompt || '').trim();
  const model = String(body?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
  }

  const { status, payload } = await runtimeJsonRequest('/api/v1/builder/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      model,
      profile_id: body?.profile_id,
      workspace_id: body?.workspace_id,
    }),
  });

  const normalizedPayload = payload as
    | {
        workflow?: unknown;
        detail?: string;
        error?: string;
      }
    | null;

  if (status < 200 || status >= 300) {
    const message =
      (normalizedPayload && typeof normalizedPayload.detail === 'string' && normalizedPayload.detail) ||
      (normalizedPayload && typeof normalizedPayload.error === 'string' && normalizedPayload.error) ||
      'Builder request failed.';
    return NextResponse.json(
      { error: message },
      { status: status || 500 },
    );
  }

  if (!normalizedPayload || typeof normalizedPayload.workflow !== 'object' || normalizedPayload.workflow === null) {
    return NextResponse.json({ error: 'Builder returned an invalid workflow.' }, { status: 502 });
  }

  return NextResponse.json(normalizedPayload.workflow);
}
