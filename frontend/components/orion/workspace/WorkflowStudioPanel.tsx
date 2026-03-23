'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, type Edge, type EdgeTypes, type Node, type NodeTypes } from '@xyflow/react';
import { Boxes, Loader2, MessageSquare, PlayCircle, Sparkles } from 'lucide-react';
import { fetchWorkflows, getWorkflow, publishWorkflow, runWorkflow } from '@/lib/api';
import { OPEN_LIVE_RUN_LABEL, RUN_STARTED_STATUS_COPY } from '@/lib/runStartCopy';
import AgentNode from '@/components/nodes/AgentNode';
import TriggerNode from '@/components/nodes/TriggerNode';
import ActionNode from '@/components/nodes/ActionNode';
import HttpRequestNode from '@/components/nodes/HttpRequestNode';
import ConditionNode from '@/components/nodes/ConditionNode';
import TransformNode from '@/components/nodes/TransformNode';
import CodeNode from '@/components/nodes/CodeNode';
import SmoothActionEdge from '@/components/nodes/SmoothActionEdge';

type WorkflowRecord = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  updatedAt?: string;
  definition?: {
    meta?: Record<string, unknown>;
  };
};

type WorkflowShape = {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  definition?: {
    nodes?: unknown[];
    edges?: unknown[];
    meta?: Record<string, unknown>;
  };
};

type CanvasNodeType = 'trigger' | 'agent' | 'action' | 'http_request' | 'condition' | 'transform' | 'code';
type TriggerKind = 'schedule' | 'webhook' | 'manual';
type ActionKind = 'send_wechat' | 'send_telegram' | 'send_whatsapp' | 'send_email' | 'write_file';

type TriggerCanvasData = { label: string; triggerType: TriggerKind };
type AgentCanvasData = {
  label: string;
  modelId: string;
  prompt: string;
  tools: string[];
  provider: string;
  role: string;
  duty: string;
  status: string;
  description: string;
};
type ActionCanvasData = { label: string; actionType: ActionKind };
type HttpRequestCanvasData = { label: string; method: string; url: string };
type ConditionCanvasData = { label: string; condition: string };
type TransformCanvasData = { label: string; mapping: string };
type CodeCanvasData = { label: string; summary: string; code: string };

type CanvasNodeData =
  | TriggerCanvasData
  | AgentCanvasData
  | ActionCanvasData
  | HttpRequestCanvasData
  | ConditionCanvasData
  | TransformCanvasData
  | CodeCanvasData;

type CanvasWorkflowNode = Node<CanvasNodeData>;
type CanvasWorkflowEdge = Edge;

type WorkflowStudioPanelProps = {
  goal: string;
  setupReady: boolean;
  latestRunSummary: string | null;
};

const CANVAS_NODE_X = 240;
const CANVAS_NODE_TOP = 56;
const CANVAS_NODE_GAP = 170;

const CANVAS_NODE_TYPES: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  action: ActionNode,
  http_request: HttpRequestNode,
  condition: ConditionNode,
  transform: TransformNode,
  code: CodeNode,
};

const CANVAS_EDGE_TYPES: EdgeTypes = {
  rope: SmoothActionEdge,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function defaultNodeData(type: CanvasNodeType): CanvasNodeData {
  if (type === 'trigger') return { label: 'Start Trigger', triggerType: 'manual' };
  if (type === 'http_request') return { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' };
  if (type === 'condition') return { label: 'Condition', condition: 'value > 10' };
  if (type === 'transform') return { label: 'Transform', mapping: 'Map fields to output payload' };
  if (type === 'code') return { label: 'Code', summary: 'Run custom logic', code: 'return input;' };
  if (type === 'action') return { label: 'Send Telegram', actionType: 'send_telegram' };
  return {
    label: 'AI Agent',
    modelId: 'gpt-4.1',
    prompt: 'Describe the task for this agent.',
    tools: [],
    provider: 'openai',
    role: 'Worker',
    duty: 'Complete the assigned task clearly and reliably.',
    status: 'ready',
    description: 'Autonomous reasoning',
  };
}

function normalizeCanvasNodeData(type: CanvasNodeType, raw: unknown): CanvasNodeData {
  if (!isRecord(raw)) return defaultNodeData(type);
  if (type === 'trigger') {
    const base: TriggerCanvasData = { label: 'Start Trigger', triggerType: 'manual' };
    const triggerType = String(raw.triggerType || base.triggerType).trim().toLowerCase();
    return {
      label: String(raw.label || base.label).trim() || base.label,
      triggerType: triggerType === 'schedule' || triggerType === 'webhook' ? triggerType : 'manual',
    };
  }
  if (type === 'action') {
    const base: ActionCanvasData = { label: 'Send Telegram', actionType: 'send_telegram' };
    const actionType = String(raw.actionType || base.actionType).trim().toLowerCase();
    return {
      label: String(raw.label || base.label).trim() || base.label,
      actionType:
        actionType === 'send_wechat' ||
        actionType === 'send_telegram' ||
        actionType === 'send_whatsapp' ||
        actionType === 'send_email' ||
        actionType === 'write_file'
          ? actionType
          : 'send_telegram',
    };
  }
  if (type === 'http_request') {
    const base: HttpRequestCanvasData = { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' };
    return {
      label: String(raw.label || base.label).trim() || base.label,
      method: String(raw.method || base.method).trim().toUpperCase() || base.method,
      url: String(raw.url || base.url).trim() || base.url,
    };
  }
  if (type === 'condition') {
    const base: ConditionCanvasData = { label: 'Condition', condition: 'value > 10' };
    return {
      label: String(raw.label || base.label).trim() || base.label,
      condition: String(raw.condition || base.condition).trim() || base.condition,
    };
  }
  if (type === 'transform') {
    const base: TransformCanvasData = { label: 'Transform', mapping: 'Map fields to output payload' };
    return {
      label: String(raw.label || base.label).trim() || base.label,
      mapping: String(raw.mapping || base.mapping).trim() || base.mapping,
    };
  }
  if (type === 'code') {
    const base: CodeCanvasData = { label: 'Code', summary: 'Run custom logic', code: 'return input;' };
    return {
      label: String(raw.label || base.label).trim() || base.label,
      summary: String(raw.summary || base.summary).trim() || base.summary,
      code: String(raw.code || base.code),
    };
  }
  const base: AgentCanvasData = {
    label: 'AI Agent',
    modelId: 'gpt-4.1',
    prompt: 'Describe the task for this agent.',
    tools: [],
    provider: 'openai',
    role: 'Worker',
    duty: 'Complete the assigned task clearly and reliably.',
    status: 'ready',
    description: 'Autonomous reasoning',
  };
  return {
    label: String(raw.label || base.label).trim() || base.label,
    modelId: String(raw.modelId || base.modelId).trim() || base.modelId,
    prompt: String(raw.prompt || base.prompt).trim() || base.prompt,
    tools: Array.isArray(raw.tools) ? raw.tools.map((item) => String(item).trim()).filter(Boolean) : base.tools,
    provider: String(raw.provider || base.provider).trim() || base.provider,
    role: String(raw.role || base.role).trim() || base.role,
    duty: String(raw.duty || base.duty).trim() || base.duty,
    status: String(raw.status || base.status).trim() || base.status,
    description: String(raw.description || base.description).trim() || base.description,
  };
}

function parseCanvasNodes(rawNodes: unknown): CanvasWorkflowNode[] {
  if (!Array.isArray(rawNodes)) return [];
  const parsed: CanvasWorkflowNode[] = [];
  for (const item of rawNodes) {
    if (!isRecord(item)) continue;
    const type = String(item.type || '').trim().toLowerCase();
    if (type !== 'trigger' && type !== 'agent' && type !== 'action' && type !== 'http_request' && type !== 'condition' && type !== 'transform' && type !== 'code') continue;
    const position = isRecord(item.position) ? item.position : {};
    const x = Number(position.x);
    const y = Number(position.y);
    parsed.push({
      id: String(item.id || `${type}-${parsed.length + 1}`),
      type,
      position: {
        x: Number.isFinite(x) ? x : CANVAS_NODE_X,
        y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + parsed.length * CANVAS_NODE_GAP,
      },
      data: normalizeCanvasNodeData(type, item.data),
    });
  }
  return parsed;
}

function parseCanvasEdges(rawEdges: unknown, nodes: CanvasWorkflowNode[]): CanvasWorkflowEdge[] {
  if (!Array.isArray(rawEdges)) return [];
  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  const parsed: CanvasWorkflowEdge[] = [];
  for (const item of rawEdges) {
    if (!isRecord(item)) continue;
    const source = String(item.source || '').trim();
    const target = String(item.target || '').trim();
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    parsed.push({
      id: String(item.id || `edge-${source}-${target}-${parsed.length + 1}`),
      source,
      target,
      sourceHandle: typeof item.sourceHandle === 'string' ? item.sourceHandle : undefined,
      targetHandle: typeof item.targetHandle === 'string' ? item.targetHandle : undefined,
      type: 'rope',
      animated: false,
      style: { stroke: '#7c3aed', strokeWidth: 2, opacity: 0.78 },
    });
  }
  return parsed;
}

function buildDraftNodes(goal: string): CanvasWorkflowNode[] {
  const text = goal.trim().toLowerCase();
  const types: CanvasNodeType[] = ['trigger'];
  if (/(if|when|only if|unless)/.test(text)) types.push('condition');
  if (/(summari|extract|format|clean|transform|rewrite)/.test(text)) types.push('transform');
  if (/(http|api|webhook|url|endpoint)/.test(text)) types.push('http_request');
  types.push('agent');
  if (/(code|script|javascript|python)/.test(text)) types.push('code');
  types.push('action');

  return types.map((type, index) => ({
    id: `${type}-${index + 1}`,
    type,
    position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP + index * CANVAS_NODE_GAP },
    data: normalizeCanvasNodeData(type, draftNodeData(type, goal, index)),
  }));
}

function buildDraftEdges(nodes: CanvasWorkflowNode[]): CanvasWorkflowEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1]?.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'rope',
    animated: index === nodes.length - 2,
    style: { stroke: '#7c3aed', strokeWidth: 2, opacity: 0.62 },
  }));
}

function compactGoal(value: string, max = 72): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function workflowRuntimeProfileLabel(workflow: WorkflowShape | null): string {
  const meta = workflow?.definition?.meta;
  if (!meta || typeof meta !== 'object') return '';
  const label = String(meta.runtime_profile_label || '').trim();
  if (label) return label;
  const profileId = String(meta.runtime_profile_id || '').trim();
  return profileId ? `Profile ${profileId.slice(0, 8)}` : '';
}

function workflowRuntimeProfileSummary(workflow: { definition?: { meta?: Record<string, unknown> } } | null | undefined): string {
  const meta = workflow?.definition?.meta;
  if (!meta || typeof meta !== 'object') return '';
  const label = String(meta.runtime_profile_label || '').trim();
  if (label) return label;
  const profileId = String(meta.runtime_profile_id || '').trim();
  return profileId ? `Profile ${profileId.slice(0, 8)}` : '';
}

function extractUrl(value: string): string | null {
  const match = value.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function draftNodeData(type: CanvasNodeType, goal: string, index: number): Partial<CanvasNodeData> {
  const text = goal.trim();
  const lowered = text.toLowerCase();
  if (type === 'trigger') {
    return { label: text ? 'User request' : 'Start here', triggerType: 'manual' };
  }
  if (type === 'condition') {
    return {
      label: 'Check conditions',
      condition:
        /if|when|unless/.test(lowered)
          ? compactGoal(text, 54)
          : 'Continue only when the required condition is true',
    };
  }
  if (type === 'http_request') {
    return {
      label: 'Call external API',
      method: /post /.test(lowered) ? 'POST' : 'GET',
      url: extractUrl(text) || 'https://api.example.com',
    };
  }
  if (type === 'transform') {
    if (/summari/.test(lowered)) {
      return { label: 'Summarize content', mapping: compactGoal(text, 56) };
    }
    if (/extract|clean|format|rewrite/.test(lowered)) {
      return { label: 'Transform data', mapping: compactGoal(text, 56) };
    }
    return { label: 'Prepare output', mapping: text ? compactGoal(text, 56) : 'Map fields to the final output' };
  }
  if (type === 'agent') {
    return {
      label: /monitor|watch|alert/.test(lowered) ? 'Monitor with AI' : 'Plan with AI',
      prompt: text || 'Describe the work for this agent.',
      duty: text ? compactGoal(text, 78) : 'Complete the assigned task clearly and reliably.',
      description: text ? compactGoal(text, 60) : 'Autonomous reasoning',
    };
  }
  if (type === 'code') {
    return {
      label: 'Custom logic',
      summary: text ? compactGoal(text, 52) : 'Run custom logic',
      code: 'return input;',
    };
  }
  if (type === 'action') {
    if (/telegram/.test(lowered)) return { label: 'Send Telegram alert', actionType: 'send_telegram' };
    if (/email|inbox/.test(lowered)) return { label: 'Send email update', actionType: 'send_email' };
    if (/file|save|document/.test(lowered)) return { label: 'Save file', actionType: 'write_file' };
    return { label: index > 0 && text ? 'Deliver result' : 'Send Telegram', actionType: 'send_telegram' };
  }
  return defaultNodeData(type);
}

function formatUpdatedAt(value?: string): string {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function statusLabel(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'published':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Needs review';
    default:
      return 'Draft';
  }
}

function nodeTypeLabel(type?: string | null): string {
  switch (String(type || '').trim().toLowerCase()) {
    case 'trigger':
      return 'Trigger';
    case 'agent':
      return 'Agent';
    case 'action':
      return 'Action';
    case 'http_request':
      return 'HTTP Request';
    case 'condition':
      return 'Condition';
    case 'transform':
      return 'Transform';
    case 'code':
      return 'Code';
    default:
      return 'Step';
  }
}

function titleCaseWords(value?: string | null): string {
  return String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nodeSummary(node: CanvasWorkflowNode | null): string {
  if (!node) return 'Select a step to inspect its details.';
  switch (node.type) {
    case 'trigger': {
      const data = node.data as TriggerCanvasData;
      return `Starts this workflow with a ${data.triggerType} trigger.`;
    }
    case 'agent': {
      const data = node.data as AgentCanvasData;
      return data.description || data.duty || 'Autonomous reasoning step.';
    }
    case 'action': {
      const data = node.data as ActionCanvasData;
      return `Delivers the result with ${String(data.actionType || '').replace(/_/g, ' ')}.`;
    }
    case 'http_request': {
      const data = node.data as HttpRequestCanvasData;
      return `${data.method} ${data.url}`;
    }
    case 'condition': {
      const data = node.data as ConditionCanvasData;
      return data.condition || 'Checks whether the workflow should continue.';
    }
    case 'transform': {
      const data = node.data as TransformCanvasData;
      return data.mapping || 'Shapes data for the next step.';
    }
    case 'code': {
      const data = node.data as CodeCanvasData;
      return data.summary || 'Runs custom logic.';
    }
    default:
      return 'Select a step to inspect its details.';
  }
}

function nodeInspectorItems(node: CanvasWorkflowNode | null): Array<{ label: string; value: string }> {
  if (!node) return [];
  switch (node.type) {
    case 'trigger': {
      const data = node.data as TriggerCanvasData;
      return [
        { label: 'Type', value: titleCaseWords(data.triggerType) || 'Manual' },
        { label: 'Label', value: data.label || 'Start trigger' },
      ];
    }
    case 'agent': {
      const data = node.data as AgentCanvasData;
      return [
        { label: 'Role', value: data.role || 'Worker' },
        { label: 'Model', value: data.modelId || 'Unknown model' },
        { label: 'Duty', value: data.duty || 'No duty set' },
        { label: 'Tools', value: Array.isArray(data.tools) && data.tools.length > 0 ? data.tools.join(', ') : 'No tools selected' },
      ];
    }
    case 'action': {
      const data = node.data as ActionCanvasData;
      return [
        { label: 'Action', value: titleCaseWords(data.actionType) || 'Action' },
        { label: 'Label', value: data.label || 'Action step' },
      ];
    }
    case 'http_request': {
      const data = node.data as HttpRequestCanvasData;
      return [
        { label: 'Method', value: data.method || 'GET' },
        { label: 'URL', value: data.url || 'No URL set' },
      ];
    }
    case 'condition': {
      const data = node.data as ConditionCanvasData;
      return [
        { label: 'Condition', value: data.condition || 'No condition set' },
      ];
    }
    case 'transform': {
      const data = node.data as TransformCanvasData;
      return [
        { label: 'Mapping', value: data.mapping || 'No mapping set' },
      ];
    }
    case 'code': {
      const data = node.data as CodeCanvasData;
      return [
        { label: 'Summary', value: data.summary || 'No summary set' },
        { label: 'Code', value: compactGoal(data.code || '', 140) || 'No code set' },
      ];
    }
    default:
      return [];
  }
}

export function WorkflowStudioPanel({ goal, setupReady, latestRunSummary }: WorkflowStudioPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowShape | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<'test' | 'activate' | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [actionRunId, setActionRunId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchWorkflows();
        if (cancelled) return;
        const items = Array.isArray(data)
          ? data
          : Array.isArray((data as { items?: WorkflowRecord[] } | null | undefined)?.items)
            ? ((data as { items: WorkflowRecord[] }).items)
            : [];
        const nextItems = items.slice(0, 6);
        setWorkflows(nextItems);
        setSelectedWorkflowId((current) => current || nextItems[0]?.id || null);
      } catch {
        if (!cancelled) {
          setWorkflows([]);
          setSelectedWorkflowId(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkflowId) {
      setSelectedWorkflow(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setDetailLoading(true);
        const workflow = await getWorkflow(selectedWorkflowId);
        if (!cancelled) setSelectedWorkflow(workflow as WorkflowShape);
      } catch {
        if (!cancelled) setSelectedWorkflow(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId]);

  const selectedWorkflowRecord = useMemo(
    () => workflows.find((item) => item.id === selectedWorkflowId) || null,
    [selectedWorkflowId, workflows],
  );
  const hasPromptDraft = goal.trim().length > 0;
  const selectedStatus = String(selectedWorkflow?.status || selectedWorkflowRecord?.status || 'draft').toLowerCase();
  const isSelectedWorkflowActive = selectedStatus === 'published';
  const currentPrompt = compactGoal(goal, 160);
  const selectedRuntimeProfileLabel = useMemo(
    () => workflowRuntimeProfileLabel(selectedWorkflow),
    [selectedWorkflow],
  );

  const setWorkflowStatus = (workflowId: string, status: string) => {
    setWorkflows((current) =>
      current.map((item) => (item.id === workflowId ? { ...item, status } : item)),
    );
    setSelectedWorkflow((current) => (current && current.id === workflowId ? { ...current, status } : current));
  };

  const handleTestWorkflow = async () => {
    if (!selectedWorkflowId || actionBusy) return;
    try {
      setActionBusy('test');
      setActionNote(null);
      setActionRunId(null);
      const payload = await runWorkflow(selectedWorkflowId) as { run_id?: string } | null;
      setActionRunId(typeof payload?.run_id === 'string' ? payload.run_id : null);
      setActionNote(RUN_STARTED_STATUS_COPY);
    } catch (error) {
      setActionRunId(null);
      setActionNote(error instanceof Error ? error.message : 'Failed to start test run.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleActivateWorkflow = async () => {
    if (!selectedWorkflowId || actionBusy) return;
    try {
      setActionBusy('activate');
      setActionNote(null);
      await publishWorkflow(selectedWorkflowId);
      setWorkflowStatus(selectedWorkflowId, 'published');
      setActionNote('Automation is now active.');
    } catch (error) {
      setActionNote(error instanceof Error ? error.message : 'Failed to activate workflow.');
    } finally {
      setActionBusy(null);
    }
  };

  const graph = useMemo(() => {
    if (hasPromptDraft) {
      const draftNodes = buildDraftNodes(goal);
      return {
        nodes: draftNodes,
        edges: buildDraftEdges(draftNodes),
        mode: 'prompt' as const,
      };
    }
    const workflowNodes = parseCanvasNodes(selectedWorkflow?.definition?.nodes);
    const workflowEdges = parseCanvasEdges(selectedWorkflow?.definition?.edges, workflowNodes);
    if (workflowNodes.length > 0) {
      return {
        nodes: workflowNodes,
        edges: workflowEdges,
        mode: 'existing' as const,
      };
    }
    const draftNodes = buildDraftNodes(goal);
    return {
      nodes: draftNodes,
      edges: buildDraftEdges(draftNodes),
      mode: 'draft' as const,
    };
  }, [goal, hasPromptDraft, selectedWorkflow]);

  useEffect(() => {
    if (graph.nodes.length === 0) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId((current) =>
      current && graph.nodes.some((node) => node.id === current) ? current : String(graph.nodes[0]?.id || ''),
    );
  }, [graph.nodes]);

  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) || null,
    [graph.nodes, selectedNodeId],
  );
  const inspectorItems = useMemo(() => nodeInspectorItems(selectedNode), [selectedNode]);

  return (
    <aside className="orion-workspace-studio">
      <section className="orion-workspace-studio-panel">
        <div className="orion-workspace-studio-header">
          <div>
            <div className="orion-workspace-studio-eyebrow">Live workflow</div>
            <h2 className="orion-workspace-studio-title">
              {graph.mode === 'existing'
                ? (selectedWorkflow?.name || selectedWorkflowRecord?.name || 'Selected workflow')
                : graph.mode === 'prompt'
                  ? 'Building from your current request'
                  : 'Build visually while you chat'}
            </h2>
            <p className="orion-workspace-studio-copy">
              {graph.mode === 'existing'
                ? 'The assistant stays on the left. This panel shows the actual workflow canvas for the workflow you are reviewing.'
                : graph.mode === 'prompt'
                  ? 'As you type on the left, this draft shifts into a visible workflow shape you can test and activate.'
                  : 'The assistant handles the conversation on the left. This panel shows the workflow shape that will be built and activated.'}
            </p>
          </div>
          <div className="orion-workspace-studio-header-actions">
            <Link href="/workflows" className="btn-secondary orion-workspace-studio-link">
              Open Workflows
            </Link>
            {selectedWorkflowId ? (
              <Link href={`/workflows/${selectedWorkflowId}`} className="btn-ghost orion-workspace-studio-link">
                Full editor
              </Link>
            ) : null}
          </div>
        </div>

        <div className="orion-workspace-studio-canvas">
          <div className="orion-workspace-studio-canvas-header">
            <div className="orion-workspace-studio-status">
              <Sparkles size={14} />
              <span>
                {detailLoading
                  ? 'Loading workflow canvas'
                  : graph.mode === 'existing'
                    ? 'Showing selected workflow'
                    : graph.mode === 'prompt'
                      ? 'Live draft from current request'
                    : goal.trim()
                      ? 'Drafting from your prompt'
                      : 'Ready for a new workflow'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {graph.mode === 'prompt' ? (
                <div className="orion-workspace-studio-chip is-live">
                  <MessageSquare size={14} />
                  Linked to chat input
                </div>
              ) : null}
              <div className="orion-workspace-studio-chip">
                {graph.nodes.length} step{graph.nodes.length === 1 ? '' : 's'}
              </div>
              {selectedRuntimeProfileLabel ? (
                <div className="orion-workspace-studio-chip">
                  Runtime {selectedRuntimeProfileLabel}
                </div>
              ) : null}
              <div className={`orion-workspace-studio-chip${setupReady ? ' is-success' : ''}`}>
                {setupReady ? 'Tools connected' : 'Connect tools later'}
              </div>
            </div>
          </div>
          {graph.mode === 'prompt' && currentPrompt ? (
            <div className="orion-workspace-studio-prompt">
              <div className="orion-workspace-studio-prompt-label">Current request</div>
              <div className="orion-workspace-studio-prompt-text">{currentPrompt}</div>
              {selectedWorkflowRecord ? (
                <div className="orion-workspace-studio-prompt-note">
                  Saved workflows stay below. The canvas above is prioritizing what you are asking for now.
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="orion-workspace-studio-actions">
            <div className="orion-workspace-studio-actions-copy">
              <div className="orion-workspace-studio-actions-title">
                {graph.mode === 'existing' ? 'Selected workflow' : 'Current draft'}
              </div>
              <div className="orion-workspace-studio-actions-note">
                {graph.mode === 'existing'
                  ? isSelectedWorkflowActive
                    ? 'This workflow is active. Test it again or open the full editor for deeper changes.'
                    : 'Test this workflow once, then activate it when the shape looks right.'
                  : graph.mode === 'prompt'
                    ? 'Keep describing the work on the left. When the draft looks right, open Workflows to save and refine it.'
                    : 'Ask for work on the left, then open Workflows when you want the full editor.'}
                {selectedRuntimeProfileLabel && graph.mode === 'existing' ? ` Runtime profile: ${selectedRuntimeProfileLabel}.` : ''}
              </div>
            </div>
            <div className="orion-workspace-studio-actions-buttons">
              {!setupReady ? (
                <Link href="/credentials" className="btn-secondary orion-workspace-studio-link">
                  Connect tools
                </Link>
              ) : null}
              {selectedWorkflowId ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary orion-workspace-studio-link"
                    onClick={() => void handleTestWorkflow()}
                    disabled={actionBusy !== null || graph.mode !== 'existing'}
                  >
                    {actionBusy === 'test' ? <Loader2 size={14} className="orion-spin" /> : <PlayCircle size={14} />}
                    {actionBusy === 'test' ? 'Starting test…' : 'Test once'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary orion-workspace-studio-link"
                    onClick={() => void handleActivateWorkflow()}
                    disabled={actionBusy !== null || isSelectedWorkflowActive || graph.mode !== 'existing'}
                  >
                    {actionBusy === 'activate' ? <Loader2 size={14} className="orion-spin" /> : null}
                    {isSelectedWorkflowActive ? 'Active' : actionBusy === 'activate' ? 'Activating…' : 'Activate'}
                  </button>
                </>
              ) : (
                <Link href="/workflows" className="btn-primary orion-workspace-studio-link">
                  Open Workflows
                </Link>
              )}
            </div>
          </div>
          <div className="orion-workspace-studio-builder">
            <div className="orion-workspace-studio-flow-frame">
              <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={CANVAS_NODE_TYPES}
                edgeTypes={CANVAS_EDGE_TYPES}
                fitView
                fitViewOptions={{ padding: 0.35 }}
                nodesConnectable={false}
                nodesDraggable={false}
                elementsSelectable
                onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
                onPaneClick={() => setSelectedNodeId(null)}
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#d4d4d8" />
              </ReactFlow>
            </div>
            <aside className="orion-workspace-studio-inspector" aria-label="Selected workflow step">
              <div className="orion-workspace-studio-inspector-header">
                <div className="orion-workspace-studio-inspector-eyebrow">Selected step</div>
                <div className="orion-workspace-studio-inspector-title">
                  {selectedNode ? String((selectedNode.data as { label?: string }).label || nodeTypeLabel(selectedNode.type)) : 'No step selected'}
                </div>
                <div className="orion-workspace-studio-inspector-copy">
                  {nodeSummary(selectedNode)}
                </div>
              </div>
              {selectedNode ? (
                <>
                  <div className="orion-workspace-studio-inspector-type-row">
                    <span className="orion-workspace-studio-list-status">{nodeTypeLabel(selectedNode.type)}</span>
                    <span className="orion-workspace-studio-inspector-id">{selectedNode.id}</span>
                  </div>
                  <div className="orion-workspace-studio-inspector-grid">
                    {inspectorItems.map((item) => (
                      <div key={`${selectedNode.id}:${item.label}`} className="orion-workspace-studio-inspector-item">
                        <div className="orion-workspace-studio-inspector-item-label">{item.label}</div>
                        <div className="orion-workspace-studio-inspector-item-value">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="orion-workspace-studio-inspector-note">
                    {graph.mode === 'existing'
                      ? 'Use the full editor for deeper field editing and execution details.'
                      : 'Keep describing the workflow on the left. This inspector updates as the draft changes.'}
                  </div>
                </>
              ) : (
                <div className="orion-workspace-studio-empty">
                  Click a step in the canvas to inspect it here.
                </div>
              )}
            </aside>
          </div>
          <div className="orion-workspace-studio-footnote">
            {actionNote?.trim() ? (
              <div className="orion-inline-actions" style={{ justifyContent: 'space-between', width: '100%' }}>
                <span>{actionNote}</span>
                {actionRunId ? (
                  <Link className="btn-secondary" href={`/runs/${encodeURIComponent(actionRunId)}/inspect?focus=timeline`}>
                    {OPEN_LIVE_RUN_LABEL}
                  </Link>
                ) : null}
              </div>
            ) : latestRunSummary?.trim() ? (
              latestRunSummary
            ) : graph.mode === 'existing' ? (
              'Open the full editor to test, publish, or refine this workflow.'
            ) : graph.mode === 'prompt' ? (
              'This draft is following your current request. Keep refining the prompt or open Workflows to turn it into a saved workflow.'
            ) : (
              'Ask for a workflow in plain language. Empyralis should turn it into a draft you can inspect and activate.'
            )}
          </div>
        </div>
      </section>

      <section className="orion-workspace-studio-panel">
        <div className="orion-workspace-studio-section-header">
          <div>
            <div className="orion-workspace-studio-section-title">Recent workflows</div>
            <div className="orion-workspace-studio-section-copy">Select one to inspect it here. Use the library for full editing.</div>
          </div>
          <Link href="/solutions" className="btn-ghost orion-workspace-studio-link">
            <Boxes size={14} />
            Solutions
          </Link>
        </div>
        <div className="orion-workspace-studio-list">
          {loading ? (
            <div className="orion-workspace-studio-empty">Loading recent workflows…</div>
          ) : workflows.length === 0 ? (
            <div className="orion-workspace-studio-empty">No workflows yet. Start by asking the assistant to build one.</div>
          ) : (
            workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                className={`orion-workspace-studio-list-item${workflow.id === selectedWorkflowId ? ' is-selected' : ''}`}
                onClick={() => setSelectedWorkflowId(workflow.id)}
              >
                <div>
                  <div className="orion-workspace-studio-list-title">{workflow.name || 'Untitled workflow'}</div>
                  <div className="orion-workspace-studio-list-copy">{workflow.description || 'Open the canvas to refine this workflow.'}</div>
                  {workflowRuntimeProfileSummary(workflow) ? (
                    <div className="orion-workspace-studio-list-copy">Runtime {workflowRuntimeProfileSummary(workflow)}</div>
                  ) : null}
                </div>
                <div className="orion-workspace-studio-list-meta">
                  <span className="orion-workspace-studio-list-status">{statusLabel(workflow.status)}</span>
                  <span>{formatUpdatedAt(workflow.updatedAt)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
