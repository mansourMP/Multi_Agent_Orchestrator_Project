import 'server-only';

import { headers } from 'next/headers';

import {
  type WorkspaceBootstrapPayload,
  parseWorkspaceBootstrapPayload,
} from '@/lib/workspace/workspace-bootstrap';

function controlPlaneBaseUrl(): string {
  const rawValue =
    process.env.EMPYRALIS_API_URL
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? process.env.NEXT_PUBLIC_ORION_API_URL
    ?? process.env.EMPYRALIS_PUBLIC_URL
    ?? 'http://127.0.0.1:8000';

  return rawValue.replace(/\/+$/, '');
}

export async function loadWorkspaceBootstrap(workspaceId: string): Promise<WorkspaceBootstrapPayload> {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get('cookie');
  const authorizationHeader = requestHeaders.get('authorization');
  const forwardedHost = requestHeaders.get('host');
  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const url = `${controlPlaneBaseUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(authorizationHeader ? { authorization: authorizationHeader } : {}),
      ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
      ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Workspace bootstrap request failed for ${workspaceId} with status ${response.status}.`);
  }

  const payload = await response.json();
  return parseWorkspaceBootstrapPayload(payload);
}
