import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/config';

export const dynamic = 'force-dynamic';

type BuilderGenerateBody = {
  prompt?: string;
  model?: string;
  profile_id?: string;
  workspace_id?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as BuilderGenerateBody | null;
  const prompt = String(body?.prompt || '').trim();
  const model = String(body?.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authorization = request.headers.get('authorization');
  const xApiKey = request.headers.get('x-api-key');
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (xApiKey) {
    headers['X-API-Key'] = xApiKey;
  }

  const response = await fetch(`${API_BASE}/api/v1/builder/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      model,
      profile_id: body?.profile_id,
      workspace_id: body?.workspace_id,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        workflow?: unknown;
        detail?: string;
        error?: string;
      }
    | null;

  if (!response.ok) {
    const message =
      (payload && typeof payload.detail === 'string' && payload.detail) ||
      (payload && typeof payload.error === 'string' && payload.error) ||
      'Builder request failed.';
    return NextResponse.json(
      { error: message },
      { status: response.status || 500 },
    );
  }

  if (!payload || typeof payload.workflow !== 'object' || payload.workflow === null) {
    return NextResponse.json({ error: 'Builder returned an invalid workflow.' }, { status: 502 });
  }

  return NextResponse.json(payload.workflow);
}
