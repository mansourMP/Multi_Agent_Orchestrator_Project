import type { ReactNode } from 'react';

type ResourceActionGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ResourceActionGroup({ children, className }: ResourceActionGroupProps) {
  return <div className={`orion-list-row-end${className ? ` ${className}` : ''}`}>{children}</div>;
}
