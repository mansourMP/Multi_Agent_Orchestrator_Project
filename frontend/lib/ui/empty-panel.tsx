'use client';

import type { HTMLAttributes, ReactNode } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';
import { APP_LINE_HEIGHT, APP_RADIUS, APP_SPACING, APP_TYPE_SCALE } from '@/lib/ui/tokens';

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
        gap: APP_SPACING[2],
        padding: APP_SPACING[4],
        borderRadius: APP_RADIUS.lg,
        border: '1px dashed var(--app-border-strong)',
        background: 'color-mix(in srgb, var(--app-bg-panel) 82%, var(--app-bg-overlay) 18%)',
      }}
    >
      <strong style={{ color: 'var(--app-text-primary)', fontSize: APP_TYPE_SCALE[14] }}>{title}</strong>
      <div style={{ color: 'var(--app-text-secondary)', fontSize: APP_TYPE_SCALE[13], lineHeight: APP_LINE_HEIGHT.relaxed }}>
        {body}
      </div>
      {actions}
    </div>
  );
}
