'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/config';
import { createWorkflow, deleteWorkflow, fetchWorkflows, getWorkflow, updateWorkflow } from '@/lib/api';
import { useAsyncPageResource } from '@/hooks/pages/useAsyncPageResource';
import { usePageSearch } from '@/hooks/pages/usePageSearch';

export type WorkflowRecord = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  nodeCount?: number;
  lastRun?: string;
  updatedAt: string;
  definition?: {
    meta?: Record<string, unknown>;
  };
};

const WORKFLOW_LIBRARY_CACHE_KEY = 'hekor.workflow-library.cache.v1';
let workflowLibraryCache: WorkflowRecord[] | null = null;
let workflowLibraryInFlight: Promise<WorkflowRecord[]> | null = null;

function readWorkflowLibraryCache(): WorkflowRecord[] {
  if (workflowLibraryCache) return workflowLibraryCache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(WORKFLOW_LIBRARY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    workflowLibraryCache = parsed as WorkflowRecord[];
    return workflowLibraryCache;
  } catch {
    return [];
  }
}

function persistWorkflowLibraryCache(next: WorkflowRecord[]) {
  workflowLibraryCache = next;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WORKFLOW_LIBRARY_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache errors.
  }
}

function formatApiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return fallback;
  if (message.includes('Failed to fetch') || message.includes('Cannot reach the backend API')) {
    return `${fallback}. Backend API may be offline on ${API_BASE}.`;
  }
  return `${fallback}: ${message}`;
}

async function loadWorkflowLibrary(): Promise<WorkflowRecord[]> {
  if (workflowLibraryInFlight) return workflowLibraryInFlight;

  workflowLibraryInFlight = (async () => {
    const data = await fetchWorkflows();
    const next = Array.isArray(data)
      ? (data as WorkflowRecord[])
      : Array.isArray((data as { items?: unknown[] } | null | undefined)?.items)
        ? (data as { items: WorkflowRecord[] }).items
        : [];
    persistWorkflowLibraryCache(next);
    return next;
  })();

  try {
    return await workflowLibraryInFlight;
  } finally {
    workflowLibraryInFlight = null;
  }
}

export function useWorkflowLibrary() {
  const formatLoadError = useCallback(
    (loadError: unknown) => formatApiError(loadError, 'Failed to load workflows'),
    [],
  );
  const {
    data: workflows,
    setData: setWorkflows,
    loading,
    error,
    refresh,
  } = useAsyncPageResource<WorkflowRecord[]>({
    initialData: [],
    load: loadWorkflowLibrary,
    formatError: formatLoadError,
    hasInitialData: false,
  });

  useEffect(() => {
    const cached = readWorkflowLibraryCache();
    if (cached.length === 0) return;
    setWorkflows((current) => (current.length > 0 ? current : cached));
  }, [setWorkflows]);

  const search = usePageSearch<WorkflowRecord>({
    items: workflows,
    matcher: (workflow, normalizedQuery) =>
      String(workflow.name || '').toLowerCase().includes(normalizedQuery)
      || String(workflow.description || '').toLowerCase().includes(normalizedQuery),
  });

  const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredWorkflows = search.filteredItems;

  const statusSummary = useMemo(() => {
    return workflows.reduce(
      (acc, workflow) => {
        const status = String(workflow.status || 'draft').toLowerCase();
        acc.total += 1;
        if (status === 'published') acc.active += 1;
        else if (status === 'paused') acc.scheduled += 1;
        else if (status === 'error') acc.needsAttention += 1;
        else acc.draft += 1;
        return acc;
      },
      { total: 0, active: 0, draft: 0, scheduled: 0, needsAttention: 0 },
    );
  }, [workflows]);

  const recentWorkflowCount = useMemo(() => {
    const now = Date.now();
    return workflows.filter((workflow) => {
      const ts = new Date(workflow.updatedAt || '').getTime();
      if (Number.isNaN(ts)) return false;
      return now - ts <= 7 * 24 * 60 * 60 * 1000;
    }).length;
  }, [workflows]);

  const duplicateWorkflow = async (id: string) => {
    const original = await getWorkflow(id);
    const copyName = `${original.name || 'Workflow'} Copy`;
    const copyDesc = original.description || '';
    const created = await createWorkflow(copyName, copyDesc);
    const createdId = typeof created.id === 'string' ? created.id : '';
    if (!createdId) {
      throw new Error('Unable to duplicate workflow right now.');
    }
    if (original.definition) {
      await updateWorkflow(createdId, original.definition);
    }
    await refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteWorkflow(deleteTarget.id);
      setWorkflows((current) => {
        const next = current.filter((workflow) => workflow.id !== deleteTarget.id);
        persistWorkflowLibraryCache(next);
        return next;
      });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    workflows,
    filteredWorkflows,
    loading,
    loadError: error,
    refresh,
    query: search.query,
    setQuery: search.setQuery,
    clearQuery: search.clearQuery,
    hasQuery: search.hasQuery,
    statusSummary,
    recentWorkflowCount,
    duplicateWorkflow,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    isDeleting,
    formatApiError,
  };
}
