'use client';

export type ArtifactItem = {
  id: string;
  label: string;
  kind: string;
  source: string;
  run_id?: string | null;
  updated_at?: string | null;
  uri_or_path: string;
  focus_target?: 'screenshots' | 'artifacts';
  agent_role?: string | null;
  agent_label?: string | null;
  run_status?: string | null;
  result_summary?: string | null;
  pack_id?: string | null;
  connector_binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

export type ArtifactPayload = {
  ok: boolean;
  workspace_id: string;
  updated_at: string;
  summary: {
    total: number;
    screenshots: number;
    reports: number;
    data: number;
    links: number;
    files: number;
  };
  items: ArtifactItem[];
};

export type KindFilter = 'all' | 'screenshots' | 'reports' | 'data' | 'links' | 'files';
export type ArtifactView = 'deliverables' | 'evidence' | 'system' | 'all';
export type ArtifactFormat = 'word' | 'powerpoint' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'generic';

export function toDateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function compactText(value?: string | null, fallback = '—', maxLength = 180): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function artifactKindGroup(kind?: string): KindFilter {
  const normalized = String(kind || '').toLowerCase();
  if (normalized === 'screenshot' || normalized === 'image') return 'screenshots';
  if (normalized === 'report') return 'reports';
  if (normalized === 'data') return 'data';
  if (normalized === 'link') return 'links';
  return 'files';
}

export function artifactKindLabel(kind?: string): string {
  const group = artifactKindGroup(kind);
  if (group === 'screenshots') return 'Screenshot';
  if (group === 'reports') return 'Report';
  if (group === 'data') return 'Data';
  if (group === 'links') return 'Link';
  return 'File';
}

export function artifactPathTail(value?: string | null): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return parsed.hostname.replace(/^www\./i, '') || normalized;
    } catch {
      return normalized;
    }
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function parseArtifactUrl(value?: string | null): URL | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isTemporaryLocalArtifactLink(value?: string | null): boolean {
  const parsed = parseArtifactUrl(value);
  if (!parsed) return false;
  return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(parsed.hostname.toLowerCase());
}

function artifactExtension(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  const parsed = parseArtifactUrl(normalized);
  const target = parsed ? parsed.pathname : normalized;
  const match = target.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

export function artifactFormat(item: ArtifactItem): ArtifactFormat {
  const ext = artifactExtension(item.uri_or_path) || artifactExtension(item.label);
  if (item.kind === 'screenshot' || item.kind === 'image') return 'image';
  if (ext === '.doc' || ext === '.docx') return 'word';
  if (ext === '.ppt' || ext === '.pptx') return 'powerpoint';
  if (ext === '.xls' || ext === '.xlsx' || ext === '.csv') return 'spreadsheet';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.svg') return 'image';
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.html' || ext === '.htm') return 'text';
  return 'generic';
}

export function artifactFormatLabel(item: ArtifactItem): string {
  const format = artifactFormat(item);
  if (format === 'word') return 'Word';
  if (format === 'powerpoint') return 'PowerPoint';
  if (format === 'spreadsheet') return 'Spreadsheet';
  if (format === 'pdf') return 'PDF';
  if (format === 'image') return 'Image';
  if (format === 'text') return 'Text';
  return 'File';
}

export function artifactFormatTone(item: ArtifactItem): { color: string; border: string; background: string } {
  const format = artifactFormat(item);
  if (format === 'word') {
    return {
      color: '#1f4fbf',
      border: '1px solid color-mix(in srgb, #1f4fbf 26%, var(--border-subtle))',
      background: 'color-mix(in srgb, #1f4fbf 10%, var(--bg-surface))',
    };
  }
  if (format === 'powerpoint') {
    return {
      color: '#c2410c',
      border: '1px solid color-mix(in srgb, #c2410c 26%, var(--border-subtle))',
      background: 'color-mix(in srgb, #c2410c 10%, var(--bg-surface))',
    };
  }
  if (format === 'spreadsheet') {
    return {
      color: '#237a3b',
      border: '1px solid color-mix(in srgb, #237a3b 26%, var(--border-subtle))',
      background: 'color-mix(in srgb, #237a3b 10%, var(--bg-surface))',
    };
  }
  if (format === 'pdf') {
    return {
      color: '#b42318',
      border: '1px solid color-mix(in srgb, #b42318 26%, var(--border-subtle))',
      background: 'color-mix(in srgb, #b42318 10%, var(--bg-surface))',
    };
  }
  if (format === 'image') {
    return { color: 'var(--primary-base)', border: '1px solid var(--primary-border-soft)', background: 'var(--primary-soft)' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
}

function resolvePreviewArtifact(item: ArtifactItem, items: ArtifactItem[]): ArtifactItem {
  if (!isTemporaryLocalArtifactLink(item.uri_or_path) || !item.run_id) return item;

  const targetExt = artifactExtension(item.uri_or_path) || artifactExtension(item.label);
  const candidates = items.filter((candidate) => {
    if (candidate.id === item.id) return false;
    if (candidate.run_id !== item.run_id) return false;
    if (isTemporaryLocalArtifactLink(candidate.uri_or_path)) return false;
    if (artifactKindGroup(candidate.kind) === 'links') return false;
    return true;
  });

  if (candidates.length === 0) return item;

  const ranked = [...candidates].sort((left, right) => {
    const score = (candidate: ArtifactItem): number => {
      let next = 0;
      const candidatePath = String(candidate.uri_or_path || '').toLowerCase();
      if (candidatePath.includes('/.orion-artifacts/')) next += 6;
      if (targetExt && artifactExtension(candidate.uri_or_path) === targetExt) next += 4;
      if (String(candidate.label || '').trim().toLowerCase() === String(item.label || '').trim().toLowerCase()) next += 2;
      if (artifactKindGroup(candidate.kind) === 'files') next += 2;
      if (artifactKindGroup(candidate.kind) === 'reports') next += 1;
      return next;
    };
    return score(right) - score(left);
  });

  return ranked[0] || item;
}

export function artifactSummary(item: ArtifactItem): string {
  if (item.result_summary?.trim()) return item.result_summary.trim();
  const group = artifactKindGroup(item.kind);
  if (group === 'screenshots') return 'Captured from a completed run.';
  if (group === 'reports') return 'Generated report output.';
  if (group === 'data') return artifactFormat(item) === 'spreadsheet' ? 'Structured spreadsheet output.' : 'Structured data output.';
  if (group === 'links') return artifactPathTail(item.uri_or_path) || 'Saved link output.';
  if (artifactFormat(item) === 'word') return artifactPathTail(item.uri_or_path) || 'Word document output.';
  if (artifactFormat(item) === 'powerpoint') return artifactPathTail(item.uri_or_path) || 'PowerPoint deck output.';
  if (artifactFormat(item) === 'spreadsheet') return artifactPathTail(item.uri_or_path) || 'Spreadsheet output.';
  if (artifactFormat(item) === 'pdf') return artifactPathTail(item.uri_or_path) || 'PDF output.';
  return artifactPathTail(item.uri_or_path) || 'Saved file output.';
}

export function artifactSurfaceLabel(item: ArtifactItem): string {
  const direct = String(item.label || '').trim();
  if (direct && direct.toLowerCase() !== 'artifact') return direct;
  return artifactPathTail(item.uri_or_path) || artifactFormatLabel(item);
}

export function artifactActionHint(item: ArtifactItem): string {
  const view = artifactViewGroup(item);
  if (view === 'deliverables') return 'Ready to open, share, or continue from.';
  if (view === 'evidence') return 'Captured proof from the run.';
  return 'Saved support file for deeper inspection.';
}

export function artifactStatusTone(status?: string | null): { color: string; border: string; background: string } {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'error' || normalized === 'failed') {
    return { color: 'var(--error-fg)', border: '1px solid var(--error-border)', background: 'var(--error-bg)' };
  }
  if (normalized === 'waiting' || normalized === 'waiting_for_input') {
    return { color: 'var(--warning-fg)', border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' };
  }
  if (normalized === 'completed' || normalized === 'success') {
    return { color: 'var(--success-fg)', border: '1px solid var(--success-border)', background: 'var(--success-bg)' };
  }
  return { color: 'var(--text-secondary)', border: '1px solid var(--border-default)', background: 'var(--bg-element)' };
}

function isInternalArtifact(item: ArtifactItem): boolean {
  const group = artifactKindGroup(item.kind);
  if (group === 'screenshots' || group === 'reports' || group === 'links' || group === 'data') {
    return false;
  }
  const path = String(item.uri_or_path || '').toLowerCase();
  if (!path) return false;
  if (
    path.includes('/.orion')
    || path.includes('/__pycache__/')
    || path.includes('/logs/')
    || path.includes('/.git/')
    || path.includes('/frontend/')
    || path.includes('/backend/')
    || path.includes('/scripts/')
    || path.includes('/server_modules/')
    || path.includes('/docs/')
  ) {
    return true;
  }
  return /\.(log|py|ts|tsx|js|jsx|json|db|sqlite|sqlite3|yml|yaml|toml|lock|sh|ps1|md)$/i.test(path);
}

export function artifactViewGroup(item: ArtifactItem): ArtifactView {
  if (isInternalArtifact(item)) return 'system';
  if (artifactKindGroup(item.kind) === 'screenshots') return 'evidence';
  return 'deliverables';
}

export function artifactViewLabel(view: ArtifactView): string {
  if (view === 'deliverables') return 'Deliverables';
  if (view === 'evidence') return 'Evidence';
  if (view === 'system') return 'System files';
  return 'All files';
}

export function connectorBindingText(
  binding?: {
    channel?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null,
): string {
  if (!binding) return '';
  const parts = [
    String(binding.channel || '').trim(),
    String(binding.identity_label || binding.label || '').trim(),
    String(binding.routing_scope || '').trim(),
  ].filter(Boolean);
  return parts.join(' · ');
}

function connectorChannelValue(
  binding?: {
    channel?: string | null;
  } | null,
): string {
  return String(binding?.channel || '').trim().toLowerCase();
}

function isHttpTarget(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function isLocalFileTarget(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  if (!normalized || isHttpTarget(normalized)) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized)) return true;
  if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('.orion-artifacts/')) return true;
  return !/^[a-z]+:/i.test(normalized);
}

export function normalizeArtifactsError(message?: string | null): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (
    !normalized
    || lowered === 'failed to fetch'
    || lowered.includes('networkerror')
    || lowered.includes('load failed')
    || lowered.includes('aborted')
    || lowered.includes('timed out')
  ) {
    return 'Runtime is offline. Start Empyralis services to load saved outputs and previews.';
  }
  return normalized;
}

export function buildArtifactBrowserView(items: ArtifactItem[]) {
  const viewSummary = items.reduce(
    (acc, item) => {
      const view = artifactViewGroup(item);
      acc.total += 1;
      if (view === 'deliverables') acc.deliverables += 1;
      if (view === 'evidence') acc.evidence += 1;
      if (view === 'system') acc.system += 1;
      return acc;
    },
    { total: 0, deliverables: 0, evidence: 0, system: 0 },
  );

  const previewTargetById = new Map<string, ArtifactItem>();
  items.forEach((item) => {
    previewTargetById.set(item.id, resolvePreviewArtifact(item, items));
  });

  const values = new Set<string>();
  items.forEach((item) => {
    const channel = connectorChannelValue(item.connector_binding);
    if (channel) values.add(channel);
  });

  return {
    viewSummary,
    previewTargetById,
    channelOptions: Array.from(values).sort(),
  };
}

export function filterArtifacts(
  items: ArtifactItem[],
  query: string,
  viewMode: ArtifactView,
  kindFilter: KindFilter,
  agentFilter: 'all' | string,
  channelFilter: string,
): ArtifactItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const group = artifactKindGroup(item.kind);
    const viewGroup = artifactViewGroup(item);
    const matchesKind = kindFilter === 'all' || group === kindFilter;
    const matchesAgent = agentFilter === 'all' || item.agent_role === agentFilter;
    const matchesChannel = channelFilter === 'all' || connectorChannelValue(item.connector_binding) === channelFilter;
    const matchesView = viewMode === 'all' || viewGroup === viewMode;
    const haystack = [
      item.label,
      item.result_summary,
      item.agent_label,
      item.run_id,
      artifactPathTail(item.uri_or_path),
      connectorBindingText(item.connector_binding),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    return matchesKind && matchesAgent && matchesChannel && matchesView && matchesQuery;
  });
}
