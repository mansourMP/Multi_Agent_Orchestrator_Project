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
  ChevronDown,
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
import LoopNode from '@/components/nodes/LoopNode';
import SmoothConnectionLine from '@/components/nodes/SmoothConnectionLine';
import SmoothActionEdge, { type SmoothActionEdgeData } from '@/components/nodes/SmoothActionEdge';
import {
  createWorkflow,
  fetchBuilderConnectorManifests,
  fetchRuntimeMachines,
  fetchWorkflows,
  getWorkflow,
  publishWorkflow,
  updateWorkflow,
  type BuilderConnectorManifestItem,
  type WorkflowRecordShape,
  type WorkflowValidationSummary,
} from '@/lib/api';
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
import { buildDefaultCanonicalConfig, resetCanonicalConfigForVariant } from '@/lib/workflowNodeDefaults';
import {
  formatWorkflowRunCountsSummary,
  formatWorkflowRunNodeStatusLabel,
  useWorkflowRunTelemetry,
  workflowRunNodeSummary,
} from '@/hooks/useWorkflowRunTelemetry';
import WorkflowValidationPanel from '@/components/workflows/WorkflowValidationPanel';

type CanvasNodeType = 'trigger' | 'agent' | 'action' | 'http_request' | 'condition' | 'transform' | 'code' | 'loop';
type CanonicalNodeType = 'trigger' | 'agent' | 'tool' | 'decision' | 'human' | 'data' | 'subflow' | 'loop';
type TriggerKind = 'schedule' | 'webhook' | 'manual' | 'connector_event' | 'workflow' | 'file_watch';
type LoopKind = 'for_each' | 'while' | 'repeat';
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

type TriggerCanvasData = CanvasCompatibilityMeta & {
  label: string;
  triggerType: TriggerKind;
  status?: string;
  executionSummary?: string;
};
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
  executionSummary?: string;
} & CanvasCompatibilityMeta;
type ActionCanvasData = CanvasCompatibilityMeta & { label: string; actionType: ActionKind; status?: string; executionSummary?: string };
type HttpRequestCanvasData = CanvasCompatibilityMeta & { label: string; method: string; url: string; status?: string; executionSummary?: string };
type ConditionCanvasData = CanvasCompatibilityMeta & { label: string; condition: string; status?: string; executionSummary?: string };
type TransformCanvasData = CanvasCompatibilityMeta & { label: string; mapping: string; status?: string; executionSummary?: string };
type CodeCanvasData = CanvasCompatibilityMeta & { label: string; summary: string; code: string; status?: string; executionSummary?: string };
type LoopCanvasData = CanvasCompatibilityMeta & { label: string; loopType: LoopKind; summary: string; status?: string; executionSummary?: string };
type CanvasNodeData =
  | TriggerCanvasData
  | AgentCanvasData
  | ActionCanvasData
  | HttpRequestCanvasData
  | ConditionCanvasData
  | TransformCanvasData
  | CodeCanvasData
  | LoopCanvasData;

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
type BuilderWorkflowRecord = WorkflowRecordShape;
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
type BuilderToolContract = {
  tool_id: string;
  description?: string;
  optional?: boolean;
};
type BuilderWorkflowListItem = {
  id: string;
  name?: string;
  status?: string;
};
type AgentInspectorSectionKey =
  | 'identity'
  | 'runtime'
  | 'skills'
  | 'tools'
  | 'memory'
  | 'connectors'
  | 'permissions';
type AgentInspectorIssue = {
  section: AgentInspectorSectionKey;
  level: 'error' | 'warning';
  message: string;
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
  loop: LoopNode,
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
    id: 'trigger_manual',
    type: 'trigger',
    label: 'Manual trigger',
    accent: '#d7f0ea',
    icon: <Play size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'manual',
    defaultData: { label: 'Manual trigger', triggerType: 'manual' },
  },
  {
    id: 'trigger_connector',
    type: 'trigger',
    label: 'Connector event',
    accent: '#d7f0ea',
    icon: <Zap size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'connector_event',
    defaultData: { label: 'Connector event', triggerType: 'connector_event' },
  },
  {
    id: 'trigger_schedule',
    type: 'trigger',
    label: 'Schedule',
    accent: '#d7f0ea',
    icon: <Zap size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'schedule',
    defaultData: { label: 'Scheduled trigger', triggerType: 'schedule' },
  },
  {
    id: 'trigger_webhook',
    type: 'trigger',
    label: 'Webhook',
    accent: '#d7f0ea',
    icon: <Zap size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'webhook',
    defaultData: { label: 'Webhook trigger', triggerType: 'webhook' },
  },
  {
    id: 'trigger_workflow',
    type: 'trigger',
    label: 'Workflow trigger',
    accent: '#d7f0ea',
    icon: <Rocket size={14} />,
    canonicalType: 'trigger',
    canonicalVariant: 'workflow',
    defaultData: { label: 'Workflow trigger', triggerType: 'workflow' },
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
    id: 'loop_for_each',
    type: 'loop',
    label: 'For each',
    accent: '#efe4ff',
    icon: <Redo2 size={14} />,
    canonicalType: 'loop',
    canonicalVariant: 'for_each',
    defaultData: { label: 'For each item', loopType: 'for_each', summary: 'Run once for every array item' },
  },
  {
    id: 'loop_while',
    type: 'loop',
    label: 'While',
    accent: '#efe4ff',
    icon: <Redo2 size={14} />,
    canonicalType: 'loop',
    canonicalVariant: 'while',
    defaultData: { label: 'While condition', loopType: 'while', summary: 'Repeat while the condition is true' },
  },
  {
    id: 'loop_repeat',
    type: 'loop',
    label: 'Repeat',
    accent: '#efe4ff',
    icon: <Redo2 size={14} />,
    canonicalType: 'loop',
    canonicalVariant: 'repeat',
    defaultData: { label: 'Repeat', loopType: 'repeat', summary: 'Run a fixed number of times' },
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
  { label: 'Triggers', items: ['trigger_manual', 'trigger_connector', 'trigger_schedule', 'trigger_webhook', 'trigger_workflow'] },
  { label: 'Agents', items: ['agent'] },
  { label: 'Tools', items: ['tool', 'http', 'code_tool'] },
  { label: 'Human', items: ['human'] },
  { label: 'Logic', items: ['decision'] },
  { label: 'Loops', items: ['loop_for_each', 'loop_while', 'loop_repeat'] },
  { label: 'Data', items: ['data'] },
  { label: 'Subflows', items: ['subflow'] },
];

const ACTION_POLICY_OPTIONS = [
  { value: 'guarded', label: 'Guarded' },
  { value: 'strict', label: 'Strict' },
  { value: 'auto', label: 'Automatic' },
] as const;
const TRUST_PRESET_OPTIONS = [
  { value: 'standard_local', label: 'Standard local' },
  { value: 'trusted_workflow', label: 'Trusted workflow' },
  { value: 'elevated_local', label: 'Elevated local' },
] as const;

const MEMORY_SCOPE_OPTIONS = ['session', 'project', 'profile'] as const;
const MEMORY_RETRIEVAL_OPTIONS = ['recent', 'pinned', 'semantic'] as const;
const FILE_MOUNT_OPTIONS = ['artifacts', 'project', 'shared', 'knowledge', 'local_root', 'connector_files'] as const;
const FILE_GRANT_OPTIONS = ['none', 'read', 'read_write', 'create_only', 'append_only'] as const;
const AGENT_INSPECTOR_DEFAULT_SECTIONS: Record<AgentInspectorSectionKey, boolean> = {
  identity: true,
  runtime: true,
  skills: false,
  tools: false,
  memory: false,
  connectors: false,
  permissions: false,
};

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

function ensureRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleStringList(list: string[], token: string, enabled: boolean): string[] {
  const next = new Set(list);
  if (enabled) next.add(token);
  else next.delete(token);
  return Array.from(next);
}

function replaceStringAtIndex(list: string[], index: number, nextValue: string): string[] {
  return list.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
}

function removeStringAtIndex(list: string[], index: number): string[] {
  return list.filter((_, itemIndex) => itemIndex !== index);
}

function dedupeIssues<T extends { level: 'error' | 'warning'; message: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const item of items) {
    const key = `${item.level}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function resolveBuilderFileMountGrants(raw: unknown): Array<{ mount: string; grant: string }> {
  const defaults = new Map<string, string>([
    ['artifacts', 'read_write'],
    ['project', 'read'],
    ['shared', 'read'],
    ['knowledge', 'read'],
    ['local_root', 'none'],
    ['connector_files', 'read'],
  ]);
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item)) continue;
      const mount = String(item.mount || '').trim().toLowerCase();
      const grant = String(item.grant || '').trim().toLowerCase();
      if ((FILE_MOUNT_OPTIONS as readonly string[]).includes(mount) && (FILE_GRANT_OPTIONS as readonly string[]).includes(grant)) {
        defaults.set(mount, grant);
      }
    }
  }
  return Array.from(defaults.entries()).map(([mount, grant]) => ({ mount, grant }));
}

function formatTrustPresetLabel(value: unknown): string {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'trusted_workflow') return 'Trusted workflow';
  if (token === 'elevated_local') return 'Elevated local';
  return 'Standard local';
}

function normalizeBuilderRememberedGrants(raw: unknown): {
  folders: string[];
  browser_session: boolean;
  shell_capabilities: string[];
} {
  const source = ensureRecord(raw);
  return {
    folders: normalizeStringList(source.folders),
    browser_session: Boolean(source.browser_session),
    shell_capabilities: normalizeStringList(source.shell_capabilities),
  };
}

function formatCanonicalTypeLabel(type: CanonicalNodeType): string {
  if (type === 'trigger') return 'Trigger';
  if (type === 'agent') return 'Agent';
  if (type === 'tool') return 'Tool';
  if (type === 'decision') return 'Decision';
  if (type === 'human') return 'Human';
  if (type === 'data') return 'Data';
  if (type === 'loop') return 'Loop';
  return 'Subflow';
}

function isCanvasNodeType(value: string): value is CanvasNodeType {
  return ['trigger', 'agent', 'action', 'http_request', 'condition', 'transform', 'code', 'loop'].includes(value);
}

function isCanonicalNodeType(value: string): value is CanonicalNodeType {
  return ['trigger', 'agent', 'tool', 'decision', 'human', 'data', 'subflow', 'loop'].includes(value);
}

function canonicalTypeForCanvasType(type: CanvasNodeType): CanonicalNodeType {
  if (type === 'http_request' || type === 'code' || type === 'action') return 'tool';
  if (type === 'condition') return 'decision';
  if (type === 'transform') return 'data';
  if (type === 'loop') return 'loop';
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

function normalizeLoopKind(value: unknown): LoopKind {
  const token = String(value || '').trim().toLowerCase();
  return token === 'while' || token === 'repeat' ? token : 'for_each';
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
  if (rawType === 'loop') return 'loop';
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

  if (canvasType === 'loop') {
    const loopType = normalizeLoopKind(canonicalVariant || 'for_each');
    let summary = 'Repeat a sub-workflow';
    if (loopType === 'for_each') {
      summary = compactText(String(config.array_source || subtitle || 'Iterate over array items'), 120) || 'Iterate over array items';
    } else if (loopType === 'while') {
      summary = compactText(String(config.expression || subtitle || 'Repeat while condition is true'), 120) || 'Repeat while condition is true';
    } else {
      summary = compactText(String(config.count_source || config.count || subtitle || 'Repeat a fixed number of times'), 120) || 'Repeat a fixed number of times';
    }
    return {
      ...compatibility,
      label: label || (loopType === 'for_each' ? 'For each item' : loopType === 'while' ? 'While condition' : 'Repeat'),
      loopType,
      summary,
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
  if (type === 'loop') return normalizeLoopKind((data as LoopCanvasData).loopType);
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
  const compatibility = deriveCanvasMeta(data);
  const canonicalType = compatibility.__canonicalType ?? canonicalTypeForCanvasType(type);
  const canonicalVariant = compatibility.__canonicalVariant || canonicalVariantForCanvasNode(type, data) || '';
  const next = resetCanonicalConfigForVariant(canonicalType, canonicalVariant, seed);
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
  if (type === 'loop') {
    const loopData = data as LoopCanvasData;
    if (loopData.loopType === 'for_each') {
      next.item_variable_name = typeof next.item_variable_name === 'string' && String(next.item_variable_name).trim()
        ? next.item_variable_name
        : 'item';
      next.parallel = Boolean(next.parallel);
      next.max_iterations = next.max_iterations ?? 100;
    } else if (loopData.loopType === 'while') {
      next.expression = typeof next.expression === 'string' && String(next.expression).trim()
        ? next.expression
        : 'result_data["should_continue"] == True';
      next.max_iterations = next.max_iterations ?? 50;
    } else {
      next.count = next.count ?? 3;
      next.max_iterations = next.max_iterations ?? 50;
    }
    if (typeof next.continue_on_error !== 'boolean') next.continue_on_error = false;
    if (!isRecord(next.body)) {
      next.body = { version: 'empyralist.workflow.v2', nodes: [], edges: [] };
    }
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
  if (type === 'loop') return { label: 'For each item', loopType: 'for_each', summary: 'Run once for every array item' };
  if (type === 'action') return { label: 'Tool action', actionType: 'connector_action' };
  return {
    label: 'Agent',
    modelId: 'gpt-4o-mini',
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
  if (type === 'loop') next.loopType = normalizeLoopKind(next.loopType);
  return next as CanvasNodeData;
}

function parseCanvasNodeRecord(rawItem: unknown, index = 0): CanvasWorkflowNode | null {
  if (!isRecord(rawItem)) return null;
  const type = deriveCanvasType(rawItem);
  if (!type) return null;
  const position = isRecord(rawItem.position) ? rawItem.position : {};
  const x = Number(position.x);
  const y = Number(position.y);
  const normalizedData = isCanvasNodeType(String(rawItem.type || '').trim().toLowerCase())
    ? normalizeCanvasNodeData(type, (isRecord(rawItem.data) ? rawItem.data : {}) as Partial<CanvasNodeData>)
    : normalizeCanvasNodeData(type, deriveCanvasDataFromCanonicalNode(rawItem, type));
  return {
    id: String(rawItem.id || makeNodeId(type)).trim() || makeNodeId(type),
    type,
    position: {
      x: Number.isFinite(x) ? x : CANVAS_NODE_X,
      y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + index * CANVAS_NODE_GAP,
    },
    data: normalizedData,
  };
}

function parseCanvasNodes(rawNodes: unknown): CanvasWorkflowNode[] {
  if (!Array.isArray(rawNodes)) return [];
  const parsed: CanvasWorkflowNode[] = [];
  for (const item of rawNodes) {
    const parsedNode = parseCanvasNodeRecord(item, parsed.length);
    if (parsedNode) parsed.push(parsedNode);
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
      return { label: 'Scheduled trigger', triggerType: 'schedule' };
    }
    if (/(webhook|api|endpoint)/.test(lowered)) {
      return { label: 'Webhook trigger', triggerType: 'webhook' };
    }
    return { label: text ? 'Manual test' : 'Manual trigger', triggerType: 'manual' };
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
  const triggerItem = CANVAS_NODE_LIBRARY.find((item) => item.id === 'trigger_manual') || CANVAS_NODE_LIBRARY[0]!;
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
          __canonicalConfig: buildDefaultCanonicalConfig(item.canonicalType, item.canonicalVariant || ''),
          __canonicalResources: {},
          __canonicalPolicy: {},
        }
      : {}),
  });
}

function formatTriggerKindLabel(kind: TriggerKind): string {
  if (kind === 'schedule') return 'Scheduled trigger';
  if (kind === 'webhook') return 'Webhook trigger';
  if (kind === 'connector_event') return 'Connector event';
  if (kind === 'workflow') return 'Workflow trigger';
  if (kind === 'file_watch') return 'File watcher';
  return 'Manual test';
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
  if (node.type === 'loop') return compactText((node.data as LoopCanvasData).summary || '', 54) || 'Repeat a sub-workflow';
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
  const [aiAssistantBusy, setAiAssistantBusy] = useState(false);
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
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationSummary | null>(null);
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
  const [connectorManifests, setConnectorManifests] = useState<BuilderConnectorManifestItem[]>([]);
  const [toolContracts, setToolContracts] = useState<BuilderToolContract[]>([]);
  const [availableSubflowTargets, setAvailableSubflowTargets] = useState<BuilderWorkflowListItem[]>([]);
  const [agentInspectorSections, setAgentInspectorSections] = useState<Record<AgentInspectorSectionKey, boolean>>(
    AGENT_INSPECTOR_DEFAULT_SECTIONS,
  );
  const [agentSkillDraft, setAgentSkillDraft] = useState('');

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
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const selectedNodeCanonicalType = useMemo(
    () => (selectedNode ? deriveCanvasMeta(selectedNode.data).__canonicalType : undefined),
    [selectedNode],
  );
  const {
    runDetail,
    refreshRunDetail,
    activeRunNodeId,
    finalRunNodeId,
    selectedRunNodeState,
    renderedNodes,
  } = useWorkflowRunTelemetry<CanvasWorkflowNode>({
    runId: messageRunId,
    nodes,
    selectedNodeId,
    controlPlaneFetch,
  });
  const selectedCanonicalNode = useMemo(
    () => (selectedNode ? serializeCanvasNode(selectedNode) : null),
    [selectedNode],
  );
  const nodeLabels = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, String((node.data as Record<string, unknown>)?.label || node.id).trim() || node.id])),
    [nodes],
  );
  const hasWorkflowValidationIssues = Boolean(
    workflowValidation
    && (
      workflowValidation.publishErrorCount > 0
      || workflowValidation.publishWarningCount > 0
      || workflowValidation.draftErrorCount > 0
      || workflowValidation.draftWarningCount > 0
    ),
  );

  useEffect(() => {
    if (selectedNodeCanonicalType === 'agent') {
      setAgentInspectorSections(AGENT_INSPECTOR_DEFAULT_SECTIONS);
      setAgentSkillDraft('');
    }
  }, [selectedNodeCanonicalType, selectedNodeId]);

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
    setWorkflowValidation(workflow?.validation || null);
    setSelectedNodeId(safeNodes[0]?.id || null);
    setSelectedEdgeId(null);
    setSavedWorkflowId(id);
    setMessageRunId(null);
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
    if (saveState === 'idle') {
      setWorkflowValidation(null);
    }
  }, [saveState]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadBuilderResources() {
      try {
        const [manifests, workflows, contracts] = await Promise.all([
          fetchBuilderConnectorManifests().catch(() => []),
          fetchWorkflows(DEFAULT_WORKSPACE_ID).catch(() => []),
          controlPlaneFetch('/api/tools/contracts')
            .then(async (response) => {
              if (!response.ok) throw new Error(`tools/contracts failed (HTTP ${response.status})`);
              const payload = await response.json().catch(() => null) as { items?: unknown[] } | null;
              return Array.isArray(payload?.items) ? payload.items : [];
            })
            .catch(() => []),
        ]);
        if (cancelled) return;
        setConnectorManifests(Array.isArray(manifests) ? manifests : []);
        setToolContracts(
          Array.isArray(contracts)
            ? contracts.reduce<BuilderToolContract[]>((acc, item) => {
                if (!isRecord(item) || typeof item.tool_id !== 'string') return acc;
                const toolId = String(item.tool_id || '').trim();
                if (!toolId) return acc;
                acc.push({
                  tool_id: toolId,
                  description: typeof item.description === 'string' ? item.description : undefined,
                  optional: typeof item.optional === 'boolean' ? item.optional : undefined,
                });
                return acc;
              }, [])
            : [],
        );
        const workflowItems = Array.isArray(workflows)
          ? workflows.reduce<BuilderWorkflowListItem[]>((acc, item) => {
              if (!isRecord(item) || typeof item.id !== 'string') return acc;
              acc.push({
                id: item.id,
                name: typeof item.name === 'string' ? item.name : undefined,
                status: typeof item.status === 'string' ? item.status : undefined,
              });
              return acc;
            }, [])
          : [];
        setAvailableSubflowTargets(workflowItems);
      } catch {
        if (!cancelled) {
          setConnectorManifests([]);
          setToolContracts([]);
          setAvailableSubflowTargets([]);
        }
      }
    }

    void loadBuilderResources();
    return () => {
      cancelled = true;
    };
  }, [controlPlaneFetch]);

  const updateSelectedCanonicalNode = useCallback(
    (updater: (current: Record<string, unknown>) => Record<string, unknown>) => {
      if (!selectedNodeId) return;
      setNodes((current) => current.map((node) => {
        if (node.id !== selectedNodeId) return node;
        const currentCanonical = serializeCanvasNode(node) as Record<string, unknown>;
        const nextCanonical = updater(structuredClone(currentCanonical));
        const rebuilt = parseCanvasNodeRecord({
          ...nextCanonical,
          id: node.id,
          position: node.position,
        });
        return rebuilt || node;
      }));
      setSaveState('idle');
      setSaveMessage(null);
    },
    [selectedNodeId],
  );

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
    setMessageRunId(null);
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
    setMessageRunId(null);
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
    setMessageRunId(null);
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
    setAssistantDockOpen(false);
    const position =
      nodeSearch?.insertEdgeId
        ? { x: snapToGrid(nodeSearch.flowX), y: snapToGrid(nodeSearch.flowY) }
        : undefined;
    const insertEdgeId = nodeSearch?.insertEdgeId;
    const edgeToSplit = insertEdgeId ? edges.find((edge) => edge.id === insertEdgeId) || null : null;
    setNodes((current) => {
      const defaultPosition = current.length === 0
        ? getCenteredStartPosition(canvasHostRef.current)
        : (() => {
            if (item.type === 'trigger') {
              const triggerNodes = current.filter((node) => node.type === 'trigger');
              const anchor = triggerNodes[0] || current[0] || null;
              const bottomTrigger = triggerNodes.reduce<CanvasWorkflowNode | null>(
                (winner, node) => (!winner || node.position.y > winner.position.y ? node : winner),
                null,
              );
              return {
                x: snapToGrid(Number(anchor?.position.x) || CANVAS_NODE_X),
                y: snapToGrid((Number(bottomTrigger?.position.y) || Number(anchor?.position.y) || CANVAS_NODE_TOP) + 144),
              };
            }
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

  const persistCurrentWorkflow = async (): Promise<BuilderWorkflowRecord | null> => {
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
      return await updateWorkflow(savedWorkflowId, definition);
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
    return created;
  };

  const handleSaveDraft = async () => {
    if (nodes.length === 0 || !draftGoal.trim() || saveState === 'saving') return;
    setSaveState('saving');
    setSaveMessage(null);
    try {
      const workflowRecord = await persistCurrentWorkflow();
      const workflowId = typeof workflowRecord?.id === 'string' ? workflowRecord.id : null;
      setSavedWorkflowId(workflowId);
      setLoadedDefinition(workflowRecord?.definition || null);
      setWorkflowValidation(workflowRecord?.validation || null);
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
      const workflowRecord = await persistCurrentWorkflow();
      const workflowId = typeof workflowRecord?.id === 'string' ? workflowRecord.id : null;
      if (!workflowId) throw new Error('Save the workflow before publishing.');
      setSavedWorkflowId(workflowId);
      setLoadedDefinition(workflowRecord?.definition || null);
      setWorkflowValidation(workflowRecord?.validation || null);
      const publishedWorkflow = await publishWorkflow(workflowId);
      setLoadedDefinition(publishedWorkflow?.definition || null);
      setWorkflowValidation(publishedWorkflow?.validation || null);
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
      const workflowRecord = await persistCurrentWorkflow();
      const workflowId = typeof workflowRecord?.id === 'string' ? workflowRecord.id : null;
      if (!workflowId) throw new Error('Save the workflow before testing.');
      setLoadedDefinition(workflowRecord?.definition || null);
      setWorkflowValidation(workflowRecord?.validation || null);
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
      const trustPreset = String(primaryAgentPermissions.trust_preset || 'standard_local').trim() || 'standard_local';
      const rememberedGrants = normalizeBuilderRememberedGrants(primaryAgentPermissions.remembered_grants);
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
            trust_preset: trustPreset,
            remembered_grants: rememberedGrants,
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
        requested_provider?: string;
        effective_provider?: string;
        requested_model?: string;
        effective_model?: string;
        provider_overridden?: boolean;
        model_overridden?: boolean;
        fallback_used?: boolean;
        execution_target_selected?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          (payload && typeof payload.detail === 'string' && payload.detail) ||
            (payload && typeof payload.error === 'string' && payload.error) ||
            'Unable to start a test run.',
        );
      }
      setMessageRunId(payload?.run_id || null);
      if (payload?.run_id) {
        void refreshRunDetail(payload.run_id);
      }
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

  const handleAssistantApply = useCallback(async (value?: string) => {
    const next = String(value || aiAssistantPrompt).trim();
    if (!next || aiAssistantBusy) return;
    setAiAssistantBusy(true);
    setSaveMessage(null);
    try {
      const response = await controlPlaneFetch(resolveBuilderGenerateUrl(), {
        method: 'POST',
        body: JSON.stringify({
          prompt: next,
          profile_id: selectedProfileId || undefined,
          workspace_id: DEFAULT_WORKSPACE_ID,
        }),
      });
      const payload = await response.json().catch(() => null) as { workflow?: BuilderGeneratedWorkflow; detail?: string; error?: string } | null;
      if (!response.ok || !payload?.workflow) {
        throw new Error(
          (payload && typeof payload.detail === 'string' && payload.detail) ||
          (payload && typeof payload.error === 'string' && payload.error) ||
          'Unable to generate a workflow draft.',
        );
      }
      const graph = parseGeneratedWorkflow(payload.workflow, next);
      if (graph.nodes.length === 0) {
        throw new Error('The builder AI returned an empty workflow draft.');
      }
      pushHistory();
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setLoadedDefinition(null);
      setSelectedNodeId(graph.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      setNodeSearch(null);
      setDraftGoal(next);
      setStagedPrompt(next);
      setPromptInput('');
      setWorkflowName(buildWorkflowName(next));
      setWorkflowDescription(buildWorkflowDescription(next));
      setMessageRunId(null);
      setSaveState('idle');
      setSaveMessage('Draft generated with AI.');
      setAiAssistantPrompt('');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'Unable to generate a workflow draft.');
    } finally {
      setAiAssistantBusy(false);
    }
  }, [aiAssistantBusy, aiAssistantPrompt, controlPlaneFetch, pushHistory, selectedProfileId]);

  const builderNoticeAction = executionTarget === 'local_companion' && !hasLocalRuntime
    ? { href: '/machines', label: 'Open Machines' }
    : doctorDecision && doctorDecision.status !== 'pass'
      ? { href: '/health', label: 'Open Health' }
      : null;
  const workflowNodeProgressSummary = useMemo(() => {
    const counts = isRecord(runDetail?.node_states?.counts) ? runDetail.node_states?.counts || null : null;
    return formatWorkflowRunCountsSummary(counts);
  }, [runDetail?.node_states?.counts]);
  const showBuilderNotice = Boolean(builderNoticeAction);
  const showInspectorDock = Boolean(selectedNode && !assistantDockOpen);
  const availableSubflowTargetsForInspector = availableSubflowTargets.filter((item) => item.id !== (savedWorkflowId || workflowId || ''));

  const renderFileMountGrantFields = (
    value: unknown,
    onChange: (next: Array<{ mount: string; grant: string }>) => void,
  ) => {
    const grants = resolveBuilderFileMountGrants(value);
    return (
      <div className="orion-builder-inspector">
        <div className="orion-builder-inspector-title">File access</div>
        <div className="orion-builder-inspector-grid">
          {grants.map((item) => (
            <label key={item.mount} className="orion-builder-field">
              <span className="orion-builder-field-label">{item.mount}</span>
              <select
                className="orion-builder-field-input"
                value={item.grant}
                onChange={(event) => {
                  onChange(grants.map((entry) => (
                    entry.mount === item.mount ? { ...entry, grant: event.target.value } : entry
                  )));
                }}
              >
                {FILE_GRANT_OPTIONS.map((grant) => (
                  <option key={grant} value={grant}>{grant}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    );
  };

  const inspectorDock = showInspectorDock && selectedNode && selectedCanonicalNode ? (() => {
    const canonicalType = String(selectedCanonicalNode.type || '').trim().toLowerCase() as CanonicalNodeType;
    const canonicalVariant = String(selectedCanonicalNode.variant || '').trim().toLowerCase();
    const config = ensureRecord(selectedCanonicalNode.config);
    const agentIdentity = ensureRecord(config.identity);
    const inspectorLabel = String(
      canonicalType === 'agent'
        ? agentIdentity.name || (selectedNode.data as Partial<AgentCanvasData>).label || 'Agent'
        : canonicalType === 'human'
          ? config.title || (selectedNode.data as Partial<ActionCanvasData>).label || 'Human step'
          : (selectedNode.data as Partial<CanvasNodeData>).label || config.summary || formatCanonicalTypeLabel(canonicalType),
    ).trim();
    const connectorBindings = Array.isArray(ensureRecord(config.connectors).bindings)
      ? ensureRecord(config.connectors).bindings as unknown[]
      : [];
    const boundConnectorIds = connectorBindings
      .filter((item) => isRecord(item))
      .map((item) => String(item.connector_id || '').trim())
      .filter(Boolean);
    const permissions = ensureRecord(config.permissions);
    const connectorPermissions = normalizeStringList(permissions.connector_permissions);
    const browserPermissions = ensureRecord(permissions.browser_permissions);
    const trustPreset = String(permissions.trust_preset || 'standard_local').trim() || 'standard_local';
    const rememberedGrants = normalizeBuilderRememberedGrants(permissions.remembered_grants);
    const agentRuntime = ensureRecord(config.runtime);
    const agentSkills = ensureRecord(config.skills);
    const agentTools = ensureRecord(config.tools);
    const agentMemory = ensureRecord(config.memory);
    const runNodeSummary = workflowRunNodeSummary(selectedRunNodeState);
    const runNodeStatusLabel = formatWorkflowRunNodeStatusLabel(selectedRunNodeState?.status);
    const isActiveRunNode = Boolean(activeRunNodeId && selectedNode.id === activeRunNodeId);
    const isFinalRunNode = Boolean(finalRunNodeId && selectedNode.id === finalRunNodeId);
    const toolActions = (() => {
      const connectorId = String(config.connector || '').trim();
      const manifest = connectorManifests.find((item) => item.id === connectorId) || null;
      return Array.isArray(manifest?.actions) ? manifest.actions : [];
    })();
    const triggerEvents = (() => {
      const connectorId = String(config.connector || '').trim();
      const manifest = connectorManifests.find((item) => item.id === connectorId) || null;
      return Array.isArray(manifest?.triggers) ? manifest.triggers : [];
    })();
    const agentRetention = ensureRecord(agentMemory.retention);
    const retentionDaysValue = Number(agentRetention.retention_days);
    const retentionMode = Number.isFinite(retentionDaysValue) && retentionDaysValue > 0 ? 'custom_days' : 'default';
    const currentProviderProfileId = String(agentRuntime.provider_profile_id || '').trim();
    const runtimeProfileEntries = [
      ...groupedRuntimeProfiles.flatMap(([provider, profiles]) => profiles.map((profile) => ({
        id: profile.id,
        label: `${profile.label}${profile.model ? ` · ${profile.model}` : ''}`,
        provider,
      }))),
      ...((currentProviderProfileId && !runtimeProfiles.some((profile) => profile.id === currentProviderProfileId))
        ? [{
            id: currentProviderProfileId,
            label: `Unavailable profile · ${currentProviderProfileId}`,
            provider: 'unavailable',
          }]
        : []),
    ];
    const currentAgentToolIds = dedupeIssues(
      [...normalizeStringList(agentTools.dynamic_allowed), ...normalizeStringList(agentTools.explicit_required)]
        .map((toolId) => ({ level: 'warning' as const, message: toolId })),
    ).map((item) => item.message);
    const toolOptionItems = [
      ...toolContracts.map((item) => ({
        tool_id: item.tool_id,
        description: item.description,
      })),
      ...currentAgentToolIds
        .filter((toolId) => !toolContracts.some((item) => item.tool_id === toolId))
        .map((toolId) => ({
          tool_id: toolId,
          description: 'Existing tool id',
        })),
    ];
    const connectorBindingOptions = [
      ...connectorManifests.map((manifest) => ({ id: manifest.id, label: manifest.label })),
      ...boundConnectorIds
        .filter((connectorId) => !connectorManifests.some((manifest) => manifest.id === connectorId))
        .map((connectorId) => ({ id: connectorId, label: connectorId })),
    ];
    const selectedNodeValidationIssues = workflowValidation
      ? dedupeIssues(
          [
            ...workflowValidation.draftIssues,
            ...workflowValidation.publishIssues,
          ]
            .filter((issue) => issue.nodeId === selectedNode.id)
            .map((issue) => ({
              level: issue.level,
              message: issue.message,
              section: (() => {
                const code = String(issue.code || '').trim().toLowerCase();
                const message = String(issue.message || '').trim().toLowerCase();
                if (code.includes('connector') || message.includes('connector')) return 'connectors' as const;
                if (code.includes('memory') || message.includes('memory')) return 'memory' as const;
                if (code.includes('tool') || message.includes('tool')) return 'tools' as const;
                if (code.includes('permission') || code.includes('local_root') || message.includes('permission') || message.includes('local root')) {
                  return 'permissions' as const;
                }
                return 'runtime' as const;
              })(),
            })),
        )
      : [];
    const localAgentIssues: AgentInspectorIssue[] = [];
    if (canonicalType === 'agent') {
      if (!String(agentIdentity.name || '').trim()) {
        localAgentIssues.push({
          section: 'identity',
          level: 'error',
          message: 'Name cannot be empty. Canonical save will normalize this field.',
        });
      }
      if (!String(agentIdentity.role || '').trim()) {
        localAgentIssues.push({
          section: 'identity',
          level: 'error',
          message: 'Role cannot be empty. Canonical save will normalize this field.',
        });
      }
      if (
        String(agentRuntime.execution_target || 'auto').trim() === 'cloud'
        && resolveBuilderFileMountGrants(permissions.file_mount_grants).some((grant) => grant.mount === 'local_root' && grant.grant !== 'none')
      ) {
        localAgentIssues.push({
          section: 'permissions',
          level: 'error',
          message: 'local_root is only allowed when the agent runs locally.',
        });
      }
      if (trustPreset !== 'standard_local' && String(agentRuntime.execution_target || 'auto').trim() === 'cloud') {
        localAgentIssues.push({
          section: 'permissions',
          level: 'warning',
          message: 'Trusted workflow and elevated local presets are intended for local companion execution.',
        });
      }
      if (
        trustPreset === 'standard_local'
        && (
          rememberedGrants.folders.length > 0
          || rememberedGrants.browser_session
          || rememberedGrants.shell_capabilities.length > 0
        )
      ) {
        localAgentIssues.push({
          section: 'permissions',
          level: 'warning',
          message: 'This agent has remembered desktop grants. Use Trusted workflow if that persistence is intentional.',
        });
      }
      if (currentProviderProfileId && !runtimeProfiles.some((profile) => profile.id === currentProviderProfileId)) {
        localAgentIssues.push({
          section: 'runtime',
          level: 'warning',
          message: 'Selected provider profile is not available in this workspace right now.',
        });
      }
      const knownToolIds = new Set(toolContracts.map((item) => item.tool_id));
      const unknownToolIds = currentAgentToolIds.filter((toolId) => !knownToolIds.has(toolId));
      if (unknownToolIds.length > 0) {
        localAgentIssues.push({
          section: 'tools',
          level: 'warning',
          message: `Unknown tool ids will be preserved as-is: ${unknownToolIds.join(', ')}`,
        });
      }
      const unknownConnectorBindings = connectorBindings
        .filter((item) => isRecord(item))
        .map((item) => String(item.connector_id || '').trim())
        .filter((connectorId) => connectorId && !connectorManifests.some((manifest) => manifest.id === connectorId));
      if (unknownConnectorBindings.length > 0) {
        localAgentIssues.push({
          section: 'connectors',
          level: 'warning',
          message: `Unknown connector bindings will be preserved as-is: ${unknownConnectorBindings.join(', ')}`,
        });
      }
      if ('retention_days' in agentRetention) {
        const value = Number(agentRetention.retention_days);
        if (!Number.isFinite(value) || value < 1 || value > 3650) {
          localAgentIssues.push({
            section: 'memory',
            level: 'error',
            message: 'Retention days must be between 1 and 3650.',
          });
        }
      }
    }
    const agentIssuesBySection = (['identity', 'runtime', 'skills', 'tools', 'memory', 'connectors', 'permissions'] as AgentInspectorSectionKey[])
      .reduce<Record<AgentInspectorSectionKey, AgentInspectorIssue[]>>((acc, key) => {
        acc[key] = dedupeIssues(
          [
            ...localAgentIssues.filter((issue) => issue.section === key),
            ...selectedNodeValidationIssues.filter((issue) => issue.section === key) as AgentInspectorIssue[],
          ],
        );
        return acc;
      }, {
        identity: [],
        runtime: [],
        skills: [],
        tools: [],
        memory: [],
        connectors: [],
        permissions: [],
      });

    const renderAgentInspectorSection = (
      section: AgentInspectorSectionKey,
      title: string,
      children: ReactNode,
    ) => {
      const issues = agentIssuesBySection[section];
      const open = agentInspectorSections[section];
      return (
        <div className={`orion-builder-inspector is-collapsible${open ? ' is-open' : ''}`}>
          <button
            type="button"
            className="orion-builder-inspector-toggle"
            onClick={() => setAgentInspectorSections((current) => ({ ...current, [section]: !current[section] }))}
            aria-expanded={open}
          >
            <span className="orion-builder-inspector-toggle-copy">
              <span className="orion-builder-inspector-title">{title}</span>
              {issues.length > 0 ? (
                <span className={`orion-builder-inline-badge is-${issues.some((issue) => issue.level === 'error') ? 'error' : 'warning'}`}>
                  {issues.length} issue{issues.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
            <ChevronDown size={16} className={`orion-builder-inspector-toggle-icon${open ? ' is-open' : ''}`} />
          </button>
          {issues.length > 0 ? (
            <div className="orion-builder-inline-issues">
              {issues.map((issue) => (
                <div key={`${section}-${issue.level}-${issue.message}`} className={`orion-builder-inline-issue is-${issue.level}`}>
                  {issue.message}
                </div>
              ))}
            </div>
          ) : null}
          {open ? <div className="orion-builder-inspector-collapsible-body">{children}</div> : null}
        </div>
      );
    };

    return (
      <aside className="orion-builder-preview-dock is-floating is-inspector">
        <div className="orion-builder-preview-head">
          <div className="orion-builder-preview-head-copy">
            <div className="orion-builder-preview-title">{inspectorLabel || 'Configure node'}</div>
            <div className="orion-builder-preview-subtitle">
              {formatCanonicalTypeLabel(canonicalType)} node
              {canonicalVariant ? ` · ${canonicalVariant.replace(/_/g, ' ')}` : ''}
            </div>
          </div>
          <div className="orion-builder-preview-head-actions">
            <span className="orion-builder-step-type">{formatCanonicalTypeLabel(canonicalType)}</span>
            <button
              type="button"
              className="orion-builder-preview-close"
              onClick={() => setSelectedNodeId(null)}
              aria-label="Close inspector"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="orion-builder-preview-body is-inspector">
          {selectedRunNodeState ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Node execution</div>
              <div className="orion-builder-inspector-grid">
                <div className="orion-builder-inspector-item">
                  <div className="orion-builder-field-label">Status</div>
                  <div className="orion-builder-field-readonly">{runNodeStatusLabel}</div>
                </div>
                <div className="orion-builder-inspector-item">
                  <div className="orion-builder-field-label">Run role</div>
                  <div className="orion-builder-field-readonly">
                    {[isActiveRunNode ? 'Active node' : null, isFinalRunNode ? 'Final node' : null].filter(Boolean).join(' · ') || 'Visited in this run'}
                  </div>
                </div>
                {runNodeSummary ? (
                  <div className="orion-builder-inspector-item is-wide">
                    <div className="orion-builder-field-label">Summary</div>
                    <div className="orion-builder-field-readonly is-block">{runNodeSummary}</div>
                  </div>
                ) : null}
                {selectedRunNodeState.input_preview ? (
                  <div className="orion-builder-inspector-item is-wide">
                    <div className="orion-builder-field-label">Input preview</div>
                    <div className="orion-builder-field-readonly is-block">{String(selectedRunNodeState.input_preview)}</div>
                  </div>
                ) : null}
                {selectedRunNodeState.output_preview ? (
                  <div className="orion-builder-inspector-item is-wide">
                    <div className="orion-builder-field-label">Output preview</div>
                    <div className="orion-builder-field-readonly is-block">{String(selectedRunNodeState.output_preview)}</div>
                  </div>
                ) : null}
                {selectedRunNodeState.error ? (
                  <div className="orion-builder-inspector-item is-wide">
                    <div className="orion-builder-field-label">Error</div>
                    <div className="orion-builder-field-readonly is-block is-error">{String(selectedRunNodeState.error)}</div>
                  </div>
                ) : null}
                {selectedRunNodeState.child_run_id ? (
                  <div className="orion-builder-inspector-item is-wide">
                    <div className="orion-builder-field-label">Child run</div>
                    <Link href={`/runs/${encodeURIComponent(String(selectedRunNodeState.child_run_id))}/inspect?focus=workflow`} className="orion-builder-field-link">
                      Open run {String(selectedRunNodeState.child_run_id)}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : messageRunId ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Node execution</div>
              <div className="orion-builder-preview-subtitle">No execution data for this node in the current run yet.</div>
            </div>
          ) : null}

          {canonicalType !== 'agent' ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Node label</div>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Label</span>
                <input
                  className="orion-builder-field-input"
                  value={inspectorLabel}
                  onChange={(event) => updateSelectedCanonicalNode((current) => {
                    const nextConfig = ensureRecord(current.config);
                    if (canonicalType === 'human') {
                      return {
                        ...current,
                        config: {
                          ...nextConfig,
                          title: event.target.value,
                        },
                      };
                    }
                    return {
                      ...current,
                      label: event.target.value,
                      config: {
                        ...nextConfig,
                        summary: event.target.value,
                      },
                    };
                  })}
                />
              </label>
            </div>
          ) : null}

          {canonicalType === 'trigger' ? (
            <>
              <div className="orion-builder-inspector">
                <div className="orion-builder-inspector-title">Trigger</div>
                <label className="orion-builder-field">
                  <span className="orion-builder-field-label">Variant</span>
                  <select
                    className="orion-builder-field-input"
                    value={canonicalVariant || 'manual'}
                    onChange={(event) => {
                      const nextVariant = event.target.value;
                      updateSelectedCanonicalNode((current) => ({
                        ...current,
                        type: 'trigger',
                        variant: nextVariant,
                        config: resetCanonicalConfigForVariant('trigger', nextVariant, ensureRecord(current.config)),
                      }));
                    }}
                  >
                    <option value="manual">Manual</option>
                    <option value="connector_event">Connector event</option>
                    <option value="schedule">Schedule</option>
                    <option value="webhook">Webhook</option>
                    <option value="workflow">Workflow</option>
                    <option value="file_watch">File / folder</option>
                  </select>
                </label>

                {canonicalVariant === 'connector_event' ? (
                  <>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Connector</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(config.connector || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            connector: event.target.value,
                            event: '',
                          },
                        }))}
                      >
                        <option value="">Choose connector</option>
                        {connectorManifests.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Event</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(config.event || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            event: event.target.value,
                          },
                        }))}
                        disabled={!String(config.connector || '').trim()}
                      >
                        <option value="">{String(config.connector || '').trim() ? 'Choose event' : 'Choose connector first'}</option>
                        {triggerEvents.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {canonicalVariant === 'schedule' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Cron</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(ensureRecord(config.schedule).cron || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          schedule: {
                            ...ensureRecord(ensureRecord(current.config).schedule),
                            cron: event.target.value,
                          },
                        },
                      }))}
                      placeholder="0 9 * * 1-5"
                    />
                  </label>
                ) : null}

                {canonicalVariant === 'webhook' ? (
                  <>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Path</span>
                      <input
                        className="orion-builder-field-input"
                        value={String(ensureRecord(config.webhook).path || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            webhook: {
                              ...ensureRecord(ensureRecord(current.config).webhook),
                              path: event.target.value,
                            },
                          },
                        }))}
                        placeholder="/hooks/lead"
                      />
                    </label>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Method</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(ensureRecord(config.webhook).method || 'POST').trim().toUpperCase()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            webhook: {
                              ...ensureRecord(ensureRecord(current.config).webhook),
                              method: event.target.value,
                            },
                          },
                        }))}
                      >
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                      </select>
                    </label>
                  </>
                ) : null}

                {canonicalVariant === 'workflow' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Workflow</span>
                    <select
                      className="orion-builder-field-input"
                      value={String(config.workflow_id || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          workflow_id: event.target.value,
                        },
                      }))}
                    >
                      <option value="">Choose workflow</option>
                      {availableSubflowTargetsForInspector.map((item) => (
                        <option key={item.id} value={item.id}>{item.name || item.id}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {canonicalVariant === 'file_watch' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Watch path</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(ensureRecord(config.file_watch).path || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          file_watch: {
                            ...ensureRecord(ensureRecord(current.config).file_watch),
                            path: event.target.value,
                          },
                        },
                      }))}
                      placeholder="/watch/invoices"
                    />
                  </label>
                ) : null}
              </div>
            </>
          ) : null}

          {canonicalType === 'agent' ? (
            <>
              {renderAgentInspectorSection('identity', 'Identity', (
                <>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Name</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(agentIdentity.name || '')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          identity: {
                            ...ensureRecord(ensureRecord(current.config).identity),
                            name: event.target.value,
                          },
                        },
                      }))}
                      placeholder="Agent"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Role</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(agentIdentity.role || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          identity: {
                            ...ensureRecord(ensureRecord(current.config).identity),
                            role: event.target.value,
                          },
                        },
                      }))}
                      placeholder="Support agent"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Goal</span>
                    <textarea
                      className="orion-builder-field-input is-textarea"
                      value={String(agentIdentity.goal || '')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          identity: {
                            ...ensureRecord(ensureRecord(current.config).identity),
                            goal: event.target.value,
                          },
                        },
                      }))}
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Success condition</span>
                    <textarea
                      className="orion-builder-field-input is-textarea"
                      value={String(agentIdentity.success_condition || '')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          identity: {
                            ...ensureRecord(ensureRecord(current.config).identity),
                            success_condition: event.target.value,
                          },
                        },
                      }))}
                      placeholder="Classify and route the request"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Output contract</span>
                    <textarea
                      className="orion-builder-field-input is-textarea"
                      value={String(agentIdentity.output_contract || '')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          identity: {
                            ...ensureRecord(ensureRecord(current.config).identity),
                            output_contract: event.target.value,
                          },
                        },
                      }))}
                      placeholder="Structured output, checklist, or handoff contract"
                    />
                  </label>
                </>
              ))}

              {renderAgentInspectorSection('runtime', 'Runtime', (
                <>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Provider profile</span>
                    <select
                      className="orion-builder-field-input"
                      value={currentProviderProfileId}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            provider_profile_id: event.target.value || null,
                          },
                        },
                      }))}
                    >
                      <option value="">Automatic</option>
                      {runtimeProfileEntries.map((profile) => (
                        <option key={`${profile.provider}:${profile.id}`} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Model</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(agentRuntime.model || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            model: event.target.value,
                          },
                        },
                      }))}
                      placeholder="gpt-5.4-mini"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Execution target</span>
                    <select
                      className="orion-builder-field-input"
                      value={String(agentRuntime.execution_target || 'auto').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            execution_target: normalizeExecutionTarget(event.target.value),
                          },
                        },
                      }))}
                    >
                      <option value="auto">Automatic</option>
                      <option value="cloud">Cloud</option>
                      <option value="local_companion">Local</option>
                    </select>
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Timeout (sec)</span>
                    <input
                      type="number"
                      min={0}
                      className="orion-builder-field-input"
                      value={String(agentRuntime.timeout_seconds ?? 300)}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            timeout_seconds: Number(event.target.value || 0),
                          },
                        },
                      }))}
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Token budget</span>
                    <input
                      type="number"
                      min={0}
                      className="orion-builder-field-input"
                      value={agentRuntime.token_budget == null ? '' : String(agentRuntime.token_budget)}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            token_budget: event.target.value ? Number(event.target.value) : null,
                          },
                        },
                      }))}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Retry policy</span>
                    <input
                      type="number"
                      min={0}
                      className="orion-builder-field-input"
                      value={String(ensureRecord(agentRuntime.retry_policy).max_attempts ?? 1)}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          runtime: {
                            ...ensureRecord(ensureRecord(current.config).runtime),
                            retry_policy: {
                              ...ensureRecord(ensureRecord(ensureRecord(current.config).runtime).retry_policy),
                              max_attempts: Number(event.target.value || 0),
                            },
                          },
                        },
                      }))}
                    />
                  </label>
                </>
              ))}

              {renderAgentInspectorSection('skills', 'Skills', (
                <>
                  <div className="orion-builder-array-editor">
                    {normalizeStringList(agentSkills.skill_bundle_ids).map((skillId, index) => (
                      <div key={`skill-${skillId}-${index}`} className="orion-builder-array-row">
                        <div className="orion-builder-array-copy">
                          <div className="orion-builder-selected-label">{skillId}</div>
                        </div>
                        <button
                          type="button"
                          className="orion-btn ghost sm"
                          onClick={() => updateSelectedCanonicalNode((current) => {
                            const currentSkills = ensureRecord(ensureRecord(current.config).skills);
                            return {
                              ...current,
                              config: {
                                ...ensureRecord(current.config),
                                skills: {
                                  ...currentSkills,
                                  skill_bundle_ids: removeStringAtIndex(
                                    normalizeStringList(currentSkills.skill_bundle_ids),
                                    index,
                                  ),
                                },
                              },
                            };
                          })}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Add skill bundle ID</span>
                    <div className="orion-builder-inline-input">
                      <input
                        className="orion-builder-field-input"
                        value={agentSkillDraft}
                        onChange={(event) => setAgentSkillDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          const nextValue = agentSkillDraft.trim();
                          if (!nextValue) return;
                          updateSelectedCanonicalNode((current) => {
                            const currentSkills = ensureRecord(ensureRecord(current.config).skills);
                            return {
                              ...current,
                              config: {
                                ...ensureRecord(current.config),
                                skills: {
                                  ...currentSkills,
                                  skill_bundle_ids: toggleStringList(
                                    normalizeStringList(currentSkills.skill_bundle_ids),
                                    nextValue,
                                    true,
                                  ),
                                },
                              },
                            };
                          });
                          setAgentSkillDraft('');
                        }}
                        placeholder="customer-ops"
                      />
                      <button
                        type="button"
                        className="orion-btn secondary sm"
                        onClick={() => {
                          const nextValue = agentSkillDraft.trim();
                          if (!nextValue) return;
                          updateSelectedCanonicalNode((current) => {
                            const currentSkills = ensureRecord(ensureRecord(current.config).skills);
                            return {
                              ...current,
                              config: {
                                ...ensureRecord(current.config),
                                skills: {
                                  ...currentSkills,
                                  skill_bundle_ids: toggleStringList(
                                    normalizeStringList(currentSkills.skill_bundle_ids),
                                    nextValue,
                                    true,
                                  ),
                                },
                              },
                            };
                          });
                          setAgentSkillDraft('');
                        }}
                        disabled={!agentSkillDraft.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </label>
                </>
              ))}

              {renderAgentInspectorSection('tools', 'Tools', (
                <>
                  <div className="orion-builder-field">
                    <span className="orion-builder-field-label">Dynamic allowed</span>
                    <div className="orion-builder-checkbox-grid">
                      {toolOptionItems.map((item) => (
                        <label key={`dynamic-${item.tool_id}`} className="orion-builder-checkbox-option">
                          <input
                            type="checkbox"
                            checked={normalizeStringList(agentTools.dynamic_allowed).includes(item.tool_id)}
                            onChange={(event) => updateSelectedCanonicalNode((current) => {
                              const currentTools = ensureRecord(ensureRecord(current.config).tools);
                              return {
                                ...current,
                                config: {
                                  ...ensureRecord(current.config),
                                  tools: {
                                    ...currentTools,
                                    dynamic_allowed: toggleStringList(
                                      normalizeStringList(currentTools.dynamic_allowed),
                                      item.tool_id,
                                      event.target.checked,
                                    ),
                                  },
                                },
                              };
                            })}
                          />
                          <span className="orion-builder-checkbox-copy">
                            <span className="orion-builder-selected-label">{item.tool_id}</span>
                            {item.description ? <span className="orion-builder-copy">{item.description}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="orion-builder-field">
                    <span className="orion-builder-field-label">Explicit required</span>
                    <div className="orion-builder-checkbox-grid">
                      {toolOptionItems.map((item) => (
                        <label key={`required-${item.tool_id}`} className="orion-builder-checkbox-option">
                          <input
                            type="checkbox"
                            checked={normalizeStringList(agentTools.explicit_required).includes(item.tool_id)}
                            onChange={(event) => updateSelectedCanonicalNode((current) => {
                              const currentTools = ensureRecord(ensureRecord(current.config).tools);
                              return {
                                ...current,
                                config: {
                                  ...ensureRecord(current.config),
                                  tools: {
                                    ...currentTools,
                                    explicit_required: toggleStringList(
                                      normalizeStringList(currentTools.explicit_required),
                                      item.tool_id,
                                      event.target.checked,
                                    ),
                                  },
                                },
                              };
                            })}
                          />
                          <span className="orion-builder-checkbox-copy">
                            <span className="orion-builder-selected-label">{item.tool_id}</span>
                            {item.description ? <span className="orion-builder-copy">{item.description}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              ))}

              {renderAgentInspectorSection('memory', 'Memory', (
                <>
                  <div className="orion-builder-field">
                    <span className="orion-builder-field-label">Read scopes</span>
                    <div className="orion-builder-checkbox-grid is-compact">
                      {MEMORY_SCOPE_OPTIONS.map((scope) => (
                        <label key={`memory-read-${scope}`} className="orion-builder-checkbox-option is-compact">
                          <input
                            type="checkbox"
                            checked={normalizeStringList(agentMemory.read_scopes).includes(scope)}
                            onChange={(event) => updateSelectedCanonicalNode((current) => {
                              const currentMemory = ensureRecord(ensureRecord(current.config).memory);
                              return {
                                ...current,
                                config: {
                                  ...ensureRecord(current.config),
                                  memory: {
                                    ...currentMemory,
                                    read_scopes: toggleStringList(
                                      normalizeStringList(currentMemory.read_scopes),
                                      scope,
                                      event.target.checked,
                                    ),
                                  },
                                },
                              };
                            })}
                          />
                          <span className="orion-builder-selected-label">{scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="orion-builder-field">
                    <span className="orion-builder-field-label">Write scopes</span>
                    <div className="orion-builder-checkbox-grid is-compact">
                      {MEMORY_SCOPE_OPTIONS.map((scope) => (
                        <label key={`memory-write-${scope}`} className="orion-builder-checkbox-option is-compact">
                          <input
                            type="checkbox"
                            checked={normalizeStringList(agentMemory.write_scopes).includes(scope)}
                            onChange={(event) => updateSelectedCanonicalNode((current) => {
                              const currentMemory = ensureRecord(ensureRecord(current.config).memory);
                              return {
                                ...current,
                                config: {
                                  ...ensureRecord(current.config),
                                  memory: {
                                    ...currentMemory,
                                    write_scopes: toggleStringList(
                                      normalizeStringList(currentMemory.write_scopes),
                                      scope,
                                      event.target.checked,
                                    ),
                                  },
                                },
                              };
                            })}
                          />
                          <span className="orion-builder-selected-label">{scope}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Retrieval policy</span>
                    <select
                      className="orion-builder-field-input"
                      value={String(agentMemory.retrieval_policy || 'recent').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          memory: {
                            ...ensureRecord(ensureRecord(current.config).memory),
                            retrieval_policy: event.target.value,
                          },
                        },
                      }))}
                    >
                      {MEMORY_RETRIEVAL_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Retention</span>
                    <select
                      className="orion-builder-field-input"
                      value={retentionMode}
                      onChange={(event) => updateSelectedCanonicalNode((current) => {
                        const currentMemory = ensureRecord(ensureRecord(current.config).memory);
                        return {
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            memory: {
                              ...currentMemory,
                              retention: event.target.value === 'custom_days' ? { ...ensureRecord(currentMemory.retention), retention_days: 30 } : {},
                            },
                          },
                        };
                      })}
                    >
                      <option value="default">Default retention</option>
                      <option value="custom_days">Custom days</option>
                    </select>
                  </label>
                  {retentionMode === 'custom_days' ? (
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Retention days</span>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        className="orion-builder-field-input"
                        value={Number.isFinite(retentionDaysValue) && retentionDaysValue > 0 ? String(retentionDaysValue) : ''}
                        onChange={(event) => updateSelectedCanonicalNode((current) => {
                          const currentMemory = ensureRecord(ensureRecord(current.config).memory);
                          const nextValue = event.target.value;
                          return {
                            ...current,
                            config: {
                              ...ensureRecord(current.config),
                              memory: {
                                ...currentMemory,
                                retention: {
                                  ...ensureRecord(currentMemory.retention),
                                  retention_days: nextValue ? Number(nextValue) : null,
                                },
                              },
                            },
                          };
                        })}
                      />
                    </label>
                  ) : null}
                </>
              ))}

              {renderAgentInspectorSection('connectors', 'Connectors', (
                <>
                  <div className="orion-builder-array-editor">
                    {connectorBindings
                      .filter((item) => isRecord(item))
                      .map((binding, index) => {
                        const connectorId = String(binding.connector_id || '').trim();
                        return (
                          <div key={`binding-${connectorId || 'new'}-${index}`} className="orion-builder-array-card">
                            <label className="orion-builder-field">
                              <span className="orion-builder-field-label">Connector</span>
                              <select
                                className="orion-builder-field-input"
                                value={connectorId}
                                onChange={(event) => updateSelectedCanonicalNode((current) => {
                                  const currentConfig = ensureRecord(current.config);
                                  const currentConnectors = ensureRecord(currentConfig.connectors);
                                  const currentBindings = Array.isArray(currentConnectors.bindings)
                                    ? currentConnectors.bindings.filter((item) => isRecord(item))
                                    : [];
                                  return {
                                    ...current,
                                    config: {
                                      ...currentConfig,
                                      connectors: {
                                        ...currentConnectors,
                                        bindings: currentBindings.map((item, itemIndex) => (
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                connector_id: event.target.value,
                                              }
                                            : item
                                        )),
                                      },
                                    },
                                  };
                                })}
                              >
                                <option value="">Choose connector</option>
                                {connectorBindingOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="orion-builder-field">
                              <span className="orion-builder-field-label">Binding ID</span>
                              <input
                                className="orion-builder-field-input"
                                value={String(binding.binding_id || '')}
                                onChange={(event) => updateSelectedCanonicalNode((current) => {
                                  const currentConfig = ensureRecord(current.config);
                                  const currentConnectors = ensureRecord(currentConfig.connectors);
                                  const currentBindings = Array.isArray(currentConnectors.bindings)
                                    ? currentConnectors.bindings.filter((item) => isRecord(item))
                                    : [];
                                  return {
                                    ...current,
                                    config: {
                                      ...currentConfig,
                                      connectors: {
                                        ...currentConnectors,
                                        bindings: currentBindings.map((item, itemIndex) => (
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                binding_id: event.target.value || null,
                                              }
                                            : item
                                        )),
                                      },
                                    },
                                  };
                                })}
                                placeholder="Optional"
                              />
                            </label>
                            <label className="orion-builder-field">
                              <span className="orion-builder-field-label">Resource</span>
                              <input
                                className="orion-builder-field-input"
                                value={String(binding.resource || '')}
                                onChange={(event) => updateSelectedCanonicalNode((current) => {
                                  const currentConfig = ensureRecord(current.config);
                                  const currentConnectors = ensureRecord(currentConfig.connectors);
                                  const currentBindings = Array.isArray(currentConnectors.bindings)
                                    ? currentConnectors.bindings.filter((item) => isRecord(item))
                                    : [];
                                  return {
                                    ...current,
                                    config: {
                                      ...currentConfig,
                                      connectors: {
                                        ...currentConnectors,
                                        bindings: currentBindings.map((item, itemIndex) => (
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                resource: event.target.value || null,
                                              }
                                            : item
                                        )),
                                      },
                                    },
                                  };
                                })}
                                placeholder="Optional"
                              />
                            </label>
                            <div className="orion-builder-array-actions">
                              <button
                                type="button"
                                className="orion-btn ghost sm"
                                onClick={() => updateSelectedCanonicalNode((current) => {
                                  const currentConfig = ensureRecord(current.config);
                                  const currentConnectors = ensureRecord(currentConfig.connectors);
                                  const currentBindings = Array.isArray(currentConnectors.bindings)
                                    ? currentConnectors.bindings.filter((item) => isRecord(item))
                                    : [];
                                  return {
                                    ...current,
                                    config: {
                                      ...currentConfig,
                                      connectors: {
                                        ...currentConnectors,
                                        bindings: currentBindings.filter((_, itemIndex) => itemIndex !== index),
                                      },
                                    },
                                  };
                                })}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                  <button
                    type="button"
                    className="orion-btn secondary sm"
                    onClick={() => updateSelectedCanonicalNode((current) => {
                      const currentConfig = ensureRecord(current.config);
                      const currentConnectors = ensureRecord(currentConfig.connectors);
                      const currentBindings = Array.isArray(currentConnectors.bindings)
                        ? currentConnectors.bindings.filter((item) => isRecord(item))
                        : [];
                      const nextConnectorId = connectorManifests.find((manifest) => !currentBindings.some((item) => String(item.connector_id || '').trim() === manifest.id))?.id
                        || connectorBindingOptions[0]?.id
                        || '';
                      return {
                        ...current,
                        config: {
                          ...currentConfig,
                          connectors: {
                            ...currentConnectors,
                            bindings: [
                              ...currentBindings,
                              {
                                connector_id: nextConnectorId,
                                binding_id: null,
                                resource: null,
                              },
                            ],
                          },
                        },
                      };
                    })}
                    disabled={connectorBindingOptions.length === 0}
                  >
                    Add binding
                  </button>
                </>
              ))}

              {renderAgentInspectorSection('permissions', 'Permissions', (
                <>
                  <div className="orion-builder-inspector">
                    <div className="orion-builder-inspector-title">Trust summary</div>
                    <div className="orion-builder-inspector-grid">
                      <div className="orion-builder-inspector-item">
                        <div className="orion-builder-field-label">Preset</div>
                        <div className="orion-builder-field-readonly">{formatTrustPresetLabel(trustPreset)}</div>
                      </div>
                      <div className="orion-builder-inspector-item">
                        <div className="orion-builder-field-label">Action policy</div>
                        <div className="orion-builder-field-readonly">
                          {ACTION_POLICY_OPTIONS.find((option) => option.value === String(permissions.action_policy || 'guarded').trim())?.label || 'Guarded'}
                        </div>
                      </div>
                      <div className="orion-builder-inspector-item">
                        <div className="orion-builder-field-label">Browser access</div>
                        <div className="orion-builder-field-readonly">
                          {Boolean(browserPermissions.allow)
                            ? rememberedGrants.browser_session
                              ? 'Automation + remembered session'
                              : 'Automation allowed'
                            : 'Off'}
                        </div>
                      </div>
                      <div className="orion-builder-inspector-item">
                        <div className="orion-builder-field-label">Machine root</div>
                        <div className="orion-builder-field-readonly">
                          {resolveBuilderFileMountGrants(permissions.file_mount_grants).find((item) => item.mount === 'local_root')?.grant !== 'none'
                            ? 'Enabled'
                            : 'Blocked'}
                        </div>
                      </div>
                      <div className="orion-builder-inspector-item is-wide">
                        <div className="orion-builder-field-label">Remembered grants</div>
                        <div className="orion-builder-field-readonly is-block">
                          {rememberedGrants.folders.length === 0 && !rememberedGrants.browser_session && rememberedGrants.shell_capabilities.length === 0
                            ? 'No remembered desktop grants.'
                            : [
                                rememberedGrants.folders.length > 0 ? `${rememberedGrants.folders.length} folder grant${rememberedGrants.folders.length === 1 ? '' : 's'}` : null,
                                rememberedGrants.browser_session ? 'browser session' : null,
                                rememberedGrants.shell_capabilities.length > 0 ? `${rememberedGrants.shell_capabilities.length} shell capability grant${rememberedGrants.shell_capabilities.length === 1 ? '' : 's'}` : null,
                              ].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Trust preset</span>
                    <select
                      className="orion-builder-field-input"
                      value={trustPreset}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            trust_preset: event.target.value,
                          },
                        },
                      }))}
                    >
                      {TRUST_PRESET_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Action policy</span>
                    <select
                      className="orion-builder-field-input"
                      value={String(permissions.action_policy || 'guarded').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            action_policy: event.target.value,
                          },
                        },
                      }))}
                    >
                      {ACTION_POLICY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="orion-builder-field">
                    <span className="orion-builder-field-label">Connector permissions</span>
                    <div className="orion-builder-checkbox-grid is-compact">
                      {connectorManifests.map((manifest) => (
                        <label key={`permission-${manifest.id}`} className="orion-builder-checkbox-option is-compact">
                          <input
                            type="checkbox"
                            checked={connectorPermissions.includes(manifest.id)}
                            onChange={(event) => updateSelectedCanonicalNode((current) => {
                              const currentPermissions = ensureRecord(ensureRecord(current.config).permissions);
                              return {
                                ...current,
                                config: {
                                  ...ensureRecord(current.config),
                                  permissions: {
                                    ...currentPermissions,
                                    connector_permissions: toggleStringList(
                                      normalizeStringList(currentPermissions.connector_permissions),
                                      manifest.id,
                                      event.target.checked,
                                    ),
                                  },
                                },
                              };
                            })}
                          />
                          <span className="orion-builder-selected-label">{manifest.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <label className="orion-builder-copy">
                    <input
                      type="checkbox"
                      checked={Boolean(browserPermissions.allow)}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            browser_permissions: {
                              ...ensureRecord(ensureRecord(ensureRecord(current.config).permissions).browser_permissions),
                              allow: event.target.checked,
                            },
                          },
                        },
                      }))}
                    />
                    {' '}Allow browser automation
                  </label>
                  <label className="orion-builder-copy">
                    <input
                      type="checkbox"
                      checked={rememberedGrants.browser_session}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            remembered_grants: {
                              ...normalizeBuilderRememberedGrants(ensureRecord(ensureRecord(current.config).permissions).remembered_grants),
                              browser_session: event.target.checked,
                            },
                          },
                        },
                      }))}
                    />
                    {' '}Remember browser session access on this machine
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Remembered folders</span>
                    <input
                      className="orion-builder-field-input"
                      value={rememberedGrants.folders.join(', ')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            remembered_grants: {
                              ...normalizeBuilderRememberedGrants(ensureRecord(ensureRecord(current.config).permissions).remembered_grants),
                              folders: normalizeCsvList(event.target.value),
                            },
                          },
                        },
                      }))}
                      placeholder="/Users/mansur/Downloads, /Users/mansur/Documents"
                    />
                  </label>
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Remembered shell capabilities</span>
                    <input
                      className="orion-builder-field-input"
                      value={rememberedGrants.shell_capabilities.join(', ')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          permissions: {
                            ...ensureRecord(ensureRecord(current.config).permissions),
                            remembered_grants: {
                              ...normalizeBuilderRememberedGrants(ensureRecord(ensureRecord(current.config).permissions).remembered_grants),
                              shell_capabilities: normalizeCsvList(event.target.value),
                            },
                          },
                        },
                      }))}
                      placeholder="stack.status, file.convert"
                    />
                  </label>
                  <div className="orion-builder-inspector-grid">
                    {resolveBuilderFileMountGrants(permissions.file_mount_grants).map((item) => (
                      <label key={item.mount} className="orion-builder-field">
                        <span className="orion-builder-field-label">{item.mount}</span>
                        <select
                          className="orion-builder-field-input"
                          value={item.grant}
                          onChange={(event) => {
                            const next = resolveBuilderFileMountGrants(permissions.file_mount_grants).map((entry) => (
                              entry.mount === item.mount ? { ...entry, grant: event.target.value } : entry
                            ));
                            updateSelectedCanonicalNode((current) => ({
                              ...current,
                              config: {
                                ...ensureRecord(current.config),
                                permissions: {
                                  ...ensureRecord(ensureRecord(current.config).permissions),
                                  file_mount_grants: next,
                                },
                              },
                            }));
                          }}
                        >
                          {FILE_GRANT_OPTIONS.map((grant) => (
                            <option key={grant} value={grant}>{grant}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              ))}
            </>
          ) : null}

          {canonicalType === 'tool' ? (
            <>
              <div className="orion-builder-inspector">
                <div className="orion-builder-inspector-title">Tool</div>
                <label className="orion-builder-field">
                  <span className="orion-builder-field-label">Variant</span>
                  <select
                    className="orion-builder-field-input"
                    value={canonicalVariant || 'connector_action'}
                    onChange={(event) => {
                      const nextVariant = event.target.value;
                      updateSelectedCanonicalNode((current) => ({
                        ...current,
                        type: 'tool',
                        variant: nextVariant,
                        config: resetCanonicalConfigForVariant('tool', nextVariant, ensureRecord(current.config)),
                      }));
                    }}
                  >
                    <option value="connector_action">Connector action</option>
                    <option value="http">HTTP</option>
                    <option value="browser">Browser</option>
                    <option value="file">File</option>
                    <option value="shell">Shell</option>
                    <option value="document">Document</option>
                    <option value="spreadsheet">Spreadsheet</option>
                    <option value="code">Code</option>
                  </select>
                </label>
                <label className="orion-builder-field">
                  <span className="orion-builder-field-label">Summary</span>
                  <input
                    className="orion-builder-field-input"
                    value={String(config.summary || '').trim()}
                    onChange={(event) => updateSelectedCanonicalNode((current) => ({
                      ...current,
                      config: {
                        ...ensureRecord(current.config),
                        summary: event.target.value,
                      },
                    }))}
                    placeholder="What this tool does"
                  />
                </label>
                <label className="orion-builder-field">
                  <span className="orion-builder-field-label">Execution target</span>
                  <select
                    className="orion-builder-field-input"
                    value={String(config.execution_target || (canonicalVariant === 'shell' ? 'local_companion' : 'auto')).trim()}
                    onChange={(event) => updateSelectedCanonicalNode((current) => ({
                      ...current,
                      config: {
                        ...ensureRecord(current.config),
                        execution_target: normalizeExecutionTarget(event.target.value),
                      },
                    }))}
                  >
                    <option value="auto">Automatic</option>
                    <option value="cloud">Cloud</option>
                    <option value="local_companion">Local</option>
                  </select>
                </label>

                {canonicalVariant === 'connector_action' ? (
                  <>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Connector</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(config.connector || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            connector: event.target.value,
                            action_id: '',
                          },
                        }))}
                      >
                        <option value="">Choose connector</option>
                        {connectorManifests.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Action</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(config.action_id || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            action_id: event.target.value,
                          },
                        }))}
                        disabled={!String(config.connector || '').trim()}
                      >
                        <option value="">{String(config.connector || '').trim() ? 'Choose action' : 'Choose connector first'}</option>
                        {toolActions.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                {canonicalVariant === 'http' ? (
                  <>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">Method</span>
                      <select
                        className="orion-builder-field-input"
                        value={String(config.method || 'GET').trim().toUpperCase()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            method: event.target.value,
                          },
                        }))}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </label>
                    <label className="orion-builder-field">
                      <span className="orion-builder-field-label">URL</span>
                      <input
                        className="orion-builder-field-input"
                        value={String(config.url || '').trim()}
                        onChange={(event) => updateSelectedCanonicalNode((current) => ({
                          ...current,
                          config: {
                            ...ensureRecord(current.config),
                            url: event.target.value,
                          },
                        }))}
                        placeholder="https://api.example.com"
                      />
                    </label>
                  </>
                ) : null}

                {canonicalVariant === 'shell' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Command</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(config.command || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          command: event.target.value,
                        },
                      }))}
                      placeholder="ls -la"
                    />
                  </label>
                ) : null}

                {canonicalVariant === 'browser' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">URL</span>
                    <input
                      className="orion-builder-field-input"
                      value={String(config.url || '').trim()}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          url: event.target.value,
                        },
                      }))}
                      placeholder="https://example.com"
                    />
                  </label>
                ) : null}

                {canonicalVariant === 'code' ? (
                  <label className="orion-builder-field">
                    <span className="orion-builder-field-label">Code</span>
                    <textarea
                      className="orion-builder-field-input is-textarea code"
                      value={String(config.code || '')}
                      onChange={(event) => updateSelectedCanonicalNode((current) => ({
                        ...current,
                        config: {
                          ...ensureRecord(current.config),
                          code: event.target.value,
                        },
                      }))}
                    />
                  </label>
                ) : null}
              </div>

              {renderFileMountGrantFields(permissions.file_mount_grants, (next) => updateSelectedCanonicalNode((current) => ({
                ...current,
                config: {
                  ...ensureRecord(current.config),
                  permissions: {
                    ...ensureRecord(ensureRecord(current.config).permissions),
                    file_mount_grants: next,
                  },
                },
              })))}
            </>
          ) : null}

          {canonicalType === 'human' ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Human step</div>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Variant</span>
                <select
                  className="orion-builder-field-input"
                  value={canonicalVariant || 'approval'}
                  onChange={(event) => {
                    const nextVariant = event.target.value;
                    updateSelectedCanonicalNode((current) => ({
                      ...current,
                      type: 'human',
                      variant: nextVariant,
                      config: resetCanonicalConfigForVariant('human', nextVariant, ensureRecord(current.config)),
                    }));
                  }}
                >
                  <option value="approval">Approval</option>
                  <option value="review">Review</option>
                  <option value="wait_for_reply">Wait for reply</option>
                </select>
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Instructions</span>
                <textarea
                  className="orion-builder-field-input is-textarea"
                  value={String(config.instructions || '')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      instructions: event.target.value,
                    },
                  }))}
                />
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Decision options</span>
                <input
                  className="orion-builder-field-input"
                  value={normalizeStringList(config.decision_options).join(', ')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      decision_options: normalizeCsvList(event.target.value),
                    },
                  }))}
                  placeholder="approve, reject"
                />
              </label>
            </div>
          ) : null}

          {canonicalType === 'decision' ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Decision</div>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Variant</span>
                <select
                  className="orion-builder-field-input"
                  value={canonicalVariant || 'if_else'}
                  onChange={(event) => {
                    const nextVariant = event.target.value;
                    updateSelectedCanonicalNode((current) => ({
                      ...current,
                      type: 'decision',
                      variant: nextVariant,
                      config: resetCanonicalConfigForVariant('decision', nextVariant, ensureRecord(current.config)),
                    }));
                  }}
                >
                  <option value="if_else">If / else</option>
                  <option value="classifier">Classifier</option>
                  <option value="field_router">Field router</option>
                </select>
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Expression</span>
                <textarea
                  className="orion-builder-field-input is-textarea"
                  value={String(config.expression || '')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      expression: event.target.value,
                    },
                  }))}
                />
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Routes</span>
                <input
                  className="orion-builder-field-input"
                  value={normalizeStringList(config.routes).join(', ')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      routes: normalizeCsvList(event.target.value),
                    },
                  }))}
                  placeholder="high, medium, low"
                />
              </label>
            </div>
          ) : null}

          {canonicalType === 'data' ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Data step</div>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Variant</span>
                <select
                  className="orion-builder-field-input"
                  value={canonicalVariant || 'transform'}
                  onChange={(event) => {
                    const nextVariant = event.target.value;
                    updateSelectedCanonicalNode((current) => ({
                      ...current,
                      type: 'data',
                      variant: nextVariant,
                      config: resetCanonicalConfigForVariant('data', nextVariant, ensureRecord(current.config)),
                    }));
                  }}
                >
                  <option value="transform">Transform</option>
                  <option value="compose">Compose</option>
                  <option value="validate">Validate</option>
                </select>
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Mapping</span>
                <textarea
                  className="orion-builder-field-input is-textarea"
                  value={String(config.mapping || '')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      mapping: event.target.value,
                    },
                  }))}
                />
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Template</span>
                <textarea
                  className="orion-builder-field-input is-textarea"
                  value={String(config.template || '')}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      template: event.target.value,
                    },
                  }))}
                />
              </label>
            </div>
          ) : null}

          {canonicalType === 'subflow' ? (
            <div className="orion-builder-inspector">
              <div className="orion-builder-inspector-title">Subflow</div>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Workflow</span>
                <select
                  className="orion-builder-field-input"
                  value={String(config.workflow_id || '').trim()}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      workflow_id: event.target.value,
                    },
                  }))}
                >
                  <option value="">Choose workflow</option>
                  {availableSubflowTargetsForInspector.map((item) => (
                    <option key={item.id} value={item.id}>{item.name || item.id}</option>
                  ))}
                </select>
              </label>
              <label className="orion-builder-field">
                <span className="orion-builder-field-label">Mode</span>
                <select
                  className="orion-builder-field-input"
                  value={String(config.mode || 'sync').trim()}
                  onChange={(event) => updateSelectedCanonicalNode((current) => ({
                    ...current,
                    config: {
                      ...ensureRecord(current.config),
                      mode: event.target.value,
                    },
                  }))}
                >
                  <option value="sync">Sync</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </aside>
    );
  })() : null;

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
            <div ref={canvasHostRef} className={`orion-builder-canvas-frame ${assistantDockOpen || showInspectorDock ? 'has-preview-dock' : ''}`.trim()}>
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

              {inspectorDock}

              {assistantDockOpen ? (
                <aside className="orion-builder-preview-dock is-floating">
                <div className="orion-builder-preview-head">
                  <div className="orion-builder-preview-head-copy">
                    <div className="orion-builder-preview-title">Build with AI</div>
                    <div className="orion-builder-preview-subtitle">
                      Describe the workflow, tools, approvals, and outcome you want, and Platform will draft the canvas.
                    </div>
                  </div>
                  <div className="orion-builder-preview-head-actions">
                    <button
                      type="button"
                      className="orion-builder-preview-reset"
                      onClick={() => setAiAssistantPrompt('')}
                      disabled={aiAssistantBusy}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="orion-builder-preview-close"
                      onClick={() => setAssistantDockOpen(false)}
                      aria-label="Close assistant"
                      disabled={aiAssistantBusy}
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
                      void handleAssistantApply();
                    }}
                >
                  <textarea
                    ref={aiAssistantInputRef}
                    className="orion-builder-preview-input"
                    value={aiAssistantPrompt}
                    onChange={(event) => setAiAssistantPrompt(event.target.value)}
                    placeholder="Describe the workflow to generate..."
                    disabled={aiAssistantBusy}
                  />
                  <button
                    type="submit"
                    className="orion-builder-preview-send"
                    disabled={!aiAssistantPrompt.trim() || aiAssistantBusy}
                    aria-label="Generate workflow draft"
                  >
                    {aiAssistantBusy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}
                  </button>
                </form>
                </aside>
              ) : null}

              {saveMessage || hasWorkflowValidationIssues ? (
                <div className="orion-builder-canvas-overlays">
                  {saveMessage ? (
                    <div className={`orion-builder-canvas-message ${saveState === 'error' ? 'is-error' : ''}`}>
                      <span>
                        {saveMessage}
                        {workflowNodeProgressSummary ? ` · ${workflowNodeProgressSummary}` : ''}
                      </span>
                      {messageRunId && saveState === 'saved' ? (
                        <button
                          type="button"
                          className="orion-builder-canvas-message-action"
                          onClick={() => router.push(`/runs/${encodeURIComponent(messageRunId)}/inspect?focus=workflow`)}
                        >
                          {OPEN_LIVE_RUN_LABEL}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {hasWorkflowValidationIssues ? (
                    <div className="orion-builder-canvas-validation">
                      <WorkflowValidationPanel
                        validation={workflowValidation}
                        nodeLabels={nodeLabels}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <ReactFlow
                style={{ width: '100%', height: '100%' }}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                nodes={renderedNodes}
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
                onNodeClick={(_, node) => {
                  setAssistantDockOpen(false);
                  setSelectedNodeId(String(node.id));
                  setSelectedEdgeId(null);
                  setNodeSearch(null);
                }}
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
