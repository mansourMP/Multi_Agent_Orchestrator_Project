'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type PageDialogProps = {
  open: boolean;
  portalTarget?: Element | null;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
};

export function PageDialog({
  open,
  portalTarget,
  title,
  children,
  footer,
  onClose,
  className,
}: PageDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.classList.add('orion-modal-open');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('orion-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="orion-modal-overlay" onClick={onClose}>
      <div
        className={`orion-modal${className ? ` ${className}` : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="orion-panel-header orion-page-dialog-header">
          <h2 className="orion-page-dialog-title">{title}</h2>
          <button
            type="button"
            className="orion-icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        <div className="orion-page-dialog-body">{children}</div>
        {footer ? <footer className="orion-page-dialog-footer">{footer}</footer> : null}
      </div>
    </div>,
    portalTarget,
  );
}
