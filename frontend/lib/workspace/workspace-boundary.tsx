'use client';

import {
  type PropsWithChildren,
  createContext,
  useContext,
  useMemo,
} from 'react';

import {
  type WorkspaceBootstrapPayload,
  createWorkspaceBoundaryKey,
} from '@/lib/workspace/workspace-bootstrap';
import { WorkspaceServicesProvider } from '@/lib/workspace/workspace-services';

export type WorkspaceBoundaryState = {
  workspaceId: string;
  boundaryKey: string;
  shellProfileId: string;
  bootstrap: WorkspaceBootstrapPayload;
};

const WorkspaceBoundaryContext = createContext<WorkspaceBoundaryState | null>(null);

export function WorkspaceBoundary({
  workspaceId,
  bootstrap,
  children,
}: PropsWithChildren<{
  workspaceId: string;
  bootstrap: WorkspaceBootstrapPayload;
}>) {
  const boundaryKey = createWorkspaceBoundaryKey(workspaceId, bootstrap);
  const shellProfileId = bootstrap.shellHints.preferredProfile;

  return (
    <WorkspaceBoundaryInstance
      key={boundaryKey}
      workspaceId={workspaceId}
      boundaryKey={boundaryKey}
      shellProfileId={shellProfileId}
      bootstrap={bootstrap}
    >
      {children}
    </WorkspaceBoundaryInstance>
  );
}

function WorkspaceBoundaryInstance({
  workspaceId,
  boundaryKey,
  shellProfileId,
  bootstrap,
  children,
}: PropsWithChildren<WorkspaceBoundaryState>) {
  const value = useMemo<WorkspaceBoundaryState>(
    () => ({
      workspaceId,
      boundaryKey,
      shellProfileId,
      bootstrap,
    }),
    [bootstrap, boundaryKey, shellProfileId, workspaceId],
  );

  return (
    <WorkspaceBoundaryContext.Provider value={value}>
      <WorkspaceServicesProvider boundaryKey={boundaryKey} bootstrap={bootstrap}>
        <div
          data-workspace-boundary={boundaryKey}
          data-workspace-id={workspaceId}
          data-shell-profile={shellProfileId}
        >
          {children}
        </div>
      </WorkspaceServicesProvider>
    </WorkspaceBoundaryContext.Provider>
  );
}

export function useWorkspaceBoundary(): WorkspaceBoundaryState {
  const value = useContext(WorkspaceBoundaryContext);
  if (!value) {
    throw new Error('useWorkspaceBoundary must be used inside WorkspaceBoundary.');
  }
  return value;
}
