import type { EmpyralistStreamEvent } from "@/src/lib/api";

export const TRANSCRIPT_EVENT_SCHEMA_VERSION = 1;
export const TRANSCRIPT_EVENT_LIMIT = 200;
export const TRANSCRIPT_EVENT_TYPES = ["trace", "step"] as const;

type TranscriptEventType = typeof TRANSCRIPT_EVENT_TYPES[number];

function readText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isTranscriptEventType(value: unknown): value is TranscriptEventType {
  return value === "trace" || value === "step";
}

export function transcriptStreamEventsFromMetadata(metadata: Record<string, unknown>): EmpyralistStreamEvent[] {
  const rawEvents = Array.isArray(metadata.transcript_events) ? metadata.transcript_events : [];
  return rawEvents
    .map((item) => {
      const record = readRecord(item);
      const event = readText(record.event || record.type);
      if (!isTranscriptEventType(event)) return null;
      const payload = readRecord(record.payload);
      if (Object.keys(payload).length === 0) return null;
      return { event, payload } as EmpyralistStreamEvent;
    })
    .filter((item): item is EmpyralistStreamEvent => Boolean(item))
    .slice(-TRANSCRIPT_EVENT_LIMIT);
}
