import { promises as fs } from 'fs';
import path from 'path';
import { API_BASE } from '@/lib/config';

const RUNTIME_API_BASE =
  process.env.ORION_API_URL || process.env.NEXT_PUBLIC_ORION_API_URL || API_BASE;

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveProjectRoot(): Promise<string> {
  const cwd = process.cwd();
  const direct = path.join(cwd, 'scripts', 'start_orion_local_stack.sh');
  if (await fileExists(direct)) return cwd;

  const parent = path.resolve(cwd, '..');
  const parentDirect = path.join(parent, 'scripts', 'start_orion_local_stack.sh');
  if (await fileExists(parentDirect)) return parent;

  throw new Error('Could not resolve project root.');
}

export async function readServerRuntimeKey(): Promise<string> {
  const envKey = String(process.env.ORION_API_KEY || '').trim();
  if (envKey) return envKey;

  const root = await resolveProjectRoot();
  const keyPath = path.join(root, '.orion-stack', 'runtime_key');
  const raw = await fs.readFile(keyPath, 'utf8');
  const normalized = String(raw || '').replace(/\s+/g, '');
  if (!normalized) throw new Error('Runtime key is unavailable.');
  return normalized;
}

export async function runtimeAuthorizedFetch(
  runtimePath: string,
  init?: RequestInit,
): Promise<Response> {
  const runtimeKey = await readServerRuntimeKey();
  const headers = new Headers(init?.headers || {});
  headers.set('X-API-Key', runtimeKey);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`${RUNTIME_API_BASE}${runtimePath}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function runtimeJsonRequest(
  runtimePath: string,
  init?: RequestInit,
): Promise<{ status: number; payload: unknown }> {
  const response = await runtimeAuthorizedFetch(runtimePath, init);

  const raw = await response.text().catch(() => '');
  let payload: unknown = raw || {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = raw || {};
  }

  return {
    status: response.status,
    payload,
  };
}

export async function runtimeProxyResponse(
  runtimePath: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await runtimeAuthorizedFetch(runtimePath, init);
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers,
  });
}
