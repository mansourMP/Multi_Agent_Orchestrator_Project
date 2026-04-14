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
    <section
      data-workstation-diagnostics="surface"
      style={{
        display: 'grid',
        gap: '0.8rem',
        padding: '0.95rem 1rem 1rem',
        borderRadius: '1rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel) 88%, var(--app-bg-overlay) 12%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.18rem' }}>
          <strong style={{ color: 'var(--app-text-primary)' }}>Diagnostics</strong>
          <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem' }}>
            Internal shell and stream state for debugging only.
          </span>
        </div>
        {onClose ? (
          <AppButton type="button" tone="ghost" onClick={onClose}>
            Hide diagnostics
          </AppButton>
        ) : null}
      </div>

      <pre
        style={{
          margin: 0,
          padding: '0.95rem',
          overflow: 'auto',
          borderRadius: '0.95rem',
          border: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-canvas) 88%, var(--app-bg-overlay) 12%)',
          color: 'var(--app-text-secondary)',
          fontSize: '0.78rem',
          lineHeight: 1.5,
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
    </section>
  );
}
