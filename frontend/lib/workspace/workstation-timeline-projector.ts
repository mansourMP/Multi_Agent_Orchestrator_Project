'use client';

export type TimelineProjectionEvent =
  | { type: 'user'; payload: { content: string } }
  | { type: 'step'; payload: Record<string, unknown> }
  | { type: 'trace'; payload: Record<string, unknown> }
  | { type: 'chunk'; payload: { delta: string } }
  | { type: 'final'; payload: Record<string, unknown> };

export type TimelineRow =
  | { id: string; kind: 'user'; content: string }
  | { id: string; kind: 'thinking'; text: string; activityLine: string | null; isStreaming: boolean }
  | { id: string; kind: 'tool'; name: string; status: 'running' | 'done' | 'error'; result: string | null }
  | { id: string; kind: 'file'; filename: string; action: string }
  | { id: string; kind: 'search'; query: string; status: 'searching' | 'done' }
  | { id: string; kind: 'assistant'; content: string; isStreaming: boolean; isIncomplete: boolean };

const COMPACT_ACTIVITY_PREFIXES = [
  'running ',
  'completed ',
  'failed ',
  'stopped ',
  'read ',
  'reading ',
  'search ',
  'searched ',
  'searching ',
  'exploring ',
  'list ',
  'listing ',
  'open ',
  'opened ',
  'find ',
  'finding ',
  'edit ',
  'edited ',
  'write ',
  'writing ',
  'wrote ',
  'apply ',
  'applied ',
] as const;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedThinkingContent(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.toLowerCase().startsWith('thinking...')) {
    return trimmed.slice('thinking...'.length).trim();
  }
  if (trimmed.toLowerCase() === 'thinking') {
    return '';
  }
  return trimmed;
}

function compactActivityPreview(normalizedText: string): string | null {
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const activityLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return COMPACT_ACTIVITY_PREFIXES.some((prefix) => lower.startsWith(prefix));
  });
  const isActivityOnly = activityLines.length === lines.length;
  if (isActivityOnly) {
    return activityLines.at(-1) ?? null;
  }
  if (activityLines.length === 1) {
    return activityLines[0] ?? null;
  }
  return null;
}

function mergeThinkingText(existing: string, incoming: string): string {
  const existingTrimmed = existing.trim();
  const incomingTrimmed = incoming.trim();
  if (!incomingTrimmed) {
    return existingTrimmed;
  }
  if (!existingTrimmed) {
    return incomingTrimmed;
  }
  const placeholders = new Set(['thinking...']);
  const existingLower = existingTrimmed.toLowerCase();
  const incomingLower = incomingTrimmed.toLowerCase();
  if (placeholders.has(incomingLower)) {
    return existingTrimmed;
  }
  if (placeholders.has(existingLower)) {
    return incomingTrimmed;
  }
  if (incomingLower === existingLower) {
    return incomingTrimmed;
  }
  if (incomingTrimmed.includes(existingTrimmed)) {
    return incomingTrimmed;
  }
  if (existingTrimmed.includes(incomingTrimmed)) {
    return existingTrimmed;
  }
  return `${existingTrimmed}\n${incomingTrimmed}`;
}

function normalizeStepStatus(value: unknown): 'running' | 'done' | 'error' {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') {
    return 'done';
  }
  if (normalized === 'error' || normalized === 'failed') {
    return 'error';
  }
  return 'running';
}

function fileActionLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('read')) {
    return 'Read';
  }
  if (lower.includes('write')) {
    return 'Write';
  }
  if (lower.includes('open')) {
    return 'Open';
  }
  return label || 'Updated';
}

function toolResultStatus(value: unknown): 'running' | 'done' | 'error' {
  return readString(value).toLowerCase() === 'error' ? 'error' : 'done';
}

export function projectTimeline(events: TimelineProjectionEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const rowIndexById = new Map<string, number>();

  const upsertThinking = (nextText: string, isStreaming: boolean) => {
    const normalizedText = normalizedThinkingContent(nextText);
    const activityLine = compactActivityPreview(normalizedText);
    const existingIndex = rowIndexById.get('thinking');
    const row: TimelineRow = {
      id: 'thinking',
      kind: 'thinking',
      text: normalizedText,
      activityLine,
      isStreaming,
    };
    if (existingIndex === undefined) {
      rowIndexById.set('thinking', rows.length);
      rows.push(row);
      return;
    }
    rows[existingIndex] = row;
  };

  const upsertTool = (id: string, name: string, status: 'running' | 'done' | 'error', result: string | null) => {
    const existingIndex = rowIndexById.get(id);
    const row: TimelineRow = {
      id,
      kind: 'tool',
      name: name || 'Tool',
      status,
      result,
    };
    if (existingIndex === undefined) {
      rowIndexById.set(id, rows.length);
      rows.push(row);
      return;
    }
    rows[existingIndex] = {
      ...(rows[existingIndex] as Extract<TimelineRow, { kind: 'tool' }>),
      ...row,
      name: name || (rows[existingIndex] as Extract<TimelineRow, { kind: 'tool' }>).name,
    };
  };

  const upsertSearch = (id: string, query: string, status: 'searching' | 'done') => {
    const existingIndex = rowIndexById.get(id);
    const row: TimelineRow = {
      id,
      kind: 'search',
      query: query || 'Search',
      status,
    };
    if (existingIndex === undefined) {
      rowIndexById.set(id, rows.length);
      rows.push(row);
      return;
    }
    rows[existingIndex] = row;
  };

  const upsertAssistant = (delta: string, isStreaming: boolean, isIncomplete: boolean) => {
    const existingIndex = rowIndexById.get('assistant');
    const existing = existingIndex === undefined ? null : rows[existingIndex] as Extract<TimelineRow, { kind: 'assistant' }>;
    const nextContent = `${existing?.content ?? ''}${delta}`;
    const row: TimelineRow = {
      id: 'assistant',
      kind: 'assistant',
      content: nextContent,
      isStreaming,
      isIncomplete,
    };
    if (existingIndex === undefined) {
      rowIndexById.set('assistant', rows.length);
      rows.push(row);
      return;
    }
    rows[existingIndex] = row;
  };

  for (const event of events) {
    if (event.type === 'user') {
      rows.push({
        id: `user:${rows.length}`,
        kind: 'user',
        content: readString(event.payload.content),
      });
      continue;
    }

    if (event.type === 'step') {
      const payload = readObject(event.payload);
      const kind = readString(payload.kind).toLowerCase();
      const id = readString(payload.id) || `${kind}:${rows.length}`;
      const label = readString(payload.label);
      const detail = readString(payload.detail);
      if (kind === 'thinking') {
        upsertThinking(detail || label || 'Thinking', normalizeStepStatus(payload.status) === 'running');
        continue;
      }
      if (kind === 'file') {
        rows.push({
          id,
          kind: 'file',
          filename: detail || label || 'File',
          action: fileActionLabel(label),
        });
        continue;
      }
      if (kind === 'search') {
        upsertSearch(id, detail || label, normalizeStepStatus(payload.status) === 'running' ? 'searching' : 'done');
        continue;
      }
      if (kind === 'tool') {
        upsertTool(id, label || 'Tool', normalizeStepStatus(payload.status), detail || null);
      }
      continue;
    }

    if (event.type === 'trace') {
      const payload = readObject(event.payload);
      const eventType = readString(payload.event_type).toLowerCase();
      const data = readObject(payload.data);
      if (eventType === 'reasoning.summary.delta') {
        const delta = readString(data.delta);
        if (delta) {
          const existing = rowIndexById.get('thinking');
          const existingText = existing === undefined ? '' : (rows[existing] as Extract<TimelineRow, { kind: 'thinking' }>).text;
          upsertThinking(mergeThinkingText(existingText, delta), true);
        }
        continue;
      }
      if (eventType === 'tool.started') {
        const toolId = readString(payload.tool_call_id) || readString(payload.item_id) || `tool:${rows.length}`;
        upsertTool(toolId, readString(data.tool_name) || 'Tool', 'running', null);
        continue;
      }
      if (eventType === 'tool.result') {
        const toolId = readString(payload.tool_call_id) || readString(payload.item_id) || `tool:${rows.length}`;
        upsertTool(toolId, '', toolResultStatus(data.status), readString(data.summary) || null);
        continue;
      }
      if (eventType === 'search.query') {
        const searchId = readString(payload.tool_call_id) || `search:${rows.length}`;
        upsertSearch(searchId, readString(data.query), 'searching');
        continue;
      }
      if (eventType === 'search.results') {
        const searchId = readString(payload.tool_call_id) || 'search';
        const existing = rowIndexById.get(searchId);
        const query = existing === undefined ? 'Search' : (rows[existing] as Extract<TimelineRow, { kind: 'search' }>).query;
        upsertSearch(searchId, query, 'done');
        continue;
      }
      if (eventType === 'plan.item.created') {
        const title = readString(data.title);
        const summary = readString(data.rationale_summary);
        const combined = `${title} ${summary}`.toLowerCase();
        if (combined.includes('search')) {
          rows.push({
            id: readString(data.item_id) || `search-plan:${rows.length}`,
            kind: 'search',
            query: title || 'Search',
            status: 'searching',
          });
          continue;
        }
        if (combined.includes('file') || combined.includes('read') || combined.includes('open')) {
          rows.push({
            id: readString(data.item_id) || `file-plan:${rows.length}`,
            kind: 'file',
            filename: title || 'File',
            action: 'Read',
          });
        }
      }
      continue;
    }

    if (event.type === 'chunk') {
      const delta = readString(event.payload.delta);
      if (delta) {
        upsertAssistant(delta, true, false);
      }
      continue;
    }

    if (event.type === 'final') {
      const payload = readObject(event.payload);
      const reply = readString(payload.reply);
      const status = readString(payload.status).toLowerCase();
      const isIncomplete = status === 'incomplete' || readObject(payload.metadata).incomplete === true;
      const existingIndex = rowIndexById.get('assistant');
      if (existingIndex !== undefined) {
        const existing = rows[existingIndex] as Extract<TimelineRow, { kind: 'assistant' }>;
        rows[existingIndex] = {
          ...existing,
          content: reply || existing.content,
          isStreaming: false,
          isIncomplete,
        };
      } else if (reply) {
        rows.push({
          id: 'assistant',
          kind: 'assistant',
          content: reply,
          isStreaming: false,
          isIncomplete,
        });
        rowIndexById.set('assistant', rows.length - 1);
      }
      const thinkingIndex = rowIndexById.get('thinking');
      if (thinkingIndex !== undefined) {
        const thinking = rows[thinkingIndex] as Extract<TimelineRow, { kind: 'thinking' }>;
        rows[thinkingIndex] = { ...thinking, isStreaming: false };
      }
    }
  }

  return rows;
}
