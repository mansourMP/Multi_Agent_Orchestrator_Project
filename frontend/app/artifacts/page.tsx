'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileStack, Image as ImageIcon, RefreshCw, Search } from 'lucide-react';
import { ORION_API_URL } from '../page.api';
import { AGENT_ROLE_OPTIONS, type AgentRoleId } from '../page.catalog';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

type ArtifactItem = {
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

type ArtifactPayload = {
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

type DesktopBridge = {
  openExternal?: (target: string) => Promise<boolean | string>;
  openPath?: (target: string) => Promise<boolean | string>;
  revealPath?: (target: string) => Promise<boolean | string>;
  platform?: string;
  desktop?: boolean;
};

type KindFilter = 'all' | 'screenshots' | 'reports' | 'data' | 'links' | 'files';
type ArtifactView = 'deliverables' | 'evidence' | 'system' | 'all';
type ArtifactFormat = 'word' | 'powerpoint' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'generic';

const RUNTIME_TIMEOUT_MS = 3500;

function toDateLabel(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function compactText(value?: string | null, fallback = '—', maxLength = 180): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function artifactKindGroup(kind?: string): KindFilter {
  const normalized = String(kind || '').toLowerCase();
  if (normalized === 'screenshot' || normalized === 'image') return 'screenshots';
  if (normalized === 'report') return 'reports';
  if (normalized === 'data') return 'data';
  if (normalized === 'link') return 'links';
  return 'files';
}

function artifactKindLabel(kind?: string): string {
  const group = artifactKindGroup(kind);
  if (group === 'screenshots') return 'Screenshot';
  if (group === 'reports') return 'Report';
  if (group === 'data') return 'Data';
  if (group === 'links') return 'Link';
  return 'File';
}

function artifactPathTail(value?: string | null): string {
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

function artifactFormat(item: ArtifactItem): ArtifactFormat {
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

function artifactFormatLabel(item: ArtifactItem): string {
  const format = artifactFormat(item);
  if (format === 'word') return 'Word';
  if (format === 'powerpoint') return 'PowerPoint';
  if (format === 'spreadsheet') return 'Spreadsheet';
  if (format === 'pdf') return 'PDF';
  if (format === 'image') return 'Image';
  if (format === 'text') return 'Text';
  return 'File';
}

function artifactFormatTone(item: ArtifactItem): { color: string; border: string; background: string } {
  const format = artifactFormat(item);
  if (format === 'word') {
    return { color: '#1f4fbf', border: '1px solid color-mix(in srgb, #1f4fbf 26%, var(--border-subtle))', background: 'color-mix(in srgb, #1f4fbf 10%, var(--bg-surface))' };
  }
  if (format === 'powerpoint') {
    return { color: '#c2410c', border: '1px solid color-mix(in srgb, #c2410c 26%, var(--border-subtle))', background: 'color-mix(in srgb, #c2410c 10%, var(--bg-surface))' };
  }
  if (format === 'spreadsheet') {
    return { color: '#237a3b', border: '1px solid color-mix(in srgb, #237a3b 26%, var(--border-subtle))', background: 'color-mix(in srgb, #237a3b 10%, var(--bg-surface))' };
  }
  if (format === 'pdf') {
    return { color: '#b42318', border: '1px solid color-mix(in srgb, #b42318 26%, var(--border-subtle))', background: 'color-mix(in srgb, #b42318 10%, var(--bg-surface))' };
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

function artifactSummary(item: ArtifactItem): string {
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

function artifactSurfaceLabel(item: ArtifactItem): string {
  const direct = String(item.label || '').trim();
  if (direct && direct.toLowerCase() !== 'artifact') return direct;
  return artifactPathTail(item.uri_or_path) || artifactFormatLabel(item);
}

function artifactActionHint(item: ArtifactItem): string {
  const view = artifactViewGroup(item);
  if (view === 'deliverables') return 'Ready to open, share, or continue from.';
  if (view === 'evidence') return 'Captured proof from the run.';
  return 'Saved support file for deeper inspection.';
}

function artifactStatusTone(status?: string | null): { color: string; border: string; background: string } {
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
    path.includes('/.orion') ||
    path.includes('/__pycache__/') ||
    path.includes('/logs/') ||
    path.includes('/.git/') ||
    path.includes('/frontend/') ||
    path.includes('/backend/') ||
    path.includes('/scripts/') ||
    path.includes('/server_modules/') ||
    path.includes('/docs/')
  ) {
    return true;
  }
  return /\.(log|py|ts|tsx|js|jsx|json|db|sqlite|sqlite3|yml|yaml|toml|lock|sh|ps1|md)$/i.test(path);
}

function artifactViewGroup(item: ArtifactItem): ArtifactView {
  if (isInternalArtifact(item)) return 'system';
  if (artifactKindGroup(item.kind) === 'screenshots') return 'evidence';
  return 'deliverables';
}

function artifactViewLabel(view: ArtifactView): string {
  if (view === 'deliverables') return 'Deliverables';
  if (view === 'evidence') return 'Evidence';
  if (view === 'system') return 'System files';
  return 'All files';
}

function connectorBindingText(
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

function isLocalFileTarget(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  if (!normalized || isHttpTarget(normalized)) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized)) return true;
  if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('.orion-artifacts/')) return true;
  return !/^[a-z]+:/i.test(normalized);
}

function normalizeArtifactsError(message?: string | null): string {
  const normalized = String(message || '').trim();
  const lowered = normalized.toLowerCase();
  if (
    !normalized ||
    lowered === 'failed to fetch' ||
    lowered.includes('networkerror') ||
    lowered.includes('load failed') ||
    lowered.includes('aborted') ||
    lowered.includes('timed out')
  ) {
    return 'Runtime is offline. Start Empyralis services to load saved outputs and previews.';
  }
  return normalized;
}

export default function ArtifactsPage() {
  const [payload, setPayload] = useState<ArtifactPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ArtifactView>('deliverables');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | AgentRoleId>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const runtimeKey = useMemo(() => readRuntimeApiKeyFromStorage(''), []);
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

  const loadArtifacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers: HeadersInit = runtimeKey.trim() ? { 'X-API-Key': runtimeKey.trim() } : {};
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), RUNTIME_TIMEOUT_MS);
      const response = await fetch(
        `${ORION_API_URL}/artifacts/workspace?workspace_id=default&history_limit=80&limit=120`,
        { headers, cache: 'no-store', signal: controller.signal },
      );
      window.clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Failed to load artifacts (${response.status})`);
      }
      const next = (await response.json()) as ArtifactPayload;
      setPayload(next);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load artifacts.';
      setError(normalizeArtifactsError(message));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [runtimeKey]);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  const filteredItems = useMemo(() => {
    const items = payload?.items || [];
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const group = artifactKindGroup(item.kind);
      const viewGroup = artifactViewGroup(item);
      const matchesKind = kindFilter === 'all' || group === kindFilter;
      const matchesAgent = agentFilter === 'all' || item.agent_role === agentFilter;
      const matchesChannel =
        channelFilter === 'all' || connectorChannelValue(item.connector_binding) === channelFilter;
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
  }, [agentFilter, channelFilter, kindFilter, payload, query, viewMode]);

  const viewSummary = useMemo(
    () =>
      (payload?.items || []).reduce(
        (acc, item) => {
          const view = artifactViewGroup(item);
          acc.total += 1;
          if (view === 'deliverables') acc.deliverables += 1;
          if (view === 'evidence') acc.evidence += 1;
          if (view === 'system') acc.system += 1;
          return acc;
        },
        { total: 0, deliverables: 0, evidence: 0, system: 0 },
      ),
    [payload],
  );

  const latestArtifact = filteredItems[0] || payload?.items?.[0] || null;

  const channelOptions = useMemo(() => {
    const values = new Set<string>();
    (payload?.items || []).forEach((item) => {
      const channel = connectorChannelValue(item.connector_binding);
      if (channel) values.add(channel);
    });
    return Array.from(values).sort();
  }, [payload]);

  const previewTargetById = useMemo(() => {
    const items = payload?.items || [];
    const map = new Map<string, ArtifactItem>();
    items.forEach((item) => {
      map.set(item.id, resolvePreviewArtifact(item, items));
    });
    return map;
  }, [payload]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    viewMode !== 'deliverables' ||
    kindFilter !== 'all' ||
    agentFilter !== 'all' ||
    channelFilter !== 'all';

  const clearFilters = useCallback(() => {
    setQuery('');
    setViewMode('deliverables');
    setKindFilter('all');
    setAgentFilter('all');
    setChannelFilter('all');
  }, []);

  const openArtifact = useCallback(async (item: ArtifactItem) => {
    const target = previewTargetById.get(item.id) || item;
    const location = String(target.uri_or_path || '').trim();
    if (!location) return;

    if (desktopBridge?.desktop) {
      try {
        if (isLocalFileTarget(location) && desktopBridge.openPath) {
          const opened = await desktopBridge.openPath(location);
          if (opened === true || opened === '') return;
        }
        if (isHttpTarget(location) && desktopBridge.openExternal) {
          const opened = await desktopBridge.openExternal(location);
          if (opened === true || opened === '') return;
        }
      } catch {
        // Old desktop shells may not expose the latest IPC handlers yet.
      }
    }

    if (isHttpTarget(location)) {
      window.open(location, '_blank', 'noopener,noreferrer');
      return;
    }

    if (item.run_id) {
      window.location.href = `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(item.focus_target || (artifactKindGroup(item.kind) === 'screenshots' ? 'screenshots' : 'artifacts'))}`;
    }
  }, [desktopBridge, previewTargetById]);

  const revealArtifact = useCallback(async (item: ArtifactItem) => {
    const target = previewTargetById.get(item.id) || item;
    const location = String(target.uri_or_path || '').trim();
    if (!desktopBridge?.desktop || !desktopBridge.revealPath || !isLocalFileTarget(location)) return;
    try {
      await desktopBridge.revealPath(location);
    } catch {
      // Ignore stale desktop bridge errors; restart the desktop app to pick up new handlers.
    }
  }, [desktopBridge, previewTargetById]);

  const revealLabel = desktopBridge?.platform === 'darwin'
    ? 'Show in Finder'
    : desktopBridge?.platform === 'win32'
      ? 'Show in Explorer'
      : 'Show in folder';

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<FileStack size={18} />}
        title="Assets"
        subtitle="Outputs, files, and evidence from your agent runs."
        meta={
          <>
            <span>{filteredItems.length} visible</span>
            {payload ? <span>{payload.summary.total} total</span> : null}
          </>
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={() => void loadArtifacts()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <section className="orion-panel orion-home-overview">
        <div className="orion-home-overview-main">
          <div className="orion-home-overview-kicker">Evidence and outputs</div>
          <div className="orion-home-overview-title">Open deliverables, inspect proof, and trace what each run produced.</div>
          <div className="orion-home-overview-copy">
            Assets are the execution record. Use this page to review final deliverables, screenshots, and support files without digging through raw run logs first.
          </div>
          <div className="orion-home-overview-actions">
            <button className="btn-secondary" onClick={() => void loadArtifacts()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link href="/executions" className="btn-secondary">
              Open Runs
            </Link>
          </div>
        </div>
        <aside className="orion-home-overview-side">
          <div className="orion-home-side-card">
            <div className="orion-home-side-label">Current totals</div>
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{viewSummary.deliverables}</div>
                <div className="orion-home-side-note">Deliverables</div>
              </div>
              <div>
                <div className="orion-home-side-value">{viewSummary.evidence}</div>
                <div className="orion-home-side-note">Evidence items</div>
              </div>
            </div>
            <div className="orion-runs-overview-side-note">
              {latestArtifact
                ? `Latest update ${toDateLabel(latestArtifact.updated_at)}`
                : 'No saved outputs yet.'}
            </div>
          </div>
          <div className="orion-home-side-card">
            <div className="orion-home-side-label">Quick focus</div>
            <div className="orion-home-mini-list">
              <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('deliverables')}>
                <span>Deliverables</span>
                <span>{viewSummary.deliverables}</span>
              </button>
              <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('evidence')}>
                <span>Evidence</span>
                <span>{viewSummary.evidence}</span>
              </button>
              <button type="button" className="orion-home-mini-link" onClick={() => setViewMode('system')}>
                <span>System files</span>
                <span>{viewSummary.system}</span>
              </button>
            </div>
          </div>
        </aside>
      </section>

      <section className="orion-panel muted" style={{ display: 'grid', gap: 10, padding: '10px 14px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'grid', gap: 2 }}>
            <div className="orion-panel-title">Browse assets</div>
            <div className="orion-panel-copy">Filter outputs, proof, and support files by type, handler, or channel.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span className="orion-chip">{filteredItems.length} shown</span>
            {payload ? <span className="orion-chip">{payload.summary.total} saved</span> : null}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 360px)' }}>
            <div className="orion-segmented" style={{ padding: 0, borderBottom: 0 }}>
            {(['deliverables', 'evidence', 'system', 'all'] as ArtifactView[]).map((view) => {
              const count =
                view === 'deliverables'
                  ? viewSummary.deliverables
                  : view === 'evidence'
                    ? viewSummary.evidence
                    : view === 'system'
                      ? viewSummary.system
                      : viewSummary.total;
              const active = viewMode === view;
              return (
                <button
                  key={view}
                  className={`orion-segmented-btn${active ? ' is-active' : ''}`}
                  onClick={() => setViewMode(view)}
                >
                  {artifactViewLabel(view)}
                  <span className={`orion-segmented-badge${active ? ' is-active' : ''}`}>{count}</span>
                </button>
              );
            })}
            </div>
            <div className="orion-toolbar-input-wrap" style={{ width: '100%', maxWidth: '100%' }}>
              <Search size={14} className="icon" />
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search assets, tasks, or channels"
                style={{ paddingLeft: 36, height: 42, borderRadius: 11 }}
              />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <select className="input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)} style={{ height: 42, minWidth: 0, borderRadius: 11 }}>
              <option value="all">All kinds</option>
              <option value="screenshots">Screenshots</option>
              <option value="reports">Reports</option>
              <option value="data">Data</option>
              <option value="links">Links</option>
              <option value="files">Saved files</option>
            </select>
            <select className="input" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value as 'all' | AgentRoleId)} style={{ height: 42, minWidth: 0, borderRadius: 11 }}>
              <option value="all">All handlers</option>
              {AGENT_ROLE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <select className="input" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)} style={{ height: 42, minWidth: 0, borderRadius: 11 }}>
              <option value="all">All channels</option>
              {channelOptions.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
            {hasActiveFilters ? (
              <button
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 42, paddingInline: 12 }}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="orion-panel muted" style={{ minHeight: 180, display: 'grid', gap: 10, placeItems: 'center', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 800 }}>Loading assets</div>
          <div style={{ maxWidth: 420, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
            Reading outputs, proof, and support files from recent runs.
          </div>
        </section>
      ) : error ? (
        <section className="orion-empty" style={{ minHeight: 220, display: 'grid', gap: 12, placeItems: 'center', textAlign: 'center', padding: '24px 20px' }}>
          <AlertTriangle size={24} style={{ color: 'var(--text-tertiary)' }} />
          <div className="orion-empty-title">No assets yet</div>
          <div style={{ maxWidth: 480, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            Assets created by your agents will appear here.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => void loadArtifacts()}>
              Retry
            </button>
          </div>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="orion-empty">
          <div className="orion-empty-title">No assets yet</div>
          <div className="orion-empty-copy" style={{ marginBottom: 16 }}>
            {viewMode === 'deliverables'
              ? 'Assets created by your agents will appear here.'
              : viewMode === 'evidence'
                ? 'Capture screenshots or browser proof, or widen the filters to show more evidence.'
                : viewMode === 'system'
                  ? 'No support files match this view yet. Try another filter or switch back to deliverables.'
                  : 'Change the filters or run something new.'}
          </div>
          <button type="button" className="btn-secondary" onClick={() => void loadArtifacts()}>
            Retry
          </button>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr' }}>
          <section className="orion-panel orion-home-list-panel" style={{ padding: 0, overflow: 'hidden' }}>
            <section className="orion-asset-grid">
              {filteredItems.map((item, index) => {
                const kindGroup = artifactKindGroup(item.kind);
                const inspectHref = item.run_id
                  ? `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(item.focus_target || (kindGroup === 'screenshots' ? 'screenshots' : 'artifacts'))}`
                  : null;
                const previewTarget = previewTargetById.get(item.id) || item;
                const resolvedLocation = String(previewTarget.uri_or_path || '').trim();
                const showReveal = Boolean(desktopBridge?.desktop && isLocalFileTarget(resolvedLocation));
                const rowKey = [
                  item.id,
                  item.run_id || '',
                  item.updated_at || '',
                  item.uri_or_path || '',
                ].join('::');
                const statusTone = item.run_status ? artifactStatusTone(item.run_status) : null;
                return (
                  <article
                    key={`${rowKey}::${index}`}
                    className="orion-asset-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => void openArtifact(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openArtifact(item);
                      }
                    }}
                  >
                    <div>
                      <div className={`orion-asset-card-visual ${kindGroup === 'screenshots' ? 'is-screenshot' : ''}`}>
                        <div className={`orion-asset-card-icon ${kindGroup === 'screenshots' ? 'is-screenshot' : ''}`}>
                          {kindGroup === 'screenshots' ? <ImageIcon size={20} /> : <FileStack size={20} />}
                        </div>
                        <span
                          className="orion-chip"
                          style={{
                            ...artifactFormatTone(item),
                            position: 'absolute',
                            top: 10,
                            left: 10,
                          }}
                        >
                          {artifactFormatLabel(item)}
                        </span>
                        {statusTone ? (
                          <span
                            className="orion-chip"
                            style={{
                              ...statusTone,
                              position: 'absolute',
                              top: 10,
                              right: 10,
                            }}
                          >
                            {item.run_status?.replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="orion-asset-card-copy">
                      <div className="orion-asset-card-title">{artifactSurfaceLabel(item)}</div>
                      <div className="orion-asset-card-summary">
                        {compactText(artifactSummary(item), artifactSummary(item), 110)}
                      </div>
                    </div>

                    <div className="orion-asset-card-chips">
                      <span className="orion-chip">{artifactKindLabel(item.kind)}</span>
                      {item.agent_label ? <span className="orion-chip">{item.agent_label}</span> : null}
                    </div>

                    <div className="orion-asset-card-meta">
                      <div className="orion-asset-card-hint">
                        {artifactPathTail(resolvedLocation) || artifactActionHint(item)}
                      </div>
                      <div className="orion-asset-card-details">
                        <span>{toDateLabel(item.updated_at)}</span>
                        {item.run_id ? <span>Run {item.run_id.slice(0, 8)}</span> : null}
                        {connectorBindingText(item.connector_binding) ? <span>{connectorBindingText(item.connector_binding)}</span> : null}
                        {viewMode === 'system' && item.source ? <span>{item.source}</span> : null}
                      </div>
                    </div>

                    <div className="orion-asset-card-actions">
                      <button
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 34, paddingInline: 10 }}
                        onClick={(event) => {
                          event.stopPropagation();
                          void openArtifact(item);
                        }}
                      >
                        Open
                      </button>
                      {showReveal ? (
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 34, paddingInline: 10 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            void revealArtifact(item);
                          }}
                        >
                          {revealLabel}
                        </button>
                      ) : null}
                      {inspectHref ? (
                        <Link
                          href={inspectHref}
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 34, paddingInline: 10 }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Source run
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
          </section>
        </div>
      )}
    </div>
  );
}
