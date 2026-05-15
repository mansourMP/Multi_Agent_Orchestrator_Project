'use client';

import React, { memo } from 'react';
import { CodexChatCell, type CodexApprovalAction } from '@/lib/workspace/codex-chat/cell-components';
import type { CodexTranscriptCell } from '@/lib/workspace/codex-chat/cells';
import { ScrollRegion } from '@/lib/ui/scroll-region';

export type SageRecentRunRow = {
  runId: string | null;
  threadId: string | null;
  createdAt: string | null;
  preview: string;
  title: string;
};

export type SageThreadSeed = {
  title: string;
  sourceRunId: string | null;
  sourceThreadId: string | null;
};

export interface SageTranscriptProps {
  visibleTranscriptCells: CodexTranscriptCell[];
  pinnedTimelineCells: CodexTranscriptCell[];
  resolvingApprovalId: string | null;
  onResolveApproval: (approvalId: string, action: CodexApprovalAction) => void;
  showBlankTranscript: boolean;
  recentRunRows: SageRecentRunRow[];
  onStartNewThread: (seed: SageThreadSeed) => void | Promise<void>;
  formatRelativeTime: (time: string | null) => string;
}

export const SageTranscript = memo(function SageTranscript({
  visibleTranscriptCells,
  pinnedTimelineCells,
  resolvingApprovalId,
  onResolveApproval,
  showBlankTranscript,
  recentRunRows,
  onStartNewThread,
  formatRelativeTime,
}: SageTranscriptProps) {
  return (
    <ScrollRegion className="app-chat-thread__scroll">
      <div className="app-chat-thread__body">
        {showBlankTranscript && (
          <div className={`app-chat-empty-state${recentRunRows.length > 0 ? ' app-chat-empty-state--recent' : ''}`}>
            {recentRunRows.length > 0 && (
              <div className="app-chat-empty-state__recent">
                {recentRunRows.map((run, index) => (
                  <button
                    key={run.runId ?? run.threadId ?? `${run.createdAt ?? 'run'}:${index}`}
                    type="button"
                    className="app-chat-empty-run-row"
                    onClick={() => onStartNewThread({
                      title: run.title,
                      sourceRunId: run.runId,
                      sourceThreadId: run.threadId,
                    })}
                  >
                    <span className="app-chat-empty-run-row__time">{formatRelativeTime(run.createdAt)}</span>
                    <span className="app-chat-empty-run-row__preview" title={run.preview}>
                      {run.preview}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {visibleTranscriptCells.map((cell, index) => (
          <CodexChatCell
            key={`${cell.kind}:${cell.id}:${index}`}
            cell={cell}
            resolvingApprovalId={resolvingApprovalId}
            onResolveApproval={onResolveApproval}
          />
        ))}

        {pinnedTimelineCells.map((cell, index) => (
          <CodexChatCell
            key={`pinned:${cell.kind}:${cell.id}:${index}`}
            cell={cell}
            resolvingApprovalId={resolvingApprovalId}
            onResolveApproval={onResolveApproval}
          />
        ))}
      </div>
    </ScrollRegion>
  );
});
