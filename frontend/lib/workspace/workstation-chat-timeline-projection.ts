'use client';

import { useMemo } from 'react';

import type { WorkstationChatMessageRecord } from '@/lib/workspace/chat-message';
import type { CodexTranscriptCell } from '@/lib/workspace/codex-chat/cells';
import type { TimelineProjectionEvent } from '@/lib/workspace/codex-chat/timeline-reducer';
import { projectCodexTimeline } from '@/lib/workspace/codex-chat/timeline-reducer';
import { workstationMessageToCodexCell } from '@/lib/workspace/codex-chat/message-adapter';

export type TimelineProjectionOptions = {
  approvals: (Record<string, unknown> & {
    approval_id?: string | null;
    id?: string | null;
    status?: string | null;
    prompt?: string | null;
  })[];
  threadMessages: WorkstationChatMessageRecord[];
  pendingUserMessage: WorkstationChatMessageRecord | null;
  isSending: boolean;
  liveTimelineEvents: TimelineProjectionEvent[];
  showProjectedAssistant: boolean;
  isSyntheticTranscriptMessage: (message: WorkstationChatMessageRecord) => boolean;
  canonicalIncludesMessage: (
    canonicalMessages: WorkstationChatMessageRecord[],
    candidate: WorkstationChatMessageRecord,
  ) => boolean;
  isProviderGateTranscriptCell: (cell: CodexTranscriptCell) => boolean;
  isProviderGateSystemCell: (cell: CodexTranscriptCell) => boolean;
  projectedAssistantLooksSynthetic: (
    cell: Extract<CodexTranscriptCell, { kind: 'assistant' }> | null,
  ) => boolean;
  readString: (value: unknown) => string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function transcriptEventsFromMetadata(metadata: Record<string, unknown>): TimelineProjectionEvent[] {
  const rawEvents = Array.isArray(metadata.transcript_events) ? metadata.transcript_events : [];
  return rawEvents
    .map((item): TimelineProjectionEvent | null => {
      const record = readRecord(item);
      const type = String(record.event || record.type || '').trim();
      if (type !== 'trace' && type !== 'step') {
        return null;
      }
      const payload = readRecord(record.payload);
      if (Object.keys(payload).length === 0) {
        return null;
      }
      return { type, payload };
    })
    .filter((item): item is TimelineProjectionEvent => item !== null);
}

function isProofCell(cell: CodexTranscriptCell): boolean {
  return (
    cell.kind === 'reasoning_summary'
    || cell.kind === 'exec'
    || cell.kind === 'tool'
    || cell.kind === 'web_search'
    || cell.kind === 'file_change'
    || cell.kind === 'screenshot'
    || cell.kind === 'approval_request'
    || cell.kind === 'status'
    || cell.kind === 'error'
  );
}

function replayProofCellsForMessage(
  message: WorkstationChatMessageRecord,
  options: Pick<TimelineProjectionOptions, 'isProviderGateSystemCell'>,
): CodexTranscriptCell[] {
  const events = transcriptEventsFromMetadata(message.metadata);
  if (events.length === 0) {
    return [];
  }
  return projectCodexTimeline(events).cells
    .filter((cell) => isProofCell(cell) && !options.isProviderGateSystemCell(cell))
    .map((cell) => ({
      ...cell,
      id: `${message.id}:transcript:${cell.id}`,
      createdAt: cell.createdAt || message.createdAt,
      dimmed: cell.kind === 'approval_request' ? cell.dimmed : true,
    }));
}

export function useWorkstationTimelineProjection(options: TimelineProjectionOptions) {
  const projectedTimelineProjection = useMemo(
    () => projectCodexTimeline(options.liveTimelineEvents),
    [options.liveTimelineEvents],
  );

  const projectedTimelineCells = projectedTimelineProjection.cells;

  const projectedSystemCells = useMemo(
    () => projectedTimelineCells.filter((cell) => isProofCell(cell) && !options.isProviderGateSystemCell(cell)),
    [options, projectedTimelineCells],
  );

  const projectedAssistantCell = useMemo(
    () => {
      const candidate = projectedTimelineCells.find(
        (cell): cell is Extract<CodexTranscriptCell, { kind: 'assistant' }> => cell.kind === 'assistant',
      ) ?? null;
      return options.projectedAssistantLooksSynthetic(candidate) ? null : candidate;
    },
    [options, projectedTimelineCells],
  );

  const pinnedTimelineCells = options.isSending ? projectedSystemCells : [];

  const pendingApprovalCells = useMemo<CodexTranscriptCell[]>(() => (
    options.approvals.map((approval, index) => {
      const approvalId = options.readString(approval.approval_id || approval.id) || `approval-${index}`;
      const approvalRecord = approval as Record<string, unknown>;
      return {
        id: approvalId,
        kind: 'approval_request',
        prompt: options.readString(approval.prompt) || `Approval ${index + 1}`,
        actions: ['allow_once', 'allow_session', 'deny'],
        status: 'waiting',
        createdAt: options.readString(approvalRecord.created_at) || null,
        metadata: {
          ...approval,
          approval_id: approvalId,
        },
      };
    })
  ), [options]);

  const visibleTranscriptCells = useMemo(() => {
    const canonicalMessages = options.threadMessages.filter((message) => !options.isSyntheticTranscriptMessage(message));
    const nextCells: CodexTranscriptCell[] = [];
    let insertedReplayProofCells = false;
    for (const message of canonicalMessages) {
      const cell = workstationMessageToCodexCell(message);
      if (options.isProviderGateTranscriptCell(cell)) {
        continue;
      }
      if (!options.isSending && cell.kind === 'assistant') {
        const replayCells = replayProofCellsForMessage(message, options);
        if (replayCells.length > 0) {
          insertedReplayProofCells = true;
          nextCells.push(...replayCells);
        }
      }
      nextCells.push(cell);
    }
    if (options.pendingUserMessage && !options.canonicalIncludesMessage(canonicalMessages, options.pendingUserMessage)) {
      nextCells.push(workstationMessageToCodexCell(options.pendingUserMessage));
    }
    const trailingCell = nextCells[nextCells.length - 1] ?? null;
    const scrollableSystemCells = options.isSending || insertedReplayProofCells ? [] : projectedSystemCells;
    const shouldInsertStepsBeforeFinalAssistant = scrollableSystemCells.length > 0
      && trailingCell?.kind === 'assistant';
    if (shouldInsertStepsBeforeFinalAssistant && trailingCell) {
      nextCells.pop();
      nextCells.push(...scrollableSystemCells, trailingCell);
    } else if (scrollableSystemCells.length > 0) {
      nextCells.push(...scrollableSystemCells);
    }
    if (options.showProjectedAssistant && projectedAssistantCell) {
      nextCells.push(projectedAssistantCell);
    }
    if (pendingApprovalCells.length > 0) {
      nextCells.push(...pendingApprovalCells);
    }
    return nextCells;
  }, [
    options,
    pendingApprovalCells,
    projectedAssistantCell,
    projectedSystemCells,
  ]);

  return {
    projectedTimelineProjection,
    projectedTimelineCells,
    projectedSystemCells,
    projectedAssistantCell,
    pinnedTimelineCells,
    pendingApprovalCells,
    visibleTranscriptCells,
  };
}
