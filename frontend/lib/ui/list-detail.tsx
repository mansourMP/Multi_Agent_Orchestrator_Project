'use client';

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { joinClassNames } from '@/lib/ui/primitives';

export function ListDetailShell({
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<{
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('app-list-detail-shell', className)}>
      <header className="app-list-detail-shell__header">
        <div className="app-list-detail-shell__title-group">
          <h1 className="app-list-detail-shell__title">{title}</h1>
          {subtitle ? (
            <p className="app-list-detail-shell__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </header>

      <div className="app-list-detail-shell__body">
        {children}
      </div>
    </section>
  );
}

export function ListDetailColumns({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  if (!secondary) {
    return <div className="app-list-detail-columns app-list-detail-columns--single">{primary}</div>;
  }
  return (
    <div className="app-list-detail-columns app-list-detail-columns--split">
      <div className="app-list-detail-columns__primary">{primary}</div>
      <div className="app-list-detail-columns__secondary">{secondary}</div>
    </div>
  );
}

export function ListDetailPanel({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<{
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('app-list-detail-panel', className)}>
      <div className="app-list-detail-panel__header">
        <div className="app-list-detail-panel__title-group">
          {eyebrow ? (
            <span className="app-list-detail-panel__eyebrow">{eyebrow}</span>
          ) : null}
          <strong className="app-list-detail-panel__title">{title}</strong>
          {subtitle ? (
            <div className="app-list-detail-panel__subtitle">{subtitle}</div>
          ) : null}
        </div>
        {actions}
      </div>
      <div className="app-list-detail-panel__body">
        {children}
      </div>
    </section>
  );
}
