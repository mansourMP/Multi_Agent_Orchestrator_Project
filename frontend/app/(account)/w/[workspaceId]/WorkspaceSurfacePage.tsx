'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationActivityPane } from '@/lib/workspace/workstation-activity-pane';
import { WorkstationApprovalsPane } from '@/lib/workspace/workstation-approvals-pane';
import { WorkstationArtifactsPane } from '@/lib/workspace/workstation-artifacts-pane';
import { WorkstationChatPane } from '@/lib/workspace/workstation-chat-pane';
import { WorkstationDeployedAgentsPane } from '@/lib/workspace/workstation-deployed-agents-pane';
import { WorkstationSageWorkCenterPane } from '@/lib/workspace/workstation-sage-heartbeat-pane';
import { MarketplacePane } from '@/lib/marketplace/marketplace-pane';
import { WorkstationNotificationsPane } from '@/lib/workspace/workstation-notifications-pane';
import { WorkstationRunsPane } from '@/lib/workspace/workstation-runs-pane';
import { WorkstationSageConnectorsPane } from '@/lib/workspace/workstation-sage-connectors-pane';
import { WorkstationSageProfilePane } from '@/lib/workspace/workstation-sage-profile-pane';
import { WorkstationSettingsPane } from '@/lib/workspace/workstation-settings-pane';
import { WorkstationStudioIntegrationsPane } from '@/lib/workspace/workstation-studio-integrations-pane';
import { WorkstationInvestorDemoPane } from '@/lib/workspace/workstation-investor-demo-pane';
import { WorkstationGatewayOperatorPane } from '@/lib/workspace/workstation-gateway-operator-pane';
import { WorkstationSurfaceViewport } from '@/lib/workspace/workstation-shell-frame';
import { resolveRouteIdFromHref, type WorkspaceRouteId } from '@/lib/workspace/workspace-shell';
import {
  getWorkspaceNavRouteDefinition,
  type WorkspaceNavDestinationId,
} from '../../../../../shared/nav-manifest';

type SurfaceRenderer = () => ReactNode;

type SurfaceRouteRenderer = {
  destinationId: WorkspaceNavDestinationId;
  render: SurfaceRenderer;
};

const WORKSPACE_SURFACE_RENDERERS: Record<WorkspaceRouteId, SurfaceRouteRenderer> = {
  chat: {
    destinationId: 'sage',
    render: () => <WorkstationChatPane />,
  },
  memory: {
    destinationId: 'sage',
    render: () => <WorkstationActivityPane />,
  },
  profile: {
    destinationId: 'sage',
    render: () => <WorkstationSageProfilePane />,
  },
  approvals: {
    destinationId: 'sage',
    render: () => <WorkstationApprovalsPane />,
  },
  artifacts: {
    destinationId: 'sage',
    render: () => <WorkstationArtifactsPane />,
  },
  notifications: {
    destinationId: 'sage',
    render: () => <WorkstationNotificationsPane />,
  },
  activity: {
    destinationId: 'sage',
    render: () => <WorkstationRunsPane />,
  },
  heartbeat: {
    destinationId: 'sage',
    render: () => <WorkstationSageWorkCenterPane />,
  },
  skills: {
    destinationId: 'sage',
    render: () => <WorkstationSageConnectorsPane />,
  },
  integrations: {
    destinationId: 'sage',
    render: () => <WorkstationSageConnectorsPane />,
  },
  studioIntegrations: {
    destinationId: 'studio',
    render: () => <WorkstationStudioIntegrationsPane />,
  },
  studio: {
    destinationId: 'studio',
    render: () => <WorkstationDeployedAgentsPane initialSubview="agents" />,
  },
  gateway: {
    destinationId: 'gateway',
    render: () => <WorkstationGatewayOperatorPane />,
  },
  channels: {
    destinationId: 'sage',
    render: () => <WorkstationSageConnectorsPane showProviders={false} showTools={false} />,
  },
  inbox: {
    destinationId: 'studio',
    render: () => <WorkstationDeployedAgentsPane initialSubview="inbox" />,
  },
  deploy: {
    destinationId: 'studio',
    render: () => <WorkstationDeployedAgentsPane initialSubview="deploy" />,
  },
  marketplace: {
    destinationId: 'marketplace',
    render: () => <MarketplacePane />,
  },
  gatewayApprovals: {
    destinationId: 'gateway',
    render: () => <WorkstationGatewayOperatorPane initialSection="approvals" />,
  },
  gatewayActivity: {
    destinationId: 'gateway',
    render: () => <WorkstationGatewayOperatorPane initialSection="activity" />,
  },
  settings: {
    destinationId: 'settings',
    render: () => <WorkstationSettingsPane />,
  },
  demo: {
    destinationId: 'studio',
    render: () => <WorkstationInvestorDemoPane />,
  },
};

export function WorkspaceSurfacePage({
  workspaceId,
  surface,
}: {
  workspaceId: string;
  surface: WorkspaceRouteId;
}) {
  const router = useRouter();
  const { routeManifest } = useWorkspaceBoundary();
  const route = routeManifest.routeIndex[surface];
  const redirectHref = routeManifest.defaultRoute || `/w/${encodeURIComponent(workspaceId)}/sage`;
  const routeDefinition = getWorkspaceNavRouteDefinition(surface);
  const routeRenderer = WORKSPACE_SURFACE_RENDERERS[surface];
  const renderSurface = routeRenderer?.render;
  const routeMatchesDestination = routeRenderer?.destinationId === routeDefinition.destinationId;
  const fallbackRouteId = resolveRouteIdFromHref(workspaceId, redirectHref) ?? 'chat';
  const fallbackRenderer = WORKSPACE_SURFACE_RENDERERS[fallbackRouteId]?.render;
  const hasValidSurface = Boolean(route && routeMatchesDestination);

  useEffect(() => {
    if (!hasValidSurface) {
      router.replace(redirectHref);
    }
  }, [hasValidSurface, redirectHref, router]);

  if (!hasValidSurface) {
    return (
      <WorkstationSurfaceViewport surface={fallbackRouteId}>
        {fallbackRenderer()}
      </WorkstationSurfaceViewport>
    );
  }

  return (
    <WorkstationSurfaceViewport surface={surface}>
      {renderSurface()}
    </WorkstationSurfaceViewport>
  );
}
