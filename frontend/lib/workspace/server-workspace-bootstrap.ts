import 'server-only';

import { headers } from 'next/headers';

import {
  type WorkspaceBootstrapPayload,
  parseWorkspaceBootstrapPayload,
} from '@/lib/workspace/workspace-bootstrap';

export class WorkspaceBootstrapError extends Error {
  status: number;
  workspaceId: string;

  constructor(workspaceId: string, status: number, message?: string) {
    super(
      message ?? `Workspace bootstrap request failed for ${workspaceId} with status ${status}.`,
    );
    this.name = 'WorkspaceBootstrapError';
    this.status = status;
    this.workspaceId = workspaceId;
  }
}

export async function loadWorkspaceBootstrap(workspaceId: string): Promise<WorkspaceBootstrapPayload> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  if (!host) {
    throw new WorkspaceBootstrapError(workspaceId, 500, 'Cannot resolve request host for workspace bootstrap.');
  }
  const origin = `${proto.split(',')[0].trim() || 'http'}://${host.split(',')[0].trim()}`;
  const url = `${origin}/api/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(requestHeaders.get('cookie') ? { cookie: requestHeaders.get('cookie') as string } : {}),
      ...(requestHeaders.get('authorization') ? { authorization: requestHeaders.get('authorization') as string } : {}),
    },
  });

  if (!response.ok) {
    throw new WorkspaceBootstrapError(workspaceId, response.status);
  }

  const payload = await response.json();
  return parseWorkspaceBootstrapPayload(payload);
}
