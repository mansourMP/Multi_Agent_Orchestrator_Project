'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AgentRoleId } from '@/app/page.catalog';
import {
  artifactKindGroup,
  buildArtifactBrowserView,
  filterArtifacts,
  isLocalFileTarget,
  normalizeArtifactsError,
  type ArtifactItem,
  type ArtifactPayload,
  type ArtifactView,
  type KindFilter,
} from '@/lib/artifactsPresentation';
import { useAsyncPageResource } from '@/hooks/pages/useAsyncPageResource';

type DesktopBridge = {
  openExternal?: (target: string) => Promise<boolean | string>;
  openPath?: (target: string) => Promise<boolean | string>;
  revealPath?: (target: string) => Promise<boolean | string>;
  platform?: string;
  desktop?: boolean;
};

function isHttpTarget(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function useArtifactsBrowser() {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ArtifactView>('deliverables');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | AgentRoleId>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

  const loadArtifacts = useCallback(async () => {
    const response = await fetch(
      '/api/artifacts/workspace?workspace_id=default&history_limit=80&limit=120',
      { cache: 'no-store' },
    );
    if (!response.ok) {
      throw new Error(`Failed to load artifacts (${response.status})`);
    }
    return (await response.json()) as ArtifactPayload;
  }, []);

  const {
    data: payload,
    loading,
    error,
    refresh,
  } = useAsyncPageResource<ArtifactPayload | null>({
    initialData: null,
    load: loadArtifacts,
    formatError: (loadError) => normalizeArtifactsError(loadError instanceof Error ? loadError.message : 'Failed to load artifacts.'),
  });

  const filteredItems = useMemo(
    () => filterArtifacts(payload?.items || [], query, viewMode, kindFilter, agentFilter, channelFilter),
    [agentFilter, channelFilter, kindFilter, payload, query, viewMode],
  );

  const browserView = useMemo(() => buildArtifactBrowserView(payload?.items || []), [payload]);
  const { viewSummary, previewTargetById, channelOptions } = browserView;
  const latestArtifact = filteredItems[0] || payload?.items?.[0] || null;

  const hasActiveFilters =
    query.trim().length > 0
    || viewMode !== 'deliverables'
    || kindFilter !== 'all'
    || agentFilter !== 'all'
    || channelFilter !== 'all';

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
      window.location.href = `/runs/${encodeURIComponent(item.run_id)}/inspect?focus=${encodeURIComponent(
        item.focus_target || (artifactKindGroup(item.kind) === 'screenshots' ? 'screenshots' : 'artifacts'),
      )}`;
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

  return {
    payload,
    loading,
    error,
    refresh,
    query,
    setQuery,
    viewMode,
    setViewMode,
    kindFilter,
    setKindFilter,
    agentFilter,
    setAgentFilter,
    channelFilter,
    setChannelFilter,
    filteredItems,
    viewSummary,
    latestArtifact,
    channelOptions,
    hasActiveFilters,
    clearFilters,
    openArtifact,
    revealArtifact,
    revealLabel,
    desktopBridge,
    previewTargetById,
  };
}
