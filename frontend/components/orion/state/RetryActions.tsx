import type { ReactNode } from 'react';

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
        <button type="button" className="btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
      {children}
    </>
  );
}
