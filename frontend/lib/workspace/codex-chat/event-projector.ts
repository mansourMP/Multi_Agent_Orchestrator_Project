'use client';

import type {
  CodexChatEvent,
  TimelineProjectionEvent,
} from './cells';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStepStatus(value: unknown): 'running' | 'done' | 'error' {
  const normalized = readString(value).toLowerCase();
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed' || normalized === 'success') {
    return 'done';
  }
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') {
    return 'error';
  }
  return 'running';
}

function fileActionLabel(label: string, fallback: string): string {
  const lower = `${label} ${fallback}`.toLowerCase();
  if (lower.includes('read')) {
    return 'Read';
  }
  if (lower.includes('rename') || lower.includes('move')) {
    return 'Move';
  }
  if (lower.includes('write')) {
    return 'Write';
  }
  if (lower.includes('open')) {
    return 'Open';
  }
  if (lower.includes('delete')) {
    return 'Delete';
  }
  return label || fallback || 'Updated';
}

function isSendish(value: string): boolean {
  return /send|sent|dispatch|deliver|reply|post|submit|outbound/i.test(value);
}

function isSearchLabel(value: string): boolean {
  return /search|searched|web/i.test(value);
}

function isFileLabel(value: string): boolean {
  return /file|read|write|open|path|desktop|folder/i.test(value);
}

function isShellLabel(value: string): boolean {
  return /shell|command|terminal|bash|zsh|exec|run/i.test(value);
}

function isShellToolName(toolName: string, command: string): boolean {
  if (command.trim()) {
    return true;
  }
  return /shell|command|terminal|bash|zsh|exec/i.test(toolName);
}

function toolInputRecord(data: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    data.input,
    data.arguments,
    data.args,
    data.parameters,
  ];
  for (const candidate of candidates) {
    const record = readObject(candidate);
    if (Object.keys(record).length > 0) {
      return record;
    }
  }
  return {};
}

function toolResultText(data: Record<string, unknown>): string | null {
  return readString(data.summary)
    || readString(data.result)
    || readString(data.output)
    || readString(data.text)
    || null;
}

function toolDisplayName(rawName: string): string {
  const normalized = rawName
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = normalized.toLowerCase();
  if (!lower) {
    return 'Using tool';
  }
  if (lower.includes('telegram')) {
    return isSendish(lower) ? 'Sending Telegram' : 'Using Telegram';
  }
  if (lower.includes('whatsapp')) {
    return isSendish(lower) ? 'Sending WhatsApp' : 'Using WhatsApp';
  }
  if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
    return isSendish(lower) ? 'Sending email' : 'Using email';
  }
  if (lower.includes('image')) {
    return 'Generating image';
  }
  if (lower.includes('browser')) {
    return 'Browser action';
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function browserActionDisplay(action: string): string {
  const normalized = action.toLowerCase();
  if (!normalized) {
    return 'Browser action';
  }
  return 'Browser action';
}

function eventId(prefix: string, candidate: unknown, fallbackIndex: number): string {
  return readString(candidate) || `${prefix}:${fallbackIndex}`;
}

function projectStepEvent(payload: Record<string, unknown>, fallbackIndex: number): CodexChatEvent[] {
  const kind = readString(payload.kind).toLowerCase();
  const id = readString(payload.id) || `${kind || 'step'}:${fallbackIndex}`;
  const label = readString(payload.label);
  const detail = readString(payload.detail);
  const status = normalizeStepStatus(payload.status);
  const combined = `${label} ${detail}`.trim();

  if (kind === 'thinking') {
    return [{
      type: 'reasoning_delta',
      id: 'reasoning_summary',
      text: detail || label || 'Thinking',
      isStreaming: status === 'running',
    }];
  }

  if (kind === 'browser') {
    if (status === 'running') {
      return [{ type: 'tool_started', id, name: label || 'Using browser' }];
    }
    return [{
      type: 'tool_result',
      id,
      name: label || 'Using browser',
      status: status === 'error' ? 'error' : 'done',
      result: detail || null,
    }];
  }

  if (kind === 'shell' || isShellLabel(combined)) {
    if (status === 'running') {
      return [{ type: 'exec_started', id, command: detail || label || 'Running command' }];
    }
    return [{ type: 'exec_result', id, status, output: detail || null, exitCode: null }];
  }

  if (kind === 'file' || isFileLabel(combined)) {
    return [{
      type: 'file_change',
      id,
      filename: detail || label || 'File',
      action: fileActionLabel(label, detail),
      status,
    }];
  }

  if (kind === 'search' || isSearchLabel(combined)) {
    if (status === 'running') {
      return [{ type: 'web_search_started', id, query: detail || label || 'Search' }];
    }
    return [{ type: 'web_search_result', id, query: detail || label || null, status: status === 'error' ? 'error' : 'done', result: detail || null }];
  }

  if (status === 'running') {
    return [{ type: 'tool_started', id, name: label || detail || 'Tool' }];
  }
  return [{
    type: 'tool_result',
    id,
    name: label || null,
    status: status === 'error' ? 'error' : 'done',
    result: detail || null,
  }];
}

function projectTraceEvent(payload: Record<string, unknown>, fallbackIndex: number): CodexChatEvent[] {
  const eventType = readString(payload.event_type).toLowerCase();
  const data = readObject(payload.data);
  const metadata = readObject(payload.metadata);

  if (eventType === 'trace.started') {
    return [];
  }

  if (eventType === 'reasoning.summary.delta') {
    const delta = readString(data.delta);
    return delta
      ? [{ type: 'reasoning_delta', id: 'reasoning_summary', text: delta, isStreaming: true }]
      : [];
  }

  if (eventType === 'assistant.message.delta') {
    // The transport already emits assistant text as chunk events. Trace deltas
    // are transparency metadata, not a second source of transcript text.
    return [];
  }

  if (eventType === 'tool.started') {
    const toolName = readString(data.tool_name) || readString(data.name) || 'Tool';
    const input = toolInputRecord(data);
    const command = readString(input.command) || readString(input.cmd) || readString(data.command);
    const query = readString(input.query) || readString(data.query);
    const path = readString(input.path) || readString(input.file_path) || readString(input.filename) || readString(data.path);
    const id = eventId('tool', payload.tool_call_id || payload.item_id, fallbackIndex);
    const combined = `${toolName} ${command} ${query} ${path}`;
    if (isShellToolName(toolName, command)) {
      return [{
        type: 'exec_started',
        id,
        command: command || 'Running shell',
      }];
    }
    if (isFileLabel(combined)) {
      return [{
        type: 'file_change',
        id,
        filename: path || readString(input.name) || 'File',
        action: fileActionLabel(toolName, path || 'Reading'),
        status: 'running',
      }];
    }
    if (isSearchLabel(combined)) {
      return [{
        type: 'web_search_started',
        id,
        query: query || 'Searching web',
      }];
    }
    return [{
      type: 'tool_started',
      id,
      name: toolDisplayName(toolName),
    }];
  }

  if (eventType === 'tool.result') {
    const status = readString(data.status).toLowerCase() === 'error' ? 'error' : 'done';
    const toolName = readString(data.tool_name) || readString(data.name) || 'Tool';
    const input = toolInputRecord(data);
    const command = readString(input.command) || readString(input.cmd) || readString(data.command);
    const query = readString(input.query) || readString(data.query);
    const path = readString(input.path) || readString(input.file_path) || readString(input.filename) || readString(data.path);
    const result = toolResultText(data);
    const id = eventId('tool', payload.tool_call_id || payload.item_id, fallbackIndex);
    const combined = `${toolName} ${command} ${query} ${path}`;
    if (isShellToolName(toolName, command)) {
      return [{
        type: 'exec_result',
        id,
        status,
        output: result,
        exitCode: readNumber(data.exit_code),
      }];
    }
    if (isFileLabel(combined)) {
      return [{
        type: 'file_change',
        id,
        filename: path || readString(input.name) || 'File',
        action: fileActionLabel(toolName, path || 'Read'),
        status,
      }];
    }
    if (isSearchLabel(combined)) {
      return [{
        type: 'web_search_result',
        id,
        query: query || null,
        status,
        result,
      }];
    }
    return [{
      type: 'tool_result',
      id,
      name: toolDisplayName(toolName),
      status,
      result,
    }];
  }

  if (eventType === 'browser.action' || eventType === 'computer.browser.action') {
    const action = readString(data.action) || readString(data.kind) || readString(data.event) || 'Action';
    const summary = readString(data.summary) || readString(data.detail) || null;
    return [{
      type: 'tool_result',
      id: eventId('browser-action', payload.item_id || payload.tool_call_id, fallbackIndex),
      name: browserActionDisplay(action),
      status: readString(data.status).toLowerCase() === 'error' ? 'error' : 'done',
      result: summary,
    }];
  }

  if (eventType.includes('telegram')) {
    const status = readString(data.status).toLowerCase() === 'error' ? 'error' : 'done';
    const channelSummary = `${eventType} ${readString(data.delivery_transport)} ${readString(data.summary)} ${readString(data.message)}`;
    return [{
      type: 'tool_result',
      id: eventId('telegram', payload.item_id || payload.tool_call_id, fallbackIndex),
      name: isSendish(channelSummary) ? 'Sending Telegram' : 'Using Telegram',
      status,
      result: readString(data.summary) || readString(data.message) || null,
    }];
  }

  if (eventType.includes('whatsapp')) {
    const status = readString(data.status).toLowerCase() === 'error' ? 'error' : 'done';
    const channelSummary = `${eventType} ${readString(data.delivery_transport)} ${readString(data.summary)} ${readString(data.message)}`;
    return [{
      type: 'tool_result',
      id: eventId('whatsapp', payload.item_id || payload.tool_call_id, fallbackIndex),
      name: isSendish(channelSummary) ? 'Sending WhatsApp' : 'Using WhatsApp',
      status,
      result: readString(data.summary) || readString(data.message) || null,
    }];
  }

  if (eventType === 'search.query') {
    return [{
      type: 'web_search_started',
      id: eventId('search', payload.tool_call_id || payload.item_id, fallbackIndex),
      query: readString(data.query) || 'Search',
    }];
  }

  if (eventType === 'search.results') {
    return [{
      type: 'web_search_result',
      id: eventId('search', payload.tool_call_id || payload.item_id, fallbackIndex),
      query: readString(data.query) || null,
      status: 'done',
      result: readString(data.summary) || null,
    }];
  }

  if (eventType === 'browser.screenshot' || eventType === 'screenshot.captured') {
    const artifactId = readString(data.artifact_id)
      || readString(data.artifactId)
      || readString(metadata.artifact_id)
      || null;
    const caption = readString(data.caption)
      || readString(data.description)
      || readString(data.summary)
      || 'Screenshot captured';
    return [{
      type: 'screenshot_captured',
      id: eventId('screenshot', artifactId || payload.item_id || payload.tool_call_id, fallbackIndex),
      caption,
      artifactId,
      width: readNumber(data.width),
      height: readNumber(data.height),
      status: readString(data.status).toLowerCase() === 'error' ? 'error' : 'done',
    }];
  }

  if (eventType === 'artifact.created') {
    const mimeType = readString(data.mime_type) || readString(data.mimeType);
    if (mimeType.startsWith('image/')) {
      const artifactId = readString(data.artifact_id)
        || readString(data.artifactId)
        || readString(payload.item_id)
        || null;
      return [{
        type: 'screenshot_captured',
        id: eventId('artifact', artifactId || payload.item_id, fallbackIndex),
        caption: readString(data.title) || readString(data.label) || 'Image artifact captured',
        artifactId,
        width: readNumber(data.width),
        height: readNumber(data.height),
        status: 'done',
      }];
    }
    return [{
      type: 'status',
      id: eventId('artifact', data.artifact_id || data.artifactId || payload.item_id, fallbackIndex),
      label: 'Done',
      detail: readString(data.title) || readString(data.label) || readString(data.mime_type) || null,
      status: 'done',
    }];
  }

  if (eventType === 'plan.item.created') {
    const title = readString(data.title);
    const summary = readString(data.rationale_summary);
    const combined = `${title} ${summary}`.toLowerCase();
    if (combined.includes('search')) {
      return [{
        type: 'web_search_started',
        id: eventId('search-plan', data.item_id, fallbackIndex),
        query: title || 'Search',
      }];
    }
    if (combined.includes('file') || combined.includes('read') || combined.includes('open')) {
      return [{
        type: 'file_change',
        id: eventId('file-plan', data.item_id, fallbackIndex),
        filename: title || 'File',
        action: 'Read',
        status: 'done',
      }];
    }
  }

  if (eventType.includes('approval')) {
    return [{
      type: 'approval_request',
      id: eventId('approval', data.approval_id || data.id || payload.item_id, fallbackIndex),
      prompt: readString(data.prompt) || readString(data.message) || 'Approval required',
    }];
  }

  if (
    eventType === 'trace.completed'
    || eventType === 'run.completed'
    || eventType === 'turn.completed'
    || eventType === 'assistant.completed'
  ) {
    const completionDetail = readString(data.summary) || readString(data.outcome) || readString(data.result) || null;
    return [{
      type: 'status',
      id: eventId('done', payload.trace_id || payload.item_id, fallbackIndex),
      label: 'Done',
      detail: completionDetail,
      status: 'done',
    }];
  }

  return [];
}

export function projectRawEventToCodexEvents(
  event: TimelineProjectionEvent,
  fallbackIndex = 0,
): CodexChatEvent[] {
  if (event.type === 'user') {
    return [{
      type: 'user',
      id: `user:${fallbackIndex}`,
      content: readString(event.payload.content),
    }];
  }

  if (event.type === 'step') {
    return projectStepEvent(readObject(event.payload), fallbackIndex);
  }

  if (event.type === 'trace') {
    return projectTraceEvent(readObject(event.payload), fallbackIndex);
  }

  if (event.type === 'chunk') {
    const delta = readString(event.payload.delta);
    return delta
      ? [{ type: 'assistant_delta', id: 'assistant', delta, provider: null, model: null }]
      : [];
  }

  const payload = readObject(event.payload);
  const metadata = readObject(payload.metadata);
  const reply = readString(payload.reply) || readString(payload.content) || readString(payload.message);
  const status = readString(payload.status).toLowerCase();
  return [{
    type: 'assistant_final',
    id: 'assistant',
    content: reply,
    isIncomplete: status === 'incomplete' || metadata.incomplete === true,
    provider: readString(metadata.effective_provider) || readString(metadata.provider) || null,
    model: readString(metadata.effective_model) || readString(metadata.model) || null,
  }];
}

export const codexChatEventInternals = {
  readObject,
  readNumber,
  readString,
};
