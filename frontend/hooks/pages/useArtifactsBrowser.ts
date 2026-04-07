'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { apiClient } from '@/lib/api-client';
import { useAsyncPageResource } from '@/hooks/pages/useAsyncPageResource';

type DesktopBridge = {
  openExternal?: (target: string) => Promise<boolean | string>;
  openPath?: (target: string) => Promise<boolean | string>;
  revealPath?: (target: string) => Promise<boolean | string>;
  platform?: string;
  desktop?: boolean;
};

const ARTIFACTS_BROWSER_CACHE_KEY = 'hekor.artifacts-browser.cache.v1';
let artifactsBrowserCache: ArtifactPayload | null = null;
let artifactsBrowserInFlight: Promise<ArtifactPayload> | null = null;

function readArtifactsBrowserCache(): ArtifactPayload | null {
  if (artifactsBrowserCache) return artifactsBrowserCache;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ARTIFACTS_BROWSER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArtifactPayload | null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null;
    artifactsBrowserCache = parsed;
    return artifactsBrowserCache;
  } catch {
    return null;
  }
}

function persistArtifactsBrowserCache(next: ArtifactPayload) {
  artifactsBrowserCache = next;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ARTIFACTS_BROWSER_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache errors.
  }
}

function isHttpTarget(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

export function useArtifactsBrowser() {
  const initialPayload = useMemo(() => readArtifactsBrowserCache(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [viewMode, setViewMode] = useState<ArtifactView>('deliverables');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | AgentRoleId>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(() => searchParams.get('artifact'));
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

  const loadArtifacts = useCallback(async () => {
    if (artifactsBrowserInFlight) return artifactsBrowserInFlight;

    artifactsBrowserInFlight = (async () => {
      const next = await apiClient.listArtifacts({
        workspace_id: 'default',
        history_limit: 80,
        limit: 120,
      }) as ArtifactPayload;
      persistArtifactsBrowserCache(next);
      return next;
    })();
    try {
      return await artifactsBrowserInFlight;
    } finally {
      artifactsBrowserInFlight = null;
    }
  }, []);
  const formatLoadError = useCallback(
    (loadError: unknown) => normalizeArtifactsError(loadError instanceof Error ? loadError.message : 'Failed to load artifacts.'),
    [],
  );

  const {
    data: payload,
    loading,
    error,
    refresh,
  } = useAsyncPageResource<ArtifactPayload | null>({
    initialData: initialPayload,
    load: loadArtifacts,
    formatError: formatLoadError,
    hasInitialData: Boolean(initialPayload),
  });

  const filteredItems = useMemo(
    () => filterArtifacts(payload?.items || [], deferredQuery, viewMode, kindFilter, agentFilter, channelFilter),
    [agentFilter, channelFilter, deferredQuery, kindFilter, payload, viewMode],
  );

  const browserView = useMemo(() => buildArtifactBrowserView(payload?.items || []), [payload]);
  const { viewSummary, previewTargetById, channelOptions } = browserView;
  const latestArtifact = filteredItems[0] || payload?.items?.[0] || null;

  const syncSelectedArtifact = useCallback((artifactId: string | null) => {
    setSelectedArtifactId(artifactId);
    const current = searchParams.get('artifact');
    if ((current || null) === artifactId) return;
    const next = new URLSearchParams(searchParams.toString());
    if (artifactId) next.set('artifact', artifactId);
    else next.delete('artifact');
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const artifactFromUrl = searchParams.get('artifact');
    if ((artifactFromUrl || null) === selectedArtifactId) return;
    setSelectedArtifactId(artifactFromUrl);
  }, [searchParams, selectedArtifactId]);

  useEffect(() => {
    if (!payload) return;
    const allItems = payload.items || [];
    if (selectedArtifactId && allItems.some((item) => item.id === selectedArtifactId)) return;
    if (filteredItems.length === 0) {
      if (selectedArtifactId) syncSelectedArtifact(null);
      return;
    }
    syncSelectedArtifact(filteredItems[0]?.id || null);
  }, [filteredItems, payload, selectedArtifactId, syncSelectedArtifact]);

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

  const selectedArtifact = useMemo(() => {
    const allItems = payload?.items || [];
    if (selectedArtifactId) {
      return allItems.find((item) => item.id === selectedArtifactId) || filteredItems[0] || allItems[0] || null;
    }
    return filteredItems[0] || allItems[0] || null;
  }, [filteredItems, payload, selectedArtifactId]);

  const selectedPreviewTarget = useMemo(
    () => (selectedArtifact ? previewTargetById.get(selectedArtifact.id) || selectedArtifact : null),
    [previewTargetById, selectedArtifact],
  );

  const selectArtifact = useCallback((item: ArtifactItem) => {
    syncSelectedArtifact(item.id);
  }, [syncSelectedArtifact]);

  const artifactContentHref = useCallback((item: ArtifactItem) => {
    const target = previewTargetById.get(item.id) || item;
    const location = String(target.uri_or_path || '').trim();
    if (isHttpTarget(location)) return location;
    return `/api/artifacts/content?path=${encodeURIComponent(location)}`;
  }, [previewTargetById]);

  const artifactDownloadHref = useCallback((item: ArtifactItem) => {
    const target = previewTargetById.get(item.id) || item;
    const location = String(target.uri_or_path || '').trim();
    if (isHttpTarget(location)) return location;
    return `/api/artifacts/file?path=${encodeURIComponent(location)}`;
  }, [previewTargetById]);

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
    window.open(`/api/artifacts/file?path=${encodeURIComponent(location)}`, '_blank', 'noopener,noreferrer');
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
    selectedArtifact,
    selectedPreviewTarget,
    selectArtifact,
    artifactContentHref,
    artifactDownloadHref,
    openArtifact,
    revealArtifact,
    revealLabel,
    desktopBridge,
    previewTargetById,
  };
}
