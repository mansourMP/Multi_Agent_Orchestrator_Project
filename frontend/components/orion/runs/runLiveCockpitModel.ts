export type RunLiveFeedMode = 'timeline' | 'logs';

export type RunLiveStreamState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'closed';

export type RunLiveReplayEvent = {
  event_id?: string;
  seq?: number;
  run_id?: string;
  ts?: string;
  level?: string;
  event?: string;
  message?: string;
  data?: unknown;
};

export type RunLiveTimelineEvent = {
  id: string;
  ts: string;
  seq: number | null;
  level: string;
  event: string;
  message: string;
  toolHint: string | null;
  rawData: Record<string, unknown> | null;
};

export type RunLiveLogRow = {
  id: string;
  ts: string;
  level: string;
  text: string;
};

function summarizeToolHint(data: unknown, event: string): string | null {
  const lower = String(event || '').trim().toLowerCase();
  if (lower.includes('tool')) return 'tool event';
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const candidates = [
    record.tool,
    record.tool_name,
    record.toolId,
    record.action,
    record.node_id,
    record.nodeId,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

export function parseRunLiveEventJson(value: string): RunLiveReplayEvent | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as RunLiveReplayEvent;
  } catch {
    return null;
  }
}

export function toRunLiveTimelineEvent(
  input: RunLiveReplayEvent,
  index: number,
  source: 'replay' | 'live',
): RunLiveTimelineEvent {
  const event = String(input?.event || 'event');
  const message = String(input?.message || '').trim();
  const eventId = String(input?.event_id || '').trim();
  const seq = typeof input?.seq === 'number' && Number.isFinite(input.seq) ? input.seq : null;
  return {
    id: eventId || `${source}:${event}:${index}`,
    ts: String(input?.ts || ''),
    seq,
    level: String(input?.level || 'info').toLowerCase(),
    event,
    message: message || event,
    toolHint: summarizeToolHint(input?.data, event),
    rawData: input?.data && typeof input.data === 'object' ? (input.data as Record<string, unknown>) : null,
  };
}

export function buildRunLiveTimelineEvents(
  replayEvents: RunLiveReplayEvent[] | null | undefined,
  liveEvents: RunLiveReplayEvent[] | null | undefined,
): RunLiveTimelineEvent[] {
  const combined: RunLiveTimelineEvent[] = [];
  const seen = new Set<string>();
  const pushUnique = (entry: RunLiveTimelineEvent) => {
    const identity = entry.id || `${entry.ts}|${entry.event}|${entry.message}|${entry.seq ?? ''}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    combined.push(entry);
  };
  (Array.isArray(replayEvents) ? replayEvents : []).forEach((item, index) => {
    pushUnique(toRunLiveTimelineEvent(item, index, 'replay'));
  });
  (Array.isArray(liveEvents) ? liveEvents : []).forEach((item, index) => {
    pushUnique(toRunLiveTimelineEvent(item, index, 'live'));
  });
  return combined;
}

export function buildRunLiveLogRows(timelineEvents: RunLiveTimelineEvent[]): RunLiveLogRow[] {
  return timelineEvents.map((item) => ({
    id: item.id,
    ts: item.ts,
    level: item.level,
    text: item.message,
  }));
}
