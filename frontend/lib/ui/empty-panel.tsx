'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

export function EmptyPanel({
  title,
  body,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  body: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      {...props}
      className={joinClassNames('app-empty-panel', className)}
      style={{
        display: 'grid',
        gap: '0.55rem',
        padding: '1rem',
        borderRadius: '1rem',
        border: '1px dashed var(--app-border-strong)',
        background: 'color-mix(in srgb, var(--app-bg-panel) 82%, var(--app-bg-overlay) 18%)',
      }}
    >
      <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.9rem' }}>{title}</strong>
      <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.6 }}>
        {body}
      </div>
      {actions}
    </div>
  );
}
