import 'server-only';

import { headers } from 'next/headers';

import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';
import {
  type WorkspaceBootstrapPayload,
  parseWorkspaceBootstrapPayload,
} from '@/lib/workspace/workspace-bootstrap';

export async function loadWorkspaceBootstrap(workspaceId: string): Promise<WorkspaceBootstrapPayload> {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get('cookie');
  const authorizationHeader = requestHeaders.get('authorization');
  const forwardedHost = requestHeaders.get('host');
  const forwardedProto = requestHeaders.get('x-forwarded-proto');
  const url = `${controlPlaneBaseUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`;

  const response = await fetch(url, {
    method: 'GET',
    next: { revalidate: 30 },
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
