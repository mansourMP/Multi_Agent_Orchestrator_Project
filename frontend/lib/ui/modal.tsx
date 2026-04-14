'use client';

import { useEffect, type HTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';

import { AppButton, joinClassNames } from '@/lib/ui/primitives';

export function Modal({
  open,
  title,
  description,
  actions,
  onClose,
  size = 'medium',
  className,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}>) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const width =
    size === 'small'
      ? 'min(100%, 28rem)'
      : size === 'large'
        ? 'min(100%, 52rem)'
        : 'min(100%, 38rem)';

  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'grid',
        placeItems: 'center',
        padding: '1.25rem',
        background: 'color-mix(in srgb, var(--app-bg-overlay) 76%, transparent 24%)',
        backdropFilter: 'blur(12px)',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={joinClassNames('app-modal', className)}
        style={{
          width,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          gap: '0.95rem',
          maxHeight: 'calc(100vh - 2.5rem)',
          padding: '1rem 1.05rem 1.05rem',
          borderRadius: '1.15rem',
          border: '1px solid var(--app-border-subtle)',
          background: 'color-mix(in srgb, var(--app-bg-panel) 90%, var(--app-bg-overlay) 10%)',
          boxShadow: 'var(--app-shadow-panel)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            gap: '0.8rem',
          }}
        >
          <div style={{ display: 'grid', gap: '0.24rem', minWidth: 0 }}>
            <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.98rem' }}>{title}</strong>
            {description ? (
              <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.84rem', lineHeight: 1.6 }}>
                {description}
              </span>
            ) : null}
          </div>
          <AppButton type="button" tone="ghost" onClick={onClose}>
            Close
          </AppButton>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.85rem',
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: '0.15rem',
          }}
        >
          {children}
        </div>

        {actions ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ModalSection({
  title,
  description,
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
}>) {
  return (
    <div
      {...props}
      className={joinClassNames('app-modal-section', className)}
      style={{
        display: 'grid',
        gap: '0.6rem',
        padding: '0.85rem 0.9rem',
        borderRadius: '0.95rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 82%, var(--app-bg-overlay) 18%)',
      }}
    >
      <div style={{ display: 'grid', gap: '0.16rem' }}>
        <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.88rem' }}>{title}</strong>
        {description ? (
          <span style={{ color: 'var(--app-text-secondary)', fontSize: '0.8rem', lineHeight: 1.55 }}>
            {description}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
