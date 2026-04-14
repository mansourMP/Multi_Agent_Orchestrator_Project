'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';

export function WorkstationDiagnostics({
  onClose,
}: {
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { kernelKey, routeManifest, shellProfile, workspaceId } = useWorkspaceBoundary();
  const kernel = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const desktop = useWorkstationDesktopBridge();

  return (
    <section data-workstation-diagnostics="surface" className="workstation-diagnostics">
      <div className="workstation-diagnostics__header">
        <div className="workstation-diagnostics__copy">
          <strong className="workstation-diagnostics__title">Diagnostics</strong>
          <span className="workstation-diagnostics__subtitle">Internal shell and stream state for debugging only.</span>
        </div>
        {onClose ? (
          <AppButton type="button" tone="ghost" onClick={onClose}>
            Hide diagnostics
          </AppButton>
        ) : null}
      </div>

      <pre className="workstation-diagnostics__dump">
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
    </section>
  );
}
