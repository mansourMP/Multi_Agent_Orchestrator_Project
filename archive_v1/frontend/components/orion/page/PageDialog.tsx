'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DESIGN_TOKENS, bodyTextStyle, iconButtonStyle, mergeStyles, modalCardStyle, modalOverlayStyle, sectionTitleStyle } from '@/design-constraints';

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
    <div style={modalOverlayStyle()} onClick={onClose}>
      <div
        className={className}
        style={modalCardStyle()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[4],
            padding: `${DESIGN_TOKENS.space[5]}px ${DESIGN_TOKENS.space[6]}px`,
            borderBottom: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
          }}
        >
          <h2 style={sectionTitleStyle()}>{title}</h2>
          <button
            type="button"
            style={iconButtonStyle()}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        <div
          style={mergeStyles(bodyTextStyle(), {
            padding: `${DESIGN_TOKENS.space[5]}px ${DESIGN_TOKENS.space[6]}px`,
          })}
        >
          {children}
        </div>
        {footer ? (
          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: DESIGN_TOKENS.space[3],
              flexWrap: 'wrap',
              padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[6]}px ${DESIGN_TOKENS.space[6]}px`,
              borderTop: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              background: DESIGN_TOKENS.color.surfaceMuted,
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    portalTarget,
  );
}
