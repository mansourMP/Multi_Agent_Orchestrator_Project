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
import {
  buildRouteManifest,
  deriveShellProfile,
  hasWorkspaceCapability,
  type WorkspaceRouteId,
  type WorkspaceRouteManifest,
  type WorkspaceShellProfile,
} from '@/lib/workspace/workspace-shell';
import { WorkspaceServicesProvider } from '@/lib/workspace/workspace-services';

export type WorkspaceBoundaryState = {
  workspaceId: string;
  boundaryKey: string;
  shellProfileId: string;
  shellProfile: WorkspaceShellProfile;
  routeManifest: WorkspaceRouteManifest;
  bootstrap: WorkspaceBootstrapPayload;
  hasCapability: (capability: string) => boolean;
  canAccessRoute: (routeId: WorkspaceRouteId) => boolean;
};

type WorkspaceBoundaryInstanceProps = Omit<
  WorkspaceBoundaryState,
  'hasCapability' | 'canAccessRoute'
>;

const WorkspaceBoundaryContext = createContext<WorkspaceBoundaryState | null>(null);

export function WorkspaceBoundary({
  workspaceId,
  bootstrap,
  children,
}: PropsWithChildren<{
  workspaceId: string;
  bootstrap: WorkspaceBootstrapPayload;
}>) {
  const shellProfile = deriveShellProfile(bootstrap);
  const routeManifest = buildRouteManifest(shellProfile, bootstrap);
  const shellProfileId = shellProfile.id;
  const boundaryKey = createWorkspaceBoundaryKey(
    workspaceId,
    bootstrap.membership.version,
    shellProfileId,
  );

  return (
    <WorkspaceBoundaryInstance
      key={boundaryKey}
      workspaceId={workspaceId}
      boundaryKey={boundaryKey}
      shellProfileId={shellProfileId}
      shellProfile={shellProfile}
      routeManifest={routeManifest}
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
  shellProfile,
  routeManifest,
  bootstrap,
  children,
}: PropsWithChildren<WorkspaceBoundaryInstanceProps>) {
  const value = useMemo<WorkspaceBoundaryState>(
    () => ({
      workspaceId,
      boundaryKey,
      shellProfileId,
      shellProfile,
      routeManifest,
      bootstrap,
      hasCapability: (capability) => hasWorkspaceCapability(bootstrap, capability),
      canAccessRoute: (routeId) => Boolean(routeManifest.routeIndex[routeId]),
    }),
    [bootstrap, boundaryKey, routeManifest, shellProfile, shellProfileId, workspaceId],
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

export function useWorkspaceCapability(capability: string): boolean {
  return useWorkspaceBoundary().hasCapability(capability);
}

export function useWorkspaceRouteManifest(): WorkspaceRouteManifest {
  return useWorkspaceBoundary().routeManifest;
}
