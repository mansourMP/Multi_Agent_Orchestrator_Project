'use client';

import type { ReactNode } from 'react';

import { Modal } from '@/lib/ui/modal';

export function CommandSheet({
  open,
  title,
  description,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      size="large"
      actions={actions}
    >
      {children}
    </Modal>
  );
}
