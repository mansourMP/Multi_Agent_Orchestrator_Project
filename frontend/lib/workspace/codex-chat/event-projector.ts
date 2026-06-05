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

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readString).filter(Boolean);
  }
  const single = readString(value);
  return single ? [single] : [];
}

function artifactIdsFromPayload(
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string[] {
  const ids: string[] = [];
  for (const candidate of [
    ...readStringList(data.artifact_ids),
    ...readStringList(data.artifacts),
    readString(data.artifact_id),
    readString(data.artifactId),
    ...readStringList(metadata.artifact_ids),
    readString(metadata.artifact_id),
    readString(metadata.artifactId),
    ...readStringList(payload.artifact_ids),
    readString(payload.artifact_id),
    readString(payload.artifactId),
  ]) {
    if (candidate && !ids.includes(candidate)) {
      ids.push(candidate);
    }
  }
  return ids;
}

function interventionStatusEvents(
  payload: Record<string, unknown>,
  fallbackIndex: number,
): CodexChatEvent[] {
  const interventions = Array.isArray(payload.interventions) ? payload.interventions : [];
  return interventions
    .map((item, index): CodexChatEvent | null => {
      const record = readObject(item);
      const kind = readString(record.kind);
      const title = readString(record.title) || toolDisplayName(kind) || 'Action needed';
      const detail = readString(record.detail) || readString(record.message) || null;
      const severity = readString(record.severity).toLowerCase();
      const status = readString(record.status).toLowerCase();
      const code = readString(record.code);
      const state: 'idle' | 'running' | 'done' | 'error' = (
        severity === 'error'
        || status === 'failed'
        || status === 'blocked'
        || status === 'error'
        || code.includes('error')
        || code.includes('blocked')
      ) ? 'error' : status === 'done' || status === 'completed' ? 'done' : 'idle';
      if (!title && !detail) {
        return null;
      }
      return {
        type: 'status',
        id: eventId('intervention', record.id || record.code || record.kind || title, fallbackIndex + index),
        label: title,
        detail,
        status: state,
      };
    })
    .filter((item): item is CodexChatEvent => Boolean(item));
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

function normalizeToolResultStatus(value: unknown): 'running' | 'done' | 'error' {
  const normalized = readString(value).toLowerCase();
  if (['done', 'complete', 'completed', 'success', 'succeeded'].includes(normalized)) {
    return 'done';
  }
  if (['running', 'queued', 'waiting', 'waiting_approval', 'waiting-for-approval', 'pending'].includes(normalized)) {
    return 'running';
  }
  if (['error', 'failed', 'failure', 'blocked', 'denied', 'offline', 'degraded'].includes(normalized)) {
    return 'error';
  }
  return 'done';
}

function normalizeApprovalStatus(eventType: string, data: Record<string, unknown>): 'waiting' | 'done' | 'error' {
  const token = readString(data.decision || data.resolution || data.status).toLowerCase();
  if (['rejected', 'reject', 'denied', 'deny', 'no', 'cancel', 'cancelled', 'canceled', 'stopped', 'aborted', 'failed', 'error'].includes(token)) {
    return 'error';
  }
  if (
    eventType.includes('resolved')
    || ['approved', 'approve', 'allowed', 'allow_once', 'allow_session', 'accepted', 'proceed', 'executed', 'done', 'resolved'].includes(token)
  ) {
    return 'done';
  }
  return 'waiting';
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
  if (isComputerSystemInfoTool(toolName)) {
    return false;
  }
  if (command.trim()) {
    return true;
  }
  return /shell|command|terminal|bash|zsh|exec/i.test(toolName);
}

function isComputerSystemInfoTool(toolName: string): boolean {
  const normalized = readString(toolName)
    .replace(/[_:.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return Boolean(normalized && normalized.includes('computer') && normalized.includes('system') && normalized.includes('info'));
}

function toolInputRecord(data: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    data.input,
    data.arguments,
    data.args_preview,
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

function compactJsonPreview(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim().slice(0, 1000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2).slice(0, 1000);
  } catch {
    return '';
  }
}

function toolInputPreview(data: Record<string, unknown>): string | null {
  const command = shellCommandFromData(data);
  if (command) {
    return null;
  }
  const input = toolInputRecord(data);
  const query = readString(data.query) || readString(input.query);
  if (query) {
    return query;
  }
  const url = readString(data.url) || readString(input.url);
  if (url) {
    return url;
  }
  const path = filePathFromData(data);
  if (path) {
    return path;
  }
  const directInput = compactJsonPreview(data.input ?? data.arguments ?? data.args ?? data.parameters);
  if (directInput) {
    return null;
  }
  const summary = readString(data.summary) || readString(data.detail);
  return summary || null;
}

const INTERNAL_TOOL_RESULT_PATTERN = /\b(?:event_type|trace_id|tool_call_id|activity_event_id|metadata|payload|run[_\s-]?command|shell[_\s-]?command|tool_calls|DSML)\b/i;
const ASSISTANT_ACTION_PLAN_RESULT_PATTERN = /\b(?:i(?:'|’)?ll check|i will check|i(?:'|’)?ll run|i will run|i(?:'|’)?ll retrieve|i will retrieve|running a command|running the command|run a command|retrieve the details|retrieve details|hardware information|checking your system|checking the system|need to run|approve\?)\b/i;
const SYNTHETIC_ASSISTANT_GATE_PATTERN = /\b(?:i do not have a verified agent computer result|i cannot confirm that action completed because no tool result was returned|connect or approve the required system|hardware actions need the computer to be connected|computer is already connected)\b/i;
const SYNTHETIC_ASSISTANT_GATE_PREFIX_PATTERN = /\b(?:i do not have a verified agent computer|i cannot confirm that action|connect or approve the required|hardware actions need the computer|computer is already connected)\b/i;

function visibleToolResultText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value);
    if (!text) {
      continue;
    }
    const normalized = text.replace(/\s+/g, ' ').trim();
    const jsonLike = (
      (normalized.startsWith('{') && normalized.endsWith('}'))
      || (normalized.startsWith('[') && normalized.endsWith(']'))
    );
    if (
      jsonLike
      || INTERNAL_TOOL_RESULT_PATTERN.test(normalized)
      || ASSISTANT_ACTION_PLAN_RESULT_PATTERN.test(normalized)
      || SYNTHETIC_ASSISTANT_GATE_PATTERN.test(normalized)
      || SYNTHETIC_ASSISTANT_GATE_PREFIX_PATTERN.test(normalized)
    ) {
      continue;
    }
    return normalized;
  }
  return null;
}

function visibleAssistantReplyText(value: unknown): string | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (
    INTERNAL_TOOL_RESULT_PATTERN.test(normalized)
    || ASSISTANT_ACTION_PLAN_RESULT_PATTERN.test(normalized)
    || SYNTHETIC_ASSISTANT_GATE_PATTERN.test(normalized)
    || SYNTHETIC_ASSISTANT_GATE_PREFIX_PATTERN.test(normalized)
  ) {
    return null;
  }
  return text;
}

function toolResultText(data: Record<string, unknown>): string | null {
  return visibleToolResultText(
    data.summary,
    data.result,
    data.output,
    data.text,
  );
}

const EXEC_OUTPUT_MAX_LINES = 30;
const EXEC_OUTPUT_MAX_CHARS = 8192;

function outputTail(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value);
    if (!text) {
      continue;
    }
    const charTail = text.length > EXEC_OUTPUT_MAX_CHARS ? text.slice(-EXEC_OUTPUT_MAX_CHARS) : text;
    const lines = charTail.replace(/\r/g, '').split('\n');
    return lines.length > EXEC_OUTPUT_MAX_LINES
      ? lines.slice(-EXEC_OUTPUT_MAX_LINES).join('\n')
      : charTail;
  }
  return null;
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
  if (lower.includes('channel')) {
    return channelDisplayName(lower);
  }
  if (lower.includes('telegram')) {
    return isSendish(lower) ? 'Sending Telegram' : 'Using Telegram';
  }
  if (lower.includes('whatsapp')) {
    return isSendish(lower) ? 'Sending WhatsApp' : 'Using WhatsApp';
  }
  if (lower.includes('slack')) {
    return isSendish(lower) ? 'Sending Slack message' : 'Reading Slack';
  }
  if (lower.includes('discord')) {
    return isSendish(lower) ? 'Sending Discord message' : 'Reading Discord';
  }
  if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
    return isSendish(lower) ? 'Sending email' : 'Using email';
  }
  if (lower.includes('screenshot') || lower.includes('screen capture')) {
    return 'Taking screenshot';
  }
  if ((lower.includes('computer') && lower.includes('system') && lower.includes('info')) || lower.includes('systeminfo')) {
    return 'Reading computer info';
  }
  if (lower.includes('shell') || lower.includes('command') || lower.includes('terminal') || lower.includes('powershell') || lower.includes('systeminfo')) {
    return 'Running command';
  }
  if (lower.includes('computer') || lower.includes('hardware') || lower.includes('keyboard') || lower.includes('mouse') || lower.includes('window') || lower.includes('app focus')) {
    return 'Using Agent Computer';
  }
  if (lower.includes('image')) {
    return 'Generating image';
  }
  if (lower.includes('browser')) {
    return 'Browser action';
  }
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function channelDisplayName(rawName: string): string {
  const lower = rawName.toLowerCase();
  if (lower.includes('telegram')) {
    return isSendish(lower) ? 'Sending Telegram' : 'Using Telegram';
  }
  if (lower.includes('whatsapp')) {
    return isSendish(lower) ? 'Sending WhatsApp' : 'Using WhatsApp';
  }
  if (lower.includes('slack')) {
    return isSendish(lower) ? 'Sending Slack message' : 'Reading Slack';
  }
  if (lower.includes('discord')) {
    return isSendish(lower) ? 'Sending Discord message' : 'Reading Discord';
  }
  if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
    return isSendish(lower) ? 'Sending email' : 'Reading email';
  }
  if (isSendish(lower)) {
    return 'Sending channel message';
  }
  if (lower.includes('read') || lower.includes('fetch') || lower.includes('list') || lower.includes('inbox') || lower.includes('recent') || lower.includes('roster')) {
    return 'Reading channel';
  }
  return 'Using channel';
}

function specialistDisplayName(data: Record<string, unknown>): string {
  return readString(data.specialist_name)
    || readString(data.name)
    || readString(data.label)
    || 'Specialist';
}

function browserActionDisplay(action: string): string {
  const normalized = action.toLowerCase();
  if (!normalized) {
    return 'Browser action';
  }
  return 'Browser action';
}

function traceStatus(value: unknown): 'running' | 'done' | 'error' {
  return normalizeToolResultStatus(value);
}

function statusFromEventType(eventType: string, explicitStatus: unknown): 'running' | 'done' | 'error' {
  const normalized = readString(explicitStatus).toLowerCase();
  if (normalized) {
    return traceStatus(normalized);
  }
  if (/started|queued|waiting|pending|running/.test(eventType)) {
    return 'running';
  }
  if (/failed|failure|error|blocked|denied|offline|degraded/.test(eventType)) {
    return 'error';
  }
  return 'done';
}

function shellCommandFromData(data: Record<string, unknown>): string {
  const input = toolInputRecord(data);
  return readString(data.command)
    || readString(data.cmd)
    || readString(data.run_command)
    || readString(data.shell_command)
    || readString(input.command)
    || readString(input.cmd)
    || readString(input.run_command)
    || readString(input.shell_command);
}

function execMetaFromData(
  data: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
): Pick<
  Extract<CodexChatEvent, { type: 'exec_result' }>,
  'runtimeTarget' | 'machineLabel' | 'targetKind' | 'cwd' | 'durationMs' | 'stdoutTail' | 'stderrTail' | 'approvalStatus'
> {
  const input = toolInputRecord(data);
  return {
    runtimeTarget: readString(data.runtime_target) || readString(metadata.runtime_target) || null,
    machineLabel: readString(data.machine_label)
      || readString(data.target_summary)
      || readString(metadata.label)
      || null,
    targetKind: readString(data.target_kind) || readString(data.runtime_access_mode) || null,
    cwd: readString(data.cwd)
      || readString(data.working_directory)
      || readString(input.cwd)
      || readString(input.workingDir)
      || null,
    durationMs: readNumber(data.duration_ms ?? data.durationMs),
    stdoutTail: outputTail(
      data.stdout_tail,
      data.stdout,
      data.output_tail,
      data.output_preview,
      data.stdout_preview,
      data.summary,
    ),
    stderrTail: outputTail(data.stderr_tail, data.stderr, data.stderr_preview, data.error),
    approvalStatus: readString(data.approval_status)
      || readString(data.approvalStatus)
      || readString(data.decision)
      || null,
  };
}

function filePathFromData(data: Record<string, unknown>): string {
  const input = toolInputRecord(data);
  return readString(data.path)
    || readString(data.file_path)
    || readString(data.filename)
    || readString(input.path)
    || readString(input.file_path)
    || readString(input.filename)
    || readString(input.name);
}

function fileActionFromEventType(eventType: string, fallback: string): string {
  if (eventType.includes('delete') || eventType.includes('remove')) {
    return 'Delete';
  }
  if (eventType.includes('write') || eventType.includes('create') || eventType.includes('update') || eventType.includes('change')) {
    return 'Write';
  }
  if (eventType.includes('rename') || eventType.includes('move')) {
    return 'Move';
  }
  if (eventType.includes('open')) {
    return 'Open';
  }
  return fileActionLabel(fallback, 'Read');
}

function runtimeStatusLabel(eventType: string, data: Record<string, unknown>): string {
  const target = readString(data.runtime_target).toLowerCase();
  const state = readString(data.state || data.status).toLowerCase();
  if (state === 'offline' || eventType.includes('offline')) {
    return target.includes('node') ? 'Node offline' : 'Gateway offline';
  }
  if (state === 'degraded' || eventType.includes('degraded')) {
    return target.includes('node') ? 'Node degraded' : 'Runtime degraded';
  }
  if (eventType.includes('blocked')) {
    return 'Action blocked';
  }
  if (eventType.includes('terminated') || eventType.includes('cancel') || eventType.includes('stop')) {
    return 'Stopped';
  }
  return readString(data.label) || readString(data.title) || 'Runtime status';
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
    const metadata = readObject(payload.metadata);
    const execMeta = execMetaFromData(payload, metadata);
    const command = readString(payload.command) || detail || label || 'Running command';
    if (status === 'running') {
      return [{
        type: 'exec_started',
        id,
        command,
        runtimeTarget: execMeta.runtimeTarget,
        machineLabel: execMeta.machineLabel,
        targetKind: execMeta.targetKind,
        cwd: execMeta.cwd,
        approvalStatus: execMeta.approvalStatus,
      }];
    }
    return [{
      type: 'exec_result',
      id,
      command,
      status,
      output: detail || execMeta.stdoutTail || null,
      exitCode: readNumber(payload.exit_code),
      ...execMeta,
    }];
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
  const eventKey = eventType.replace(/_/g, '.');
  const nestedData = readObject(payload.data);
  const data = { ...payload, ...nestedData };
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
    const toolName = readString(data.tool_name) || readString(data.capability_id) || readString(data.name) || 'Tool';
    const input = toolInputRecord(data);
    const command = shellCommandFromData(data);
    const query = readString(data.query) || readString(input.query);
    const path = filePathFromData(data);
    const id = eventId('tool', payload.tool_call_id || payload.item_id, fallbackIndex);
    const combined = `${toolName} ${command} ${query} ${path}`;
    if (isShellToolName(toolName, command)) {
      const execMeta = execMetaFromData(data, metadata);
      return [{
        type: 'exec_started',
        id,
        command: command || 'Running shell',
        runtimeTarget: execMeta.runtimeTarget,
        machineLabel: execMeta.machineLabel,
        targetKind: execMeta.targetKind,
        cwd: execMeta.cwd,
        approvalStatus: execMeta.approvalStatus,
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
      input: toolInputPreview(data),
    }];
  }

  if (eventType === 'tool.result') {
    const status = normalizeToolResultStatus(data.status);
    const toolName = readString(data.tool_name) || readString(data.capability_id) || readString(data.name) || 'Tool';
    const input = toolInputRecord(data);
    const command = shellCommandFromData(data);
    const query = readString(data.query) || readString(input.query);
    const path = filePathFromData(data);
    const result = toolResultText(data);
    const id = eventId('tool', payload.tool_call_id || payload.item_id, fallbackIndex);
    const combined = `${toolName} ${command} ${query} ${path}`;
    const artifactIds = artifactIdsFromPayload(payload, data, metadata);
    const artifactId = readString(artifactIds[0]);
    if (combined.toLowerCase().includes('screenshot') && artifactId) {
      return [{
        type: 'screenshot_captured',
        id: eventId('artifact', artifactId, fallbackIndex),
        caption: result || 'Screenshot captured',
        artifactId,
        width: readNumber(data.width),
        height: readNumber(data.height),
        status: status === 'error' ? 'error' : 'done',
      }];
    }
    if (isShellToolName(toolName, command)) {
      const execMeta = execMetaFromData(data, metadata);
      if (status === 'running') {
        return [{
          type: 'exec_started',
          id,
          command: result || command || 'Running shell',
          runtimeTarget: execMeta.runtimeTarget,
          machineLabel: execMeta.machineLabel,
          targetKind: execMeta.targetKind,
          cwd: execMeta.cwd,
          approvalStatus: execMeta.approvalStatus,
        }];
      }
      return [{
        type: 'exec_result',
        id,
        command: command || undefined,
        status,
        output: execMeta.stdoutTail ?? result,
        exitCode: readNumber(data.exit_code),
        ...execMeta,
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
      if (status === 'running') {
        return [{
          type: 'web_search_started',
          id,
          query: query || result || 'Searching web',
        }];
      }
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
      input: toolInputPreview(data),
      status,
      result,
    }];
  }

  if (eventType === 'delegation.started') {
    const specialistName = specialistDisplayName(data);
    return [{
      type: 'tool_result',
      id: eventId('delegation-started', `${readString(payload.item_id) || readString(data.action_id) || specialistName}:started`, fallbackIndex),
      name: `Delegated to ${specialistName}`,
      status: 'done',
      result: readString(data.task_summary) || readString(data.summary) || null,
    }];
  }

  if (eventType === 'delegation.finished') {
    const status = normalizeToolResultStatus(data.status);
    const result = readString(data.result_summary)
      || readString(data.summary)
      || readString(data.detail)
      || null;
    return [{
      type: 'tool_result',
      id: eventId('delegation-finished', `${readString(payload.item_id) || readString(data.action_id) || readString(data.name) || 'specialist'}:finished`, fallbackIndex),
      name: 'Specialist finished',
      status,
      result,
    }];
  }

  if (eventType.startsWith('shell.')) {
    const status = statusFromEventType(eventType, data.status || data.state);
    const id = eventId('shell', payload.tool_call_id || payload.item_id || data.action_id, fallbackIndex);
    const command = shellCommandFromData(data) || readString(data.detail) || 'Running shell';
    const execMeta = execMetaFromData(data, metadata);
    if (status === 'running') {
      return [{
        type: 'exec_started',
        id,
        command,
        runtimeTarget: execMeta.runtimeTarget,
        machineLabel: execMeta.machineLabel,
        targetKind: execMeta.targetKind,
        cwd: execMeta.cwd,
        approvalStatus: execMeta.approvalStatus,
      }];
    }
    return [{
      type: 'exec_result',
      id,
      command,
      status: status === 'error' ? 'error' : 'done',
      output: execMeta.stdoutTail ?? toolResultText(data),
      exitCode: readNumber(data.exit_code),
      ...execMeta,
    }];
  }

  if (eventType.startsWith('file.')) {
    const status = statusFromEventType(eventType, data.status || data.state);
    const path = filePathFromData(data);
    return [{
      type: 'file_change',
      id: eventId('file', payload.item_id || payload.tool_call_id || data.action_id || path, fallbackIndex),
      filename: path || readString(data.summary) || 'File',
      action: fileActionFromEventType(eventType, readString(data.action) || readString(data.label)),
      status,
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

  if (eventKey.startsWith('runtime.') || eventKey.startsWith('gateway.') || eventKey.startsWith('hardware.')) {
    const status = statusFromEventType(eventKey, data.status || data.state);
    const action = readString(data.action)
      || readString(data.capability)
      || readString(data.capability_id)
      || readString(data.tool_name);
    if (action && !eventKey.includes('status') && !eventKey.includes('session')) {
      return [{
        type: 'tool_result',
        id: eventId('hardware', payload.item_id || payload.tool_call_id || data.action_id, fallbackIndex),
        name: toolDisplayName(action),
        status,
        result: readString(data.summary) || readString(data.detail) || null,
      }];
    }
    return [{
      type: 'status',
      id: eventId('runtime', payload.item_id || data.action_id || data.runtime_session_id, fallbackIndex),
      label: runtimeStatusLabel(eventKey, data),
      detail: readString(data.summary) || readString(data.detail) || null,
      status: status === 'error' ? 'error' : status === 'running' ? 'running' : 'done',
    }];
  }

  if (eventKey.startsWith('channel.')) {
    const rawStatus = readString(data.status).toLowerCase();
    const status = rawStatus === 'error' || rawStatus === 'failed'
      ? 'error'
      : rawStatus === 'running' || rawStatus === 'started'
        ? 'running'
        : 'done';
    const channelSummary = `${eventKey} ${readString(data.action)} ${readString(data.delivery_transport)} ${readString(data.summary)} ${readString(data.message)}`;
    return [{
      type: 'tool_result',
      id: eventId('channel', payload.item_id || payload.tool_call_id || data.action_id, fallbackIndex),
      name: channelDisplayName(channelSummary),
      status,
      result: readString(data.summary) || readString(data.message) || null,
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
    const artifactId = artifactIdsFromPayload(payload, data, metadata)[0]
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
    const artifactKind = readString(data.kind).toLowerCase();
    const artifactTitle = `${readString(data.title)} ${readString(data.label)}`.toLowerCase();
    if (mimeType.startsWith('image/') || artifactKind.includes('screenshot') || artifactTitle.includes('screenshot')) {
      const artifactId = readString(data.artifact_id)
        || readString(data.artifactId)
        || readString(payload.item_id)
        || null;
      return [{
        type: 'screenshot_captured',
        id: eventId('artifact', artifactId || payload.item_id, fallbackIndex),
        caption: readString(data.title) || readString(data.label) || 'Screenshot captured',
        artifactId,
        width: readNumber(data.width),
        height: readNumber(data.height),
        status: 'done',
      }];
    }
    const artifactId = readString(data.artifact_id)
      || readString(data.artifactId)
      || readString(payload.artifact_id)
      || readString(payload.item_id)
      || null;
    return [{
      type: 'artifact_created',
      id: eventId('artifact', artifactId || payload.item_id, fallbackIndex),
      title: readString(data.title) || readString(data.label) || readString(data.mime_type) || 'Artifact created',
      artifactId,
      mimeType: mimeType || null,
      status: readString(data.status).toLowerCase() === 'error' ? 'error' : 'done',
    }];
  }

  if (eventType === 'assistant.message.completed') {
    return artifactIdsFromPayload(payload, data, metadata).map((artifactId, artifactIndex) => ({
      type: 'artifact_created' as const,
      id: eventId('artifact', artifactId, fallbackIndex + artifactIndex),
      title: 'Artifact created',
      artifactId,
      mimeType: null,
      status: 'done' as const,
    }));
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
    const normalizedApproval = data.normalized_approval && typeof data.normalized_approval === 'object'
      ? data.normalized_approval as Record<string, unknown>
      : {};
    const approvalId = data.approval_id
      || payload.approval_id
      || data.id
      || normalizedApproval.approval_id
      || normalizedApproval.id
      || payload.item_id;
    const status = normalizeApprovalStatus(eventType, {
      ...normalizedApproval,
      ...data,
    });
    return [{
      type: 'approval_request',
      id: eventId('approval', approvalId, fallbackIndex),
      prompt: readString(data.prompt)
        || readString(data.message)
        || readString(data.title)
        || readString(data.description)
        || readString(normalizedApproval.action)
        || (status === 'waiting' ? 'Approval required' : ''),
      status,
      metadata: {
        ...data,
        ...normalizedApproval,
        approval_id: readString(data.approval_id)
          || readString(payload.approval_id)
          || readString(normalizedApproval.approval_id)
          || readString(normalizedApproval.id),
        code: readString(data.code) || readString(normalizedApproval.code),
      },
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

function projectTypedStreamEvent(payload: Record<string, unknown>, fallbackIndex: number): CodexChatEvent[] {
  const rawType = readString(payload.event_type || payload.type || payload.event || payload.kind).toLowerCase();
  const data = readObject(payload.payload);
  const merged = Object.keys(data).length > 0 ? { ...payload, ...data } : payload;
  const id = eventId('typed', merged.tool_call_id || merged.id || merged.item_id, fallbackIndex);
  if (rawType === 'thinking') {
    const text = readString(merged.delta)
      || readString(merged.text)
      || readString(merged.content)
      || readString(merged.message);
    return text
      ? [{
          type: 'reasoning_delta',
          id: 'reasoning_summary',
          text,
          isStreaming: readString(merged.status).toLowerCase() !== 'done' && merged.done !== true,
        }]
      : [];
  }
  if (rawType === 'tool_call') {
    const name = readString(merged.tool_name) || readString(merged.name) || readString(merged.tool) || 'Tool';
    const command = shellCommandFromData(merged);
    const input = toolInputPreview(merged);
    if (isShellToolName(name, command)) {
      return [{
        type: 'exec_started',
        id,
        command: command || input || 'Running shell',
      }];
    }
    return [{
      type: 'tool_started',
      id,
      name: toolDisplayName(name),
      input,
    }];
  }
  if (rawType === 'tool_result') {
    const name = readString(merged.tool_name) || readString(merged.name) || readString(merged.tool) || null;
    const command = shellCommandFromData(merged);
    const input = toolInputPreview(merged);
    const status = normalizeToolResultStatus(merged.status);
    if (isShellToolName(name || '', command)) {
      if (status === 'running') {
        return [{
          type: 'exec_started',
          id,
          command: command || input || 'Running shell',
        }];
      }
      return [{
        type: 'exec_result',
        id,
        command: command || input || undefined,
        status,
        output: outputTail(merged.output, merged.result, merged.text, merged.summary),
        exitCode: readNumber(merged.exit_code),
      }];
    }
    return [{
      type: 'tool_result',
      id,
      name: name ? toolDisplayName(name) : null,
      input,
      status,
      result: toolResultText(merged),
    }];
  }
  if (rawType === 'bash_output') {
    return [{
      type: 'exec_delta',
      id,
      output: readString(merged.delta)
        || readString(merged.output)
        || readString(merged.stdout)
        || readString(merged.text),
    }];
  }
  if (rawType === 'response') {
    const text = readString(merged.delta)
      || readString(merged.text)
      || readString(merged.content)
      || readString(merged.message);
    const visibleText = visibleAssistantReplyText(text);
    return visibleText
      ? [{ type: 'assistant_delta', id: 'assistant', delta: visibleText, provider: null, model: null }]
      : [];
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

  if (event.type === 'typed') {
    return projectTypedStreamEvent(readObject(event.payload), fallbackIndex);
  }

  if (event.type === 'chunk') {
    const delta = visibleAssistantReplyText(event.payload.delta);
    return delta
      ? [{ type: 'assistant_delta', id: 'assistant', delta, provider: null, model: null }]
      : [];
  }

  const payload = readObject(event.payload);
  const metadata = readObject(payload.metadata);
  const reply = visibleAssistantReplyText(payload.reply) || visibleAssistantReplyText(payload.content) || '';
  const status = readString(payload.status).toLowerCase();
  if (!reply) {
    return interventionStatusEvents(payload, fallbackIndex);
  }
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
