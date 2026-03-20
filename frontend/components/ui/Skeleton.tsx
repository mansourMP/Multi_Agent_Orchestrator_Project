import type { CSSProperties } from 'react';

type SkeletonBlockProps = {
  className?: string;
  style?: CSSProperties;
};

export function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return <div className={`orion-skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}
