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
const DEFAULT_ARTIFACT_VIEW: ArtifactView = 'deliverables';
const DEFAULT_KIND_FILTER: KindFilter = 'all';
const DEFAULT_AGENT_FILTER: 'all' | AgentRoleId = 'all';
const DEFAULT_CHANNEL_FILTER = 'all';
const NARROW_VIEWPORT_QUERY = '(max-width: 980px)';

function parseArtifactView(value?: string | null): ArtifactView {
  if (value === 'deliverables' || value === 'evidence' || value === 'system' || value === 'all') return value;
  return DEFAULT_ARTIFACT_VIEW;
}

function parseKindFilter(value?: string | null): KindFilter {
  if (value === 'all' || value === 'screenshots' || value === 'reports' || value === 'data' || value === 'links' || value === 'files') return value;
  return DEFAULT_KIND_FILTER;
}

function shouldIgnoreKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button';
}

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
  const [query, setQueryState] = useState(() => searchParams.get('q') || '');
  const deferredQuery = useDeferredValue(query);
  const [viewMode, setViewModeState] = useState<ArtifactView>(() => parseArtifactView(searchParams.get('view')));
  const [kindFilter, setKindFilterState] = useState<KindFilter>(() => parseKindFilter(searchParams.get('kind')));
  const [agentFilter, setAgentFilterState] = useState<'all' | AgentRoleId>(() => {
    const value = String(searchParams.get('agent') || '').trim();
    return (value || DEFAULT_AGENT_FILTER) as 'all' | AgentRoleId;
  });
  const [channelFilter, setChannelFilterState] = useState(() => String(searchParams.get('channel') || '').trim() || DEFAULT_CHANNEL_FILTER);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(() => searchParams.get('artifact'));
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
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

  const replaceBrowserUrl = useCallback((updates: {
    artifact?: string | null;
    q?: string | null;
    view?: ArtifactView | null;
    kind?: KindFilter | null;
    agent?: string | null;
    channel?: string | null;
  }) => {
    const next = new URLSearchParams(searchParams.toString());
    const apply = (key: string, value: string | null | undefined, defaultValue?: string) => {
      if (value == null || value === '' || value === defaultValue) {
        next.delete(key);
        return;
      }
      next.set(key, value);
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'artifact')) apply('artifact', updates.artifact);
    if (Object.prototype.hasOwnProperty.call(updates, 'q')) apply('q', updates.q);
    if (Object.prototype.hasOwnProperty.call(updates, 'view')) apply('view', updates.view || null, DEFAULT_ARTIFACT_VIEW);
    if (Object.prototype.hasOwnProperty.call(updates, 'kind')) apply('kind', updates.kind || null, DEFAULT_KIND_FILTER);
    if (Object.prototype.hasOwnProperty.call(updates, 'agent')) apply('agent', updates.agent || null, DEFAULT_AGENT_FILTER);
    if (Object.prototype.hasOwnProperty.call(updates, 'channel')) apply('channel', updates.channel || null, DEFAULT_CHANNEL_FILTER);
    const href = next.toString() ? `${pathname}?${next.toString()}` : pathname;
    router.replace(href, { scroll: false });
  }, [pathname, router, searchParams]);

  const syncSelectedArtifact = useCallback((artifactId: string | null) => {
    setSelectedArtifactId(artifactId);
    const current = searchParams.get('artifact');
    if ((current || null) === artifactId) return;
    replaceBrowserUrl({ artifact: artifactId });
  }, [replaceBrowserUrl, searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const apply = () => setIsNarrowViewport(media.matches);
    apply();
    const handleChange = () => apply();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const artifactFromUrl = searchParams.get('artifact');
    const nextQuery = searchParams.get('q') || '';
    const nextView = parseArtifactView(searchParams.get('view'));
    const nextKind = parseKindFilter(searchParams.get('kind'));
    const nextAgent = (String(searchParams.get('agent') || '').trim() || DEFAULT_AGENT_FILTER) as 'all' | AgentRoleId;
    const nextChannel = String(searchParams.get('channel') || '').trim() || DEFAULT_CHANNEL_FILTER;

    if ((artifactFromUrl || null) !== selectedArtifactId) setSelectedArtifactId(artifactFromUrl);
    if (nextQuery !== query) setQueryState(nextQuery);
    if (nextView !== viewMode) setViewModeState(nextView);
    if (nextKind !== kindFilter) setKindFilterState(nextKind);
    if (nextAgent !== agentFilter) setAgentFilterState(nextAgent);
    if (nextChannel !== channelFilter) setChannelFilterState(nextChannel);
  }, [agentFilter, channelFilter, kindFilter, query, searchParams, selectedArtifactId, viewMode]);

  useEffect(() => {
    if (!payload) return;
    const allItems = payload.items || [];
    if (selectedArtifactId && allItems.some((item) => item.id === selectedArtifactId)) return;
    if (filteredItems.length === 0) {
      if (selectedArtifactId) syncSelectedArtifact(null);
      return;
    }
    const hasExplicitSelection = Boolean(searchParams.get('artifact'));
    if (isNarrowViewport && !hasExplicitSelection && !selectedArtifactId) return;
    syncSelectedArtifact(filteredItems[0]?.id || null);
  }, [filteredItems, isNarrowViewport, payload, searchParams, selectedArtifactId, syncSelectedArtifact]);

  const hasActiveFilters =
    query.trim().length > 0
    || viewMode !== DEFAULT_ARTIFACT_VIEW
    || kindFilter !== DEFAULT_KIND_FILTER
    || agentFilter !== DEFAULT_AGENT_FILTER
    || channelFilter !== DEFAULT_CHANNEL_FILTER;

  const clearFilters = useCallback(() => {
    setQueryState('');
    setViewModeState(DEFAULT_ARTIFACT_VIEW);
    setKindFilterState(DEFAULT_KIND_FILTER);
    setAgentFilterState(DEFAULT_AGENT_FILTER);
    setChannelFilterState(DEFAULT_CHANNEL_FILTER);
    replaceBrowserUrl({
      q: null,
      view: DEFAULT_ARTIFACT_VIEW,
      kind: DEFAULT_KIND_FILTER,
      agent: DEFAULT_AGENT_FILTER,
      channel: DEFAULT_CHANNEL_FILTER,
    });
  }, [replaceBrowserUrl]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    replaceBrowserUrl({ q: value.trim() ? value : null });
  }, [replaceBrowserUrl]);

  const setViewMode = useCallback((value: ArtifactView) => {
    setViewModeState(value);
    replaceBrowserUrl({ view: value });
  }, [replaceBrowserUrl]);

  const setKindFilter = useCallback((value: KindFilter) => {
    setKindFilterState(value);
    replaceBrowserUrl({ kind: value });
  }, [replaceBrowserUrl]);

  const setAgentFilter = useCallback((value: 'all' | AgentRoleId) => {
    setAgentFilterState(value);
    replaceBrowserUrl({ agent: value });
  }, [replaceBrowserUrl]);

  const setChannelFilter = useCallback((value: string) => {
    const normalized = String(value || '').trim() || DEFAULT_CHANNEL_FILTER;
    setChannelFilterState(normalized);
    replaceBrowserUrl({ channel: normalized });
  }, [replaceBrowserUrl]);

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
  const selectedArtifactVisible = useMemo(
    () => Boolean(selectedArtifact && filteredItems.some((item) => item.id === selectedArtifact.id)),
    [filteredItems, selectedArtifact],
  );
  const selectedArtifactHiddenByFilters = Boolean(selectedArtifact && !selectedArtifactVisible && hasActiveFilters);

  const navigableArtifacts = filteredItems.length > 0 ? filteredItems : (payload?.items || []);
  const selectedNavigationIndex = useMemo(
    () => navigableArtifacts.findIndex((item) => item.id === selectedArtifact?.id),
    [navigableArtifacts, selectedArtifact],
  );

  const selectPreviousArtifact = useCallback(() => {
    if (navigableArtifacts.length === 0) return;
    if (selectedNavigationIndex <= 0) {
      syncSelectedArtifact(navigableArtifacts[0]?.id || null);
      return;
    }
    syncSelectedArtifact(navigableArtifacts[selectedNavigationIndex - 1]?.id || null);
  }, [navigableArtifacts, selectedNavigationIndex, syncSelectedArtifact]);

  const selectNextArtifact = useCallback(() => {
    if (navigableArtifacts.length === 0) return;
    if (selectedNavigationIndex < 0) {
      syncSelectedArtifact(navigableArtifacts[0]?.id || null);
      return;
    }
    const nextIndex = Math.min(navigableArtifacts.length - 1, selectedNavigationIndex + 1);
    syncSelectedArtifact(navigableArtifacts[nextIndex]?.id || null);
  }, [navigableArtifacts, selectedNavigationIndex, syncSelectedArtifact]);

  const closeArtifactSelection = useCallback(() => {
    syncSelectedArtifact(null);
  }, [syncSelectedArtifact]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || shouldIgnoreKeyboardEvent(event.target)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectPreviousArtifact();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectNextArtifact();
        return;
      }
      if (event.key === 'Escape' && isNarrowViewport && selectedArtifactId) {
        event.preventDefault();
        closeArtifactSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeArtifactSelection, isNarrowViewport, selectNextArtifact, selectPreviousArtifact, selectedArtifactId]);

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
    isNarrowViewport,
    selectedArtifact,
    selectedPreviewTarget,
    selectedArtifactVisible,
    selectedArtifactHiddenByFilters,
    selectArtifact,
    closeArtifactSelection,
    hasPreviousArtifact: navigableArtifacts.length > 0 && selectedNavigationIndex > 0,
    hasNextArtifact: navigableArtifacts.length > 0 && selectedNavigationIndex < navigableArtifacts.length - 1,
    selectPreviousArtifact,
    selectNextArtifact,
    artifactContentHref,
    artifactDownloadHref,
    openArtifact,
    revealArtifact,
    revealLabel,
    desktopBridge,
    previewTargetById,
  };
}
