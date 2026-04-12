import type { PropsWithChildren, ReactNode } from 'react';

import Link from 'next/link';

export function WorkstationShellFrame({
  switcherPane,
  kernelPane,
}: {
  switcherPane: ReactNode;
  kernelPane: ReactNode;
}) {
  return (
    <div
      data-workstation-shell="frame"
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '18rem minmax(0, 1fr)',
        background:
          'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
      }}
    >
      <aside
        data-workstation-pane="1"
        style={{
          minWidth: 0,
          borderRight: '1px solid #cbd5e1',
          background: 'rgba(248, 250, 252, 0.96)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {switcherPane}
      </aside>

      <div
        data-workstation-shell="kernel-host"
        style={{
          minWidth: 0,
          minHeight: '100vh',
          padding: '1rem',
        }}
      >
        {kernelPane}
      </div>
    </div>
  );
}

export function WorkstationSurfaceViewport({
  children,
}: PropsWithChildren) {
  return (
    <div
      data-workstation-surface="viewport"
      style={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'auto',
      }}
    >
      {children}
    </div>
  );
}

export function WorkstationRouteFallback({
  surface,
  shellProfileId,
  fallbackHref,
}: {
  surface: string;
  shellProfileId: string;
  fallbackHref: string;
}) {
  return (
    <div
      data-workstation-surface="fallback"
      style={{
        height: '100%',
        padding: '2rem',
        display: 'grid',
        alignContent: 'start',
        gap: '0.9rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <span
          style={{
            width: 'fit-content',
            padding: '0.25rem 0.55rem',
            borderRadius: '999px',
            background: '#dbeafe',
            color: '#1d4ed8',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Route guard
        </span>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>Route Not Available</h1>
      </div>

      <p style={{ margin: 0, color: '#334155', lineHeight: 1.6 }}>
        This workspace does not expose <code>{surface}</code> in the active shell profile.
      </p>
      <p style={{ margin: 0, color: '#475569' }}>
        Active shell profile: <code>{shellProfileId}</code>
      </p>
      <p style={{ margin: 0 }}>
        Safe fallback: <Link href={fallbackHref}>{fallbackHref}</Link>
      </p>
    </div>
  );
}
