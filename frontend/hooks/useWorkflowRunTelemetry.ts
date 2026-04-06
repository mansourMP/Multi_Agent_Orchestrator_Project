import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { RunDetailResponse } from '@/lib/api-contract';

export interface WorkflowRunNodeState {
  node_id?: string | null;
  label?: string | null;
  type?: string | null;
  variant?: string | null;
  status?: string | null;
  summary?: string | null;
  error?: string | null;
  input_preview?: string | null;
  output_preview?: string | null;
  child_run_id?: string | null;
  waiting_for_approval?: boolean;
}

export interface WorkflowRunNodeStatesPayload {
  active_node_id?: string | null;
  final_node_id?: string | null;
  counts?: Record<string, number> | null;
  items?: WorkflowRunNodeState[] | null;
}

export interface WorkflowRunDetail {
  run_id?: string | null;
  status?: string | null;
  node_states?: WorkflowRunNodeStatesPayload | null;
}

type WorkflowRenderableNode = {
  id: string;
  data: Record<string, unknown>;
  selected?: boolean;
};

type WorkflowRunTelemetryOptions<TNode extends WorkflowRenderableNode> = {
  runId?: string | null;
  nodes: TNode[];
  selectedNodeId?: string | null;
  controlPlaneFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'waiting', 'waiting_human', 'starting']);

export function normalizeWorkflowRunNodeStatus(value: string | null | undefined): string {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'succeeded' || status === 'completed' || status === 'success') return 'success';
  if (status === 'failed' || status === 'error' || status === 'timeout') return 'error';
  if (status === 'running' || status === 'starting') return 'running';
  if (status === 'waiting_human' || status === 'waiting' || status === 'waiting_for_input') return 'waiting';
  return status || 'ready';
}

export function formatWorkflowRunNodeStatusLabel(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'waiting_human') return 'Waiting';
  if (normalized === 'succeeded') return 'Succeeded';
  return normalized.replace(/_/g, ' ');
}

export function workflowRunNodeSummary(item: WorkflowRunNodeState | null | undefined): string {
  if (!item) return '';
  const summary = String(item.summary || '').trim();
  if (summary) return summary;
  const error = String(item.error || '').trim();
  if (error) return error;
  const outputPreview = String(item.output_preview || '').trim();
  if (outputPreview) return outputPreview;
  const inputPreview = String(item.input_preview || '').trim();
  if (inputPreview) return inputPreview;
  if (item.waiting_for_approval) return 'Waiting for approval.';
  return '';
}

export function formatWorkflowRunCountsSummary(counts: Record<string, number> | null | undefined): string {
  if (!counts || typeof counts !== 'object') return '';
  const parts = Object.entries(counts)
    .filter(([, value]) => Number(value) > 0)
    .map(([status, value]) => `${Number(value)} ${status.replace(/_/g, ' ')}`);
  return parts.join(' · ');
}

export function useWorkflowRunTelemetry<TNode extends WorkflowRenderableNode>({
  runId,
  nodes,
  selectedNodeId,
}: WorkflowRunTelemetryOptions<TNode>) {
  const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
  const normalizedRunId = String(runId || '').trim();

  const refreshRunDetail = useCallback(async (targetRunId?: string | null) => {
    const nextRunId = String(targetRunId || runId || '').trim();
    if (!nextRunId) return;
    try {
      const payload = await apiClient.getRunDetail(nextRunId);
      setRunDetail(payload as RunDetailResponse as WorkflowRunDetail | null);
    } catch {
      // Keep the current surface stable if run detail sync fails transiently.
    }
  }, [runId]);

  useEffect(() => {
    if (!normalizedRunId) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await apiClient.getRunDetail(normalizedRunId);
        if (!cancelled) setRunDetail(payload as RunDetailResponse as WorkflowRunDetail | null);
      } catch {
        // Keep the current surface stable if run detail sync fails transiently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedRunId]);

  const scopedRunDetail = useMemo(() => {
    if (!normalizedRunId) return null;
    const currentRunId = String(runDetail?.run_id || '').trim();
    if (currentRunId && currentRunId !== normalizedRunId) return null;
    return runDetail;
  }, [normalizedRunId, runDetail]);

  const currentRunStatus = String(scopedRunDetail?.status || '').trim().toLowerCase();

  useEffect(() => {
    if (!normalizedRunId) return;
    if (currentRunStatus && !ACTIVE_RUN_STATUSES.has(currentRunStatus)) return;
    const timer = window.setInterval(() => {
      void refreshRunDetail(normalizedRunId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [currentRunStatus, normalizedRunId, refreshRunDetail]);

  const scopedNodeStates = scopedRunDetail?.node_states ?? null;

  const workflowRunNodeStateMap = useMemo(() => {
    const items = Array.isArray(scopedNodeStates?.items) ? scopedNodeStates.items : [];
    return items.reduce<Record<string, WorkflowRunNodeState>>((acc, item) => {
      const nodeId = String(item?.node_id || '').trim();
      if (nodeId) acc[nodeId] = item;
      return acc;
    }, {});
  }, [scopedNodeStates]);

  const activeRunNodeId = useMemo(
    () => String(scopedNodeStates?.active_node_id || '').trim() || null,
    [scopedNodeStates],
  );

  const finalRunNodeId = useMemo(
    () => String(scopedNodeStates?.final_node_id || '').trim() || null,
    [scopedNodeStates],
  );

  const selectedRunNodeState = useMemo(
    () => (selectedNodeId ? workflowRunNodeStateMap[selectedNodeId] || null : null),
    [selectedNodeId, workflowRunNodeStateMap],
  );

  const renderedNodes = useMemo<TNode[]>(
    () => nodes.map((node) => {
      const runNodeState = workflowRunNodeStateMap[node.id];
      if (!runNodeState) return node;
      const nextData = { ...node.data };
      nextData.status = normalizeWorkflowRunNodeStatus(runNodeState.status);
      const summary = workflowRunNodeSummary(runNodeState);
      if (summary) nextData.executionSummary = summary;
      return {
        ...node,
        selected: selectedNodeId === node.id,
        data: nextData,
      };
    }) as TNode[],
    [nodes, selectedNodeId, workflowRunNodeStateMap],
  );

  return {
    runDetail: scopedRunDetail,
    refreshRunDetail,
    activeRunNodeId,
    finalRunNodeId,
    selectedRunNodeState,
    renderedNodes,
    workflowRunNodeStateMap,
  };
}
