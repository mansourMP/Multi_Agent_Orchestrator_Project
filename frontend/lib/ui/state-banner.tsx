'use client';

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

type StateBannerTone = 'neutral' | 'success' | 'warning' | 'danger';

function toneStyles(tone: StateBannerTone): {
  border: string;
  background: string;
  accent: string;
} {
  if (tone === 'success') {
    return {
      border: 'color-mix(in srgb, var(--app-success) 45%, var(--app-border-subtle) 55%)',
      background: 'color-mix(in srgb, var(--app-success) 10%, var(--app-bg-panel) 90%)',
      accent: 'var(--app-success)',
    };
  }
  if (tone === 'warning') {
    return {
      border: 'color-mix(in srgb, var(--app-warning) 45%, var(--app-border-subtle) 55%)',
      background: 'color-mix(in srgb, var(--app-warning) 10%, var(--app-bg-panel) 90%)',
      accent: 'var(--app-warning)',
    };
  }
  if (tone === 'danger') {
    return {
      border: 'color-mix(in srgb, var(--app-danger) 45%, var(--app-border-subtle) 55%)',
      background: 'color-mix(in srgb, var(--app-danger) 10%, var(--app-bg-panel) 90%)',
      accent: 'var(--app-danger)',
    };
  }
  return {
    border: 'var(--app-border-subtle)',
    background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 84%, var(--app-bg-overlay) 16%)',
    accent: 'var(--app-accent)',
  };
}

export function StateBanner({
  tone = 'neutral',
  title,
  detail,
  actions,
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & {
  tone?: StateBannerTone;
  title?: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}>) {
  const palette = toneStyles(tone);
  return (
    <div
      {...props}
      className={joinClassNames('app-state-banner', className)}
      style={{
        display: 'grid',
        gap: '0.5rem',
        padding: '0.8rem 0.9rem',
        borderRadius: '1rem',
        border: `1px solid ${palette.border}`,
        background: palette.background,
        boxShadow: 'var(--app-shadow-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'start',
          justifyContent: 'space-between',
          gap: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.18rem' }}>
          {title ? (
            <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.88rem' }}>
              {title}
            </strong>
          ) : null}
          {detail ? (
            <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem', lineHeight: 1.55 }}>
              {detail}
            </span>
          ) : null}
        </div>
        {actions}
      </div>
      {children ? (
        <div style={{ color: palette.accent, fontSize: '0.8rem', lineHeight: 1.5 }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
