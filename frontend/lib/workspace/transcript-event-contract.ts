'use client';

import type { TimelineProjectionEvent } from '@/lib/workspace/codex-chat/cells';

export const TRANSCRIPT_EVENT_SCHEMA_VERSION = 1;
export const TRANSCRIPT_EVENT_LIMIT = 200;
export const TRANSCRIPT_EVENT_TYPES = ['trace', 'step'] as const;

export type TranscriptEventType = typeof TRANSCRIPT_EVENT_TYPES[number];

export type TranscriptEventRecord = {
  event?: unknown;
  type?: unknown;
  schema_version?: unknown;
  payload?: unknown;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isTranscriptEventType(value: unknown): value is TranscriptEventType {
  return value === 'trace' || value === 'step';
}

export function transcriptProjectionEventsFromMetadata(
  metadata: Record<string, unknown>,
): TimelineProjectionEvent[] {
  const rawEvents = Array.isArray(metadata.transcript_events) ? metadata.transcript_events : [];
  return rawEvents
    .map((item): TimelineProjectionEvent | null => {
      const record = readRecord(item) as TranscriptEventRecord;
      const type = String(record.event || record.type || '').trim();
      if (!isTranscriptEventType(type)) {
        return null;
      }
      const payload = readRecord(record.payload);
      if (Object.keys(payload).length === 0) {
        return null;
      }
      return { type, payload };
    })
    .filter((item): item is TimelineProjectionEvent => item !== null)
    .slice(-TRANSCRIPT_EVENT_LIMIT);
}
