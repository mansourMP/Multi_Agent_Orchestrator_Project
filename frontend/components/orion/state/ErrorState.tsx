import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';

type ErrorStateProps = {
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ErrorState({ title, copy, actions, className }: ErrorStateProps) {
  return (
    <PageStatePanel
      variant="error"
      icon={<AlertCircle size={18} />}
      title={title}
      copy={copy}
      actions={actions}
      className={className}
    />
  );
}
