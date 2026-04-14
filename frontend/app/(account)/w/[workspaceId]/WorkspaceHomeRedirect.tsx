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
  const { actions } = useAccountShell();
  const { routeManifest, canAccessRoute } = useWorkspaceBoundary();
  const rememberedRoute = actions.resolveWorkspaceHref(workspaceId);
  const rememberedRouteId = resolveRouteIdFromHref(workspaceId, rememberedRoute);
  const nextRoute =
    (rememberedRouteId && canAccessRoute(rememberedRouteId) ? rememberedRoute : null)
    ?? routeManifest.defaultRoute;

  useEffect(() => {
    router.replace(nextRoute);
  }, [nextRoute, router]);

  return (
    <WorkspaceScopeRedirectMessage workspaceId={workspaceId} nextRoute={nextRoute} />
  );
}

function WorkspaceScopeRedirectMessage({
  workspaceId,
  nextRoute,
}: {
  workspaceId: string;
  nextRoute: string;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '2.5rem',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ display: 'grid', gap: '0.45rem', textAlign: 'center', maxWidth: '32rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Opening workspace</h1>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
          Resolving the safe entry route for <code>{workspaceId}</code>.
        </p>
        <p style={{ margin: 0, color: '#64748b' }}>
          Next route: <code>{nextRoute}</code>
        </p>
      </div>
    </main>
  );
}
