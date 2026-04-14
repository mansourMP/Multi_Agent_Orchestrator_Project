'use client';

import { DesktopWindowControls } from '@/lib/workspace/desktop-window-controls';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

export function WorkstationTitlebar({
  surfaceLabel: _surfaceLabel,
  diagnosticsVisible: _diagnosticsVisible,
  onToggleDiagnostics: _onToggleDiagnostics,
}: {
  surfaceLabel: string;
  diagnosticsVisible: boolean;
  onToggleDiagnostics: () => void;
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
        Empyralis
      </div>
      <DesktopWindowControls />
    </header>
  );
}
