import type { ReactNode } from 'react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';

type LoadingStateProps = {
  title?: ReactNode;
  copy?: ReactNode;
  className?: string;
};

export function LoadingState({
  title = 'Loading…',
  copy,
  className,
}: LoadingStateProps) {
  return (
    <PageStatePanel
      variant="loading"
      title={title}
      copy={copy}
      className={className}
    />
  );
}
