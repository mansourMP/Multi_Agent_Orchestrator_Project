import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type RetryActionsProps = {
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
};

export function RetryActions({ onRetry, retryLabel = 'Retry', children }: RetryActionsProps) {
  if (!onRetry && !children) return null;

  return (
    <>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
      {children}
    </>
  );
}
