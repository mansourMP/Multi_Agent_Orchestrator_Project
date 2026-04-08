import type { ReactNode } from 'react';
import { DESIGN_TOKENS, metaTextStyle, mergeStyles } from '@/design-constraints';

type ResourceMetaLineProps = {
  children: ReactNode;
  className?: string;
};

export function ResourceMetaLine({ children, className }: ResourceMetaLineProps) {
  return (
    <div
      className={className}
      style={mergeStyles(metaTextStyle(), {
        display: 'flex',
        alignItems: 'center',
        gap: DESIGN_TOKENS.space[3],
        flexWrap: 'wrap',
      })}
    >
      {children}
    </div>
  );
}
