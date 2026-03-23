'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import {
  Bot,
  BrainCircuit,
  Code2,
  Database,
  Globe,
  Hand,
  LoaderCircle,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Rocket,
  Send,
  Shuffle,
  Undo2,
  Zap,
} from 'lucide-react';
import TriggerNode from '@/components/nodes/TriggerNode';
import AgentNode from '@/components/nodes/AgentNode';
import ActionNode from '@/components/nodes/ActionNode';
import HttpRequestNode from '@/components/nodes/HttpRequestNode';
import ConditionNode from '@/components/nodes/ConditionNode';
import TransformNode from '@/components/nodes/TransformNode';
import CodeNode from '@/components/nodes/CodeNode';
import SmoothConnectionLine from '@/components/nodes/SmoothConnectionLine';
import SmoothActionEdge, { type SmoothActionEdgeData } from '@/components/nodes/SmoothActionEdge';
import { createWorkflow, getWorkflow, publishWorkflow, runWorkflow, updateWorkflow } from '@/lib/api';
import { API_BASE } from '@/lib/config';

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
type CanvasNodeSearchState = {
  screenX: number;
  screenY: number;
  flowX: number;
  flowY: number;
  query: string;
  insertEdgeId?: string;
};
type BuilderWorkflowRecord = {
  id: string;
  name?: string;
  description?: string;
  status?: string;
  definition?: {
    nodes?: unknown;
    edges?: unknown;
    meta?: Record<string, unknown>;
  };
};
type BuilderGeneratedNode = {
  id: string;
  type: CanvasNodeType;
  label?: string;
  subtitle?: string;
  x?: number;
  y?: number;
};
type BuilderGeneratedEdge = {
  source: string;
  target: string;
};
type BuilderGeneratedWorkflow = {
  nodes?: BuilderGeneratedNode[];
  edges?: BuilderGeneratedEdge[];
};

const CANVAS_NODE_X = 260;
const CANVAS_NODE_TOP = 64;
const CANVAS_NODE_GAP = 176;
const GRID_SIZE = 16;
const DEFAULT_NODE_SIZE = 96;
const NODE_HORIZONTAL_GAP = 232;
const CANVAS_EDGE_COLOR = 'rgba(128, 128, 120, 0.42)';

const CANVAS_NODE_TYPES: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  action: ActionNode,
  http_request: HttpRequestNode,
  condition: ConditionNode,
  transform: TransformNode,
  code: CodeNode,
};

const CANVAS_EDGE_TYPES = {
  smoothstep: SmoothActionEdge,
} satisfies EdgeTypes;

const CANVAS_NODE_LIBRARY: Array<{
  type: CanvasNodeType;
  label: string;
  accent: string;
  icon: ReactNode;
}> = [
  { type: 'trigger', label: 'Start', accent: '#d7f0ea', icon: <Play size={14} /> },
  { type: 'agent', label: 'Agent', accent: '#dce9ff', icon: <Bot size={14} /> },
  { type: 'action', label: 'Note', accent: '#ece8ff', icon: <Send size={14} /> },
  { type: 'http_request', label: 'Tool', accent: '#f7ebc6', icon: <Globe size={14} /> },
  { type: 'condition', label: 'If / else', accent: '#f7ebc6', icon: <Shuffle size={14} /> },
  { type: 'transform', label: 'Transform', accent: '#ece1ff', icon: <Shuffle size={14} /> },
  { type: 'code', label: 'Code', accent: '#ececec', icon: <Code2 size={14} /> },
];

const CANVAS_NODE_GROUPS: Array<{
  label: string;
  items: CanvasNodeType[];
}> = [
  { label: 'Core', items: ['agent', 'trigger', 'action'] },
  { label: 'Tools', items: ['http_request'] },
  { label: 'Logic', items: ['condition', 'code'] },
  { label: 'Data', items: ['transform'] },
];

type GraphSnapshot = {
  nodes: CanvasWorkflowNode[];
  edges: CanvasWorkflowEdge[];
};

function cloneGraph(nodes: CanvasWorkflowNode[], edges: CanvasWorkflowEdge[]): GraphSnapshot {
  return JSON.parse(JSON.stringify({ nodes, edges })) as GraphSnapshot;
}

function compactText(value: string, max = 80): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function extractUrl(value: string): string | null {
  const match = value.match(/https?:\/\/\S+/i);
  return match ? match[0] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function makeNodeId(type: CanvasNodeType): string {
  return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getCenteredStartPosition(host: HTMLDivElement | null): { x: number; y: number } {
  if (!host) return { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP };
  const width = host.clientWidth || 0;
  const height = host.clientHeight || 0;
  return {
    x: snapToGrid(Math.max(CANVAS_NODE_X, width / 2 - 180)),
    y: snapToGrid(Math.max(CANVAS_NODE_TOP, height / 2 - 24)),
  };
}

function layoutDraftNodes(nodes: CanvasWorkflowNode[], host: HTMLDivElement | null): CanvasWorkflowNode[] {
  if (nodes.length === 0) return nodes;
  const start = getCenteredStartPosition(host);
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: snapToGrid(start.x + index * NODE_HORIZONTAL_GAP),
      y: snapToGrid(start.y + (index % 2 === 1 ? -28 : 0)),
    },
  }));
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

function normalizeCanvasNodeData(type: CanvasNodeType, raw: Partial<CanvasNodeData>): CanvasNodeData {
  return { ...defaultNodeData(type), ...raw } as CanvasNodeData;
}

function parseCanvasNodes(rawNodes: unknown): CanvasWorkflowNode[] {
  if (!Array.isArray(rawNodes)) return [];
  const parsed: CanvasWorkflowNode[] = [];
  for (const item of rawNodes) {
    if (!isRecord(item)) continue;
    const type = String(item.type || '').trim().toLowerCase();
    if (!['trigger', 'agent', 'action', 'http_request', 'condition', 'transform', 'code'].includes(type)) continue;
    const position = isRecord(item.position) ? item.position : {};
    const x = Number(position.x);
    const y = Number(position.y);
    parsed.push({
      id: String(item.id || makeNodeId(type as CanvasNodeType)).trim() || makeNodeId(type as CanvasNodeType),
      type: type as CanvasNodeType,
      position: {
        x: Number.isFinite(x) ? x : CANVAS_NODE_X,
        y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + parsed.length * CANVAS_NODE_GAP,
      },
      data: normalizeCanvasNodeData(type as CanvasNodeType, (isRecord(item.data) ? item.data : {}) as Partial<CanvasNodeData>),
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
      animated: false,
      style: {
        stroke: CANVAS_EDGE_COLOR,
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
      },
      interactionWidth: 40,
    });
  }
  return parsed;
}

function draftNodeData(type: CanvasNodeType, goal: string, index: number): Partial<CanvasNodeData> {
  const text = goal.trim();
  const lowered = text.toLowerCase();
  if (type === 'trigger') {
    if (/(daily|every morning|every day|each day|weekly|every week|schedule)/.test(lowered)) {
      return { label: 'Scheduled start', triggerType: 'schedule' };
    }
    if (/(webhook|api|endpoint)/.test(lowered)) {
      return { label: 'Webhook start', triggerType: 'webhook' };
    }
    return { label: text ? 'User request' : 'Start here', triggerType: 'manual' };
  }
  if (type === 'condition') {
    return {
      label: 'Check conditions',
      condition: /if|when|unless/.test(lowered) ? compactText(text, 56) : 'Continue only when the required condition is true',
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
    if (/summari/.test(lowered)) return { label: 'Summarize content', mapping: compactText(text, 60) };
    return { label: 'Prepare output', mapping: text ? compactText(text, 60) : 'Map fields to the final output' };
  }
  if (type === 'agent') {
    return {
      label: /monitor|watch|alert/.test(lowered) ? 'Monitor with AI' : 'Plan with AI',
      prompt: text || 'Describe the work for this agent.',
      duty: text ? compactText(text, 88) : 'Complete the assigned task clearly and reliably.',
      description: text ? compactText(text, 64) : 'Autonomous reasoning',
    };
  }
  if (type === 'code') {
    return { label: 'Custom logic', summary: text ? compactText(text, 56) : 'Run custom logic', code: 'return input;' };
  }
  if (type === 'action') {
    if (/telegram/.test(lowered)) return { label: 'Send Telegram alert', actionType: 'send_telegram' };
    if (/email|inbox/.test(lowered)) return { label: 'Send email update', actionType: 'send_email' };
    if (/file|save|document/.test(lowered)) return { label: 'Save file', actionType: 'write_file' };
    return { label: index > 0 && text ? 'Deliver result' : 'Send Telegram', actionType: 'send_telegram' };
  }
  return defaultNodeData(type);
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
    position: { x: CANVAS_NODE_X + index * NODE_HORIZONTAL_GAP, y: CANVAS_NODE_TOP + (index % 2 === 1 ? -28 : 0) },
    data: normalizeCanvasNodeData(type, draftNodeData(type, goal, index)),
  }));
}

function buildDraftEdges(nodes: CanvasWorkflowNode[]): CanvasWorkflowEdge[] {
  return nodes.slice(0, -1).map((node, index) => ({
    id: `edge-${node.id}-${nodes[index + 1]!.id}`,
    source: node.id,
    target: nodes[index + 1]!.id,
    sourceHandle: 'bottom',
    targetHandle: 'top',
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: CANVAS_EDGE_COLOR,
      strokeWidth: 2,
      strokeLinecap: 'round' as const,
    },
    interactionWidth: 40,
  }));
}

function buildWorkflowName(goal: string): string {
  const clean = compactText(goal.replace(/[.?!]+$/g, ''), 56);
  if (!clean) return 'New workflow';
  return clean
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');
}

function buildWorkflowDescription(goal: string): string {
  return compactText(goal, 160) || 'Workflow created from Builder.';
}

function buildWorkflowDefinition(nodes: CanvasWorkflowNode[], edges: CanvasWorkflowEdge[], goal: string) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
    meta: {
      mode: 'visual_builder',
      origin: 'builder',
      draft_goal: goal,
    },
  };
}

function resolveBuilderGenerateUrl(): string {
  if (typeof window === 'undefined') {
    return '/api/builder/generate';
  }

  try {
    const configured = new URL(API_BASE, window.location.origin);
    if (configured.origin === window.location.origin) {
      return `${configured.origin}/api/builder/generate`;
    }
  } catch {
    // fall through to same-origin route
  }

  return '/api/builder/generate';
}

function mapGeneratedNodeData(node: BuilderGeneratedNode, prompt: string): CanvasNodeData {
  const type = node.type;
  const label = compactText(String(node.label || '').trim(), 48) || defaultNodeData(type).label;
  const subtitle = compactText(String(node.subtitle || '').trim(), 64);

  if (type === 'trigger') {
    return {
      label,
      triggerType: /schedule|daily|weekly/i.test(subtitle) ? 'schedule' : /webhook|api/i.test(subtitle) ? 'webhook' : 'manual',
    };
  }
  if (type === 'agent') {
    const base = defaultNodeData(type) as AgentCanvasData;
    return {
      ...base,
      label,
      prompt: prompt || base.prompt,
      description: subtitle || base.description,
      duty: subtitle || base.duty,
    };
  }
  if (type === 'action') {
    return {
      label,
      actionType: /email/i.test(subtitle) ? 'send_email' : /file|save|document/i.test(subtitle) ? 'write_file' : 'send_telegram',
    };
  }
  if (type === 'http_request') {
    return {
      label,
      method: /post/i.test(subtitle) ? 'POST' : 'GET',
      url: extractUrl(subtitle) || 'https://api.example.com',
    };
  }
  if (type === 'condition') {
    return {
      label,
      condition: subtitle || 'Continue only when the required condition is true',
    };
  }
  if (type === 'transform') {
    return {
      label,
      mapping: subtitle || 'Map fields to output payload',
    };
  }
  return {
    label,
    summary: subtitle || 'Run custom logic',
    code: 'return input;',
  };
}

function parseGeneratedWorkflow(workflow: BuilderGeneratedWorkflow, prompt: string): GraphSnapshot {
  const rawNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const nextNodes: CanvasWorkflowNode[] = rawNodes
    .filter((node): node is BuilderGeneratedNode => isRecord(node) && typeof node.id === 'string' && typeof node.type === 'string')
    .filter((node) => ['trigger', 'agent', 'action', 'http_request', 'condition', 'transform', 'code'].includes(node.type))
    .map((node, index) => ({
      id: node.id,
      type: node.type,
      position: {
        x: snapToGrid(Number.isFinite(node.x) ? Number(node.x) : CANVAS_NODE_X + index * NODE_HORIZONTAL_GAP),
        y: snapToGrid(Number.isFinite(node.y) ? Number(node.y) : CANVAS_NODE_TOP),
      },
      data: mapGeneratedNodeData(node, prompt),
    }));

  const nodeIds = new Set(nextNodes.map((node) => node.id));
  const rawEdges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const nextEdges: CanvasWorkflowEdge[] = rawEdges
    .filter((edge): edge is BuilderGeneratedEdge => isRecord(edge) && typeof edge.source === 'string' && typeof edge.target === 'string')
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge, index) => ({
      id: `edge-${edge.source}-${edge.target}-${index + 1}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: 'bottom',
      targetHandle: 'top',
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: CANVAS_EDGE_COLOR,
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
      },
      interactionWidth: 40,
    }));

  return { nodes: nextNodes, edges: nextEdges };
}

export type BuilderCanvasPageProps = {
  workflowId?: string | null;
};

export default function BuilderCanvasPage({ workflowId = null }: BuilderCanvasPageProps) {
  const router = useRouter();
  const flowRef = useRef<{ screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const nodeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CanvasWorkflowNode[]>([]);
  const [edges, setEdges] = useState<CanvasWorkflowEdge[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [runState, setRunState] = useState<'idle' | 'testing' | 'publishing'>('idle');
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodeSearch, setNodeSearch] = useState<CanvasNodeSearchState | null>(null);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('select');
  const [historyStack, setHistoryStack] = useState<GraphSnapshot[]>([]);
  const [futureStack, setFutureStack] = useState<GraphSnapshot[]>([]);
  const [builderGenerating, setBuilderGenerating] = useState(false);

  const pushHistory = useCallback(() => {
    setHistoryStack((current) => [...current.slice(-19), cloneGraph(nodes, edges)]);
    setFutureStack([]);
  }, [edges, nodes]);

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'smoothstep' as const,
        selected: selectedEdgeId === edge.id,
        animated: false,
        style: {
          stroke: CANVAS_EDGE_COLOR,
          strokeWidth: 2,
          strokeLinecap: 'round' as const,
        },
        interactionWidth: 40,
        data: {
          onAdd: (edgeId: string, point: { x: number; y: number }) => {
            const hostRect = canvasHostRef.current?.getBoundingClientRect();
            const currentEdge = edges.find((item) => item.id === edgeId);
            if (!hostRect || !currentEdge) return;
            const flowX = snapToGrid(((nodes.find((node) => node.id === currentEdge.source)?.position.x || CANVAS_NODE_X) + (nodes.find((node) => node.id === currentEdge.target)?.position.x || CANVAS_NODE_X)) / 2);
            const flowY = snapToGrid(((nodes.find((node) => node.id === currentEdge.source)?.position.y || CANVAS_NODE_TOP) + (nodes.find((node) => node.id === currentEdge.target)?.position.y || CANVAS_NODE_TOP)) / 2);
            setSelectedNodeId(null);
            setSelectedEdgeId(edgeId);
            setNodeSearch({
              screenX: Math.max(12, Math.min(point.x, hostRect.width - 240)),
              screenY: Math.max(12, Math.min(point.y, hostRect.height - 220)),
              flowX,
              flowY,
              query: '',
              insertEdgeId: edgeId,
            });
          },
          onDelete: (edgeId: string) => {
            pushHistory();
            setEdges((current) => current.filter((item) => item.id !== edgeId));
            setSelectedEdgeId(null);
            setNodeSearch(null);
            setSaveState('idle');
            setSaveMessage(null);
          },
        } satisfies SmoothActionEdgeData,
      })),
    [edges, nodes, pushHistory, selectedEdgeId],
  );

  const filteredNodeLibrary = useMemo(() => {
    const query = String(nodeSearch?.query || '').trim().toLowerCase();
    const library = nodeSearch?.insertEdgeId
      ? CANVAS_NODE_LIBRARY.filter((item) => item.type !== 'trigger')
      : CANVAS_NODE_LIBRARY;
    if (!query) return library;
    return library.filter((item) => item.label.toLowerCase().includes(query));
  }, [nodeSearch?.insertEdgeId, nodeSearch?.query]);

  const groupedNodeLibrary = useMemo(
    () =>
      CANVAS_NODE_GROUPS.map((group) => ({
        ...group,
        items: group.items
          .map((type) => filteredNodeLibrary.find((item) => item.type === type) || null)
          .filter((item): item is (typeof CANVAS_NODE_LIBRARY)[number] => item !== null),
      })).filter((group) => group.items.length > 0),
    [filteredNodeLibrary],
  );

  const loadWorkflowIntoBuilder = useCallback(async (id: string) => {
    const workflow = (await getWorkflow(id)) as BuilderWorkflowRecord;
    const nextNodes = parseCanvasNodes(workflow?.definition?.nodes);
    const safeNodes = nextNodes.length > 0 ? nextNodes : buildDraftNodes(workflow?.definition?.meta?.draft_goal ? String(workflow.definition.meta.draft_goal) : workflow?.description || workflow?.name || '');
    setNodes(safeNodes);
    setEdges(parseCanvasEdges(workflow?.definition?.edges, safeNodes));
    setSelectedNodeId(safeNodes[0]?.id || null);
    setSelectedEdgeId(null);
    setSavedWorkflowId(id);
    setWorkflowName(String(workflow?.name || ''));
    setWorkflowDescription(String(workflow?.description || ''));
    const nextGoal = String(workflow?.definition?.meta?.draft_goal || workflow?.description || workflow?.name || '').trim();
    setDraftGoal(nextGoal);
    setPromptInput(nextGoal);
    setSaveState('saved');
    setSaveMessage('Workflow loaded.');
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    void loadWorkflowIntoBuilder(workflowId);
  }, [loadWorkflowIntoBuilder, workflowId]);

  const handleBuild = () => {
    const next = promptInput.trim();
    if (!next) return;
    pushHistory();
    const nextNodes = layoutDraftNodes(buildDraftNodes(next), canvasHostRef.current);
    setDraftGoal(next);
    setNodes(nextNodes);
    setEdges(buildDraftEdges(nextNodes));
    setSelectedNodeId(nextNodes[0]?.id || null);
    setSavedWorkflowId(null);
    setSaveState('idle');
    setSaveMessage(null);
    setRunState('idle');
    setWorkflowName(buildWorkflowName(next));
    setWorkflowDescription(buildWorkflowDescription(next));
  };

  const handleBuilderGenerate = useCallback(async () => {
    const next = promptInput.trim();
    if (!next || builderGenerating) return;

    setBuilderGenerating(true);
    setSaveMessage(null);

    try {
      const response = await fetch(resolveBuilderGenerateUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: next,
          model: 'gpt-4o-mini',
        }),
      });

      const payload = (await response.json().catch(() => null)) as BuilderGeneratedWorkflow | { error?: string } | null;
      if (!response.ok || !payload || !('nodes' in payload)) {
        const payloadRecord = isRecord(payload) ? (payload as Record<string, unknown>) : null;
        const errorMessage =
          payloadRecord && typeof payloadRecord.error === 'string'
            ? payloadRecord.error
            : 'Unable to generate a workflow from that prompt.';
        throw new Error(
          errorMessage,
        );
      }

      const generated = parseGeneratedWorkflow(payload, next);
      if (generated.nodes.length === 0) {
        throw new Error('Builder AI returned an empty workflow.');
      }

      pushHistory();
      setDraftGoal(next);
      setNodes(generated.nodes);
      setEdges(generated.edges);
      setSelectedNodeId(generated.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      setSavedWorkflowId(null);
      setSaveState('idle');
      setSaveMessage(null);
      setRunState('idle');
      setWorkflowName(buildWorkflowName(next));
      setWorkflowDescription(buildWorkflowDescription(next));
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to generate a workflow from that prompt.');
    } finally {
      setBuilderGenerating(false);
    }
  }, [builderGenerating, promptInput, pushHistory]);

  const handleReset = () => {
    if (nodes.length || edges.length) pushHistory();
    setPromptInput('');
    setDraftGoal('');
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setSavedWorkflowId(null);
    setSaveState('idle');
    setSaveMessage(null);
    setRunState('idle');
    setWorkflowName('');
    setWorkflowDescription('');
  };

  const openNodeSearch = useCallback(
    (options?: { clientX?: number; clientY?: number; flowX?: number; flowY?: number; insertEdgeId?: string }) => {
      const hostRect = canvasHostRef.current?.getBoundingClientRect();
      if (!hostRect) return;
      const centered = getCenteredStartPosition(canvasHostRef.current);
      setNodeSearch({
        screenX:
          typeof options?.clientX === 'number'
            ? Math.max(12, Math.min(options.clientX - hostRect.left, hostRect.width - 240))
            : Math.max(12, hostRect.width / 2 - 120),
        screenY:
          typeof options?.clientY === 'number'
            ? Math.max(12, Math.min(options.clientY - hostRect.top, hostRect.height - 220))
            : Math.max(12, hostRect.height / 2 - 110),
        flowX: snapToGrid(options?.flowX ?? centered.x),
        flowY: snapToGrid(options?.flowY ?? centered.y),
        query: '',
        insertEdgeId: options?.insertEdgeId,
      });
    },
    [],
  );

  const addCanvasNode = (type: CanvasNodeType) => {
    pushHistory();
    const position =
      nodeSearch?.insertEdgeId
        ? { x: snapToGrid(nodeSearch.flowX), y: snapToGrid(nodeSearch.flowY) }
        : undefined;
    const insertEdgeId = nodeSearch?.insertEdgeId;
    const edgeToSplit = insertEdgeId ? edges.find((edge) => edge.id === insertEdgeId) || null : null;
    setNodes((current) => {
      if (type === 'trigger') {
        const existingTrigger = current.find((node) => node.type === 'trigger');
        if (existingTrigger) {
          setSelectedNodeId(existingTrigger.id);
          setSelectedEdgeId(null);
          return current;
        }
      }
      const defaultPosition = current.length === 0
        ? getCenteredStartPosition(canvasHostRef.current)
        : (() => {
            const lastNode = current[current.length - 1] || null;
            return {
              x: snapToGrid((Number(lastNode?.position.x) || CANVAS_NODE_X) + NODE_HORIZONTAL_GAP),
              y: snapToGrid(Number(lastNode?.position.y) || CANVAS_NODE_TOP),
            };
          })();
      const nextNode: CanvasWorkflowNode = {
        id: makeNodeId(type),
        type,
        position: position || defaultPosition,
        data: defaultNodeData(type),
      };
      const nextNodes = [...current, nextNode];
      setSelectedNodeId(nextNode.id);
      setSelectedEdgeId(null);
      if (edgeToSplit) {
        setEdges((currentEdges) => [
          ...currentEdges.filter((edge) => edge.id !== edgeToSplit.id),
          {
            id: `edge-${edgeToSplit.source}-${nextNode.id}-${Date.now()}`,
            source: edgeToSplit.source,
            target: nextNode.id,
            sourceHandle: edgeToSplit.sourceHandle,
            targetHandle: 'top',
          },
          {
            id: `edge-${nextNode.id}-${edgeToSplit.target}-${Date.now() + 1}`,
            source: nextNode.id,
            target: edgeToSplit.target,
            sourceHandle: 'bottom',
            targetHandle: edgeToSplit.targetHandle,
          },
        ]);
      }
      return nextNodes;
    });
    setNodeSearch(null);
    setSaveState('idle');
    setSaveMessage(null);
  };

  const persistCurrentWorkflow = async (): Promise<string | null> => {
    if (nodes.length === 0 || !draftGoal.trim()) return null;
    const definition = buildWorkflowDefinition(nodes, edges, draftGoal);
    if (savedWorkflowId) {
      await updateWorkflow(savedWorkflowId, definition);
      return savedWorkflowId;
    }
    const created = await createWorkflow(
      workflowName.trim() || buildWorkflowName(draftGoal),
      workflowDescription.trim() || buildWorkflowDescription(draftGoal),
      'default',
      definition,
    );
    const nextWorkflowId = typeof created?.id === 'string' ? created.id : null;
    if (nextWorkflowId) {
      router.replace(`/builder/${nextWorkflowId}`);
    }
    return nextWorkflowId;
  };

  const handleSaveDraft = async () => {
    if (nodes.length === 0 || !draftGoal.trim() || saveState === 'saving') return;
    setSaveState('saving');
    setSaveMessage(null);
    try {
      const workflowId = await persistCurrentWorkflow();
      setSavedWorkflowId(workflowId);
      setSaveState('saved');
      setSaveMessage(workflowId ? (savedWorkflowId ? 'Changes saved.' : 'Draft saved to Automations.') : 'Draft saved.');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save the workflow draft.');
    }
  };

  const handlePublish = async () => {
    if (runState !== 'idle') return;
    setRunState('publishing');
    setSaveMessage(null);
    try {
      const workflowId = await persistCurrentWorkflow();
      if (!workflowId) throw new Error('Save the workflow before publishing.');
      setSavedWorkflowId(workflowId);
      await publishWorkflow(workflowId);
      setSaveState('saved');
      setSaveMessage('Workflow published.');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to publish the workflow.');
    } finally {
      setRunState('idle');
    }
  };

  const handleTest = async () => {
    if (runState !== 'idle') return;
    setRunState('testing');
    setSaveMessage(null);
    try {
      const workflowId = await persistCurrentWorkflow();
      if (!workflowId) throw new Error('Save the workflow before testing.');
      setSavedWorkflowId(workflowId);
      await runWorkflow(workflowId);
      setSaveState('saved');
      setSaveMessage('Test run started. Open Activity for live progress.');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to start a test run.');
    } finally {
      setRunState('idle');
    }
  };

  const handleNodesChange = (changes: NodeChange<CanvasWorkflowNode>[]) => {
    if (changes.length > 0) pushHistory();
    setNodes((current) =>
      applyNodeChanges(
        changes.map((change) => {
          if (
            change.type === 'position' &&
            change.position &&
            Number.isFinite(change.position.x) &&
            Number.isFinite(change.position.y)
          ) {
            return {
              ...change,
              position: {
                x: snapToGrid(change.position.x),
                y: snapToGrid(change.position.y),
              },
            };
          }
          return change;
        }),
        current,
      ),
    );
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleEdgesChange = (changes: EdgeChange<CanvasWorkflowEdge>[]) => {
    if (changes.length > 0) pushHistory();
    setEdges((current) => applyEdgeChanges(changes, current));
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleConnect = (connection: Connection) => {
    pushHistory();
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `edge-${connection.source || 'source'}-${connection.target || 'target'}-${Date.now()}`,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: CANVAS_EDGE_COLOR,
            strokeWidth: 2,
            strokeLinecap: 'round' as const,
          },
          interactionWidth: 40,
        },
        current,
      ),
    );
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodeSearch(null);
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    if (!previous) return;
    setFutureStack((current) => [cloneGraph(nodes, edges), ...current]);
    setHistoryStack((current) => current.slice(0, -1));
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodeSearch(null);
  }, [edges, historyStack, nodes]);

  const handleRedo = useCallback(() => {
    if (futureStack.length === 0) return;
    const next = futureStack[0];
    if (!next) return;
    setHistoryStack((current) => [...current, cloneGraph(nodes, edges)]);
    setFutureStack((current) => current.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodeSearch(null);
  }, [edges, futureStack, nodes]);

  const handlePaneClick = (event: { detail?: number; clientX: number; clientY: number }) => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setNodeSearch(null);
    if ((event.detail || 1) < 2) return;
    const instance = flowRef.current;
    const flowPoint = instance?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    openNodeSearch({
      clientX: event.clientX,
      clientY: event.clientY,
      flowX: flowPoint?.x,
      flowY: flowPoint?.y,
    });
  };

  useEffect(() => {
    if (!nodeSearch) return;
    const timeout = window.setTimeout(() => nodeSearchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [nodeSearch]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return;
      const tagName = (document.activeElement?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
      if (selectedEdgeId) {
        event.preventDefault();
        pushHistory();
        setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        setSaveState('idle');
        setSaveMessage(null);
        return;
      }
      if (!selectedNodeId) return;
      event.preventDefault();
      pushHistory();
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      setSaveState('idle');
      setSaveMessage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pushHistory, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    document.body.classList.add('orion-builder-focus');
    return () => {
      document.body.classList.remove('orion-builder-focus');
    };
  }, []);

  return (
    <div className="orion-page-shell orion-animate-in is-builder-page">
      <div className="orion-builder-shell">
        <div className="orion-builder-toolbar is-agent-builder">
          <div className="orion-builder-toolbar-title-row">
            <button type="button" className="orion-builder-toolbar-back" onClick={() => router.push('/builder')} aria-label="Back to builder">
              ‹
            </button>
            <div className="orion-builder-toolbar-title">
              {workflowName.trim() || (draftGoal ? compactText(draftGoal, 56) : 'New agent')}
            </div>
            <span className="orion-builder-draft-badge">Draft</span>
          </div>
          <div className="orion-builder-toolbar-actions">
            <button type="button" className="btn-ghost" onClick={handleTest} disabled={nodes.length === 0 || runState !== 'idle'}>
              {runState === 'testing' ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
              Evaluate
            </button>
            <button type="button" className="btn-primary" onClick={handlePublish} disabled={nodes.length === 0 || runState !== 'idle'}>
              {runState === 'publishing' ? <LoaderCircle size={14} className="spin" /> : <Rocket size={14} />}
              Publish
            </button>
          </div>
        </div>

        <div className="orion-builder-main is-agent-builder">
          <section className="orion-builder-canvas-panel is-agent-builder">
            <div ref={canvasHostRef} className="orion-builder-canvas-frame">
              <aside className="orion-builder-library is-floating">
                {groupedNodeLibrary.map((group) => (
                  <div key={group.label} className="orion-builder-library-group">
                    <div className="orion-builder-library-title">{group.label}</div>
                    <div className="orion-builder-library-list">
                      {group.items.map((item) => (
                        <button key={item.type} type="button" className="orion-builder-library-item" onClick={() => addCanvasNode(item.type)}>
                          <span className="orion-builder-library-icon" style={{ ['--builder-accent' as string]: item.accent }}>
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </aside>

              {saveMessage ? <div className={`orion-builder-canvas-message ${saveState === 'error' ? 'is-error' : ''}`}>{saveMessage}</div> : null}

              {nodes.length === 0 ? (
                <div className="orion-builder-empty-state">
                  <div className="orion-builder-empty-title">Create a workflow</div>
                  <div className="orion-builder-empty-copy">
                    Build an agent workflow with custom logic and tools.
                  </div>
                  <button
                    type="button"
                    className="orion-builder-create-button"
                    onClick={(event) => openNodeSearch({ clientX: event.clientX, clientY: event.clientY })}
                  >
                    <Plus size={18} />
                    Create
                  </button>
                </div>
              ) : (
                <>
                  <ReactFlow
                    style={{ width: '100%', height: '100%' }}
                    onInit={(instance) => {
                      flowRef.current = instance;
                    }}
                    nodes={nodes}
                    edges={renderedEdges}
                    nodeTypes={CANVAS_NODE_TYPES}
                    edgeTypes={CANVAS_EDGE_TYPES}
                    fitView
                    fitViewOptions={{ padding: 0.35 }}
                    nodesConnectable
                    nodesDraggable
                    elementsSelectable={interactionMode === 'select'}
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={handleConnect}
                    onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
                    onPaneClick={(event) => {
                      handlePaneClick({ detail: event.detail, clientX: event.clientX, clientY: event.clientY });
                    }}
                    onEdgeClick={(_, edge) => {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(edge.id);
                      setNodeSearch(null);
                    }}
                    onEdgeContextMenu={(event, edge) => {
                      event.preventDefault();
                      pushHistory();
                      setEdges((current) => current.filter((item) => item.id !== edge.id));
                      setSelectedEdgeId(null);
                      setNodeSearch(null);
                      setSaveState('idle');
                      setSaveMessage(null);
                    }}
                    panOnDrag={interactionMode === 'pan'}
                    zoomOnScroll
                    zoomOnPinch
                    connectionLineComponent={SmoothConnectionLine}
                    proOptions={{ hideAttribution: true }}
                  />
                </>
              )}

              {nodes.length === 0 ? (
                <form
                  className="orion-builder-ai-prompt"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleBuilderGenerate();
                  }}
                >
                  <input
                    className="orion-builder-ai-prompt-input"
                    value={promptInput}
                    onChange={(event) => setPromptInput(event.target.value)}
                    placeholder="Describe what you want to automate..."
                  />
                  <button
                    type="submit"
                    className="orion-builder-ai-prompt-send"
                    disabled={!promptInput.trim() || builderGenerating}
                    aria-label="Generate workflow"
                  >
                    {builderGenerating ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}
                  </button>
                </form>
              ) : null}

              <div className="orion-builder-bottom-toolbar">
                <button
                  type="button"
                  className={`orion-builder-bottom-tool ${interactionMode === 'pan' ? 'is-active' : ''}`}
                  onClick={() => setInteractionMode('pan')}
                  aria-label="Hand tool"
                >
                  <Hand size={16} />
                </button>
                <button
                  type="button"
                  className={`orion-builder-bottom-tool ${interactionMode === 'select' ? 'is-active' : ''}`}
                  onClick={() => setInteractionMode('select')}
                  aria-label="Pointer tool"
                >
                  <MousePointer2 size={16} />
                </button>
                <button type="button" className="orion-builder-bottom-tool" onClick={handleUndo} disabled={historyStack.length === 0} aria-label="Undo">
                  <Undo2 size={16} />
                </button>
                <button type="button" className="orion-builder-bottom-tool" onClick={handleRedo} disabled={futureStack.length === 0} aria-label="Redo">
                  <Redo2 size={16} />
                </button>
              </div>

              {nodeSearch ? (
                <div
                  className="orion-builder-node-search"
                  style={{ left: nodeSearch.screenX, top: nodeSearch.screenY }}
                >
                  <input
                    ref={nodeSearchInputRef}
                    className="orion-builder-node-search-input"
                    value={nodeSearch.query}
                    onChange={(event) => setNodeSearch((current) => (current ? { ...current, query: event.target.value } : current))}
                    placeholder="Search nodes..."
                  />
                  <div className="orion-builder-node-search-list">
                    {filteredNodeLibrary.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        className="orion-builder-node-search-item"
                        onClick={() => addCanvasNode(item.type)}
                      >
                        <span className="orion-builder-palette-icon" style={{ ['--builder-accent' as string]: item.accent }}>
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
