'use client';

import { useCallback } from 'react';

import { AppButton } from '@/lib/ui/primitives';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

export function WorkstationDesktopStatus() {
  const desktop = useWorkstationDesktopBridge();

  const handleOpenPermissions = useCallback(() => {
    void desktop.openPermissionSettings('accessibility');
  }, [desktop]);

  if (!desktop.available) {
    return null;
  }

  const localCompanionLabel = desktop.localCompanion.present
    ? `${desktop.localCompanion.label ?? 'Local companion'} ${desktop.localCompanion.online ? 'ready' : 'needs attention'}`
    : 'No local companion attached to this workstation';

  return (
    <section
      data-workstation-desktop-bridge="native"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.8rem',
        flexWrap: 'wrap',
        padding: '0.68rem 0.9rem',
        borderRadius: '1rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel) 86%, var(--app-bg-overlay) 14%)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '1.75rem',
            padding: '0.26rem 0.56rem',
            borderRadius: '999px',
            border: '1px solid var(--app-border-subtle)',
            background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
            color: 'var(--app-text-secondary)',
            fontSize: '0.78rem',
            fontWeight: 620,
          }}
        >
          Native shell{desktop.platform ? ` · ${desktop.platform}` : ''}
        </span>
        <span
          style={{
            color: desktop.localCompanion.online ? 'var(--app-success)' : 'var(--app-text-secondary)',
            fontSize: '0.82rem',
          }}
        >
          {localCompanionLabel}
        </span>
      </div>

      {desktop.localCompanion.present && !desktop.localCompanion.online ? (
        <AppButton type="button" tone="secondary" onClick={handleOpenPermissions}>
          Review companion permissions
        </AppButton>
      ) : null}
    </section>
  );
}
