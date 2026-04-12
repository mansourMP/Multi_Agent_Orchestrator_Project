'use client';

import { WorkspaceChannelOperationsConsole } from '@/lib/workspace/workspace-channel-operations-console';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkspaceFeatureSurface } from '@/lib/workspace/workspace-feature-surface';
import {
  WorkstationRouteFallback,
  WorkstationSurfaceViewport,
} from '@/lib/workspace/workstation-shell-frame';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';

export function WorkspaceSurfacePage({
  workspaceId,
  surface,
}: {
  workspaceId: string;
  surface: WorkspaceRouteId;
}) {
  const { routeManifest, shellProfile } = useWorkspaceBoundary();
  const route = routeManifest.routeIndex[surface];

  if (!route) {
    return (
      <WorkstationRouteFallback
        surface={surface}
        shellProfileId={shellProfile.id}
        fallbackHref={routeManifest.defaultRoute}
      />
    );
  }

  if (surface === 'settings' || surface === 'integrations') {
    return (
      <WorkstationSurfaceViewport>
        <WorkspaceChannelPairingSurface featureId={surface} />
      </WorkstationSurfaceViewport>
    );
  }

  if (surface === 'admin') {
    return (
      <WorkstationSurfaceViewport>
        <WorkspaceChannelOperationsConsole />
      </WorkstationSurfaceViewport>
    );
  }

  return (
    <WorkstationSurfaceViewport>
      <WorkspaceFeatureSurface featureId={surface} />
    </WorkstationSurfaceViewport>
  );
}
