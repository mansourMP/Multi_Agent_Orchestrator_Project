'use client';

import { AppButton } from '@/lib/ui/primitives';
import { ActivityIcon, InboxIcon, SettingsIcon, SparkIcon } from '@/lib/ui/icons';
import { DesktopWindowControls } from '@/lib/workspace/desktop-window-controls';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import { useWorkstationStreamState } from '@/lib/workspace/workspace-services';

export function WorkstationTitlebar({
  surfaceLabel,
  diagnosticsVisible,
  onToggleDiagnostics,
}: {
  surfaceLabel: string;
  diagnosticsVisible: boolean;
  onToggleDiagnostics: () => void;
}) {
  const { bootstrap, shellProfile } = useWorkspaceBoundary();
  const streamState = useWorkstationStreamState();
  const desktop = useWorkstationDesktopBridge();

  return (
    <header
      data-workstation-titlebar="root"
      onDoubleClick={() => {
        if (desktop.available) {
          void desktop.window.toggleMaximize();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: desktop.platform === 'macos' ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: '0.95rem',
        padding: '0.72rem 0.95rem 0.68rem',
        borderRadius: '1.05rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-shell) 90%, var(--app-bg-overlay) 10%)',
        boxShadow: 'var(--app-shadow-panel)',
      }}
    >
      {desktop.platform === 'macos' ? <DesktopWindowControls /> : null}

      <div
        data-tauri-drag-region={desktop.available ? '' : undefined}
        style={{
          display: 'grid',
          gap: '0.28rem',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            color: 'var(--app-text-tertiary)',
            fontSize: '0.74rem',
            fontWeight: 650,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <SparkIcon size={14} />
          Empyralis
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.62rem',
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              color: 'var(--app-text-primary)',
              fontSize: '1.04rem',
              fontWeight: 680,
              letterSpacing: '-0.025em',
            }}
          >
            {bootstrap.workspace.label}
          </h1>
          <span
            style={{
              color: 'var(--app-text-secondary)',
              fontSize: '0.84rem',
            }}
          >
            {surfaceLabel}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.42rem',
            color: 'var(--app-text-secondary)',
            fontSize: '0.8rem',
          }}
        >
          <span>{shellProfile.label}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>•</span>
          <span>{bootstrap.membership.role}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>•</span>
          <span>{bootstrap.workspace.kind}</span>
          {desktop.available && desktop.platform ? (
            <>
              <span style={{ color: 'var(--app-text-tertiary)' }}>•</span>
              <span>{desktop.platform}</span>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.42rem',
            padding: '0.4rem 0.62rem',
            borderRadius: '999px',
            border: '1px solid var(--app-border-subtle)',
            background: 'color-mix(in srgb, var(--app-bg-panel) 80%, var(--app-bg-overlay) 20%)',
            color: 'var(--app-text-secondary)',
            fontSize: '0.79rem',
          }}
        >
          <InboxIcon size={14} />
          {streamState.notifications.unreadCount} unread
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.42rem',
            padding: '0.4rem 0.62rem',
            borderRadius: '999px',
            border: '1px solid var(--app-border-subtle)',
            background: 'color-mix(in srgb, var(--app-bg-panel) 80%, var(--app-bg-overlay) 20%)',
            color: 'var(--app-text-secondary)',
            fontSize: '0.79rem',
          }}
        >
          <ActivityIcon size={14} />
          {streamState.activity.totalCount} events
        </div>
        <AppButton
          type="button"
          tone={diagnosticsVisible ? 'primary' : 'secondary'}
          onClick={onToggleDiagnostics}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <SettingsIcon size={14} />
            {diagnosticsVisible ? 'Hide diagnostics' : 'Inspect shell'}
          </span>
        </AppButton>
        {desktop.platform !== 'macos' ? <DesktopWindowControls /> : null}
      </div>
    </header>
  );
}
