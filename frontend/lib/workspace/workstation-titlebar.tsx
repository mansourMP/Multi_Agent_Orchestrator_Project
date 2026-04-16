'use client';

import type { ReactNode } from 'react';

import { DesktopWindowControls } from '@/lib/workspace/desktop-window-controls';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

export function WorkstationTitlebar({
  surfaceLabel,
  diagnosticsVisible: _diagnosticsVisible,
  onToggleDiagnostics: _onToggleDiagnostics,
  navigation,
  actions,
}: {
  surfaceLabel: string;
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
        <span className="workstation-titlebar__brand-mark">Empyralis</span>
        <span className="workstation-titlebar__separator" aria-hidden="true" />
        <span className="workstation-titlebar__surface">{surfaceLabel}</span>
      </div>
      {navigation ? (
        <nav className="workstation-titlebar__nav" aria-label={`${surfaceLabel} views`}>
          {navigation}
        </nav>
      ) : (
        <div className="workstation-titlebar__spacer" data-tauri-drag-region={desktop.available ? '' : undefined} />
      )}
      {actions ? <div className="workstation-titlebar__actions">{actions}</div> : null}
      <DesktopWindowControls />
    </header>
  );
}
