'use client';

import { useCallback } from 'react';

import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

export function WorkstationDesktopStatus() {
  const desktop = useWorkstationDesktopBridge();

  const handleOpenCurrentSurface = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    void desktop.openExternal(window.location.href);
  }, [desktop]);

  const handleOpenPermissions = useCallback(() => {
    void desktop.openPermissionSettings('accessibility');
  }, [desktop]);

  return (
    <section
      data-workstation-desktop-bridge={desktop.available ? 'desktop' : 'browser'}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
        padding: '0.9rem 1rem',
        borderRadius: '1rem',
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'rgba(255, 255, 255, 0.88)',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ display: 'grid', gap: '0.2rem' }}>
        <strong style={{ color: '#0f172a' }}>
          {desktop.available ? `Desktop bridge active${desktop.platform ? ` · ${desktop.platform}` : ''}` : 'Browser mode'}
        </strong>
        <span style={{ color: '#475569', fontSize: '0.88rem', lineHeight: 1.5 }}>
          {desktop.localCompanion.present
            ? `${desktop.localCompanion.label ?? 'Local companion'} is ${desktop.localCompanion.online ? 'online' : 'offline'}${desktop.localCompanion.preferred ? ' and preferred' : ''}.`
            : 'No local companion runtime target is attached to this workspace.'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleOpenCurrentSurface}
          style={{
            border: '1px solid #0f172a',
            borderRadius: '999px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '0.45rem 0.85rem',
            cursor: 'pointer',
          }}
        >
          Open current surface externally
        </button>

        {desktop.available && desktop.localCompanion.present && !desktop.localCompanion.online ? (
          <button
            type="button"
            onClick={handleOpenPermissions}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: '999px',
              background: '#ffffff',
              color: '#334155',
              padding: '0.45rem 0.85rem',
              cursor: 'pointer',
            }}
          >
            Open local permissions
          </button>
        ) : null}
      </div>
    </section>
  );
}
