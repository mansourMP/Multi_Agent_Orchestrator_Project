import type { ReactNode } from 'react';

type ResourceMetaLineProps = {
  children: ReactNode;
  className?: string;
};

export function ResourceMetaLine({ children, className }: ResourceMetaLineProps) {
  return <div className={`orion-item-meta${className ? ` ${className}` : ''}`}>{children}</div>;
}
