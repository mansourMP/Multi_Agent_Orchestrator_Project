import type { ReactNode } from 'react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';

type EmptyStateProps = {
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  filtered?: boolean;
  className?: string;
};

export function EmptyState({ title, copy, actions, filtered = false, className }: EmptyStateProps) {
  return (
    <PageStatePanel
      variant={filtered ? 'filtered-empty' : 'empty'}
      title={title}
      copy={copy}
      actions={actions}
      className={className}
    />
  );
}
