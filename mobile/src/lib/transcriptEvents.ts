import type { EmpyralistStreamEvent } from "@/src/lib/api";

export const TRANSCRIPT_EVENT_SCHEMA_VERSION = 1;
export const TRANSCRIPT_EVENT_LIMIT = 200;
export const TRANSCRIPT_EVENT_TYPES = ["trace", "step"] as const;

type TranscriptEventType = typeof TRANSCRIPT_EVENT_TYPES[number];
type JsonRecord = Record<string, unknown>;

const BLOCKED_KEYS = new Set([
  "args",
  "args_preview",
  "arguments",
  "audit",
  "audit_event",
  "audit_event_id",
  "audit_event_type",
  "chain_of_thought",
  "context",
  "debug",
  "filters",
  "input",
  "messages",
  "model",
  "model_id",
  "modelId",
  "output",
  "parameters",
  "policy",
  "policy_metadata",
  "prompt",
  "provider",
  "provider_id",
  "providerId",
  "raw",
  "raw_input",
  "raw_output",
  "reasoning",
  "result",
  "system_prompt",
  "text",
  "trace_id",
  "traceId",
  "tool_args",
]);

const SAFE_TRACE_TOP_LEVEL_KEYS = new Set([
  "approval_id",
  "artifact_id",
  "data",
  "event_type",
  "item_id",
  "metadata",
  "seq",
  "tool_call_id",
  "ts",
]);

const SAFE_TRACE_DATA_KEYS = new Set([
  "action",
  "action_id",
  "actor",
  "approval_id",
  "artifact_id",
  "artifact_ids",
  "artifactId",
  "caption",
  "capability_id",
  "code",
  "decision",
  "delivery_transport",
  "description",
  "detail",
  "event",
  "exit_code",
  "filename",
  "height",
  "id",
  "kind",
  "label",
  "message",
  "metadata",
  "mime_type",
  "mimeType",
  "name",
  "normalized_approval",
  "path",
  "query",
  "request_id",
  "resolution",
  "runtime_access_mode",
  "runtime_session_id",
  "runtime_target",
  "state",
  "status",
  "summary",
  "target_summary",
  "title",
  "tool_call_id",
  "tool_name",
  "url",
  "width",
]);

const SAFE_METADATA_KEYS = new Set([
  "action_id",
  "approval_id",
  "artifact_id",
  "code",
  "label",
  "request_id",
  "runtime_access_mode",
  "runtime_session_id",
  "runtime_target",
  "status",
  "summary",
  "title",
]);

const SAFE_STEP_KEYS = new Set(["detail", "id", "kind", "label", "metadata", "status"]);
const BLOCKED_STEP_KINDS = new Set(["thinking", "reasoning", "assistant", "message", "final", "chunk"]);
const TRACE_EVENT_EXACT = new Set([
  "artifact.created",
  "approval.requested",
  "approval.resolved",
  "browser.action",
  "browser.screenshot",
  "computer.browser.action",
  "screenshot.captured",
  "search.query",
  "search.results",
  "tool.result",
  "tool.started",
  "trace.completed",
  "trace.failed",
]);
const TRACE_EVENT_PREFIXES = [
  "approval.",
  "artifact.",
  "browser.",
  "computer.",
  "file.",
  "gateway.",
  "hardware.",
  "runtime.",
  "screenshot.",
  "search.",
  "shell.",
  "tool.",
];
const SENDISH_TRACE_TOKENS = ["telegram", "whatsapp", "gmail", "email", "mail", "message.sent", "message.queued"];
const BLOCKED_TRACE_EVENTS = new Set([
  "assistant.message.delta",
  "final",
  "message.delta",
  "reasoning.summary.delta",
  "trace.started",
]);

const BLOCKED_TRACE_EVENT_TOKENS = [
  ".delta",
  "audit",
  "debug",
  "internal",
  "model",
  "policy",
  "prompt",
  "provider",
  "raw",
  "reasoning",
];

const INTERNAL_TEXT_TOKENS = [
  "activity_event_id",
  "chain of thought",
  "chain_of_thought",
  "deepseek",
  "model id",
  "model_id",
  "policy metadata",
  "policy_metadata",
  "provider id",
  "provider_id",
  "raw output",
  "raw_output",
  "request id",
  "request_id",
  "stacktrace",
  "system prompt",
  "system_prompt",
  "trace id",
  "trace_id",
];

function readText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function isTranscriptEventType(value: unknown): value is TranscriptEventType {
  return value === "trace" || value === "step";
}

function looksInternalText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.startsWith("{") || normalized.startsWith("[")) return true;
  const lowered = normalized.toLowerCase();
  return INTERNAL_TEXT_TOKENS.some((token) => lowered.includes(token));
}

function safeScalar(value: unknown, key: string): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\0/g, "").trim();
  if (["caption", "description", "detail", "label", "message", "summary", "title"].includes(key) && looksInternalText(cleaned)) {
    return undefined;
  }
  return cleaned.slice(0, 500);
}

function sanitizeValue(value: unknown, key: string, safeKeys: Set<string>, depth: number): unknown {
  if (BLOCKED_KEYS.has(key)) return undefined;
  const scalar = safeScalar(value, key);
  if (scalar !== undefined || value == null) return scalar;
  if (Array.isArray(value)) {
    if (depth > 2) return [];
    return value
      .slice(0, 20)
      .map((item) => sanitizeValue(item, "", safeKeys, depth + 1))
      .filter((item) => item != null && (!(typeof item === "object") || Object.keys(item as JsonRecord).length > 0));
  }
  if (typeof value === "object") {
    return sanitizeRecord(readRecord(value), key === "metadata" ? SAFE_METADATA_KEYS : safeKeys, depth + 1);
  }
  return undefined;
}

function sanitizeRecord(record: JsonRecord, safeKeys: Set<string>, depth = 0): JsonRecord {
  if (depth > 2) return {};
  const sanitized: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    const token = key.trim();
    if (!token || BLOCKED_KEYS.has(token)) continue;
    if (safeKeys.size > 0 && !safeKeys.has(token)) continue;
    const nextValue = sanitizeValue(value, token, safeKeys, depth);
    if (nextValue == null) continue;
    if (typeof nextValue === "object" && Object.keys(nextValue as JsonRecord).length === 0) continue;
    sanitized[token] = nextValue;
  }
  return sanitized;
}

function traceEventType(payload: JsonRecord): string {
  const data = readRecord(payload.data);
  return readText(payload.event_type || data.event || data.kind).toLowerCase();
}

function isAllowedTracePayload(payload: JsonRecord): boolean {
  const eventType = traceEventType(payload);
  if (!eventType || BLOCKED_TRACE_EVENTS.has(eventType)) return false;
  if (BLOCKED_TRACE_EVENT_TOKENS.some((token) => eventType.includes(token))) return false;
  if (TRACE_EVENT_EXACT.has(eventType)) return true;
  if (TRACE_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix))) return true;
  return SENDISH_TRACE_TOKENS.some((token) => eventType.includes(token));
}

function sanitizeTracePayload(payload: JsonRecord): JsonRecord {
  const sanitized: JsonRecord = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_TRACE_TOP_LEVEL_KEYS.has(key)) continue;
    const nextValue = key === "data"
      ? sanitizeRecord(readRecord(value), SAFE_TRACE_DATA_KEYS)
      : key === "metadata"
        ? sanitizeRecord(readRecord(value), SAFE_METADATA_KEYS)
        : sanitizeValue(value, key, new Set(), 0);
    if (nextValue == null) continue;
    if (typeof nextValue === "object" && Object.keys(nextValue as JsonRecord).length === 0) continue;
    sanitized[key] = nextValue;
  }
  return sanitized;
}

function sanitizeStepPayload(payload: JsonRecord): JsonRecord {
  return sanitizeRecord(payload, SAFE_STEP_KEYS);
}

function normalizeTranscriptPayload(event: TranscriptEventType, payload: JsonRecord): JsonRecord | null {
  if (event === "trace") {
    if (!isAllowedTracePayload(payload)) return null;
    const sanitized = sanitizeTracePayload(payload);
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  const kind = readText(payload.kind).toLowerCase();
  if (BLOCKED_STEP_KINDS.has(kind)) return null;
  if (!kind && !readText(payload.label) && !readText(payload.detail)) return null;
  const sanitized = sanitizeStepPayload(payload);
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function normalizeTranscriptStreamEvent(value: unknown): EmpyralistStreamEvent | null {
  const record = readRecord(value);
  const event = readText(record.event || record.type).toLowerCase();
  if (!isTranscriptEventType(event)) return null;
  const payload = readRecord(record.payload);
  const normalizedPayload = normalizeTranscriptPayload(event, payload);
  return normalizedPayload ? { event, payload: normalizedPayload } : null;
}

export function transcriptStreamEventsFromMetadata(metadata: Record<string, unknown>): EmpyralistStreamEvent[] {
  const rawEvents = Array.isArray(metadata.transcript_events) ? metadata.transcript_events : [];
  return rawEvents
    .map((item) => normalizeTranscriptStreamEvent(item))
    .filter((item): item is EmpyralistStreamEvent => Boolean(item))
    .slice(-TRANSCRIPT_EVENT_LIMIT);
}
