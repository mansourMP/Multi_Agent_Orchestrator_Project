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
    <section
      className={joinClassNames('stage-detail-layout', className)}
      style={{
        display: 'grid',
        gap: '0.95rem',
        padding: '1rem',
        borderRadius: '1.05rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'var(--app-bg-panel)',
        boxShadow: 'var(--app-shadow-panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          gap: '0.85rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '0.2rem', minWidth: 0 }}>
          {eyebrow ? (
            <span
              style={{
                color: 'var(--app-text-tertiary)',
                fontSize: '0.72rem',
                fontWeight: 650,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          <h2
            style={{
              margin: 0,
              color: 'var(--app-text-primary)',
              fontSize: '1.02rem',
              fontWeight: 670,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h2>
          {subtitle ? (
            <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.85rem', lineHeight: 1.55 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions}
      </div>

      {notice ? (
        <AppNotice tone={notice.tone ?? 'neutral'}>
          {notice.message}
        </AppNotice>
      ) : null}

      <div style={{ display: 'grid', gap: '0.95rem' }}>
        {children}
      </div>
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
    <section
      className={joinClassNames('stage-detail-section', className)}
      style={{
        display: 'grid',
        gap: '0.75rem',
        paddingTop: '0.1rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.18rem' }}>
        <strong style={{ color: 'var(--app-text-primary)', fontSize: '0.88rem' }}>{title}</strong>
        {description ? (
          <div style={{ color: 'var(--app-text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
            {description}
          </div>
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
      style={{
        margin: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
        gap: '0.75rem',
      }}
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
  const color =
    tone === 'success'
      ? 'var(--app-success)'
      : tone === 'warning'
        ? 'var(--app-warning)'
        : tone === 'danger'
          ? 'var(--app-danger)'
          : 'var(--app-text-primary)';

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.2rem',
        padding: '0.8rem 0.9rem',
        borderRadius: '0.95rem',
        border: '1px solid var(--app-border-subtle)',
        background: 'color-mix(in srgb, var(--app-bg-panel-elevated) 78%, var(--app-bg-overlay) 22%)',
      }}
    >
      <dt
        style={{
          color: 'var(--app-text-tertiary)',
          fontSize: '0.74rem',
          fontWeight: 650,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          color,
          fontSize: '0.88rem',
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
          fontFamily: mono ? 'var(--app-font-mono)' : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
