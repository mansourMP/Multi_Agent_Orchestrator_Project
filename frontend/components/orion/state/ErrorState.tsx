import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { humanizeUiError, isTechnicalUiError } from '@/lib/uiError';

type ErrorStateProps = {
  title: ReactNode;
  copy?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ErrorState({ title, copy, actions, className }: ErrorStateProps) {
  const resolvedCopy =
    typeof copy === 'string' && isTechnicalUiError(copy)
      ? humanizeUiError(copy)
      : copy;

  return (
    <PageStatePanel
      variant="error"
      icon={<AlertCircle size={18} />}
      title={title}
      copy={resolvedCopy}
      actions={actions}
      className={className}
    />
  );
}
