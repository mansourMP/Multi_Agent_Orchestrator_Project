'use client';

import type { ReactNode } from 'react';
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
  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="orion-modal-overlay" onClick={onClose}>
      <div className={`orion-modal${className ? ` ${className}` : ''}`} onClick={(event) => event.stopPropagation()}>
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
