import type { PropsWithChildren, ReactNode } from 'react';

import Link from 'next/link';

import { ScrollRegion } from '@/lib/ui/scroll-region';

function humanizeSurface(surface: string): string {
  return surface
    .split('/')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' / ');
}

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
        background: 'var(--app-bg-shell)',
      }}
    >
      <aside
        data-workstation-pane="1"
        style={{
          minWidth: 0,
          minHeight: '100vh',
          borderRight: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-shell) 92%, var(--app-bg-overlay) 8%)',
        }}
      >
        {switcherPane}
      </aside>

      <div
        data-workstation-shell="kernel-host"
        style={{
          minWidth: 0,
          minHeight: '100vh',
          padding: '0.85rem',
          background: 'var(--app-bg-canvas)',
        }}
      >
        {kernelPane}
      </div>
    </div>
  );
}

export function WorkstationSurfaceViewport({
  children,
  surface,
}: PropsWithChildren<{
  surface?: string;
}>) {
  return (
    <ScrollRegion
      data-workstation-surface="viewport"
      data-workstation-surface-view={surface ?? 'unknown'}
      style={{
        padding: '1.1rem 1.15rem 1.35rem',
      }}
    >
      {children}
    </ScrollRegion>
  );
}

export function WorkstationRouteFallback({
  surface,
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
        padding: '1.35rem',
        display: 'grid',
        alignContent: 'start',
        gap: '0.85rem',
        borderRadius: '1rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'var(--app-bg-panel)',
      }}
    >
      <div style={{ display: 'grid', gap: '0.3rem' }}>
        <span
          style={{
            width: 'fit-content',
            padding: '0.24rem 0.56rem',
            borderRadius: '999px',
            background: 'color-mix(in srgb, var(--app-accent-muted) 80%, var(--app-bg-panel) 20%)',
            color: 'var(--app-accent-text)',
            fontSize: '0.74rem',
            fontWeight: 650,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Unavailable
        </span>
        <h1 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--app-text-primary)' }}>
          This view is not available here
        </h1>
      </div>

      <p style={{ margin: 0, color: 'var(--app-text-secondary)', lineHeight: 1.6 }}>
        {humanizeSurface(surface)} is not enabled for the current workspace configuration.
      </p>

      <div>
        <Link
          href={fallbackHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '2.2rem',
            padding: '0.5rem 0.9rem',
            borderRadius: '999px',
            border: '1px solid var(--app-border-accent)',
            background: 'color-mix(in srgb, var(--app-accent) 18%, var(--app-bg-overlay) 82%)',
            color: 'var(--app-accent-text)',
            fontWeight: 620,
            textDecoration: 'none',
          }}
        >
          Open workspace default view
        </Link>
      </div>
    </div>
  );
}
