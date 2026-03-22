'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { BrainCircuit, CheckCircle2, Code2, ExternalLink, FileUp, Globe, LayoutTemplate, LoaderCircle, Play, Plus, Rocket, Send, Shuffle, Sparkles, Zap } from 'lucide-react';
import TriggerNode from '@/components/nodes/TriggerNode';
import AgentNode from '@/components/nodes/AgentNode';
import ActionNode from '@/components/nodes/ActionNode';
import HttpRequestNode from '@/components/nodes/HttpRequestNode';
import ConditionNode from '@/components/nodes/ConditionNode';
import TransformNode from '@/components/nodes/TransformNode';
import CodeNode from '@/components/nodes/CodeNode';
import { createWorkflow, fetchWorkflows, getWorkflow, publishWorkflow, runWorkflow, updateWorkflow } from '@/lib/api';

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
};
type BuilderView = 'editor' | 'executions' | 'evaluations';
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

const CANVAS_NODE_X = 260;
const CANVAS_NODE_TOP = 64;
const CANVAS_NODE_GAP = 176;

const CANVAS_NODE_TYPES: NodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  action: ActionNode,
  http_request: HttpRequestNode,
  condition: ConditionNode,
  transform: TransformNode,
  code: CodeNode,
};

const CANVAS_NODE_LIBRARY: Array<{
  type: CanvasNodeType;
  label: string;
  accent: string;
  icon: ReactNode;
}> = [
  { type: 'trigger', label: 'Trigger', accent: '#f59e0b', icon: <Zap size={14} /> },
  { type: 'agent', label: 'Agent', accent: '#7c3aed', icon: <BrainCircuit size={14} /> },
  { type: 'action', label: 'Action', accent: '#10b981', icon: <Send size={14} /> },
  { type: 'http_request', label: 'HTTP Request', accent: '#6b7280', icon: <Globe size={14} /> },
  { type: 'condition', label: 'Condition', accent: '#f59e0b', icon: <Shuffle size={14} /> },
  { type: 'transform', label: 'Transform', accent: '#3b82f6', icon: <Shuffle size={14} /> },
  { type: 'code', label: 'Code', accent: '#1f2937', icon: <Code2 size={14} /> },
];

const STARTER_PROMPTS = [
  'Monitor my shop entrance and alert me on Telegram',
  'Summarize support emails every morning',
  'Follow up with new leads automatically',
  'Watch a webhook and update a spreadsheet',
];

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
        stroke: 'rgba(124, 58, 237, 0.75)',
        strokeWidth: 2,
        strokeLinecap: 'square' as const,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#7c3aed',
      },
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
    position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP + index * CANVAS_NODE_GAP },
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
      stroke: 'rgba(124, 58, 237, 0.75)',
      strokeWidth: 2,
      strokeLinecap: 'square' as const,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#7c3aed',
    },
  }));
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

function inspectorRows(node: CanvasWorkflowNode | null): Array<{ label: string; value: string }> {
  if (!node) return [];
  switch (node.type) {
    case 'trigger': {
      const data = node.data as TriggerCanvasData;
      return [
        { label: 'Type', value: data.triggerType },
        { label: 'Label', value: data.label },
      ];
    }
    case 'agent': {
      const data = node.data as AgentCanvasData;
      return [
        { label: 'Role', value: data.role },
        { label: 'Model', value: data.modelId },
        { label: 'Duty', value: data.duty },
      ];
    }
    case 'action': {
      const data = node.data as ActionCanvasData;
      return [
        { label: 'Action', value: data.actionType.replace(/_/g, ' ') },
        { label: 'Label', value: data.label },
      ];
    }
    case 'http_request': {
      const data = node.data as HttpRequestCanvasData;
      return [
        { label: 'Method', value: data.method },
        { label: 'URL', value: data.url },
      ];
    }
    case 'condition': {
      const data = node.data as ConditionCanvasData;
      return [{ label: 'Condition', value: data.condition }];
    }
    case 'transform': {
      const data = node.data as TransformCanvasData;
      return [{ label: 'Mapping', value: data.mapping }];
    }
    case 'code': {
      const data = node.data as CodeCanvasData;
      return [
        { label: 'Summary', value: data.summary },
        { label: 'Code', value: compactText(data.code, 120) },
      ];
    }
    default:
      return [];
  }
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

export default function BuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [workflowList, setWorkflowList] = useState<BuilderWorkflowRecord[]>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [nodeSearch, setNodeSearch] = useState<CanvasNodeSearchState | null>(null);
  const [currentView, setCurrentView] = useState<BuilderView>('editor');

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || nodes[0] || null,
    [nodes, selectedNodeId],
  );

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: 'smoothstep' as const,
        selected: selectedEdgeId === edge.id,
        animated: false,
        style: {
          stroke: 'rgba(124, 58, 237, 0.75)',
          strokeWidth: 2,
          strokeLinecap: 'square' as const,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#7c3aed',
        },
      })),
    [edges, selectedEdgeId],
  );

  const filteredNodeLibrary = useMemo(() => {
    const query = String(nodeSearch?.query || '').trim().toLowerCase();
    if (!query) return CANVAS_NODE_LIBRARY;
    return CANVAS_NODE_LIBRARY.filter((item) => item.label.toLowerCase().includes(query));
  }, [nodeSearch?.query]);

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
    let cancelled = false;
    const run = async () => {
      setLoadingWorkflows(true);
      try {
        const items = (await fetchWorkflows('default')) as BuilderWorkflowRecord[];
        if (!cancelled) setWorkflowList(Array.isArray(items) ? items.slice(0, 6) : []);
      } catch {
        if (!cancelled) setWorkflowList([]);
      } finally {
        if (!cancelled) setLoadingWorkflows(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const workflowId = searchParams.get('workflow');
    if (!workflowId) return;
    void loadWorkflowIntoBuilder(workflowId);
  }, [loadWorkflowIntoBuilder, searchParams]);

  const handleBuild = () => {
    const next = promptInput.trim();
    if (!next) return;
    const nextNodes = buildDraftNodes(next);
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

  const handleReset = () => {
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

  const addCanvasNode = (type: CanvasNodeType) => {
    const position = nodeSearch ? { x: nodeSearch.flowX, y: nodeSearch.flowY } : undefined;
    setNodes((current) => {
      const maxY = current.length > 0 ? Math.max(...current.map((node) => Number(node.position.y) || CANVAS_NODE_TOP)) : CANVAS_NODE_TOP - CANVAS_NODE_GAP;
      const nextNode: CanvasWorkflowNode = {
        id: makeNodeId(type),
        type,
        position: position || { x: CANVAS_NODE_X, y: maxY + CANVAS_NODE_GAP },
        data: defaultNodeData(type),
      };
      const nextNodes = [...current, nextNode];
      setSelectedNodeId(nextNode.id);
      setSelectedEdgeId(null);
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
    return typeof created?.id === 'string' ? created.id : null;
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

  const updateSelectedNodeData = (patch: Partial<CanvasNodeData>) => {
    if (!selectedNode) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: { ...node.data, ...patch } as CanvasNodeData,
            }
          : node,
      ),
    );
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleNodesChange = (changes: NodeChange<CanvasWorkflowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleEdgesChange = (changes: EdgeChange<CanvasWorkflowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    setSaveState('idle');
    setSaveMessage(null);
  };

  const handleConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `edge-${connection.source || 'source'}-${connection.target || 'target'}-${Date.now()}`,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: 'rgba(124, 58, 237, 0.75)',
            strokeWidth: 2,
            strokeLinecap: 'square' as const,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#7c3aed',
          },
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

  const handlePaneClick = (event: { clientX: number; clientY: number }) => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    const hostRect = canvasHostRef.current?.getBoundingClientRect();
    const instance = flowRef.current;
    if (!hostRect || !instance) return;
    const flowPoint = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodeSearch({
      screenX: Math.max(12, event.clientX - hostRect.left),
      screenY: Math.max(12, event.clientY - hostRect.top),
      flowX: flowPoint.x,
      flowY: flowPoint.y,
      query: '',
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
        setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
        setSelectedEdgeId(null);
        setSaveState('idle');
        setSaveMessage(null);
        return;
      }
      if (!selectedNodeId) return;
      event.preventDefault();
      setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
      setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
      setSelectedNodeId(null);
      setSaveState('idle');
      setSaveMessage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEdgeId, selectedNodeId]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <div className="orion-builder-shell">
        <section className="orion-builder-canvas-panel">
          <div className="orion-builder-toolbar">
            <div>
              <div className="orion-builder-eyebrow">Workflow builder</div>
              <h1 className="orion-builder-title">{draftGoal ? compactText(draftGoal, 72) : 'Build workflows visually'}</h1>
              <p className="orion-builder-copy">
                Start with AI or build from a blank canvas. Save the result into Automations when it is ready.
              </p>
            </div>
            <div className="orion-builder-toolbar-actions">
              <button type="button" className="btn-secondary" onClick={handleReset}>
                <Plus size={14} />
                New workflow
              </button>
              <button type="button" className="btn-ghost" onClick={() => router.push('/workflows')}>
                <LayoutTemplate size={14} />
                Template
              </button>
              <button type="button" className="btn-ghost" onClick={() => router.push('/workflows')}>
                <FileUp size={14} />
                Import
              </button>
              <button type="button" className="btn-secondary" onClick={handleTest} disabled={nodes.length === 0 || runState !== 'idle'}>
                {runState === 'testing' ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
                Test run
              </button>
              <button type="button" className="btn-ghost" onClick={handlePublish} disabled={nodes.length === 0 || runState !== 'idle'}>
                {runState === 'publishing' ? <LoaderCircle size={14} className="spin" /> : <Rocket size={14} />}
                Publish
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveDraft} disabled={nodes.length === 0 || saveState === 'saving' || runState !== 'idle'}>
                {saveState === 'saving' ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
                {saveState === 'saved' ? 'Saved' : savedWorkflowId ? 'Save changes' : 'Save draft'}
              </button>
            </div>
          </div>

          <div className="orion-builder-toolbar-meta">
            <span className="orion-builder-meta-chip">{nodes.length || 0} steps</span>
            <span className="orion-builder-meta-chip">{draftGoal ? 'Draft preview' : 'Blank canvas'}</span>
            {savedWorkflowId ? <span className="orion-builder-meta-chip">Saved draft</span> : null}
            {saveState === 'saved' && saveMessage ? (
              <span className="orion-builder-meta-chip is-success">
                <CheckCircle2 size={13} />
                {saveMessage}
              </span>
            ) : null}
            {saveState === 'error' && saveMessage ? <span className="orion-builder-meta-chip is-danger">{saveMessage}</span> : null}
          </div>

          <div className="orion-builder-view-tabs" role="tablist" aria-label="Builder views">
            <button type="button" className={`orion-builder-view-tab ${currentView === 'editor' ? 'is-active' : ''}`} onClick={() => setCurrentView('editor')}>
              Editor
            </button>
            <button type="button" className={`orion-builder-view-tab ${currentView === 'executions' ? 'is-active' : ''}`} onClick={() => setCurrentView('executions')}>
              Executions
            </button>
            <button type="button" className={`orion-builder-view-tab ${currentView === 'evaluations' ? 'is-active' : ''}`} onClick={() => setCurrentView('evaluations')}>
              Evaluations
            </button>
          </div>

          {currentView === 'editor' ? (
            <>
              <div className="orion-builder-palette">
                {CANVAS_NODE_LIBRARY.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="orion-builder-palette-btn"
                    onClick={() => addCanvasNode(item.type)}
                    style={{ ['--builder-accent' as string]: item.accent }}
                  >
                    <span className="orion-builder-palette-icon">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              <div ref={canvasHostRef} className="orion-builder-canvas-frame">
                {nodes.length === 0 ? (
                  <div className="orion-builder-empty">
                    <div className="orion-builder-empty-copy">
                      <h2>Start with AI or build from scratch</h2>
                      <p>Describe the workflow in the right drawer, or start from a blank graph and refine it visually.</p>
                    </div>
                    <div className="orion-builder-empty-actions">
                      <button type="button" className="orion-builder-empty-card" onClick={() => addCanvasNode('trigger')}>
                        <Plus size={22} />
                        <span>Add first step</span>
                        <small>Manual canvas</small>
                      </button>
                      <span className="orion-builder-empty-or">or</span>
                      <button type="button" className="orion-builder-empty-card is-accent" onClick={handleBuild} disabled={!promptInput.trim()}>
                        <Sparkles size={22} />
                        <span>Build with AI</span>
                        <small>Draft from prompt</small>
                      </button>
                    </div>
                  </div>
                ) : (
                  <ReactFlow
                    onInit={(instance) => {
                      flowRef.current = instance;
                    }}
                    nodes={nodes}
                    edges={renderedEdges}
                    nodeTypes={CANVAS_NODE_TYPES}
                    fitView
                    fitViewOptions={{ padding: 0.35 }}
                    nodesConnectable
                    nodesDraggable
                    elementsSelectable
                    onNodesChange={handleNodesChange}
                    onEdgesChange={handleEdgesChange}
                    onConnect={handleConnect}
                    onNodeClick={(_, node) => setSelectedNodeId(String(node.id))}
                    onPaneClick={(event) => {
                      handlePaneClick({ clientX: event.clientX, clientY: event.clientY });
                    }}
                    onPaneContextMenu={(event) => {
                      event.preventDefault();
                      handlePaneClick({ clientX: event.clientX, clientY: event.clientY });
                    }}
                    onEdgeClick={(_, edge) => {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(edge.id);
                      setNodeSearch(null);
                    }}
                    onEdgeContextMenu={(event, edge) => {
                      event.preventDefault();
                      setEdges((current) => current.filter((item) => item.id !== edge.id));
                      setSelectedEdgeId(null);
                      setNodeSearch(null);
                      setSaveState('idle');
                      setSaveMessage(null);
                    }}
                    panOnDrag
                    zoomOnScroll
                    zoomOnPinch
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background color="var(--canvas-dot-color)" gap={16} size={1.5} variant={BackgroundVariant.Dots} />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                )}
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
            </>
          ) : (
            <div className="orion-builder-empty is-panel">
              <div className="orion-builder-empty-copy">
                <h2>{currentView === 'executions' ? 'Execution timeline' : 'Evaluation results'}</h2>
                <p>
                  {currentView === 'executions'
                    ? 'Run a test or publish this workflow, then track live activity here.'
                    : 'Evaluation summaries can appear here after Builder supports step-level checks.'}
                </p>
              </div>
              <div className="orion-builder-empty-actions">
                <Link href="/executions" className="btn-secondary">Open Activity</Link>
                <button type="button" className="btn-primary" onClick={() => setCurrentView('editor')}>Back to Editor</button>
              </div>
            </div>
          )}
        </section>

        <aside className="orion-builder-drawer">
          <div className="orion-builder-drawer-header">
            <div className="orion-builder-drawer-eyebrow">Builder AI</div>
            <div className="orion-builder-drawer-title">Describe the workflow</div>
            <div className="orion-builder-drawer-copy">
              Tell Empyralis what to automate. This shapes the draft canvas without touching your main assistant chat.
            </div>
          </div>

          <div className="orion-builder-drawer-body">
            <textarea
              className="orion-builder-textarea"
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              placeholder="Monitor my shop entrance and alert me on Telegram"
              rows={6}
            />
            <button type="button" className="btn-primary orion-builder-submit" onClick={handleBuild} disabled={!promptInput.trim()}>
              Build workflow
            </button>
            <label className="orion-builder-field">
              <span className="orion-builder-field-label">Workflow name</span>
              <input className="orion-builder-field-input" value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} />
            </label>
            <label className="orion-builder-field">
              <span className="orion-builder-field-label">Description</span>
              <textarea
                className="orion-builder-field-input is-textarea"
                value={workflowDescription}
                onChange={(event) => setWorkflowDescription(event.target.value)}
                rows={3}
              />
            </label>
            <div className="orion-builder-starters">
              {STARTER_PROMPTS.map((item) => (
                <button key={item} type="button" className="btn-secondary orion-builder-starter" onClick={() => setPromptInput(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Continue existing</div>
              {loadingWorkflows ? (
                <div className="orion-builder-inspector-empty">Loading workflows…</div>
              ) : workflowList.length > 0 ? (
                <div className="orion-builder-existing-list">
                  {workflowList.map((workflow) => (
                    <button
                      key={workflow.id}
                      type="button"
                      className={`orion-builder-existing-item ${savedWorkflowId === workflow.id ? 'is-active' : ''}`}
                      onClick={() => void loadWorkflowIntoBuilder(workflow.id)}
                    >
                      <strong>{workflow.name || 'Untitled workflow'}</strong>
                      <span>{compactText(workflow.description || 'Open this workflow in Builder.', 80)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="orion-builder-inspector-empty">No saved workflows yet.</div>
              )}
            </div>

            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Selected step</div>
              {selectedNode ? (
                <>
                  <div className="orion-builder-inspector-head">
                    <span className="orion-builder-step-type">{nodeTypeLabel(selectedNode.type)}</span>
                    <span className="orion-builder-step-id">{selectedNode.id}</span>
                  </div>
                  <div className="orion-builder-selected-label">
                    {String((selectedNode.data as { label?: string }).label || nodeTypeLabel(selectedNode.type))}
                  </div>
                  <div className="orion-builder-inspector-grid">
                    {inspectorRows(selectedNode).map((row) => (
                      <div key={`${selectedNode.id}:${row.label}`} className="orion-builder-inspector-item">
                        <div className="orion-builder-inspector-label">{row.label}</div>
                        <div className="orion-builder-inspector-value">{row.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="orion-builder-inspector-form">
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Label</span>
                      <input
                        className="orion-builder-field-input"
                        value={String((selectedNode.data as { label?: string }).label || '')}
                        onChange={(event) => updateSelectedNodeData({ label: event.target.value })}
                      />
                    </label>
                    {selectedNode.type === 'trigger' ? (
                      <label className="orion-builder-field">
                        <span className="orion-builder-field-label">Trigger type</span>
                        <select
                          className="orion-builder-field-input"
                          value={(selectedNode.data as TriggerCanvasData).triggerType}
                          onChange={(event) => updateSelectedNodeData({ triggerType: event.target.value as TriggerKind })}
                        >
                          <option value="manual">Manual</option>
                          <option value="schedule">Schedule</option>
                          <option value="webhook">Webhook</option>
                        </select>
                      </label>
                    ) : null}
                    {selectedNode.type === 'agent' ? (
                      <>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">Model</span>
                          <input
                            className="orion-builder-field-input"
                            value={(selectedNode.data as AgentCanvasData).modelId}
                            onChange={(event) => updateSelectedNodeData({ modelId: event.target.value })}
                          />
                        </label>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">Duty</span>
                          <textarea
                            className="orion-builder-field-input is-textarea"
                            value={(selectedNode.data as AgentCanvasData).duty}
                            onChange={(event) => updateSelectedNodeData({ duty: event.target.value })}
                            rows={3}
                          />
                        </label>
                      </>
                    ) : null}
                    {selectedNode.type === 'action' ? (
                      <label className="orion-builder-field">
                        <span className="orion-builder-field-label">Action type</span>
                        <select
                          className="orion-builder-field-input"
                          value={(selectedNode.data as ActionCanvasData).actionType}
                          onChange={(event) => updateSelectedNodeData({ actionType: event.target.value as ActionKind })}
                        >
                          <option value="send_telegram">Telegram</option>
                          <option value="send_email">Email</option>
                          <option value="write_file">Write file</option>
                          <option value="send_whatsapp">WhatsApp</option>
                          <option value="send_wechat">WeChat</option>
                        </select>
                      </label>
                    ) : null}
                    {selectedNode.type === 'http_request' ? (
                      <>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">Method</span>
                          <select
                            className="orion-builder-field-input"
                            value={(selectedNode.data as HttpRequestCanvasData).method}
                            onChange={(event) => updateSelectedNodeData({ method: event.target.value })}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                          </select>
                        </label>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">URL</span>
                          <input
                            className="orion-builder-field-input"
                            value={(selectedNode.data as HttpRequestCanvasData).url}
                            onChange={(event) => updateSelectedNodeData({ url: event.target.value })}
                          />
                        </label>
                      </>
                    ) : null}
                    {selectedNode.type === 'condition' ? (
                      <label className="orion-builder-field">
                        <span className="orion-builder-field-label">Condition</span>
                        <textarea
                          className="orion-builder-field-input is-textarea"
                          value={(selectedNode.data as ConditionCanvasData).condition}
                          onChange={(event) => updateSelectedNodeData({ condition: event.target.value })}
                          rows={3}
                        />
                      </label>
                    ) : null}
                    {selectedNode.type === 'transform' ? (
                      <label className="orion-builder-field">
                        <span className="orion-builder-field-label">Mapping</span>
                        <textarea
                          className="orion-builder-field-input is-textarea"
                          value={(selectedNode.data as TransformCanvasData).mapping}
                          onChange={(event) => updateSelectedNodeData({ mapping: event.target.value })}
                          rows={3}
                        />
                      </label>
                    ) : null}
                    {selectedNode.type === 'code' ? (
                      <>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">Summary</span>
                          <input
                            className="orion-builder-field-input"
                            value={(selectedNode.data as CodeCanvasData).summary}
                            onChange={(event) => updateSelectedNodeData({ summary: event.target.value })}
                          />
                        </label>
                        <label className="orion-builder-field">
                          <span className="orion-builder-field-label">Code</span>
                          <textarea
                            className="orion-builder-field-input is-textarea code"
                            value={(selectedNode.data as CodeCanvasData).code}
                            onChange={(event) => updateSelectedNodeData({ code: event.target.value })}
                            rows={5}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="orion-builder-inspector-empty">
                  Build a workflow or select a step in the canvas to inspect it here.
                </div>
              )}
            </div>

            <div className="orion-builder-drawer-actions">
              {savedWorkflowId ? (
                <Link href={`/workflows/${savedWorkflowId}`} className="btn-primary">
                  <ExternalLink size={14} />
                  Open editor
                </Link>
              ) : null}
              {savedWorkflowId ? (
                <Link href="/executions" className="btn-ghost">
                  Activity
                </Link>
              ) : null}
              <Link href="/workflows" className="btn-ghost">
                Open Automations
              </Link>
              <Link href="/workspace" className="btn-ghost">
                Assistant
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
