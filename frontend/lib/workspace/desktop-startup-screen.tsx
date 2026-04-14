'use client';

import { useEffect, useState } from 'react';

import { AppButton } from '@/lib/ui/primitives';
import { SparkIcon } from '@/lib/ui/icons';
import { resolveWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';

type StartupPhase = 'probing' | 'launching' | 'ready' | 'error';

export function DesktopStartupScreen({
  workspaceLabel,
}: {
  workspaceLabel: string;
}) {
  const [desktop, setDesktop] = useState(false);
  const [phase, setPhase] = useState<StartupPhase>('probing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const bridge = resolveWorkstationDesktopBridge();
    if (!bridge) {
      setDesktop(false);
      setPhase('ready');
      return undefined;
    }

    setDesktop(true);
    setPhase('launching');
    setError(null);

    void (async () => {
      try {
        if (typeof bridge.markShellReady === 'function') {
          await bridge.markShellReady();
        }
        if (!active) {
          return;
        }
        window.setTimeout(() => {
          if (active) {
            setPhase('ready');
          }
        }, 360);
      } catch (launchError) {
        if (!active) {
          return;
        }
        setError(launchError instanceof Error ? launchError.message : 'Desktop shell could not finish startup.');
        setPhase('error');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!desktop || phase === 'ready') {
    return null;
  }

  return (
    <div
      data-desktop-startup-screen="overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(circle at top, color-mix(in srgb, var(--app-accent) 14%, var(--app-bg-overlay) 86%) 0%, var(--app-bg-shell) 38%, #05080d 100%)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 30rem)',
          display: 'grid',
          gap: '1rem',
          padding: '1.45rem 1.5rem',
          borderRadius: '1.4rem',
          border: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-panel) 88%, var(--app-bg-overlay) 12%)',
          boxShadow: '0 24px 80px color-mix(in srgb, black 52%, transparent 48%)',
        }}
      >
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <span
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
            <SparkIcon size={15} />
            Empyralis Desktop
          </span>
          <strong
            style={{
              color: 'var(--app-text-primary)',
              fontSize: '1.18rem',
              fontWeight: 690,
              letterSpacing: '-0.025em',
            }}
          >
            {phase === 'error' ? 'Desktop launch needs attention' : 'Opening workstation'}
          </strong>
          <span
            style={{
              color: 'var(--app-text-secondary)',
              fontSize: '0.9rem',
              lineHeight: 1.65,
            }}
          >
            {phase === 'error'
              ? error || 'The native shell could not finish startup.'
              : `Restoring ${workspaceLabel} into the native workstation shell.`}
          </span>
        </div>

        {phase !== 'error' ? (
          <div
            aria-hidden="true"
            style={{
              height: '0.42rem',
              overflow: 'hidden',
              borderRadius: '999px',
              border: '1px solid var(--app-border-subtle)',
              background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 84%, var(--app-bg-overlay) 16%)',
            }}
          >
            <div
              style={{
                width: '38%',
                height: '100%',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, color-mix(in srgb, var(--app-accent) 78%, white 22%) 0%, color-mix(in srgb, var(--app-accent) 45%, var(--app-bg-overlay) 55%) 100%)',
                animation: 'desktop-startup-slide 1.15s ease-in-out infinite',
              }}
            />
          </div>
        ) : null}

        {phase === 'error' ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <AppButton
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Retry launch
            </AppButton>
          </div>
        ) : null}
      </div>
      <style jsx>{`
        @keyframes desktop-startup-slide {
          0% {
            transform: translateX(-110%);
          }
          100% {
            transform: translateX(320%);
          }
        }
      `}</style>
    </div>
  );
}
