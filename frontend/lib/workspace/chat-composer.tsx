'use client';

import type { KeyboardEvent } from 'react';

import { AppButton, AppTextarea } from '@/lib/ui/primitives';

export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  executionPlacement,
  onToggleExecutionPlacement,
  executionPlacementDisabled = false,
  pendingApprovalsCount = 0,
  onOpenApprovals,
  permissionMode,
  onTogglePermissionMode,
  disabled = false,
  busy = false,
}: {
  draft: string;
  onDraftChange: (nextDraft: string) => void;
  onSubmit: () => void;
  executionPlacement: 'Local' | 'Cloud';
  onToggleExecutionPlacement?: () => void;
  executionPlacementDisabled?: boolean;
  pendingApprovalsCount?: number;
  onOpenApprovals?: () => void;
  permissionMode: 'Auto-run' | 'Requires approval';
  onTogglePermissionMode?: () => void;
  disabled?: boolean;
  busy?: boolean;
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
      <div className="app-chat-composer__surface">
        <AppTextarea
          value={draft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder="Ask anything."
          className="app-chat-composer__textarea"
        />

        <div className="app-chat-composer__bar">
          <div className="app-chat-composer__controls">
            <button
              type="button"
              className="app-chat-composer__control"
              onClick={() => {
                onToggleExecutionPlacement?.();
              }}
              disabled={executionPlacementDisabled}
            >
              {executionPlacement}
            </button>
            <button
              type="button"
              className="app-chat-composer__control"
              onClick={() => {
                onOpenApprovals?.();
              }}
            >
              Approvals
              <span className="app-chat-composer__badge">{pendingApprovalsCount}</span>
            </button>
            <button
              type="button"
              className="app-chat-composer__control"
              onClick={() => {
                onTogglePermissionMode?.();
              }}
            >
              {permissionMode}
            </button>
          </div>
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
