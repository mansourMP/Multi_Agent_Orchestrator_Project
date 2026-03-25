'use client';

import { useMemo, useState } from 'react';
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

function formatApiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (!message) return fallback;
  if (message.includes('Failed to fetch') || message.includes('Cannot reach the backend API')) {
    return `${fallback}. Backend API may be offline on ${API_BASE}.`;
  }
  return `${fallback}: ${message}`;
}

async function loadWorkflowLibrary(): Promise<WorkflowRecord[]> {
  const data = await fetchWorkflows();
  if (Array.isArray(data)) return data as WorkflowRecord[];
  if (Array.isArray((data as { items?: unknown[] } | null | undefined)?.items)) {
    return (data as { items: WorkflowRecord[] }).items;
  }
  return [];
}

export function useWorkflowLibrary() {
  const {
    data: workflows,
    setData: setWorkflows,
    loading,
    error,
    refresh,
  } = useAsyncPageResource<WorkflowRecord[]>({
    initialData: [],
    load: loadWorkflowLibrary,
    formatError: (loadError) => formatApiError(loadError, 'Failed to load workflows'),
  });

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
    if (original.definition) {
      await updateWorkflow(created.id, original.definition);
    }
    await refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await deleteWorkflow(deleteTarget.id);
      setWorkflows((current) => current.filter((workflow) => workflow.id !== deleteTarget.id));
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
