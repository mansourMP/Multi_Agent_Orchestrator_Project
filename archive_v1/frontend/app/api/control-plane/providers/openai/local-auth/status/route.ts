import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { readOpenAiLocalAuth, openAiLocalAuthFilePath, DEFAULT_OPENAI_BROWSER_SIGN_IN_URL } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const snapshot = await readOpenAiLocalAuth();
  const authFilePath = snapshot?.authFilePath || openAiLocalAuthFilePath();
  const hasAccessToken = Boolean(snapshot?.accessToken);
  const hasApiKey = Boolean(snapshot?.openaiApiKey);
  const available = hasAccessToken;

  return Response.json({
    available,
    importable: hasAccessToken,
    auth_file_exists: Boolean(snapshot),
    auth_file_path: authFilePath,
    auth_mode: snapshot?.authMode || null,
    has_access_token: hasAccessToken,
    has_api_key: hasApiKey,
    sign_in_url: DEFAULT_OPENAI_BROWSER_SIGN_IN_URL,
    detail: available
      ? hasAccessToken
        ? 'A local OpenAI / Codex session was found on this Mac. You can import it into Empyralis without pasting a token.'
        : 'A local OpenAI API key was found on this Mac.'
      : hasApiKey
        ? 'A local OpenAI API key was found on this Mac, but there is no importable Codex session yet.'
        : 'No local OpenAI / Codex session was found yet. Sign in with ChatGPT or Codex in your browser first, then return here.',
  });
}
