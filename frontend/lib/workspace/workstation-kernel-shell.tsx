'use client';

import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { SplitPane } from '@/lib/ui/split-pane';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import { WorkstationCommandBar } from '@/lib/workspace/workstation-command-bar';
import { WorkstationDiagnostics } from '@/lib/workspace/workstation-diagnostics';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkstationRosterPane } from '@/lib/workspace/workstation-roster-pane';
import { WorkstationStagePane } from '@/lib/workspace/workstation-stage-pane';
import { WorkstationTitlebar } from '@/lib/workspace/workstation-titlebar';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { resolveRouteIdFromHref } from '@/lib/workspace/workspace-shell';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';

type WorkstationShellLayoutState = {
  rosterWidth: number;
  stageWidth: number;
};

const WORKSTATION_SHELL_LAYOUT_KEY = 'layout:workstation-shell:v2';
const DEFAULT_LAYOUT: WorkstationShellLayoutState = {
  rosterWidth: 308,
  stageWidth: 364,
};

function clampWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(width)));
}

function normalizeLayoutState(
  value: Partial<WorkstationShellLayoutState> | null | undefined,
): WorkstationShellLayoutState {
  return {
    rosterWidth: clampWidth(value?.rosterWidth ?? DEFAULT_LAYOUT.rosterWidth, 256, 420),
    stageWidth: clampWidth(value?.stageWidth ?? DEFAULT_LAYOUT.stageWidth, 300, 520),
  };
}

function resolveRouteLabel(pathname: string, workspaceId: string, routeIndex: ReturnType<typeof useWorkspaceBoundary>['routeManifest']['routeIndex']) {
  const routeId = resolveRouteIdFromHref(workspaceId, pathname);
  return routeId ? routeIndex[routeId]?.label ?? 'Workspace' : 'Workspace';
}

function WorkstationPane({
  paneId,
  title,
  subtitle,
  children,
}: PropsWithChildren<{
  paneId: '2' | '3' | '4';
  title: string;
  subtitle: string;
}>) {
  return (
    <section data-workstation-pane={paneId} className="workstation-pane">
      <header className="workstation-pane__header">
        <strong className="workstation-pane__title">{title}</strong>
        <span className="workstation-pane__subtitle">{subtitle}</span>
      </header>

      <ScrollRegion>{children}</ScrollRegion>
    </section>
  );
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const pathname = usePathname();
  const kernel = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const { routeManifest, workspaceId } = useWorkspaceBoundary();
  const [layout, setLayout] = useState<WorkstationShellLayoutState>(() =>
    normalizeLayoutState(
      kernel.persistence.getJson<WorkstationShellLayoutState>(WORKSTATION_SHELL_LAYOUT_KEY),
    ),
  );
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    kernel.persistence.setJson(WORKSTATION_SHELL_LAYOUT_KEY, layout);
  }, [kernel, layout]);

  const currentRouteLabel = useMemo(
    () => resolveRouteLabel(pathname, workspaceId, routeManifest.routeIndex),
    [pathname, routeManifest.routeIndex, workspaceId],
  );

  const rosterSubtitle = `${streamState.notifications.unreadCount} unread notifications · ${streamState.activity.totalCount} recent events`;
  const surfaceSubtitle = `Current workspace surface · ${currentRouteLabel}`;
  const stageSubtitle = 'Focused detail, selection, and action context';

  return (
    <div data-workstation-shell="kernel" className="workstation-shell">
      <WorkstationTitlebar
        surfaceLabel={currentRouteLabel}
        diagnosticsVisible={showDiagnostics}
        onToggleDiagnostics={() => {
          setShowDiagnostics((current) => !current);
        }}
      />

      <WorkstationCommandBar />
      <WorkstationDesktopStatus />
      {showDiagnostics ? <WorkstationDiagnostics onClose={() => setShowDiagnostics(false)} /> : null}

      <SplitPane
        primary="first"
        size={layout.rosterWidth}
        minSize={256}
        maxSize={420}
        handleLabel="Resize workspace inventory"
        onSizeChange={(nextWidth) => {
          setLayout((current) => ({
            ...current,
            rosterWidth: clampWidth(nextWidth, 256, 420),
          }));
        }}
      >
        <WorkstationPane paneId="2" title="Workspace" subtitle={rosterSubtitle}>
          <WorkstationRosterPane />
        </WorkstationPane>

        <SplitPane
          primary="second"
          size={layout.stageWidth}
          minSize={300}
          maxSize={520}
          handleLabel="Resize inspector"
          onSizeChange={(nextWidth) => {
            setLayout((current) => ({
              ...current,
              stageWidth: clampWidth(nextWidth, 300, 520),
            }));
          }}
        >
          <WorkstationPane paneId="3" title={currentRouteLabel} subtitle={surfaceSubtitle}>
            {children}
          </WorkstationPane>

          <WorkstationPane paneId="4" title="Inspector" subtitle={stageSubtitle}>
            <WorkstationStagePane />
          </WorkstationPane>
        </SplitPane>
      </SplitPane>
    </div>
  );
}
