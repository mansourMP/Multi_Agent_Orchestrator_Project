'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { WorkspaceChannelOperationsConsole } from '@/lib/workspace/workspace-channel-operations-console';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { isWorkspaceRouteHiddenFromNavigation } from '@/lib/workspace/workspace-shell';
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
  const router = useRouter();
  const { routeManifest } = useWorkspaceBoundary();
  const route = routeManifest.routeIndex[surface];
  const redirectHref = routeManifest.defaultRoute || `/w/${encodeURIComponent(workspaceId)}/workstation`;
  const hiddenSurface = isWorkspaceRouteHiddenFromNavigation(surface);

  useEffect(() => {
    if (!route || hiddenSurface) {
      router.replace(redirectHref);
    }
  }, [hiddenSurface, redirectHref, route, router]);

  if (!route || hiddenSurface) {
    return null;
  }

  const renderedSurface = (() => {
    switch (surface) {
      case 'chat':
        return <WorkstationChatPane />;
      case 'workstation':
        return <WorkstationHomePane />;
      case 'runs':
        return <WorkstationRunsPane />;
      case 'approvals':
        return <WorkstationApprovalsPane />;
      case 'artifacts':
        return <WorkstationArtifactsPane />;
      case 'notifications':
        return <WorkstationNotificationsPane />;
      case 'applications':
        return <WorkstationApplicationsPane />;
      case 'agents':
        return <WorkstationAgentsPane />;
      case 'deployed-agents':
        return <WorkstationDeployedAgentsPane />;
      case 'activity':
        return <WorkstationActivityPane />;
      case 'settings':
        return <WorkstationSettingsPane />;
      case 'integrations':
        return <WorkspaceChannelPairingSurface featureId="integrations" />;
      case 'admin':
        return <WorkspaceChannelOperationsConsole />;
      case 'admin/platform':
        return <WorkstationPlatformAnalyticsPane />;
      case 'admin/billing':
        return <WorkstationBillingPane />;
      case 'admin/routing':
        return <WorkstationRoutingAdminPane />;
      case 'admin/members':
        return <WorkstationMembersAdminPane />;
      case 'admin/policies':
        return <WorkstationPoliciesAdminPane />;
      default:
        return null;
    }
  })();

  if (renderedSurface) {
    return (
      <WorkstationSurfaceViewport surface={surface}>
        {renderedSurface}
      </WorkstationSurfaceViewport>
    );
  }

  return (
    <WorkstationSurfaceViewport surface={surface}>
      <WorkstationRouteFallback
        surface={surface}
        shellProfileId={shellProfile.id}
        fallbackHref={redirectHref}
      />
    </WorkstationSurfaceViewport>
  );
}
