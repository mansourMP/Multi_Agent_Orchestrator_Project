'use client';

import type { PropsWithChildren, ReactNode } from 'react';
type ChatInlineStateTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function ChatInlineStateCard({
  tone = 'neutral',
  eyebrow,
  title,
  meta,
  actions,
  children,
}: PropsWithChildren<{
  tone?: ChatInlineStateTone;
  eyebrow?: string | null;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <section className="app-chat-inline-state" data-tone={tone}>
      <div className="app-chat-inline-state__header">
        <div className="app-chat-inline-state__copy">
          {eyebrow ? (
            <span className="app-chat-inline-state__eyebrow">{eyebrow}</span>
          ) : null}
          <strong className="app-chat-inline-state__title">{title}</strong>
          {meta ? (
            <div className="app-chat-inline-state__meta">{meta}</div>
          ) : null}
        </div>
        {actions}
      </div>

      <div className="app-chat-inline-state__body">
        {children}
      </div>
    </section>
  );
}
