'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAccountShell } from '@/lib/shell/account-shell-context';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';

export function WorkspaceHomeRedirect({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const router = useRouter();
  const { actions, state } = useAccountShell();
  const {
    boundaryKey,
    routeManifest,
    shellProfileId,
    shellProfile,
    canAccessRoute,
  } = useWorkspaceBoundary();
  const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
  const rememberedRouteId = resolveRouteIdFromHref(workspaceId, rememberedRoute);
  const nextRoute =
    (rememberedRouteId && canAccessRoute(rememberedRouteId) ? rememberedRoute : null)
    ?? routeManifest.defaultRoute;

  useEffect(() => {
    router.replace(nextRoute);
  }, [nextRoute, router]);

  return (
    <WorkspaceScopeRedirectMessage
      boundaryKey={boundaryKey}
      workspaceId={workspaceId}
      nextRoute={nextRoute}
      defaultRoute={routeManifest.defaultRoute}
      rememberedRoute={rememberedRoute}
      rememberedRouteId={rememberedRouteId}
      routeAllowed={rememberedRouteId ? canAccessRoute(rememberedRouteId) : false}
      shellProfileLabel={shellProfile.label}
      shellProfileId={shellProfileId}
      routeWorkspaceId={state.selectedWorkspaceId}
    />
  );
}

function WorkspaceScopeRedirectMessage({
  boundaryKey,
  defaultRoute,
  rememberedRoute,
  rememberedRouteId,
  routeAllowed,
  shellProfileLabel,
  workspaceId,
  nextRoute,
  shellProfileId,
  routeWorkspaceId,
}: {
  boundaryKey: string;
  defaultRoute: string;
  rememberedRoute: string | null;
  rememberedRouteId: string | null;
  routeAllowed: boolean;
  shellProfileLabel: string;
  workspaceId: string;
  nextRoute: string;
  shellProfileId: string;
  routeWorkspaceId: string | null;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Workspace Redirect</h1>
      <p style={{ margin: 0, maxWidth: '48rem', lineHeight: 1.6 }}>
        Resolving the safe route for workspace <code>{workspaceId}</code>.
      </p>
      <p style={{ margin: 0 }}>
        Next route: <code>{nextRoute}</code>
      </p>
      <p style={{ margin: 0 }}>
        Boundary key: <code>{boundaryKey}</code>
      </p>
      <p style={{ margin: 0 }}>
        Shell profile: <code>{shellProfileId}</code>
      </p>
      <p style={{ margin: 0 }}>
        Shell label: <code>{shellProfileLabel}</code>
      </p>
      <p style={{ margin: 0 }}>
        Default route: <code>{defaultRoute}</code>
      </p>
      <p style={{ margin: 0 }}>
        Remembered route: <code>{rememberedRoute ?? 'null'}</code>
      </p>
      <p style={{ margin: 0 }}>
        Remembered route id: <code>{rememberedRouteId ?? 'null'}</code>
      </p>
      <p style={{ margin: 0 }}>
        Remembered route allowed: <code>{String(routeAllowed)}</code>
      </p>
      <p style={{ margin: 0 }}>
        Route workspace id: <code>{routeWorkspaceId ?? 'null'}</code>
      </p>
    </main>
  );
}
