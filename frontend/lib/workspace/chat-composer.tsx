'use client';

import type { KeyboardEvent } from 'react';

import { AppButton, AppTextarea } from '@/lib/ui/primitives';

export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  disabled = false,
  busy = false,
  statusMessage,
}: {
  draft: string;
  onDraftChange: (nextDraft: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  statusMessage?: string | null;
}) {
  const canSend = !disabled && !busy && draft.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      onSubmit();
    }
  };

  return (
    <section data-workstation-chat-composer="root" className="app-chat-composer">
      <div className="app-chat-composer__header">
        <div className="app-chat-header__copy">
          <strong className="app-chat-composer__title">Message</strong>
          <span className="app-chat-composer__meta">Enter to send. Shift+Enter for a new line.</span>
        </div>
        <span className="app-chat-composer__meta">
          {statusMessage ?? 'Connected to the canonical runtime conversation.'}
        </span>
      </div>

      <div className="app-chat-composer__surface">
        <AppTextarea
          value={draft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="Ask the workspace to do real work."
          className="app-chat-composer__textarea"
        />

        <div className="app-chat-composer__footer">
          <span className="app-chat-composer__status">
            Responses reconcile against canonical thread state after every turn.
          </span>
          <AppButton
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
          >
            {busy ? 'Sending…' : 'Send'}
          </AppButton>
        </div>
      </div>
    </section>
  );
}
