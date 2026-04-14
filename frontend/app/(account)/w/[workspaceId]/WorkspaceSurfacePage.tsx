'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { WorkspaceChannelOperationsConsole } from '@/lib/workspace/workspace-channel-operations-console';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { WorkstationActivityPane } from '@/lib/workspace/workstation-activity-pane';
import { WorkstationAgentsPane } from '@/lib/workspace/workstation-agents-pane';
import { WorkstationApplicationsPane } from '@/lib/workspace/workstation-applications-pane';
import { WorkstationApprovalsPane } from '@/lib/workspace/workstation-approvals-pane';
import { WorkstationArtifactsPane } from '@/lib/workspace/workstation-artifacts-pane';
import { WorkstationBillingPane } from '@/lib/workspace/workstation-billing-pane';
import { WorkstationChatPane } from '@/lib/workspace/workstation-chat-pane';
import { WorkstationDeployedAgentsPane } from '@/lib/workspace/workstation-deployed-agents-pane';
import { WorkstationHomePane } from '@/lib/workspace/workstation-home-pane';
import { WorkstationMembersAdminPane } from '@/lib/workspace/workstation-members-admin-pane';
import { WorkstationNotificationsPane } from '@/lib/workspace/workstation-notifications-pane';
import { WorkstationPlatformAnalyticsPane } from '@/lib/workspace/workstation-platform-analytics-pane';
import { WorkstationPoliciesAdminPane } from '@/lib/workspace/workstation-policies-admin-pane';
import { WorkstationRoutingAdminPane } from '@/lib/workspace/workstation-routing-admin-pane';
import { WorkstationRunsPane } from '@/lib/workspace/workstation-runs-pane';
import { WorkstationSettingsPane } from '@/lib/workspace/workstation-settings-pane';
import { WorkstationSurfaceViewport } from '@/lib/workspace/workstation-shell-frame';
import type { WorkspaceRouteId } from '@/lib/workspace/workspace-shell';
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
  workstation: {
    destinationId: 'home',
    render: () => <WorkstationHomePane />,
  },
  chat: {
    destinationId: 'chat',
    render: () => <WorkstationChatPane />,
  },
  runs: {
    destinationId: 'work',
    render: () => <WorkstationRunsPane />,
  },
  approvals: {
    destinationId: 'work',
    render: () => <WorkstationApprovalsPane />,
  },
  artifacts: {
    destinationId: 'work',
    render: () => <WorkstationArtifactsPane />,
  },
  notifications: {
    destinationId: 'work',
    render: () => <WorkstationNotificationsPane />,
  },
  activity: {
    destinationId: 'work',
    render: () => <WorkstationActivityPane />,
  },
  agents: {
    destinationId: 'build',
    render: () => <WorkstationAgentsPane />,
  },
  'deployed-agents': {
    destinationId: 'build',
    render: () => <WorkstationDeployedAgentsPane />,
  },
  applications: {
    destinationId: 'build',
    render: () => <WorkstationApplicationsPane />,
  },
  integrations: {
    destinationId: 'build',
    render: () => <WorkspaceChannelPairingSurface featureId="integrations" />,
  },
  settings: {
    destinationId: 'control',
    render: () => <WorkstationSettingsPane />,
  },
  admin: {
    destinationId: 'control',
    render: () => <WorkspaceChannelOperationsConsole />,
  },
  'admin/platform': {
    destinationId: 'control',
    render: () => <WorkstationPlatformAnalyticsPane />,
  },
  'admin/billing': {
    destinationId: 'control',
    render: () => <WorkstationBillingPane />,
  },
  'admin/routing': {
    destinationId: 'control',
    render: () => <WorkstationRoutingAdminPane />,
  },
  'admin/members': {
    destinationId: 'control',
    render: () => <WorkstationMembersAdminPane />,
  },
  'admin/policies': {
    destinationId: 'control',
    render: () => <WorkstationPoliciesAdminPane />,
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
  const redirectHref = routeManifest.defaultRoute || `/w/${encodeURIComponent(workspaceId)}/home`;
  const routeDefinition = getWorkspaceNavRouteDefinition(surface);
  const routeRenderer = WORKSPACE_SURFACE_RENDERERS[surface];
  const renderSurface = routeRenderer?.render;
  const routeMatchesDestination = routeRenderer?.destinationId === routeDefinition.destinationId;

  useEffect(() => {
    if (!route || !renderSurface || !routeMatchesDestination) {
      router.replace(redirectHref);
    }
  }, [redirectHref, renderSurface, route, routeMatchesDestination, router]);

  if (!route || !renderSurface || !routeMatchesDestination) {
    return null;
  }

  return (
    <WorkstationSurfaceViewport surface={surface}>
      {renderSurface()}
    </WorkstationSurfaceViewport>
  );
}
