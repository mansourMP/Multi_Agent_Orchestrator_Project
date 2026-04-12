'use client';

import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { WorkstationDiagnostics } from '@/lib/workspace/workstation-diagnostics';
import { WorkstationDesktopStatus } from '@/lib/workspace/workstation-desktop-status';
import { WorkstationRosterPane } from '@/lib/workspace/workstation-roster-pane';
import { WorkstationStagePane } from '@/lib/workspace/workstation-stage-pane';
import { useWorkstationKernel, useWorkstationStreamState } from '@/lib/workspace/workspace-services';

type WorkstationShellLayoutState = {
  rosterWidth: number;
  stageWidth: number;
};

const WORKSTATION_SHELL_LAYOUT_KEY = 'layout:workstation-shell:v1';
const DEFAULT_LAYOUT: WorkstationShellLayoutState = {
  rosterWidth: 280,
  stageWidth: 340,
};

function clampWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(width)));
}

function normalizeLayoutState(
  value: Partial<WorkstationShellLayoutState> | null | undefined,
): WorkstationShellLayoutState {
  return {
    rosterWidth: clampWidth(value?.rosterWidth ?? DEFAULT_LAYOUT.rosterWidth, 220, 420),
    stageWidth: clampWidth(value?.stageWidth ?? DEFAULT_LAYOUT.stageWidth, 260, 520),
  };
}

function WorkstationPane({
  paneId,
  title,
  subtitle,
  controls,
  children,
}: PropsWithChildren<{
  paneId: '2' | '3' | '4';
  title: string;
  subtitle: string;
  controls?: ReactNode;
}>) {
  return (
    <section
      data-workstation-pane={paneId}
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        borderRadius: '1.25rem',
        border: '1px solid rgba(148, 163, 184, 0.45)',
        background: 'rgba(255, 255, 255, 0.88)',
        boxShadow: '0 24px 50px rgba(15, 23, 42, 0.08)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '1rem',
          padding: '1rem 1.1rem',
          borderBottom: '1px solid rgba(226, 232, 240, 0.95)',
          background: 'rgba(248, 250, 252, 0.95)',
        }}
      >
        <div style={{ display: 'grid', gap: '0.2rem' }}>
          <strong style={{ color: '#0f172a' }}>{title}</strong>
          <span style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.5 }}>
            {subtitle}
          </span>
        </div>
        {controls}
      </header>

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function WorkstationKernelShell({
  children,
}: PropsWithChildren) {
  const kernel = useWorkstationKernel();
  const streamState = useWorkstationStreamState();
  const [layout, setLayout] = useState<WorkstationShellLayoutState>(() =>
    normalizeLayoutState(
      kernel.persistence.getJson<WorkstationShellLayoutState>(WORKSTATION_SHELL_LAYOUT_KEY),
    ),
  );

  useEffect(() => {
    kernel.persistence.setJson(WORKSTATION_SHELL_LAYOUT_KEY, layout);
  }, [kernel, layout]);

  return (
    <div
      data-workstation-shell="kernel"
      style={{
        minWidth: 0,
        minHeight: 'calc(100vh - 2rem)',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: '1rem',
      }}
    >
      <WorkstationDesktopStatus />
      <WorkstationDiagnostics />

      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `${layout.rosterWidth}px minmax(0, 1fr) ${layout.stageWidth}px`,
          gap: '1rem',
        }}
      >
        <WorkstationPane
          paneId="2"
          title="Agent Roster"
          subtitle={`Kernel-scoped roster sourced from bootstrap and canonical workstation truth. ${streamState.notifications.unreadCount} live notifications.`}
          controls={(
            <label style={{ display: 'grid', gap: '0.2rem', minWidth: '8rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                Width
              </span>
              <input
                type="range"
                min={220}
                max={420}
                step={10}
                value={layout.rosterWidth}
                aria-label="Resize roster pane"
                onChange={(event) => {
                  const nextWidth = Number(event.currentTarget.value);
                  setLayout((current) => ({
                    ...current,
                    rosterWidth: clampWidth(nextWidth, 220, 420),
                  }));
                }}
              />
            </label>
          )}
        >
          <WorkstationRosterPane />
        </WorkstationPane>

        <WorkstationPane
          paneId="3"
          title="Chat / Surface"
          subtitle={`Route content mounts here inside the kernel shell. ${streamState.activity.totalCount} recent activity events live.`}
        >
          {children}
        </WorkstationPane>

        <WorkstationPane
          paneId="4"
          title="Dynamic Stage"
          subtitle={`Route-safe and kernel-scoped stage detail rebuilt from canonical data. Streams ${streamState.notifications.connectionState}/${streamState.activity.connectionState}.`}
          controls={(
            <label style={{ display: 'grid', gap: '0.2rem', minWidth: '8rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>
                Width
              </span>
              <input
                type="range"
                min={260}
                max={520}
                step={10}
                value={layout.stageWidth}
                aria-label="Resize stage pane"
                onChange={(event) => {
                  const nextWidth = Number(event.currentTarget.value);
                  setLayout((current) => ({
                    ...current,
                    stageWidth: clampWidth(nextWidth, 260, 520),
                  }));
                }}
              />
            </label>
          )}
        >
          <WorkstationStagePane />
        </WorkstationPane>
      </div>
    </div>
  );
}
