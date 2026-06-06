'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, type Edge, type Node, type NodeTypes } from '@xyflow/react';
import { Bot, Boxes, PlayCircle, Sparkles, Workflow } from 'lucide-react';
import { fetchWorkflows, getWorkflow } from '@/lib/api';
import AgentNode from '@/components/nodes/AgentNode';
import TriggerNode from '@/components/nodes/TriggerNode';
import ActionNode from '@/components/nodes/ActionNode';
import HttpRequestNode from '@/components/nodes/HttpRequestNode';
import ConditionNode from '@/components/nodes/ConditionNode';
import TransformNode from '@/components/nodes/TransformNode';
import CodeNode from '@/components/nodes/CodeNode';

type WorkflowRecord = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  updatedAt?: string;
};

type WorkflowShape = {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  definition?: {
    nodes?: unknown[];
    edges?: unknown[];
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
      type: 'smoothstep',
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
    data: normalizeCanvasNodeData(type, { ...defaultNodeData(type), label: index === 0 && !text ? 'Start here' : undefined }),
  }));
}

function buildDraftEdges(nodes: CanvasWorkflowNode[]): CanvasWorkflowEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1]?.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    style: { stroke: '#7c3aed', strokeWidth: 2, opacity: 0.5 },
  }));
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

export function WorkflowStudioPanel({ goal, setupReady, latestRunSummary }: WorkflowStudioPanelProps) {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowShape | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const graph = useMemo(() => {
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
  }, [goal, selectedWorkflow]);

  return (
    <aside className="orion-workspace-studio">
      <section className="orion-workspace-studio-panel">
        <div className="orion-workspace-studio-header">
          <div>
            <div className="orion-workspace-studio-eyebrow">Live workflow</div>
            <h2 className="orion-workspace-studio-title">
              {graph.mode === 'existing' ? (selectedWorkflow?.name || selectedWorkflowRecord?.name || 'Selected automation') : 'Build visually while you chat'}
            </h2>
            <p className="orion-workspace-studio-copy">
              {graph.mode === 'existing'
                ? 'The assistant stays on the left. This panel shows the actual workflow canvas for the automation you are reviewing.'
                : 'The assistant handles the conversation on the left. This panel shows the workflow shape that will be built and activated.'}
            </p>
          </div>
          <div className="orion-workspace-studio-header-actions">
            <Link href="/workflows" className="btn-secondary orion-workspace-studio-link">
              Open Automations
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
                    ? 'Showing selected automation'
                    : goal.trim()
                      ? 'Drafting from your prompt'
                      : 'Ready for a new automation'}
              </span>
            </div>
            <div className={`orion-workspace-studio-chip${setupReady ? ' is-success' : ''}`}>
              {setupReady ? 'Tools connected' : 'Connect tools later'}
            </div>
          </div>
          <div className="orion-workspace-studio-flow-frame">
            <ReactFlow
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={CANVAS_NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.35 }}
              nodesConnectable={false}
              nodesDraggable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#d4d4d8" />
            </ReactFlow>
          </div>
          <div className="orion-workspace-studio-footnote">
            {latestRunSummary?.trim()
              ? latestRunSummary
              : graph.mode === 'existing'
                ? 'Open the full editor to test, publish, or refine this workflow.'
                : 'Ask for a workflow in plain language. Empyralis should turn it into a draft you can inspect and activate.'}
          </div>
        </div>
      </section>

      <section className="orion-workspace-studio-panel">
        <div className="orion-workspace-studio-section-header">
          <div>
            <div className="orion-workspace-studio-section-title">How this should feel</div>
            <div className="orion-workspace-studio-section-copy">Simple for first-time users, flexible for power users.</div>
          </div>
        </div>
        <div className="orion-workspace-studio-principles">
          <div className="orion-workspace-studio-principle">
            <Bot size={16} />
            <div>
              <strong>Ask in plain language</strong>
              <span>Describe the work once. Do not make the user wire nodes first.</span>
            </div>
          </div>
          <div className="orion-workspace-studio-principle">
            <Workflow size={16} />
            <div>
              <strong>See the workflow live</strong>
              <span>The canvas should reflect the real automation, not only a static preview.</span>
            </div>
          </div>
          <div className="orion-workspace-studio-principle">
            <PlayCircle size={16} />
            <div>
              <strong>Test and activate</strong>
              <span>One clear path from draft to first successful run.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="orion-workspace-studio-panel">
        <div className="orion-workspace-studio-section-header">
          <div>
            <div className="orion-workspace-studio-section-title">Recent automations</div>
            <div className="orion-workspace-studio-section-copy">Select one to inspect it here. Use the library for full editing.</div>
          </div>
          <Link href="/solutions" className="btn-ghost orion-workspace-studio-link">
            <Boxes size={14} />
            Solutions
          </Link>
        </div>
        <div className="orion-workspace-studio-list">
          {loading ? (
            <div className="orion-workspace-studio-empty">Loading recent automations…</div>
          ) : workflows.length === 0 ? (
            <div className="orion-workspace-studio-empty">No automations yet. Start by asking the assistant to build one.</div>
          ) : (
            workflows.map((workflow) => (
              <button
                key={workflow.id}
                type="button"
                className={`orion-workspace-studio-list-item${workflow.id === selectedWorkflowId ? ' is-selected' : ''}`}
                onClick={() => setSelectedWorkflowId(workflow.id)}
              >
                <div>
                  <div className="orion-workspace-studio-list-title">{workflow.name || 'Untitled automation'}</div>
                  <div className="orion-workspace-studio-list-copy">{workflow.description || 'Open the canvas to refine this workflow.'}</div>
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
