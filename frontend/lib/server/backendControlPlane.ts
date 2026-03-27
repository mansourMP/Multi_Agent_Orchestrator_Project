import { API_BASE } from '@/lib/config';
import { readServerRuntimeKey } from '@/lib/server/runtimeControlPlane';

export async function backendAuthorizedFetch(
  backendPath: string,
  init?: RequestInit,
): Promise<Response> {
  const runtimeKey = await readServerRuntimeKey();
  const headers = new Headers(init?.headers || {});
  headers.set('X-API-Key', runtimeKey);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`${API_BASE}${backendPath}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function backendJsonRequest(
  backendPath: string,
  init?: RequestInit,
): Promise<{ status: number; payload: unknown }> {
  const response = await backendAuthorizedFetch(backendPath, init);

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

export async function backendProxyResponse(
  backendPath: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await backendAuthorizedFetch(backendPath, init);
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers,
  });
}
