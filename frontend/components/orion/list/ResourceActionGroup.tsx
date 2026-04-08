import type { ReactNode } from 'react';
import { DESIGN_TOKENS } from '@/design-constraints';

type ResourceActionGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ResourceActionGroup({ children, className }: ResourceActionGroupProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: DESIGN_TOKENS.space[2],
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        paddingLeft: DESIGN_TOKENS.space[2],
      }}
    >
      {children}
    </div>
  );
}
