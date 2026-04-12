'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';

export function WorkstationDiagnostics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { kernelKey, routeManifest, shellProfile, workspaceId } = useWorkspaceBoundary();
  const kernel = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const desktop = useWorkstationDesktopBridge();

  return (
    <details
      data-workstation-diagnostics="surface"
      style={{
        borderRadius: '1rem',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(255, 255, 255, 0.78)',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '0.9rem 1rem',
          color: '#0f172a',
          fontWeight: 700,
        }}
      >
        Workstation diagnostics
      </summary>
      <pre
        style={{
          margin: 0,
          padding: '0 1rem 1rem',
          overflow: 'auto',
          color: '#334155',
          fontSize: '0.78rem',
          lineHeight: 1.45,
        }}
      >
        {JSON.stringify(
          {
            workspaceId,
            kernelKey,
            shellProfileId: shellProfile.id,
            defaultRoute: routeManifest.defaultRoute,
            activePath: pathname,
            activeSearch: searchParams.toString(),
            desktop: {
              available: desktop.available,
              platform: desktop.platform,
              localCompanion: desktop.localCompanion,
            },
            kernel: kernel.snapshot(),
            streams: streamState,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}
