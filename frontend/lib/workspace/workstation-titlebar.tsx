'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { DesktopWindowControls } from '@/lib/workspace/desktop-window-controls';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

export function WorkstationTitlebar({
  surfaceLabel,
  surfaceHref,
  diagnosticsVisible: _diagnosticsVisible,
  onToggleDiagnostics: _onToggleDiagnostics,
  navigation,
  actions,
}: {
  surfaceLabel: string;
  surfaceHref?: string;
  diagnosticsVisible: boolean;
  onToggleDiagnostics: () => void;
  navigation?: ReactNode;
  actions?: ReactNode;
}) {
  const desktop = useWorkstationDesktopBridge();

  return (
    <header
      className="workstation-titlebar"
      data-workstation-titlebar="root"
      onDoubleClick={() => {
        if (desktop.available) {
          void desktop.window.toggleMaximize();
        }
      }}
    >
      <div
        className="workstation-titlebar__brand"
        data-tauri-drag-region={desktop.available ? '' : undefined}
      >
        {surfaceHref ? (
          <Link
            href={surfaceHref}
            className="workstation-titlebar__surface-link"
            aria-label={`Open ${surfaceLabel}`}
          >
            <span className="workstation-titlebar__surface">{surfaceLabel}</span>
          </Link>
        ) : (
          <span className="workstation-titlebar__surface">{surfaceLabel}</span>
        )}
      </div>
      {navigation ? (
        <div
          className="workstation-titlebar__nav-shell"
          aria-label="Workspace views"
        >
          <nav className="workstation-titlebar__nav" aria-label="Workspace views">
            {navigation}
          </nav>
        </div>
      ) : (
        <div className="workstation-titlebar__spacer" data-tauri-drag-region={desktop.available ? '' : undefined} />
      )}
      <div className="workstation-titlebar__right">
        <div className="workstation-titlebar__actions" id="workstation-titlebar-actions-slot">
          {actions}
        </div>
        <DesktopWindowControls />
      </div>
    </header>
  );
}
