'use client';

import type { CSSProperties, HTMLAttributes } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

export function SkeletonBlock({
  width = '100%',
  height = '1rem',
  radius = '0.8rem',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
}) {
  return (
    <div
      {...props}
      className={joinClassNames('app-skeleton-block', className)}
      style={{
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, color-mix(in srgb, var(--app-bg-panel-elevated) 88%, var(--app-bg-overlay) 12%) 0%, color-mix(in srgb, var(--app-bg-panel) 72%, var(--app-bg-overlay) 28%) 50%, color-mix(in srgb, var(--app-bg-panel-elevated) 88%, var(--app-bg-overlay) 12%) 100%)',
        ...style,
      }}
    />
  );
}
