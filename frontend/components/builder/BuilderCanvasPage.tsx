'use client';

import Link from 'next/link';
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
  ArrowUp,
  Bot,
  BrainCircuit,
  ChevronLeft,
  Code2,
  Globe,
  Hand,
  LoaderCircle,
  MousePointer2,
  Play,
  Plus,
  Redo2,
  Rocket,
  Send,
  Settings2,
  Shuffle,
  Undo2,
  X,
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
import { createWorkflow, fetchRuntimeMachines, getWorkflow, publishWorkflow, updateWorkflow } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';
import {
  type ExecutionTarget,
  describeExecutionTarget,
  formatExecutionTargetLabel,
  hasOnlineLocalRuntime,
  normalizeExecutionTarget,
} from '@/lib/executionTargets';
import { OPEN_LIVE_RUN_LABEL, RUN_STARTED_STATUS_COPY } from '@/lib/runStartCopy';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';

type CanvasNodeType = 'trigger' | 'agent' | 'action' | 'http_request' | 'condition' | 'transform' | 'code';
type CanonicalNodeType = 'trigger' | 'agent' | 'tool' | 'decision' | 'human' | 'data' | 'subflow';
type TriggerKind = 'schedule' | 'webhook' | 'manual' | 'connector_event' | 'workflow' | 'file_watch';
type ActionKind =
  | 'send_wechat'
  | 'send_telegram'
  | 'send_whatsapp'
  | 'send_email'
  | 'write_file'
  | 'connector_action'
  | 'browser'
  | 'file'
  | 'shell'
  | 'document'
  | 'spreadsheet'
  | 'approval'
  | 'review'
  | 'wait_for_reply'
  | 'call_workflow';

type CanvasCompatibilityMeta = {
  __canonicalType?: CanonicalNodeType;
  __canonicalVariant?: string;
  __canonicalConfig?: Record<string, unknown>;
  __canonicalResources?: Record<string, unknown>;
  __canonicalPolicy?: Record<string, unknown>;
};

type TriggerCanvasData = CanvasCompatibilityMeta & { label: string; triggerType: TriggerKind };
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
} & CanvasCompatibilityMeta;
type ActionCanvasData = CanvasCompatibilityMeta & { label: string; actionType: ActionKind };
type HttpRequestCanvasData = CanvasCompatibilityMeta & { label: string; method: string; url: string };
type ConditionCanvasData = CanvasCompatibilityMeta & { label: string; condition: string };
type TransformCanvasData = CanvasCompatibilityMeta & { label: string; mapping: string };
type CodeCanvasData = CanvasCompatibilityMeta & { label: string; summary: string; code: string };
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
    version?: string;
    nodes?: unknown;
    edges?: unknown;
    defaults?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    policy?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
};
type BuilderGeneratedNode = {
  id: string;
  type: string;
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
type BuilderRuntimeProfileRow = {
  id: string;
  provider: string;
  label: string;
  model?: string | null;
  priority?: number;
  enabled: boolean;
  health?: string | null;
  created_at?: string;
};

const CANVAS_NODE_X = 260;
const CANVAS_NODE_TOP = 64;
const CANVAS_NODE_GAP = 176;
const GRID_SIZE = 16;
const DEFAULT_NODE_SIZE = 96;
const NODE_HORIZONTAL_GAP = 232;
const CANVAS_EDGE_COLOR = 'rgba(128, 128, 120, 0.42)';
const DEFAULT_WORKSPACE_ID = 'default';

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

type CanvasLibraryItem = {
  id: string;
  type: CanvasNodeType;
  label: string;
  accent: string;
  icon: ReactNode;
  canonicalType?: CanonicalNodeType;
  canonicalVariant?: string;
  defaultData?: Partial<CanvasNodeData>;
};

const CANVAS_NODE_LIBRARY: CanvasLibraryItem[] = [
  {
    id: 'trigger',
    type: 'trigger',
    label: 'Trigger',
    accent: '#d7f0ea',
    icon: <Play size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'manual',
    defaultData: { label: 'Manual trigger', triggerType: 'manual' },
  },
  {
    id: 'agent',
    type: 'agent',
    label: 'Agent',
    accent: '#dce9ff',
    icon: <Bot size={14} />,
    canonicalType: 'agent',
    defaultData: {
      label: 'Agent',
      role: 'Agent',
      description: 'Core reasoning step',
      duty: 'Core reasoning step',
      status: 'ready',
    },
  },
  {
    id: 'tool',
    type: 'action',
    label: 'Tool',
    accent: '#ece8ff',
    icon: <Send size={14} />,
    canonicalType: 'tool',
    canonicalVariant: 'connector_action',
    defaultData: { label: 'Tool action', actionType: 'connector_action' },
  },
  {
    id: 'http',
    type: 'http_request',
    label: 'HTTP',
    accent: '#f7ebc6',
    icon: <Globe size={14} />,
    canonicalType: 'tool',
    canonicalVariant: 'http',
    defaultData: { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' },
  },
  {
    id: 'human',
    type: 'action',
    label: 'Human',
    accent: '#fde5cf',
    icon: <Hand size={14} />,
    canonicalType: 'human',
    canonicalVariant: 'approval',
    defaultData: { label: 'Approval', actionType: 'approval' },
  },
  {
    id: 'decision',
    type: 'condition',
    label: 'Decision',
    accent: '#f7ebc6',
    icon: <Shuffle size={14} />,
    canonicalType: 'decision',
    canonicalVariant: 'if_else',
    defaultData: { label: 'Decision', condition: 'Continue only when the required condition is true' },
  },
  {
    id: 'data',
    type: 'transform',
    label: 'Data',
    accent: '#ece1ff',
    icon: <Shuffle size={14} />,
    canonicalType: 'data',
    canonicalVariant: 'transform',
    defaultData: { label: 'Transform', mapping: 'Map fields to output payload' },
  },
  {
    id: 'subflow',
    type: 'action',
    label: 'Subflow',
    accent: '#e7ecff',
    icon: <Rocket size={14} />,
    canonicalType: 'subflow',
    canonicalVariant: 'call_workflow',
    defaultData: { label: 'Call workflow', actionType: 'call_workflow' },
  },
  {
    id: 'code_tool',
    type: 'code',
    label: 'Code tool',
    accent: '#ececec',
    icon: <Code2 size={14} />,
    canonicalType: 'tool',
    canonicalVariant: 'code',
    defaultData: { label: 'Code tool', summary: 'Run custom logic', code: 'return input;' },
  },
];

const CANVAS_NODE_GROUPS: Array<{
  label: string;
  items: string[];
}> = [
  { label: 'Triggers', items: ['trigger'] },
  { label: 'Agents', items: ['agent'] },
  { label: 'Tools', items: ['tool', 'http', 'code_tool'] },
  { label: 'Human', items: ['human'] },
  { label: 'Logic', items: ['decision'] },
  { label: 'Data', items: ['data'] },
  { label: 'Subflows', items: ['subflow'] },
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

function isCanvasNodeType(value: string): value is CanvasNodeType {
  return ['trigger', 'agent', 'action', 'http_request', 'condition', 'transform', 'code'].includes(value);
}

function isCanonicalNodeType(value: string): value is CanonicalNodeType {
  return ['trigger', 'agent', 'tool', 'decision', 'human', 'data', 'subflow'].includes(value);
}

function canonicalTypeForCanvasType(type: CanvasNodeType): CanonicalNodeType {
  if (type === 'http_request' || type === 'code' || type === 'action') return 'tool';
  if (type === 'condition') return 'decision';
  if (type === 'transform') return 'data';
  return type;
}

function normalizeTriggerKind(value: unknown): TriggerKind {
  const token = String(value || '').trim().toLowerCase();
  return token === 'schedule'
    || token === 'webhook'
    || token === 'connector_event'
    || token === 'workflow'
    || token === 'file_watch'
    ? token
    : 'manual';
}

function normalizeActionKind(value: unknown): ActionKind {
  const token = String(value || '').trim().toLowerCase();
  return token === 'send_wechat'
    || token === 'send_telegram'
    || token === 'send_whatsapp'
    || token === 'send_email'
    || token === 'write_file'
    || token === 'connector_action'
    || token === 'browser'
    || token === 'file'
    || token === 'shell'
    || token === 'document'
    || token === 'spreadsheet'
    || token === 'approval'
    || token === 'review'
    || token === 'wait_for_reply'
    || token === 'call_workflow'
    ? token
    : 'write_file';
}

function deriveCanvasType(rawNode: Record<string, unknown>): CanvasNodeType | null {
  const rawType = String(rawNode.type || '').trim().toLowerCase();
  if (isCanvasNodeType(rawType)) return rawType;
  if (!isCanonicalNodeType(rawType)) return null;
  const variant = String(rawNode.variant || '').trim().toLowerCase();
  if (rawType === 'tool') {
    if (variant === 'http') return 'http_request';
    if (variant === 'code') return 'code';
    return 'action';
  }
  if (rawType === 'decision') return 'condition';
  if (rawType === 'data') return 'transform';
  if (rawType === 'human' || rawType === 'subflow') return 'action';
  return rawType;
}

function buildCanvasCompatibilityMeta(
  rawNode: Record<string, unknown>,
  canonicalType: CanonicalNodeType,
  canonicalVariant: string | undefined,
  canonicalConfig: Record<string, unknown>,
): CanvasCompatibilityMeta {
  return {
    __canonicalType: canonicalType,
    __canonicalVariant: canonicalVariant,
    __canonicalConfig: canonicalConfig,
    __canonicalResources: isRecord(rawNode.resources) ? rawNode.resources : {},
    __canonicalPolicy: isRecord(rawNode.policy) ? rawNode.policy : {},
  };
}

function canonicalToolVariantToActionKind(variant: string): ActionKind {
  if (variant === 'browser') return 'browser';
  if (variant === 'file') return 'file';
  if (variant === 'shell') return 'shell';
  if (variant === 'document') return 'document';
  if (variant === 'spreadsheet') return 'spreadsheet';
  return 'connector_action';
}

function deriveCanvasDataFromCanonicalNode(
  rawNode: Record<string, unknown>,
  canvasType: CanvasNodeType,
): Partial<CanvasNodeData> {
  const canonicalType = String(rawNode.type || '').trim().toLowerCase() as CanonicalNodeType;
  const canonicalVariant = String(rawNode.variant || '').trim().toLowerCase() || undefined;
  const config = isRecord(rawNode.config) ? rawNode.config : {};
  const rawData = isRecord(rawNode.data) ? rawNode.data : {};
  const compatibility = buildCanvasCompatibilityMeta(rawNode, canonicalType, canonicalVariant, config);
  const identity = isRecord(config.identity) ? config.identity : {};
  const label = compactText(
    String(
      rawData.label
        ?? rawNode.label
        ?? (canonicalType === 'agent' ? identity.name ?? identity.role : '')
        ?? (canonicalType === 'human' ? config.title : '')
        ?? (canonicalType === 'tool' ? config.summary ?? config.action_id : '')
        ?? (canonicalType === 'subflow' ? 'Call workflow' : ''),
    ),
    80,
  );
  const subtitle = compactText(String(rawData.description ?? rawData.summary ?? rawNode.subtitle ?? ''), 140);

  if (canvasType === 'trigger') {
    return {
      ...compatibility,
      label: label || 'Trigger',
      triggerType: normalizeTriggerKind(canonicalVariant),
    };
  }

  if (canvasType === 'agent') {
    const runtime = isRecord(config.runtime) ? config.runtime : {};
    const tools = isRecord(config.tools) ? config.tools : {};
    return {
      ...compatibility,
      label: label || compactText(String(identity.name ?? identity.role ?? 'Agent'), 80) || 'Agent',
      modelId: String(runtime.model || '').trim(),
      prompt: String(identity.goal || '').trim(),
      tools: Array.isArray(tools.explicit_required)
        ? tools.explicit_required.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      provider: String(runtime.provider || '').trim(),
      role: String(identity.role || label || 'Agent').trim() || 'Agent',
      duty: compactText(String(identity.success_condition ?? identity.goal ?? subtitle), 120) || 'Autonomous reasoning',
      status: 'ready',
      description: compactText(String(identity.goal ?? subtitle), 120) || 'Autonomous reasoning',
    };
  }

  if (canvasType === 'http_request') {
    return {
      ...compatibility,
      label: label || 'HTTP Request',
      method: String(config.method || 'GET').trim().toUpperCase() || 'GET',
      url: String(config.url || '').trim() || 'https://api.example.com',
    };
  }

  if (canvasType === 'code') {
    return {
      ...compatibility,
      label: label || 'Code',
      summary: compactText(String(config.summary ?? subtitle ?? 'Run custom logic'), 120) || 'Run custom logic',
      code: String(config.code || 'return input;'),
    };
  }

  if (canvasType === 'condition') {
    return {
      ...compatibility,
      label: label || 'Decision',
      condition:
        compactText(
          String(
            config.expression
              ?? config.field
              ?? subtitle
              ?? (Array.isArray(config.routes) ? config.routes.join(', ') : ''),
          ),
          160,
        ) || 'Continue only when the required condition is true',
    };
  }

  if (canvasType === 'transform') {
    return {
      ...compatibility,
      label: label || 'Transform',
      mapping: compactText(String(config.mapping ?? config.template ?? subtitle), 160) || 'Map fields to output payload',
    };
  }

  let actionType: ActionKind = 'connector_action';
  if (canonicalType === 'tool') {
    actionType = canonicalToolVariantToActionKind(canonicalVariant || '');
  } else if (canonicalType === 'human') {
    actionType = normalizeActionKind(canonicalVariant || 'approval');
  } else if (canonicalType === 'subflow') {
    actionType = 'call_workflow';
  }

  return {
    ...compatibility,
    label: label || 'Action',
    actionType,
  };
}

function deriveCanvasMeta(data: CanvasNodeData): CanvasCompatibilityMeta {
  const raw = isRecord(data) ? data as Record<string, unknown> : {};
  return {
    __canonicalType: isCanonicalNodeType(String(raw.__canonicalType || '')) ? String(raw.__canonicalType || '') as CanonicalNodeType : undefined,
    __canonicalVariant: String(raw.__canonicalVariant || '').trim() || undefined,
    __canonicalConfig: isRecord(raw.__canonicalConfig) ? raw.__canonicalConfig : undefined,
    __canonicalResources: isRecord(raw.__canonicalResources) ? raw.__canonicalResources : undefined,
    __canonicalPolicy: isRecord(raw.__canonicalPolicy) ? raw.__canonicalPolicy : undefined,
  };
}

function canonicalVariantForCanvasNode(type: CanvasNodeType, data: CanvasNodeData): string | undefined {
  if (type === 'trigger') return normalizeTriggerKind((data as TriggerCanvasData).triggerType);
  if (type === 'http_request') return 'http';
  if (type === 'code') return 'code';
  if (type === 'condition') return 'if_else';
  if (type === 'transform') return 'transform';
  if (type === 'action') {
    const actionType = normalizeActionKind((data as ActionCanvasData).actionType);
    if (actionType === 'approval' || actionType === 'review' || actionType === 'wait_for_reply' || actionType === 'call_workflow') {
      return actionType;
    }
    if (actionType === 'browser' || actionType === 'file' || actionType === 'shell' || actionType === 'document' || actionType === 'spreadsheet') {
      return actionType;
    }
    return 'connector_action';
  }
  return undefined;
}

function canonicalConfigFromCanvasNode(
  type: CanvasNodeType,
  data: CanvasNodeData,
  seed: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next = isRecord(seed) ? structuredClone(seed) : {};
  if (type === 'trigger') {
    const triggerData = data as TriggerCanvasData;
    const kind = normalizeTriggerKind(triggerData.triggerType);
    next.test_only = kind === 'manual';
    if (!isRecord(next.schedule)) next.schedule = {};
    if (!isRecord(next.webhook)) next.webhook = {};
    if (!isRecord(next.file_watch)) next.file_watch = {};
    return next;
  }
  if (type === 'agent') {
    const agentData = data as AgentCanvasData;
    const identity = isRecord(next.identity) ? { ...next.identity } : {};
    const runtime = isRecord(next.runtime) ? { ...next.runtime } : {};
    const tools = isRecord(next.tools) ? { ...next.tools } : {};
    identity.name = agentData.label;
    identity.role = agentData.role || agentData.label;
    identity.goal = agentData.prompt || identity.goal || '';
    identity.success_condition = agentData.duty || identity.success_condition || '';
    runtime.model = agentData.modelId || runtime.model || null;
    runtime.provider = agentData.provider || runtime.provider || null;
    tools.explicit_required = Array.isArray(agentData.tools) ? agentData.tools : [];
    next.identity = identity;
    next.runtime = runtime;
    next.tools = tools;
    return next;
  }
  if (type === 'http_request') {
    const httpData = data as HttpRequestCanvasData;
    next.method = httpData.method;
    next.url = httpData.url;
    next.action_id = httpData.label;
    return next;
  }
  if (type === 'condition') {
    const conditionData = data as ConditionCanvasData;
    next.expression = conditionData.condition;
    return next;
  }
  if (type === 'transform') {
    const transformData = data as TransformCanvasData;
    next.mapping = transformData.mapping;
    return next;
  }
  if (type === 'code') {
    const codeData = data as CodeCanvasData;
    next.summary = codeData.summary;
    next.code = codeData.code;
    return next;
  }
  const actionData = data as ActionCanvasData;
  if (actionData.actionType === 'approval' || actionData.actionType === 'review' || actionData.actionType === 'wait_for_reply') {
    next.title = actionData.label;
    next.decision_options = Array.isArray(next.decision_options) && next.decision_options.length > 0
      ? next.decision_options
      : ['approve', 'reject'];
    return next;
  }
  if (actionData.actionType === 'call_workflow') {
    next.mode = next.mode || 'sync';
    return next;
  }
  if (typeof next.action_id !== 'string' || !String(next.action_id || '').trim()) {
    next.action_id = actionData.label;
  }
  if (typeof next.summary !== 'string' || !String(next.summary || '').trim()) {
    next.summary = actionData.label;
  }
  return next;
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
  if (type === 'trigger') return { label: 'Manual trigger', triggerType: 'manual' };
  if (type === 'http_request') return { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' };
  if (type === 'condition') return { label: 'Decision', condition: 'Continue only when the required condition is true' };
  if (type === 'transform') return { label: 'Transform', mapping: 'Map fields to output payload' };
  if (type === 'code') return { label: 'Code tool', summary: 'Run custom logic', code: 'return input;' };
  if (type === 'action') return { label: 'Tool action', actionType: 'connector_action' };
  return {
    label: 'Agent',
    modelId: 'gpt-4.1',
    prompt: 'Describe the task for this agent.',
    tools: [],
    provider: 'openai',
    role: 'Agent',
    duty: 'Core reasoning step',
    status: 'ready',
    description: 'Core reasoning step',
  };
}

function normalizeCanvasNodeData(type: CanvasNodeType, raw: Partial<CanvasNodeData>): CanvasNodeData {
  const base = defaultNodeData(type) as Record<string, unknown>;
  const next = { ...base, ...(raw as Record<string, unknown>) } as Record<string, unknown>;
  if (type === 'trigger') next.triggerType = normalizeTriggerKind(next.triggerType);
  if (type === 'action') next.actionType = normalizeActionKind(next.actionType);
  return next as CanvasNodeData;
}

function parseCanvasNodes(rawNodes: unknown): CanvasWorkflowNode[] {
  if (!Array.isArray(rawNodes)) return [];
  const parsed: CanvasWorkflowNode[] = [];
  for (const item of rawNodes) {
    if (!isRecord(item)) continue;
    const type = deriveCanvasType(item);
    if (!type) continue;
    const position = isRecord(item.position) ? item.position : {};
    const x = Number(position.x);
    const y = Number(position.y);
    const normalizedData = isCanvasNodeType(String(item.type || '').trim().toLowerCase())
      ? normalizeCanvasNodeData(type, (isRecord(item.data) ? item.data : {}) as Partial<CanvasNodeData>)
      : normalizeCanvasNodeData(type, deriveCanvasDataFromCanonicalNode(item, type));
    parsed.push({
      id: String(item.id || makeNodeId(type)).trim() || makeNodeId(type),
      type,
      position: {
        x: Number.isFinite(x) ? x : CANVAS_NODE_X,
        y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + parsed.length * CANVAS_NODE_GAP,
      },
      data: normalizedData,
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

function buildStarterGraph(): GraphSnapshot {
  const triggerItem = CANVAS_NODE_LIBRARY.find((item) => item.id === 'trigger') || CANVAS_NODE_LIBRARY[0]!;
  const agentItem = CANVAS_NODE_LIBRARY.find((item) => item.id === 'agent') || CANVAS_NODE_LIBRARY[1]!;
  const nodes: CanvasWorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 560, y: 300 },
      data: buildNodeDataFromLibraryItem(triggerItem),
    },
    {
      id: 'agent-2',
      type: 'agent',
      position: { x: 920, y: 300 },
      data: normalizeCanvasNodeData('agent', {
        ...buildNodeDataFromLibraryItem(agentItem),
        label: 'My agent',
        modelId: '',
      }),
    },
  ];
  return { nodes, edges: buildDraftEdges(nodes) };
}

function buildNodeDataFromLibraryItem(item: CanvasLibraryItem): CanvasNodeData {
  return normalizeCanvasNodeData(item.type, {
    ...defaultNodeData(item.type),
    ...(item.defaultData || {}),
    ...(item.canonicalType
      ? {
          __canonicalType: item.canonicalType,
          __canonicalVariant: item.canonicalVariant,
          __canonicalConfig: {},
          __canonicalResources: {},
          __canonicalPolicy: {},
        }
      : {}),
  });
}

function formatTriggerKindLabel(kind: TriggerKind): string {
  if (kind === 'schedule') return 'Scheduled start';
  if (kind === 'webhook') return 'Webhook start';
  if (kind === 'connector_event') return 'Connector event';
  if (kind === 'workflow') return 'Workflow trigger';
  if (kind === 'file_watch') return 'File watcher';
  return 'Manual start';
}

function formatActionKindLabel(kind: ActionKind): string {
  if (kind === 'send_wechat') return 'WeChat delivery';
  if (kind === 'send_whatsapp') return 'WhatsApp delivery';
  if (kind === 'send_email') return 'Email delivery';
  if (kind === 'write_file') return 'File output';
  if (kind === 'connector_action') return 'Tool action';
  if (kind === 'browser') return 'Browser action';
  if (kind === 'file') return 'File action';
  if (kind === 'shell') return 'Shell action';
  if (kind === 'document') return 'Document action';
  if (kind === 'spreadsheet') return 'Spreadsheet action';
  if (kind === 'approval') return 'Human approval';
  if (kind === 'review') return 'Human review';
  if (kind === 'wait_for_reply') return 'Wait for reply';
  if (kind === 'call_workflow') return 'Call workflow';
  return 'Telegram delivery';
}

function describeDraftRailNode(node: CanvasWorkflowNode): string {
  if (node.type === 'trigger') return formatTriggerKindLabel((node.data as TriggerCanvasData).triggerType);
  if (node.type === 'condition') return compactText((node.data as ConditionCanvasData).condition || '', 54) || 'Conditional branch';
  if (node.type === 'transform') return compactText((node.data as TransformCanvasData).mapping || '', 54) || 'Prepare structured output';
  if (node.type === 'http_request') {
    const data = node.data as HttpRequestCanvasData;
    return compactText(`${data.method || 'GET'} ${data.url || ''}`, 54) || 'External request';
  }
  if (node.type === 'agent') {
    const data = node.data as AgentCanvasData;
    return compactText(data.duty || data.description || '', 54) || 'AI reasoning step';
  }
  if (node.type === 'code') return compactText((node.data as CodeCanvasData).summary || '', 54) || 'Custom logic';
  if (node.type === 'action') return formatActionKindLabel((node.data as ActionCanvasData).actionType);
  return 'Workflow step';
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

function serializeCanvasNode(node: CanvasWorkflowNode): Record<string, unknown> {
  const canvasType = (isCanvasNodeType(String(node.type || '').trim()) ? String(node.type || '').trim() : 'action') as CanvasNodeType;
  const compatibility = deriveCanvasMeta(node.data);
  const canonicalType: CanonicalNodeType = compatibility.__canonicalType ?? canonicalTypeForCanvasType(canvasType);
  const canonicalVariant = compatibility.__canonicalVariant || canonicalVariantForCanvasNode(canvasType, node.data);
  const config = canonicalConfigFromCanvasNode(canvasType, node.data, compatibility.__canonicalConfig);
  const strippedData = Object.fromEntries(
    Object.entries(node.data as Record<string, unknown>).filter(([key]) => !key.startsWith('__canonical')),
  );
  return {
    id: node.id,
    type: canonicalType,
    variant: canonicalVariant,
    config,
    resources: compatibility.__canonicalResources || {},
    policy: compatibility.__canonicalPolicy || {},
    position: node.position,
    data: strippedData,
  };
}

function buildWorkflowDefinition(
  nodes: CanvasWorkflowNode[],
  edges: CanvasWorkflowEdge[],
  goal: string,
  executionTarget: ExecutionTarget,
  runtimeProfileId?: string,
  runtimeProfile?: BuilderRuntimeProfileRow | null,
  baseDefinition?: BuilderWorkflowRecord['definition'] | null,
) {
  const baseDefaults = isRecord(baseDefinition?.defaults) ? baseDefinition.defaults : {};
  const baseRuntimeDefaults = isRecord(baseDefaults.runtime) ? baseDefaults.runtime : {};
  return {
    version: 'empyralist.workflow.v2',
    nodes: nodes.map((node) => serializeCanvasNode(node)),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
    defaults: {
      ...baseDefaults,
      runtime: {
        ...baseRuntimeDefaults,
        execution_target: executionTarget,
        provider_profile_id: String(runtimeProfileId || '').trim() || undefined,
        provider: String(runtimeProfile?.provider || '').trim() || undefined,
        model: String(runtimeProfile?.model || '').trim() || undefined,
      },
    },
    resources: isRecord(baseDefinition?.resources) ? baseDefinition.resources : {},
    policy: isRecord(baseDefinition?.policy) ? baseDefinition.policy : {},
    meta: {
      ...(isRecord(baseDefinition?.meta) ? baseDefinition.meta : {}),
      mode: 'visual_builder',
      origin: 'builder',
      draft_goal: goal,
      execution_target: executionTarget,
      runtime_profile_id: String(runtimeProfileId || '').trim() || undefined,
      runtime_profile_label: String(runtimeProfile?.label || '').trim() || undefined,
      runtime_profile_provider: String(runtimeProfile?.provider || '').trim() || undefined,
      runtime_profile_model: String(runtimeProfile?.model || '').trim() || undefined,
    },
  };
}

function formatProviderLabel(provider: string): string {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'anthropic') return 'Anthropic';
  if (normalized === 'gemini') return 'Gemini';
  if (normalized === 'deepseek') return 'DeepSeek';
  if (normalized === 'xai') return 'xAI';
  if (normalized === 'vertex') return 'Vertex';
  if (normalized === 'ollama') return 'Ollama';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Provider';
}

function buildBuilderAgentSummary(nodes: CanvasWorkflowNode[]): string {
  const items = nodes
    .filter((node) => node.type === 'agent')
    .map((node) => {
      const data = node.data as AgentCanvasData;
      const role = String(data.role || data.label || 'Agent').trim();
      const provider = String(data.provider || 'openai').trim();
      const model = String(data.modelId || 'gpt-4o-mini').trim();
      return `${role} (${provider}:${model})`;
    });
  return items.length > 0 ? items.join(', ') : 'No explicit agent nodes configured.';
}

function resolveBuilderRuntimeModel(
  selectedRuntimeProfile: BuilderRuntimeProfileRow | null,
  nodes: CanvasWorkflowNode[],
): string {
  const selectedModel = String(selectedRuntimeProfile?.model || '').trim();
  if (selectedModel) return selectedModel;
  const firstAgentNode = nodes.find((node) => {
    if (node.type !== 'agent' || !isRecord(node.data)) return false;
    return typeof (node.data as Partial<AgentCanvasData>).modelId === 'string';
  });
  const nodeModel = firstAgentNode && isRecord(firstAgentNode.data)
    ? String((firstAgentNode.data as Partial<AgentCanvasData>).modelId || '').trim()
    : '';
  return nodeModel || 'gpt-4o-mini';
}

function sortBuilderProfiles(items: BuilderRuntimeProfileRow[]): BuilderRuntimeProfileRow[] {
  return [...items].sort((left, right) => {
    const providerCompare = String(left.provider || '').localeCompare(String(right.provider || ''));
    if (providerCompare !== 0) return providerCompare;
    const priorityCompare = Number(left.priority ?? 100) - Number(right.priority ?? 100);
    if (priorityCompare !== 0) return priorityCompare;
    const createdCompare = String(left.created_at || '').localeCompare(String(right.created_at || ''));
    if (createdCompare !== 0) return createdCompare;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
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
  const type: CanvasNodeType = isCanvasNodeType(node.type) ? node.type : 'action';
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
  void prompt;
  const nextNodes = parseCanvasNodes(workflow.nodes);
  const nextEdges = parseCanvasEdges(workflow.edges, nextNodes);
  return { nodes: nextNodes, edges: nextEdges };
}

export type BuilderCanvasPageProps = {
  workflowId?: string | null;
};

export default function BuilderCanvasPage({ workflowId = null }: BuilderCanvasPageProps) {
  const starterGraph = useMemo(() => (workflowId ? { nodes: [], edges: [] } : buildStarterGraph()), [workflowId]);
  const router = useRouter();
  const flowRef = useRef<{ screenToFlowPosition: (point: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const settingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const nodeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const aiAssistantInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [assistantDockOpen, setAssistantDockOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [stagedPrompt, setStagedPrompt] = useState('');
  const [aiAssistantPrompt, setAiAssistantPrompt] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CanvasWorkflowNode[]>(starterGraph.nodes);
  const [edges, setEdges] = useState<CanvasWorkflowEdge[]>(starterGraph.edges);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [runState, setRunState] = useState<'idle' | 'testing' | 'publishing'>('idle');
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [messageRunId, setMessageRunId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [loadedDefinition, setLoadedDefinition] = useState<BuilderWorkflowRecord['definition'] | null>(null);
  const [nodeSearch, setNodeSearch] = useState<CanvasNodeSearchState | null>(null);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('select');
  const [historyStack, setHistoryStack] = useState<GraphSnapshot[]>([]);
  const [futureStack, setFutureStack] = useState<GraphSnapshot[]>([]);
  const [runtimeProfiles, setRuntimeProfiles] = useState<BuilderRuntimeProfileRow[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>('auto');
  const [hasLocalRuntime, setHasLocalRuntime] = useState(false);
  const [doctorChecking, setDoctorChecking] = useState(false);
  const [doctorDecision, setDoctorDecision] = useState<DoctorRunGateDecision | null>(null);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const pushHistory = useCallback(() => {
    setHistoryStack((current) => [...current.slice(-19), cloneGraph(nodes, edges)]);
    setFutureStack([]);
  }, [edges, nodes]);

  const groupedRuntimeProfiles = useMemo(() => {
    const groups = new Map<string, BuilderRuntimeProfileRow[]>();
    for (const profile of sortBuilderProfiles(runtimeProfiles)) {
      const provider = String(profile.provider || '').trim().toLowerCase() || 'openai';
      const current = groups.get(provider) || [];
      current.push(profile);
      groups.set(provider, current);
    }
    return Array.from(groups.entries());
  }, [runtimeProfiles]);

  const selectedRuntimeProfile = useMemo(
    () => runtimeProfiles.find((profile) => profile.id === selectedProfileId) || null,
    [runtimeProfiles, selectedProfileId],
  );
  const currentRuntimeProvider = String(selectedRuntimeProfile?.provider || 'openai').trim() || 'openai';

  const loadDoctorDecision = useCallback(async () => {
    setDoctorChecking(true);
    try {
      const nextDecision = await fetchDoctorRunGate({
        executionTarget,
        runtimeProvider: currentRuntimeProvider,
        usesManagedOpenAi: false,
      });
      setDoctorDecision(nextDecision);
      return nextDecision;
    } finally {
      setDoctorChecking(false);
    }
  }, [currentRuntimeProvider, executionTarget]);

  const stagedDraftGoal = stagedPrompt.trim();

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
          .map((itemId) => filteredNodeLibrary.find((item) => item.id === itemId) || null)
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
    setLoadedDefinition(workflow?.definition || null);
    setSelectedNodeId(safeNodes[0]?.id || null);
    setSelectedEdgeId(null);
    setSavedWorkflowId(id);
    setWorkflowName(String(workflow?.name || ''));
    setWorkflowDescription(String(workflow?.description || ''));
    const nextGoal = String(workflow?.definition?.meta?.draft_goal || workflow?.description || workflow?.name || '').trim();
    setDraftGoal(nextGoal);
    setStagedPrompt(nextGoal);
    setPromptInput(nextGoal);
    setSelectedProfileId(String(workflow?.definition?.meta?.runtime_profile_id || '').trim());
    setExecutionTarget(normalizeExecutionTarget(workflow?.definition?.meta?.execution_target));
    setSaveState('saved');
    setSaveMessage('Workflow loaded.');
  }, []);

  useEffect(() => {
    if (!workflowId) return;
    void loadWorkflowIntoBuilder(workflowId);
  }, [loadWorkflowIntoBuilder, workflowId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeProfiles() {
      try {
        const [response, machinesPayload] = await Promise.all([
          controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(DEFAULT_WORKSPACE_ID)}`),
          fetchRuntimeMachines().catch(() => ({ items: [] })),
        ]);
        const payload = (await response.json().catch(() => null)) as { items?: unknown[] } | null;
        if (!response.ok) throw new Error('Failed to load runtime profiles.');
        const rows = Array.isArray(payload?.items)
          ? payload.items.reduce<BuilderRuntimeProfileRow[]>((acc, item) => {
              if (!isRecord(item)) return acc;
              const id = String(item.id || '').trim();
              const provider = String(item.provider || '').trim();
              const label = String(item.label || '').trim();
              const enabled = Boolean(item.enabled);
              if (!id || !provider || !label || !enabled) return acc;
              acc.push({
                id,
                provider,
                label,
                model: typeof item.model === 'string' ? item.model : null,
                priority: typeof item.priority === 'number' ? item.priority : undefined,
                enabled,
                health: typeof item.health === 'string' ? item.health : null,
                created_at: typeof item.created_at === 'string' ? item.created_at : undefined,
              });
              return acc;
            }, [])
          : [];
        if (cancelled) return;
        const sorted = sortBuilderProfiles(rows);
        setRuntimeProfiles(sorted);
        setHasLocalRuntime(hasOnlineLocalRuntime(machinesPayload));
        setSelectedProfileId((current) => {
          if (current && sorted.some((item) => item.id === current)) return current;
          const defaultReadyProfile = sorted.find((item) => String(item.health || '').trim().toLowerCase() === 'healthy');
          return defaultReadyProfile?.id || '';
        });
      } catch {
        if (!cancelled) {
          setRuntimeProfiles([]);
          setHasLocalRuntime(false);
        }
      }
    }

    void loadRuntimeProfiles();
    return () => {
      cancelled = true;
    };
  }, [controlPlaneFetch]);

  const handleBuild = (goal?: string) => {
    const next = String(goal || stagedPrompt || promptInput).trim();
    if (!next) return;
    pushHistory();
    const nextNodes = layoutDraftNodes(buildDraftNodes(next), canvasHostRef.current);
    setStagedPrompt(next);
    setDraftGoal(next);
    setNodes(nextNodes);
    setEdges(buildDraftEdges(nextNodes));
    setLoadedDefinition(null);
    setSelectedNodeId(nextNodes[0]?.id || null);
    setSavedWorkflowId(null);
    setSaveState('idle');
    setSaveMessage(null);
    setRunState('idle');
    setWorkflowName(buildWorkflowName(next));
    setWorkflowDescription(buildWorkflowDescription(next));
  };

  const handleStageDraft = useCallback(() => {
    const next = promptInput.trim();
    if (!next) return;

    setStagedPrompt(next);
    setDraftGoal(next);
    setSaveMessage(null);
    setSaveState('idle');
    setRunState('idle');
    setWorkflowName(buildWorkflowName(next));
    setWorkflowDescription(buildWorkflowDescription(next));
    setPromptInput('');
  }, [promptInput]);

  const handleReset = () => {
    if (nodes.length || edges.length) pushHistory();
    setPromptInput('');
    setStagedPrompt('');
    setDraftGoal('');
    setNodes([]);
    setEdges([]);
    setLoadedDefinition(null);
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

  const addCanvasNode = (item: CanvasLibraryItem) => {
    pushHistory();
    const position =
      nodeSearch?.insertEdgeId
        ? { x: snapToGrid(nodeSearch.flowX), y: snapToGrid(nodeSearch.flowY) }
        : undefined;
    const insertEdgeId = nodeSearch?.insertEdgeId;
    const edgeToSplit = insertEdgeId ? edges.find((edge) => edge.id === insertEdgeId) || null : null;
    setNodes((current) => {
      if (item.type === 'trigger') {
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
        id: makeNodeId(item.type),
        type: item.type,
        position: position || defaultPosition,
        data: buildNodeDataFromLibraryItem(item),
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
    const definition = buildWorkflowDefinition(
      nodes,
      edges,
      draftGoal,
      executionTarget,
      selectedProfileId,
      selectedRuntimeProfile,
      loadedDefinition,
    );
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
      setSaveMessage(workflowId ? (savedWorkflowId ? 'Changes saved.' : 'Draft saved to Workflows.') : 'Draft saved.');
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
    setMessageRunId(null);
    try {
      const workflowId = await persistCurrentWorkflow();
      if (!workflowId) throw new Error('Save the workflow before testing.');
      if (executionTarget === 'local_companion' && !hasLocalRuntime) {
        throw new Error('No local machine is online. Choose Automatic or Cloud runtime, or connect a local runtime first.');
      }
      const doctorGate = await loadDoctorDecision();
      if (doctorGate?.blocking) {
        throw new Error(doctorGate.detail);
      }
      const runtimeProvider = String(selectedRuntimeProfile?.provider || 'openai').trim() || 'openai';
      const runtimeModel = resolveBuilderRuntimeModel(selectedRuntimeProfile, nodes);
      const primaryAgentNode = nodes.find((node) => node.type === 'agent') || null;
      const primaryAgentMeta = primaryAgentNode ? deriveCanvasMeta(primaryAgentNode.data) : {};
      const primaryAgentConfig = isRecord(primaryAgentMeta.__canonicalConfig) ? primaryAgentMeta.__canonicalConfig : {};
      const primaryAgentPermissions = isRecord(primaryAgentConfig.permissions) ? primaryAgentConfig.permissions : {};
      const trustMode = String(primaryAgentPermissions.action_policy || 'guarded').trim() || 'guarded';
      const connectorPermissions = Array.isArray(primaryAgentPermissions.connector_permissions)
        ? primaryAgentPermissions.connector_permissions.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const browserPermissions = isRecord(primaryAgentPermissions.browser_permissions)
        ? primaryAgentPermissions.browser_permissions
        : undefined;
      const fileMountGrants = Array.isArray(primaryAgentPermissions.file_mount_grants)
        ? primaryAgentPermissions.file_mount_grants.filter((item) => isRecord(item))
        : [];
      const businessPlan = [
        `Workflow: ${workflowName.trim() || buildWorkflowName(draftGoal)}`,
        `Goal: ${draftGoal.trim() || 'No goal provided.'}`,
        `Execution route: ${formatExecutionTargetLabel(executionTarget)}`,
        `Runtime Provider: ${runtimeProvider}`,
        `Runtime Model: ${runtimeModel}`,
        selectedRuntimeProfile ? `Runtime Profile: ${selectedRuntimeProfile.label}` : 'Runtime Profile: Automatic routing',
        `Nodes: ${nodes.length}`,
        `Agent Setup: ${buildBuilderAgentSummary(nodes)}`,
      ].join('\n');
      const response = await controlPlaneFetch('/api/runs/start', {
        method: 'POST',
        body: JSON.stringify({
          engine: 'orion',
          workflow_id: workflowId,
          workspace_id: DEFAULT_WORKSPACE_ID,
          user_goal: draftGoal.trim() || workflowDescription.trim() || workflowName.trim() || 'Run builder workflow',
          business_plan: businessPlan,
          agent_role: 'builder',
          provider: runtimeProvider,
          model: runtimeModel,
          metadata: {
            workspace_id: DEFAULT_WORKSPACE_ID,
            origin: 'builder',
            trust_mode: trustMode,
            connector_permissions: connectorPermissions,
            browser_permissions: browserPermissions,
            file_mount_grants: fileMountGrants,
            execution_target: executionTarget,
            execution_target_requested: executionTarget,
            runtime_profile_id: selectedProfileId || undefined,
            profile_id: selectedProfileId || undefined,
            provider: runtimeProvider,
            model: runtimeModel,
          },
          agents: nodes
            .filter((node) => node.type === 'agent')
            .map((node) => {
              const data = node.data as AgentCanvasData;
              return {
                role: String(data.role || data.label || 'Agent').trim(),
                modelId: String(data.modelId || runtimeModel).trim(),
                provider: String(data.provider || runtimeProvider).trim(),
                duty: String(data.duty || data.description || '').trim(),
              };
            }),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        run_id?: string;
        detail?: string;
        error?: string;
        active_profile_id?: string;
        active_profile_label?: string;
        active_profile_provider?: string;
        active_profile_model?: string;
        execution_target_selected?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          (payload && typeof payload.detail === 'string' && payload.detail) ||
            (payload && typeof payload.error === 'string' && payload.error) ||
            'Unable to start a test run.',
        );
      }
      if (payload?.run_id) {
        upsertSeededRuntimeRun({
          run_id: payload.run_id,
          status: 'running',
          workflow_name: workflowName.trim() || buildWorkflowName(draftGoal),
          user_goal: draftGoal.trim() || workflowDescription.trim() || workflowName.trim() || 'Run builder workflow',
          created_at: new Date().toISOString(),
          agent_role: 'builder',
          triggered_by: 'Direct',
        active_profile_id: payload.active_profile_id || selectedProfileId || null,
        active_profile_label: payload.active_profile_label || selectedRuntimeProfile?.label || null,
        active_profile_provider: payload.active_profile_provider || runtimeProvider,
        active_profile_model: payload.active_profile_model || runtimeModel,
        execution_target_selected:
          (typeof payload.execution_target_selected === 'string' && payload.execution_target_selected)
            ? payload.execution_target_selected
            : executionTarget,
      });
      }
      setMessageRunId(payload?.run_id || null);
      setSavedWorkflowId(workflowId);
      setSaveState('saved');
      setSaveMessage(RUN_STARTED_STATUS_COPY);
    } catch (error) {
      setMessageRunId(null);
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to start a test run.');
    } finally {
      setRunState('idle');
    }
  };

  useEffect(() => {
    void loadDoctorDecision();
  }, [loadDoctorDecision]);

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

  useEffect(() => {
    if (!assistantDockOpen) return;
    const timeout = window.setTimeout(() => aiAssistantInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [assistantDockOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof globalThis.Node && settingsPopoverRef.current?.contains(target)) return;
      setSettingsOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [settingsOpen]);

  const handleAssistantApply = useCallback((value?: string) => {
    const next = String(value || aiAssistantPrompt).trim();
    if (!next) return;
    handleBuild(next);
    setAiAssistantPrompt('');
  }, [aiAssistantPrompt, handleBuild]);

  const builderNoticeAction = executionTarget === 'local_companion' && !hasLocalRuntime
    ? { href: '/machines', label: 'Open Machines' }
    : doctorDecision && doctorDecision.status !== 'pass'
      ? { href: '/health', label: 'Open Health' }
      : null;
  const showBuilderNotice = Boolean(builderNoticeAction);

  return (
    <div className="orion-page-shell orion-animate-in is-builder-page">
      <div className="orion-builder-shell">
        <div className="orion-builder-toolbar is-agent-builder">
          <div className="orion-builder-toolbar-title-row">
            <button type="button" className="orion-builder-toolbar-back" onClick={() => router.push('/builder')} aria-label="Back to builder">
              <ChevronLeft size={18} strokeWidth={2.2} />
            </button>
            <div className="orion-builder-toolbar-title">
              {workflowName.trim() || (draftGoal ? compactText(draftGoal, 56) : 'New agent')}
            </div>
            <span className="orion-builder-draft-badge">Draft</span>
          </div>
          <div className="orion-builder-toolbar-actions">
            <div ref={settingsPopoverRef} className={`orion-builder-toolbar-popover${settingsOpen ? ' is-open' : ''}`.trim()}>
              <button
                type="button"
                className="orion-builder-toolbar-icon-button"
                onClick={() => setSettingsOpen((current) => !current)}
                aria-label="Builder settings"
                aria-expanded={settingsOpen}
              >
                <Settings2 size={15} />
              </button>
              {settingsOpen ? (
                <div className="orion-builder-toolbar-popover-panel">
                  <label className="orion-builder-runtime-picker is-route-picker">
                    <span className="orion-builder-runtime-picker-label">Route</span>
                    <select
                      className="orion-builder-runtime-select is-route-select"
                      value={executionTarget}
                      onChange={(event) => setExecutionTarget(normalizeExecutionTarget(event.target.value))}
                    >
                      <option value="auto">Automatic</option>
                      <option value="local_companion" disabled={!hasLocalRuntime}>Local machine</option>
                      <option value="cloud">Cloud runtime</option>
                    </select>
                  </label>
                  <label className="orion-builder-runtime-picker">
                    <span className="orion-builder-runtime-picker-label">Runtime</span>
                    <select
                      className="orion-builder-runtime-select"
                      value={selectedProfileId}
                      onChange={(event) => setSelectedProfileId(event.target.value)}
                    >
                      <option value="">Automatic</option>
                      {groupedRuntimeProfiles.map(([provider, profiles]) => (
                        <optgroup key={provider} label={formatProviderLabel(provider)}>
                          {profiles.map((profile) => {
                            const health = String(profile.health || '').trim().toLowerCase();
                            const healthSuffix = health === 'cooldown' ? ' · cooling down' : '';
                            const modelSuffix = profile.model ? ` · ${profile.model}` : '';
                            return (
                              <option key={profile.id} value={profile.id}>
                                {`${profile.label}${modelSuffix}${healthSuffix}`}
                              </option>
                            );
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`orion-builder-ai-button${assistantDockOpen ? ' is-open' : ''}`.trim()}
              onClick={() => setAssistantDockOpen((current) => !current)}
            >
              <BrainCircuit size={15} />
              AI
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={handleTest}
              disabled={nodes.length === 0 || runState !== 'idle' || doctorChecking || Boolean(doctorDecision?.blocking) || (executionTarget === 'local_companion' && !hasLocalRuntime)}
            >
              {runState === 'testing' || doctorChecking ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
              {runState === 'testing' ? 'Evaluating…' : doctorChecking ? 'Checking…' : 'Evaluate'}
            </button>
            <button type="button" className="btn-primary" onClick={handlePublish} disabled={nodes.length === 0 || runState !== 'idle'}>
              {runState === 'publishing' ? <LoaderCircle size={14} className="spin" /> : <Rocket size={14} />}
              Publish
            </button>
          </div>
        </div>

        {showBuilderNotice ? (
          <div className={`orion-builder-toolbar-note${executionTarget === 'local_companion' && !hasLocalRuntime ? ' is-warning' : ''}`.trim()}>
            <span>
              Route: {formatExecutionTargetLabel(executionTarget)}. {describeExecutionTarget(executionTarget, hasLocalRuntime)}
              {doctorDecision && doctorDecision.status !== 'pass' ? ` ${doctorDecision.title}.` : ''}
            </span>
            {builderNoticeAction ? (
              <Link href={builderNoticeAction.href} className="orion-builder-toolbar-note-link">
                {builderNoticeAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="orion-builder-main is-agent-builder">
          <section className="orion-builder-canvas-panel is-agent-builder">
            <div ref={canvasHostRef} className={`orion-builder-canvas-frame ${assistantDockOpen ? 'has-preview-dock' : ''}`.trim()}>
              <aside className="orion-builder-library is-floating">
                {groupedNodeLibrary.map((group) => (
                  <div key={group.label} className="orion-builder-library-group">
                    <div className="orion-builder-library-title">{group.label}</div>
                    <div className="orion-builder-library-list">
                      {group.items.map((item) => (
                        <button key={item.id} type="button" className="orion-builder-library-item" onClick={() => addCanvasNode(item)}>
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

              {assistantDockOpen ? (
                <aside className="orion-builder-preview-dock is-floating">
                <div className="orion-builder-preview-head">
                  <div className="orion-builder-preview-head-copy">
                    <div className="orion-builder-preview-title">Build with AI</div>
                    <div className="orion-builder-preview-subtitle">
                      Describe the workflow, tools, approvals, and outcome you want, and Hekor will draft the canvas.
                    </div>
                  </div>
                  <div className="orion-builder-preview-head-actions">
                    <button
                      type="button"
                      className="orion-builder-preview-reset"
                      onClick={() => setAiAssistantPrompt('')}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="orion-builder-preview-close"
                      onClick={() => setAssistantDockOpen(false)}
                      aria-label="Close assistant"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div className="orion-builder-preview-body">
                  <div className="orion-builder-preview-thread">
                    <div className="orion-builder-preview-empty">
                      <span className="orion-builder-preview-empty-icon">
                        <BrainCircuit size={20} />
                      </span>
                      <div className="orion-builder-preview-empty-title">Describe the workflow you want to build</div>
                      <div className="orion-builder-preview-empty-copy">
                        Ask for steps, tools, conditions, approvals, and handoffs. The builder will turn that brief into a workflow draft.
                      </div>
                    </div>
                  </div>
                </div>

                <form
                  className="orion-builder-preview-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAssistantApply();
                  }}
                >
                  <textarea
                    ref={aiAssistantInputRef}
                    className="orion-builder-preview-input"
                    value={aiAssistantPrompt}
                    onChange={(event) => setAiAssistantPrompt(event.target.value)}
                    placeholder="Describe the workflow to generate..."
                  />
                  <button
                    type="submit"
                    className="orion-builder-preview-send"
                    disabled={!aiAssistantPrompt.trim()}
                    aria-label="Generate workflow draft"
                  >
                    <ArrowUp size={15} />
                  </button>
                </form>
                </aside>
              ) : null}

              {saveMessage ? (
                <div className={`orion-builder-canvas-message ${saveState === 'error' ? 'is-error' : ''}`}>
                  <span>{saveMessage}</span>
                  {messageRunId && saveState === 'saved' ? (
                    <button
                      type="button"
                      className="orion-builder-canvas-message-action"
                      onClick={() => router.push(`/runs/${encodeURIComponent(messageRunId)}/inspect?focus=timeline`)}
                    >
                      {OPEN_LIVE_RUN_LABEL}
                    </button>
                  ) : null}
                </div>
              ) : null}

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
                fitViewOptions={{ padding: 0.42 }}
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
                panOnDrag
                zoomOnScroll
                zoomOnPinch
                connectionLineComponent={SmoothConnectionLine}
                proOptions={{ hideAttribution: true }}
              />

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
                          key={item.id}
                          type="button"
                          className="orion-builder-node-search-item"
                          onClick={() => addCanvasNode(item)}
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
