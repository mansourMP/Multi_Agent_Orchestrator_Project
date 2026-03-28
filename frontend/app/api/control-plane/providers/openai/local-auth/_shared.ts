import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export const DEFAULT_OPENAI_BROWSER_SIGN_IN_URL = 'https://chatgpt.com/auth/login';
const DEFAULT_IMPORTED_LABEL = 'OpenAI / Codex on this Mac';

type CodexAuthSnapshot = {
  authMode: string;
  accessToken: string;
  openaiApiKey: string;
  authFilePath: string;
};

export function openAiLocalAuthFilePath(): string {
  const override = String(process.env.CODEX_AUTH_FILE || '').trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), '.codex', 'auth.json');
}

export async function readOpenAiLocalAuth(): Promise<CodexAuthSnapshot | null> {
  const target = openAiLocalAuthFilePath();
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return null;
    const tokens = parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens as Record<string, unknown> : {};
    const accessToken = sanitizeToken(tokens.access_token);
    const openaiApiKey = sanitizeToken((parsed as Record<string, unknown>).OPENAI_API_KEY);
    const authMode = String((parsed as Record<string, unknown>).auth_mode || '').trim().toLowerCase();
    return {
      authMode,
      accessToken,
      openaiApiKey,
      authFilePath: target,
    };
  } catch {
    return null;
  }
}

export function sanitizeToken(value: unknown): string {
  const token = String(value || '').trim();
  if (token.toLowerCase().startsWith('bearer ')) {
    return token.slice(7).trim();
  }
  return token;
}

export function importedOpenAiCredentialLabel(): string {
  return DEFAULT_IMPORTED_LABEL;
}

export function importedOpenAiCredentialMetadata() {
  return {
    auth_mode: 'oauth_token',
    import_source: 'codex_auth_file',
    source_label: 'OpenAI / Codex on this Mac',
  };
}
