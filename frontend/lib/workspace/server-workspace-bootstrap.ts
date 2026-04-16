import 'server-only';

import { headers } from 'next/headers';

import { controlPlaneBaseUrl } from '@/lib/server/control-plane-base-url';
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

const TRANSIENT_BOOTSTRAP_STATUSES = new Set([500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function loadWorkspaceBootstrap(workspaceId: string): Promise<WorkspaceBootstrapPayload> {
  const requestHeaders = await headers();
  const url = `${controlPlaneBaseUrl()}/api/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`;
  const forwardHeaders: Record<string, string> = {
    accept: 'application/json',
  };
  const cookie = requestHeaders.get('cookie');
  const authorization = requestHeaders.get('authorization');
  if (cookie) {
    forwardHeaders.cookie = cookie;
  }
  if (authorization) {
    forwardHeaders.authorization = authorization;
  }

  let lastStatus = 500;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: forwardHeaders,
      });

      if (response.ok) {
        const payload = await response.json();
        return parseWorkspaceBootstrapPayload(payload);
      }

      lastStatus = response.status;
      if (!TRANSIENT_BOOTSTRAP_STATUSES.has(response.status) || attempt === 2) {
        throw new WorkspaceBootstrapError(workspaceId, response.status);
      }
    } catch (error) {
      lastError = error;
      if (error instanceof WorkspaceBootstrapError && !TRANSIENT_BOOTSTRAP_STATUSES.has(error.status)) {
        throw error;
      }
      if (attempt === 2) {
        break;
      }
    }
    await delay(150 * (attempt + 1));
  }
  if (lastError instanceof WorkspaceBootstrapError) {
    throw lastError;
  }
  throw new WorkspaceBootstrapError(
    workspaceId,
    lastStatus,
    lastError instanceof Error ? lastError.message : undefined,
  );
}
