'use client';

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { AppNotice } from '@/lib/ui/primitives';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function StageDetailLayout({
  eyebrow,
  title,
  subtitle,
  notice,
  actions,
  className,
  children,
}: PropsWithChildren<{
  eyebrow?: string | null;
  title: string;
  subtitle?: ReactNode;
  notice?: {
    tone?: 'neutral' | 'success' | 'warning' | 'danger';
    message: ReactNode;
  } | null;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('stage-detail-layout', className)}>
      <div className="stage-detail-layout__header">
        <div className="stage-detail-layout__copy">
          {eyebrow ? (
            <span className="stage-detail-layout__eyebrow">{eyebrow}</span>
          ) : null}
          <h2 className="stage-detail-layout__title">{title}</h2>
          {subtitle ? (
            <div className="stage-detail-layout__subtitle">{subtitle}</div>
          ) : null}
        </div>
        {actions}
      </div>

      {notice ? (
        <AppNotice tone={notice.tone ?? 'neutral'}>
          {notice.message}
        </AppNotice>
      ) : null}

      <div className="stage-detail-layout__body">{children}</div>
    </section>
  );
}

export function StageDetailSection({
  title,
  description,
  children,
  className,
}: PropsWithChildren<{
  title: string;
  description?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={joinClassNames('stage-detail-section', className)}>
      <div className="stage-detail-section__header">
        <strong className="stage-detail-section__title">{title}</strong>
        {description ? (
          <div className="stage-detail-section__description">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function StageDetailFieldGrid({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDListElement>>) {
  return (
    <dl
      {...props}
      className={joinClassNames('stage-detail-field-grid', className)}
    >
      {children}
    </dl>
  );
}

export function StageDetailField({
  label,
  value,
  tone = 'default',
  mono = false,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  mono?: boolean;
}) {
  return (
    <div className="stage-detail-field" data-tone={tone}>
      <dt className="stage-detail-field__label">{label}</dt>
      <dd className={joinClassNames('stage-detail-field__value', mono && 'stage-detail-field__value--mono')}>
        {value}
      </dd>
    </div>
  );
}
