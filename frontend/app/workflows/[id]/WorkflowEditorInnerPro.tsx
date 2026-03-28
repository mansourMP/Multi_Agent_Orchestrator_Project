'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Code2, GitBranch, Globe, Hand, Loader2, Play, Rocket, Save, Search, Send, ShieldCheck, Shuffle, UploadCloud, X, Zap } from 'lucide-react';
import { ReactFlow, Controls, Background, BackgroundVariant, MarkerType, addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type EdgeTypes, type Node, type NodeChange, type NodeTypes, type ReactFlowInstance } from '@xyflow/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    fetchBuilderConnectorManifests,
    fetchWorkflows,
    createWorkflow,
    getWorkflow,
    publishWorkflow,
    updateWorkflow,
    type BuilderConnectorManifestItem,
    type WorkflowValidationSummary,
} from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
    AGENT_ROLE_OPTIONS,
    DEFAULT_MODEL_ALIAS_OPTIONS,
    DEFAULT_AGENT_ROLE_ID,
    isAgentRoleId,
    mapModelOptionsToAliases,
    normalizeProviderId,
    resolveModelAlias,
    type AgentRoleId,
    type ModelAliasOption,
} from '@/app/page.catalog';
import { BRAND } from '@/lib/brand';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { openAuthenticatedEventStream, type AuthenticatedEventStreamConnection } from '@/lib/authenticatedEventStream';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';
import {
    type ExecutionTarget,
    describeExecutionTarget,
    formatExecutionTargetLabel,
    hasOnlineLocalRuntime,
    normalizeExecutionTarget,
} from '@/lib/executionTargets';
import { buildRunStartedMessage, OPEN_LIVE_RUN_LABEL, RUN_WAITING_STATUS_COPY } from '@/lib/runStartCopy';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';
import { buildDefaultCanonicalConfig, resetCanonicalConfigForVariant } from '@/lib/workflowNodeDefaults';
import {
    formatWorkflowRunNodeStatusLabel,
    useWorkflowRunTelemetry,
    workflowRunNodeSummary,
} from '@/hooks/useWorkflowRunTelemetry';
import DoctorPreflightNotice from '@/components/orion/DoctorPreflightNotice';
import LocalRuntimeRecoveryCard from '@/components/orion/LocalRuntimeRecoveryCard';
import AgentNode from '@/components/nodes/AgentNode';
import TriggerNode from '@/components/nodes/TriggerNode';
import ActionNode from '@/components/nodes/ActionNode';
import HttpRequestNode from '@/components/nodes/HttpRequestNode';
import ConditionNode from '@/components/nodes/ConditionNode';
import TransformNode from '@/components/nodes/TransformNode';
import CodeNode from '@/components/nodes/CodeNode';
import SmoothConnectionLine from '@/components/nodes/SmoothConnectionLine';
import SmoothActionEdge, { type SmoothActionEdgeData } from '@/components/nodes/SmoothActionEdge';
import WorkflowValidationPanel from '@/components/workflows/WorkflowValidationPanel';

type RunStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'error';
type LogLevel = 'info' | 'warn' | 'error';
type ConnectionMode = 'byok' | 'managed';
type ProviderId = 'openai' | 'anthropic' | 'claude_code_cli' | 'gemini' | 'vertex';
type TrustMode = 'ask' | 'auto';

interface WorkflowEditorInnerProProps {
    workflowId?: string;
}

interface OperatorConfig {
    modelId: string;
    agentRole: AgentRoleId;
    duty: string;
    systemPrompt: string;
    userGoal: string;
}

interface ConnectionConfig {
    provider: ProviderId;
    mode: ConnectionMode;
    credentialId: string;
}

interface RunLogEntry {
    ts: string;
    level: LogLevel;
    message: string;
}

interface WorkflowShape {
    name?: string;
    workspaceId?: string;
    status?: string;
    definition?: {
        version?: string;
        nodes?: unknown[];
        edges?: unknown[];
        defaults?: Record<string, unknown>;
        resources?: Record<string, unknown>;
        policy?: Record<string, unknown>;
        meta?: Record<string, unknown>;
    };
    validation?: WorkflowValidationSummary;
}

interface ProviderInfo {
    id: string;
    label: string;
    auth: string[];
    auth_modes?: Array<{ id?: string; label?: string; secret_required?: boolean }>;
    default_auth_mode?: string;
    default_model?: string;
    note?: string;
}

interface VaultCredentialItem {
    id: string;
    label: string;
    provider: string;
    mode: string;
    workspace_id?: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
}

interface WorkflowConnectorItem {
    id: string;
    connector: string;
    metadata?: Record<string, unknown>;
}

interface RuntimeProfileRow {
    id: string;
    provider: string;
    label: string;
    model?: string | null;
    priority?: number;
    enabled: boolean;
    health?: string | null;
    created_at?: string;
}

interface StreamLogPayload {
    message?: string;
    level?: string;
    event?: string;
    data?: unknown;
}

interface MaskedUsageTelemetry {
    provider: string;
    model: string;
    input_tokens_est: number;
    output_tokens_est: number;
    total_tokens_est: number;
    cost_est_usd: number;
    cost_band: string;
}

interface AutopilotPack {
    id: string;
    label: string;
    goal: string;
    duty: string;
    prompt: string;
}

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

type TriggerCanvasData = {
    label: string;
    triggerType: TriggerKind;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

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

type ActionCanvasData = {
    label: string;
    actionType: ActionKind;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

type HttpRequestCanvasData = {
    label: string;
    method: string;
    url: string;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

type ConditionCanvasData = {
    label: string;
    condition: string;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

type TransformCanvasData = {
    label: string;
    mapping: string;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

type CodeCanvasData = {
    label: string;
    summary: string;
    code: string;
    status?: string;
    executionSummary?: string;
} & CanvasCompatibilityMeta;

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
type CanonicalInspectorNode = {
    canonicalType: CanonicalNodeType;
    canonicalVariant?: string;
    config: Record<string, unknown>;
    resources: Record<string, unknown>;
    policy: Record<string, unknown>;
};
type WorkflowListItem = {
    id: string;
    name?: string;
};
const CANVAS_NODE_X = 265;
const CANVAS_NODE_TOP = 50;
const CANVAS_NODE_GAP = 170;
const ACTION_POLICY_OPTIONS = [
    { value: 'guarded', label: 'Guarded' },
    { value: 'auto', label: 'Adaptive' },
    { value: 'strict', label: 'Strict' },
    { value: 'cost_guard', label: 'Cost guard' },
    { value: 'sensitive_guard', label: 'Sensitive guard' },
] as const;
const MEMORY_SCOPE_OPTIONS = ['session', 'project', 'profile'] as const;
const MEMORY_RETRIEVAL_OPTIONS = ['recent', 'pinned', 'semantic'] as const;
const FILE_MOUNT_OPTIONS = ['artifacts', 'project', 'shared', 'knowledge', 'local_root', 'connector_files'] as const;
const FILE_GRANT_OPTIONS = ['none', 'read', 'read_write', 'create_only', 'append_only'] as const;

const DEFAULT_OPERATOR: OperatorConfig = {
    modelId: 'gpt-4o-mini',
    agentRole: DEFAULT_AGENT_ROLE_ID,
    duty: 'Run workflows reliably, explain what is happening, and ask before risky actions.',
    systemPrompt: `You are the ${BRAND.assistant}. Be practical, concise, and transparent.`,
    userGoal: '',
};

const DEFAULT_CONNECTION: ConnectionConfig = {
    provider: 'openai',
    mode: 'managed',
    credentialId: '',
};

const AUTOPILOT_PACKS: AutopilotPack[] = [
    {
        id: 'inbox-triage',
        label: 'Inbox Triage',
        goal: 'Review incoming customer messages, classify urgency, and draft clear replies.',
        duty: 'Prioritize urgent customer issues first and keep replies concise and polite.',
        prompt: 'Act as a customer operations assistant. Triage incoming messages and prepare safe response drafts.',
    },
    {
        id: 'lead-followup',
        label: 'Lead Follow-up',
        goal: 'Follow up with warm leads and move them to a booked call or appointment.',
        duty: 'Keep follow-ups short, personalized, and focused on booking next steps.',
        prompt: 'Act as a growth assistant. Draft high-converting follow-ups with clear CTAs.',
    },
    {
        id: 'booking-helper',
        label: 'Booking Assistant',
        goal: 'Confirm availability, propose time slots, and guide customers to complete booking.',
        duty: 'Reduce back-and-forth by proposing clear options and confirming details.',
        prompt: 'Act as a scheduling assistant. Resolve booking requests quickly and accurately.',
    },
];

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
    icon: React.ReactNode;
    canonicalType?: CanonicalNodeType;
    canonicalVariant?: string;
    defaultData?: Partial<CanvasNodeData>;
};

const CANVAS_NODE_LIBRARY: CanvasLibraryItem[] = [
    {
        id: 'trigger',
        type: 'trigger',
        label: 'Trigger',
        accent: '#f59e0b',
        icon: <Play size={14} />,
        canonicalType: 'trigger',
        canonicalVariant: 'manual',
        defaultData: { label: 'Manual trigger', triggerType: 'manual' },
    },
    {
        id: 'agent',
        type: 'agent',
        label: 'Agent',
        accent: BRAND.accentColor,
        icon: <BrainCircuit size={14} />,
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
        accent: '#10b981',
        icon: <Send size={14} />,
        canonicalType: 'tool',
        canonicalVariant: 'connector_action',
        defaultData: { label: 'Tool action', actionType: 'connector_action' },
    },
    {
        id: 'http',
        type: 'http_request',
        label: 'HTTP',
        accent: '#6b7280',
        icon: <Globe size={14} />,
        canonicalType: 'tool',
        canonicalVariant: 'http',
        defaultData: { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' },
    },
    {
        id: 'human',
        type: 'action',
        label: 'Human',
        accent: '#f59e0b',
        icon: <Hand size={14} />,
        canonicalType: 'human',
        canonicalVariant: 'approval',
        defaultData: { label: 'Approval', actionType: 'approval' },
    },
    {
        id: 'decision',
        type: 'condition',
        label: 'Decision',
        accent: '#f59e0b',
        icon: <GitBranch size={14} />,
        canonicalType: 'decision',
        canonicalVariant: 'if_else',
        defaultData: { label: 'Decision', condition: 'Continue only when the required condition is true' },
    },
    {
        id: 'data',
        type: 'transform',
        label: 'Data',
        accent: '#3b82f6',
        icon: <Shuffle size={14} />,
        canonicalType: 'data',
        canonicalVariant: 'transform',
        defaultData: { label: 'Transform', mapping: 'Map fields to output payload' },
    },
    {
        id: 'subflow',
        type: 'action',
        label: 'Subflow',
        accent: '#8b5cf6',
        icon: <Rocket size={14} />,
        canonicalType: 'subflow',
        canonicalVariant: 'call_workflow',
        defaultData: { label: 'Call workflow', actionType: 'call_workflow' },
    },
    {
        id: 'code_tool',
        type: 'code',
        label: 'Code tool',
        accent: '#1f2937',
        icon: <Code2 size={14} />,
        canonicalType: 'tool',
        canonicalVariant: 'code',
        defaultData: { label: 'Code tool', summary: 'Run custom logic', code: 'return input;' },
    },
];

const CANVAS_NODE_GROUPS: Array<{ label: string; items: string[] }> = [
    { label: 'Triggers', items: ['trigger'] },
    { label: 'Agents', items: ['agent'] },
    { label: 'Tools', items: ['tool', 'http', 'code_tool'] },
    { label: 'Human', items: ['human'] },
    { label: 'Logic', items: ['decision'] },
    { label: 'Data', items: ['data'] },
    { label: 'Subflows', items: ['subflow'] },
];

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

function compactText(value: unknown, max = 160): string {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function normalizeCsvList(value: string): string[] {
    const seen = new Set<string>();
    return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
}

function ensureRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? structuredClone(value) : {};
}

function normalizeStringList(value: unknown, allowed?: readonly string[]): string[] {
    const items = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    return items
        .map((item) => String(item || '').trim())
        .filter((item) => {
            if (!item || seen.has(item)) return false;
            if (allowed && !allowed.includes(item)) return false;
            seen.add(item);
            return true;
        });
}

function toggleStringList(values: string[], token: string, enabled: boolean): string[] {
    const next = new Set(values);
    if (enabled) next.add(token);
    else next.delete(token);
    return Array.from(next);
}

function canvasTypeFromCanonicalNode(canonicalType: CanonicalNodeType, canonicalVariant?: string): CanvasNodeType {
    return deriveCanvasType({ type: canonicalType, variant: canonicalVariant }) || (canonicalType === 'tool' ? 'action' : canonicalType as CanvasNodeType);
}

function defaultGrantForMount(mount: typeof FILE_MOUNT_OPTIONS[number]): typeof FILE_GRANT_OPTIONS[number] {
    if (mount === 'artifacts') return 'read_write';
    if (mount === 'local_root') return 'none';
    return 'read';
}

function normalizeFileMountGrantRows(value: unknown): Array<{ mount: typeof FILE_MOUNT_OPTIONS[number]; grant: typeof FILE_GRANT_OPTIONS[number] }> {
    const entries = Array.isArray(value) ? value : [];
    return FILE_MOUNT_OPTIONS.map((mount) => {
        const match = entries.find((item) => isRecord(item) && String(item.mount || '').trim() === mount);
        const rawGrant = String((isRecord(match) ? match.grant : '') || '').trim();
        return {
            mount,
            grant: FILE_GRANT_OPTIONS.includes(rawGrant as typeof FILE_GRANT_OPTIONS[number])
                ? rawGrant as typeof FILE_GRANT_OPTIONS[number]
                : defaultGrantForMount(mount),
        };
    });
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

function deriveCanvasDataFromCanonicalNode(rawNode: Record<string, unknown>, canvasType: CanvasNodeType): Partial<CanvasNodeData> {
    const canonicalType = String(rawNode.type || '').trim().toLowerCase() as CanonicalNodeType;
    const canonicalVariant = String(rawNode.variant || '').trim().toLowerCase() || undefined;
    const config = isRecord(rawNode.config) ? rawNode.config : {};
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const compatibility = buildCanvasCompatibilityMeta(rawNode, canonicalType, canonicalVariant, config);
    const label = String(
        rawData.label
        || rawNode.label
        || (canonicalType === 'agent' && isRecord(config.identity) ? config.identity.name || config.identity.role : '')
        || (canonicalType === 'human' ? config.title : '')
        || (canonicalType === 'tool' ? config.summary || config.action_id : '')
        || (canonicalType === 'subflow' ? 'Call workflow' : ''),
    ).trim();
    const subtitle = String(rawData.description || rawData.summary || rawNode.subtitle || '').trim();

    if (canvasType === 'trigger') {
        return {
            ...compatibility,
            label: label || 'Trigger',
            triggerType: normalizeTriggerKind(canonicalVariant),
        };
    }

    if (canvasType === 'agent') {
        const identity = isRecord(config.identity) ? config.identity : {};
        const runtime = isRecord(config.runtime) ? config.runtime : {};
        const tools = isRecord(config.tools) ? config.tools : {};
        return {
            ...compatibility,
            label: label || String(identity.name || identity.role || 'Agent').trim() || 'Agent',
            modelId: String(runtime.model || '').trim(),
            prompt: String(identity.goal || '').trim(),
            tools: Array.isArray(tools.explicit_required)
                ? tools.explicit_required.map((item) => String(item || '').trim()).filter(Boolean)
                : [],
            provider: String(runtime.provider || '').trim(),
            role: String(identity.role || label || 'Agent').trim() || 'Agent',
            duty: String(identity.success_condition || identity.goal || subtitle || 'Autonomous reasoning').trim(),
            status: 'ready',
            description: String(identity.goal || subtitle || 'Autonomous reasoning').trim(),
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
            summary: String(config.summary || subtitle || 'Run custom logic').trim() || 'Run custom logic',
            code: String(config.code || 'return input;'),
        };
    }

    if (canvasType === 'condition') {
        return {
            ...compatibility,
            label: label || 'Decision',
            condition:
                String(config.expression || config.field || subtitle || '').trim()
                || (Array.isArray(config.routes) ? config.routes.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : '')
                || 'Continue only when the required condition is true',
        };
    }

    if (canvasType === 'transform') {
        return {
            ...compatibility,
            label: label || 'Transform',
            mapping: String(config.mapping || config.template || subtitle || 'Map fields to output payload').trim() || 'Map fields to output payload',
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
    const meta = deriveCanvasMeta(data);
    const canonicalType = meta.__canonicalType ?? canonicalTypeForCanvasType(type);
    const canonicalVariant = meta.__canonicalVariant || canonicalVariantForCanvasNode(type, data) || '';
    const next = resetCanonicalConfigForVariant(canonicalType, canonicalVariant, seed);
    if (type === 'trigger') {
        next.test_only = normalizeTriggerKind((data as TriggerCanvasData).triggerType) === 'manual';
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
        next.expression = (data as ConditionCanvasData).condition;
        return next;
    }
    if (type === 'transform') {
        next.mapping = (data as TransformCanvasData).mapping;
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

function readCanonicalInspectorNode(node: CanvasWorkflowNode): CanonicalInspectorNode {
    const meta = deriveCanvasMeta(node.data);
    const canonicalType = meta.__canonicalType ?? canonicalTypeForCanvasType(node.type as CanvasNodeType);
    const canonicalVariant = meta.__canonicalVariant || canonicalVariantForCanvasNode(node.type as CanvasNodeType, node.data);
    return {
        canonicalType,
        canonicalVariant,
        config: ensureRecord(meta.__canonicalConfig),
        resources: ensureRecord(meta.__canonicalResources),
        policy: ensureRecord(meta.__canonicalPolicy),
    };
}

function rebuildCanvasNodeFromCanonical(
    node: CanvasWorkflowNode,
    nextState: CanonicalInspectorNode,
    displayData?: Partial<CanvasNodeData>,
): CanvasWorkflowNode {
    const nextCanvasType = canvasTypeFromCanonicalNode(nextState.canonicalType, nextState.canonicalVariant);
    const rawNode = {
        type: nextState.canonicalType,
        variant: nextState.canonicalVariant,
        config: nextState.config,
        resources: nextState.resources,
        policy: nextState.policy,
        data: {
            label: String((node.data as { label?: string })?.label || '').trim() || undefined,
            ...(displayData || {}),
        },
    };
    const derivedData = deriveCanvasDataFromCanonicalNode(rawNode, nextCanvasType);
    return {
        ...node,
        type: nextCanvasType,
        data: normalizeCanvasNodeData(nextCanvasType, {
            ...derivedData,
            ...(displayData || {}),
            __canonicalType: nextState.canonicalType,
            __canonicalVariant: nextState.canonicalVariant,
            __canonicalConfig: nextState.config,
            __canonicalResources: nextState.resources,
            __canonicalPolicy: nextState.policy,
        }),
    };
}

function makeNodeId(type: CanvasNodeType): string {
    return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultNodeData(type: CanvasNodeType): CanvasNodeData {
    if (type === 'trigger') {
        return {
            label: 'Manual trigger',
            triggerType: 'manual',
        };
    }
    if (type === 'http_request') {
        return {
            label: 'HTTP Request',
            method: 'GET',
            url: 'https://api.example.com',
        };
    }
    if (type === 'condition') {
        return {
            label: 'Decision',
            condition: 'Continue only when the required condition is true',
        };
    }
    if (type === 'transform') {
        return {
            label: 'Transform',
            mapping: 'Map fields to output payload',
        };
    }
    if (type === 'code') {
        return {
            label: 'Code tool',
            summary: 'Run custom logic',
            code: 'return input;',
        };
    }
    if (type === 'action') {
        return {
            label: 'Tool action',
            actionType: 'connector_action',
        };
    }
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

function normalizeCanvasNodeData(type: CanvasNodeType, raw: unknown): CanvasNodeData {
    if (!isRecord(raw)) return defaultNodeData(type);
    if (type === 'trigger') {
        const base: TriggerCanvasData = { label: 'Manual trigger', triggerType: 'manual' };
        const triggerType = normalizeTriggerKind(raw.triggerType || base.triggerType);
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            triggerType,
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    if (type === 'action') {
        const base: ActionCanvasData = { label: 'Tool action', actionType: 'connector_action' };
        const actionType = normalizeActionKind(raw.actionType || base.actionType);
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            actionType,
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    if (type === 'http_request') {
        const base: HttpRequestCanvasData = { label: 'HTTP Request', method: 'GET', url: 'https://api.example.com' };
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            method: String(raw.method || base.method).trim().toUpperCase() || base.method,
            url: String(raw.url || base.url).trim() || base.url,
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    if (type === 'condition') {
        const base: ConditionCanvasData = { label: 'Condition', condition: 'occupancy_count > 10' };
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            condition: String(raw.condition || base.condition).trim() || base.condition,
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    if (type === 'transform') {
        const base: TransformCanvasData = { label: 'Transform', mapping: 'Map fields to output payload' };
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            mapping: String(raw.mapping || base.mapping).trim() || base.mapping,
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    if (type === 'code') {
        const base: CodeCanvasData = { label: 'Code', summary: 'Run custom logic', code: 'return input;' };
        return {
            ...(raw as CanvasCompatibilityMeta),
            label: String(raw.label || base.label).trim() || base.label,
            summary: String(raw.summary || base.summary).trim() || base.summary,
            code: String(raw.code || base.code),
            status: String(raw.status || '').trim() || undefined,
            executionSummary: String(raw.executionSummary || '').trim() || undefined,
        };
    }
    const base: AgentCanvasData = {
        label: 'AI Agent',
        modelId: 'gpt-4o-mini',
        prompt: 'Describe the task for this agent.',
        tools: [],
        provider: 'openai',
        role: 'Worker',
        duty: 'Complete the assigned task clearly and reliably.',
        status: 'ready',
        description: 'Autonomous reasoning',
    };
    return {
        ...(raw as CanvasCompatibilityMeta),
        label: String(raw.label || base.label).trim() || base.label,
        modelId: String(raw.modelId || base.modelId).trim() || base.modelId,
        prompt: String(raw.prompt || base.prompt).trim() || base.prompt,
        tools: Array.isArray(raw.tools) ? raw.tools.map((item) => String(item).trim()).filter(Boolean) : base.tools,
        provider: String(raw.provider || base.provider).trim() || base.provider,
        role: String(raw.role || base.role).trim() || base.role,
        duty: String(raw.duty || base.duty).trim() || base.duty,
        status: String(raw.status || base.status).trim() || base.status,
        description: String(raw.description || base.description).trim() || base.description,
        executionSummary: String(raw.executionSummary || '').trim() || undefined,
    };
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
            ? normalizeCanvasNodeData(type, item.data)
            : normalizeCanvasNodeData(type, deriveCanvasDataFromCanonicalNode(item, type));
        parsed.push({
            id: String(item.id || makeNodeId(type)).trim() || makeNodeId(type),
            type,
            position: {
                x: Number.isFinite(x) ? x : CANVAS_NODE_X,
                y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + (parsed.length * CANVAS_NODE_GAP),
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
                stroke: 'var(--canvas-edge--color)',
                strokeWidth: 2,
                strokeLinecap: 'square' as const,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: BRAND.accentColor,
            },
            interactionWidth: 40,
        });
    }
    return parsed;
}

function buildDefaultCanvasNodes(): CanvasWorkflowNode[] {
    return [
        {
            id: 'trigger-default',
            type: 'trigger',
            position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP },
            data: { label: 'Manual trigger', triggerType: 'manual' },
        },
    ];
}

function serializeCanvasNodes(nodes: CanvasWorkflowNode[]): Array<Record<string, unknown>> {
    return nodes.map((node) => {
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
    });
}

function formatTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function parseJson(input: string): unknown {
    try {
        return JSON.parse(input);
    } catch {
        return null;
    }
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
}

function humanizeRuntimeError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('invalid api key') && !lower.includes('incorrect api key provided')) {
        return `Runtime access key is invalid. Open Setup and enter the same access key used by the ${BRAND.product} runtime.`;
    }
    if (lower.includes('incorrect api key provided') || lower.includes('invalid_api_key')) {
        return 'Your AI provider key is not valid. Open Setup, reconnect your account, then try again.';
    }
    if (lower.includes('401') && lower.includes('unauthorized')) {
        return 'Authorization failed. Reconnect your account or check your runtime key.';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        return `Network connection issue. Make sure ${BRAND.company} backend services are running, then retry.`;
    }
    return message;
}

function isStreamPayload(value: unknown): value is StreamLogPayload {
    return typeof value === 'object' && value !== null;
}

const workflowLabelStyle = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-secondary)',
    marginBottom: 5,
    fontWeight: 700,
    letterSpacing: '0.02em',
};

const workflowInputSurfaceStyle = {
    width: '100%',
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-element)',
    color: 'var(--text-primary)',
    padding: '7px 9px',
};

const workflowCompactSelectStyle = {
    borderRadius: 8,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-element)',
    color: 'var(--text-secondary)',
    height: 30,
    padding: '0 9px',
    fontSize: 11.5,
};

const workflowSectionDividerStyle = {
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: 10,
    display: 'grid',
    gap: 8,
};

const workflowMutedCopyStyle = {
    fontSize: 11,
    color: 'var(--text-tertiary)',
};

function normalizeProvider(provider: string): ProviderId {
    if (provider === 'claude_code_cli') return 'anthropic';
    if (provider === 'anthropic' || provider === 'gemini' || provider === 'vertex') return provider;
    return 'openai';
}

function sortRuntimeProfiles(items: RuntimeProfileRow[]): RuntimeProfileRow[] {
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

function formatConnectionModeLabel(mode: ConnectionMode): string {
    return mode === 'managed' ? 'Runtime account' : 'Saved AI account';
}

function buildWorkflowDraftName(nodes: CanvasWorkflowNode[], fallbackGoal = ''): string {
    const goal = String(fallbackGoal || '').replace(/\s+/g, ' ').trim();
    if (goal) {
        return goal.length <= 60 ? goal : `${goal.slice(0, 59).trimEnd()}…`;
    }
    const agentNode = nodes.find((node) => node.type === 'agent') || null;
    const agentData = agentNode && typeof agentNode.data === 'object' && agentNode.data ? agentNode.data as Record<string, unknown> : {};
    const label = String(agentData.label || '').replace(/\s+/g, ' ').trim();
    if (label) return `${label} workflow`;
    return 'New workflow';
}

function buildWorkflowDraftDescription(nodes: CanvasWorkflowNode[], fallbackGoal = ''): string {
    const goal = String(fallbackGoal || '').replace(/\s+/g, ' ').trim();
    if (goal) return goal;
    const triggerNode = nodes.find((node) => node.type === 'trigger') || null;
    const triggerData = triggerNode && typeof triggerNode.data === 'object' && triggerNode.data ? triggerNode.data as Record<string, unknown> : {};
    const triggerLabel = String(triggerData.label || '').replace(/\s+/g, ' ').trim();
    if (triggerLabel) return `Workflow starting from ${triggerLabel.toLowerCase()}.`;
    return 'Reusable workflow draft.';
}

function buildEmptyWorkflowShape(): WorkflowShape {
    return {
        name: 'New workflow',
        workspaceId: 'default',
        status: 'draft',
        definition: {
            version: 'empyralist.workflow.v2',
            nodes: [],
            edges: [],
            defaults: {},
            resources: {},
            policy: {},
            meta: {
                mode: 'visual_builder',
            },
        },
    };
}

export default function WorkflowEditorInnerPro({ workflowId }: WorkflowEditorInnerProProps) {
    const { addToast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);
    const flowInstanceRef = useRef<ReactFlowInstance<CanvasWorkflowNode, Edge> | null>(null);
    const canvasHostRef = useRef<HTMLDivElement | null>(null);
    const canvasSearchInputRef = useRef<HTMLInputElement | null>(null);
    const onboardingToastShownRef = useRef(false);
    const [canvasNodes, setCanvasNodes] = useState<CanvasWorkflowNode[]>(() => {
        return buildDefaultCanvasNodes();
    });
    const [canvasEdges, setCanvasEdges] = useState<CanvasWorkflowEdge[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [workflow, setWorkflow] = useState<WorkflowShape | null>(null);
    const [workspaceId, setWorkspaceId] = useState<string>('default');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [canvasNodeSearch, setCanvasNodeSearch] = useState<{
        screenX: number;
        screenY: number;
        flowX: number;
        flowY: number;
        query: string;
        insertEdgeId?: string;
    } | null>(null);

    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [runId, setRunId] = useState<string | null>(null);
    const [logs, setLogs] = useState<RunLogEntry[]>([]);
    const [usageTelemetry, setUsageTelemetry] = useState<MaskedUsageTelemetry | null>(null);

    const [operator, setOperator] = useState<OperatorConfig>(DEFAULT_OPERATOR);
    const [connection, setConnection] = useState<ConnectionConfig>(DEFAULT_CONNECTION);
    const [providerAuthMode, setProviderAuthMode] = useState('api_key');
    const [showBehavior, setShowBehavior] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [trustMode, setTrustMode] = useState<TrustMode>('ask');
    const [isPreflightChecking, setIsPreflightChecking] = useState(false);
    const [doctorDecision, setDoctorDecision] = useState<DoctorRunGateDecision | null>(null);

    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
    const [modelAliases, setModelAliases] = useState<ModelAliasOption[]>(DEFAULT_MODEL_ALIAS_OPTIONS);
    const [models, setModels] = useState<string[]>([]);
    const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfileRow[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>('auto');
    const [hasLocalRuntime, setHasLocalRuntime] = useState(false);
    const [providersLoading, setProvidersLoading] = useState(false);
    const [credentialsLoading, setCredentialsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [credentialBusy, setCredentialBusy] = useState(false);
    const [connectedChannels, setConnectedChannels] = useState<string[]>([]);
    const [connectorManifests, setConnectorManifests] = useState<BuilderConnectorManifestItem[]>([]);
    const [availableWorkflows, setAvailableWorkflows] = useState<WorkflowListItem[]>([]);

    const [newCredentialLabel, setNewCredentialLabel] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [geminiKey, setGeminiKey] = useState('');
    const [vertexToken, setVertexToken] = useState('');
    const [vertexProject, setVertexProject] = useState('');
    const [vertexLocation, setVertexLocation] = useState('us-central1');
    const [vaultPassphrase, setVaultPassphrase] = useState('');
    const [newVaultPassphrase, setNewVaultPassphrase] = useState('');
    const [vaultBundle, setVaultBundle] = useState('');
    const [vaultImportOverwrite, setVaultImportOverwrite] = useState(false);
    const [vaultBusy, setVaultBusy] = useState(false);

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

    const withWorkspaceQuery = useCallback((path: string): string => {
        if (!workspaceId) return path;
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}workspace_id=${encodeURIComponent(workspaceId)}`;
    }, [workspaceId]);

    const providerOptions = useMemo(() => {
        return providers.length > 0
            ? providers
            : [
                {
                    id: 'openai',
                    label: 'OpenAI',
                    auth: ['api_key', 'access_token', 'oauth_token'],
                    auth_modes: [
                        { id: 'api_key', label: 'API Key', secret_required: true },
                        { id: 'access_token', label: 'OpenAI access token', secret_required: true },
                        { id: 'oauth_token', label: 'Saved OpenAI / Codex token', secret_required: true },
                    ],
                    default_auth_mode: 'api_key',
                    default_model: 'gpt-4o-mini',
                    note: 'Direct OpenAI credentials only. Empyralis does not provide an in-product ChatGPT or Codex sign-in flow yet.',
                },
                {
                    id: 'anthropic',
                    label: 'Anthropic',
                    auth: ['api_key', 'local_cli'],
                    auth_modes: [{ id: 'api_key', label: 'API Key', secret_required: true }, { id: 'local_cli', label: 'Claude Subscription', secret_required: false }],
                    default_auth_mode: 'api_key',
                    default_model: 'claude-sonnet',
                    note: 'Use a direct Anthropic API key or the Claude subscription already signed into the local CLI on this machine.',
                },
                { id: 'gemini', label: 'Google Gemini', auth: ['api_key'], auth_modes: [{ id: 'api_key', label: 'API Key', secret_required: true }], default_auth_mode: 'api_key', default_model: 'gemini-flash', note: 'Direct Gemini API key only.' },
                { id: 'vertex', label: 'Google Vertex AI', auth: ['access_token', 'project_id', 'location'], auth_modes: [{ id: 'access_token', label: 'Access Token', secret_required: true }], default_auth_mode: 'access_token', default_model: 'vertex-gemini-flash', note: 'Direct Vertex AI access token with project and region.' },
            ];
    }, [providers]);

    const effectiveModelAliases = useMemo(
        () => (modelAliases.length > 0 ? modelAliases : DEFAULT_MODEL_ALIAS_OPTIONS),
        [modelAliases],
    );

    const selectedProvider = useMemo(() => {
        return providerOptions.find((item) => normalizeProvider(item.id) === connection.provider) || providerOptions[0];
    }, [providerOptions, connection.provider]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const items = await fetchBuilderConnectorManifests();
                if (!cancelled) setConnectorManifests(items);
            } catch {
                if (!cancelled) setConnectorManifests([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const payload = await fetchWorkflows(workspaceId);
                if (cancelled) return;
                const items = Array.isArray(payload)
                    ? payload.filter((item): item is WorkflowListItem => isRecord(item) && typeof item.id === 'string')
                    : [];
                setAvailableWorkflows(items);
            } catch {
                if (!cancelled) setAvailableWorkflows([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [workspaceId]);

    const primaryTriggerNode = useMemo(
        () => canvasNodes.find((node) => node.type === 'trigger') || null,
        [canvasNodes],
    );

    const primaryActionNode = useMemo(
        () => canvasNodes.find((node) => node.type === 'action') || null,
        [canvasNodes],
    );

    const statusChannel = useMemo(() => {
        const actionType = String((primaryActionNode?.data as ActionCanvasData | undefined)?.actionType || '').trim().toLowerCase();
        if (actionType === 'send_telegram') return { label: 'Telegram', connector: 'telegram_bot' };
        if (actionType === 'send_whatsapp') return { label: 'WhatsApp', connector: 'whatsapp_twilio' };
        if (actionType === 'send_wechat') return { label: 'WeChat', connector: 'wechat_work' };
        if (actionType === 'send_email') return { label: 'email', connector: null };
        if (actionType === 'write_file') return { label: 'a file', connector: null };
        return { label: 'your channel', connector: null };
    }, [primaryActionNode]);

    const triggerSummary = useMemo(() => {
        const triggerType = String((primaryTriggerNode?.data as TriggerCanvasData | undefined)?.triggerType || '').trim().toLowerCase();
        if (triggerType === 'schedule') return 'on a schedule';
        if (triggerType === 'webhook') return 'when triggered';
        return 'when you start it';
    }, [primaryTriggerNode]);

    const channelConnected = useMemo(() => {
        if (!statusChannel.connector) return true;
        return connectedChannels.includes(statusChannel.connector);
    }, [connectedChannels, statusChannel]);

    const providerAuthOptions = useMemo(() => {
        const items = Array.isArray(selectedProvider?.auth_modes) ? selectedProvider.auth_modes : [];
        if (items.length > 0) {
            return items.map((item) => ({
                id: typeof item.id === 'string' ? item.id : 'api_key',
                label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : String(item.id || 'API Key'),
                secretRequired: Boolean(item.secret_required),
            }));
        }
        return (selectedProvider?.auth || []).map((auth) => ({ id: auth, label: auth, secretRequired: auth !== 'local_cli' }));
    }, [selectedProvider]);

    const activeProviderAuthMode = useMemo(() => {
        return providerAuthOptions.find((item) => item.id === providerAuthMode)?.id
            || selectedProvider?.default_auth_mode
            || providerAuthOptions[0]?.id
            || 'api_key';
    }, [providerAuthMode, providerAuthOptions, selectedProvider]);

    const providerAuthNeedsSecret = useMemo(() => {
        return providerAuthOptions.find((item) => item.id === activeProviderAuthMode)?.secretRequired !== false;
    }, [providerAuthOptions, activeProviderAuthMode]);

    const providerCredentialGuidance = useMemo(() => {
        if (connection.provider === 'openai') {
            if (activeProviderAuthMode === 'oauth_token') {
                return 'Paste a saved OpenAI or Codex token you already control. Empyralis does not open a ChatGPT or Codex login flow for you.';
            }
            if (activeProviderAuthMode === 'access_token') {
                return 'Paste a direct OpenAI access token. Use this only if your organization issues access tokens instead of API keys.';
            }
            return selectedProvider?.note || 'Use a direct OpenAI API key. Empyralis does not route requests through model proxy services.';
        }
        if (connection.provider === 'anthropic' && activeProviderAuthMode === 'local_cli') {
            return selectedProvider?.note || 'Use the Claude subscription already signed into the local Claude CLI on this machine.';
        }
        return selectedProvider?.note || 'Use direct provider credentials only.';
    }, [connection.provider, activeProviderAuthMode, selectedProvider]);

    const openAiCredentialPlaceholder = useMemo(() => {
        if (activeProviderAuthMode === 'oauth_token') return 'Saved OpenAI or Codex token';
        if (activeProviderAuthMode === 'access_token') return 'OpenAI access token';
        return 'OpenAI API key';
    }, [activeProviderAuthMode]);

    const filteredCredentials = useMemo(() => {
        return credentials.filter((item) => normalizeProvider(item.provider) === connection.provider);
    }, [credentials, connection.provider]);

    const selectedRuntimeProfile = useMemo(
        () => runtimeProfiles.find((profile) => profile.id === selectedProfileId) || null,
        [runtimeProfiles, selectedProfileId],
    );
    const groupedRuntimeProfiles = useMemo(() => {
        const grouped = new Map<string, RuntimeProfileRow[]>();
        for (const profile of runtimeProfiles) {
            const key = String(profile.provider || '').trim() || 'other';
            const current = grouped.get(key) || [];
            current.push(profile);
            grouped.set(key, current);
        }
        return Array.from(grouped.entries());
    }, [runtimeProfiles]);

    const appendLog = useCallback((message: string, level: LogLevel = 'info') => {
        setLogs((prev) => [...prev, { ts: new Date().toISOString(), level, message }]);
    }, []);

    const applyAutopilotPack = useCallback((pack: AutopilotPack) => {
        setOperator((prev) => ({
            ...prev,
            userGoal: pack.goal,
            duty: pack.duty,
            systemPrompt: pack.prompt,
        }));
        addToast({ type: 'success', title: 'Template Applied', message: `${pack.label} is ready.` });
    }, [addToast]);

    const buildDefinition = useCallback((baseDefinition: WorkflowShape['definition'], nextOperator: OperatorConfig, nextConnection: ConnectionConfig) => {
        const baseMeta = baseDefinition?.meta || {};
        return {
            nodes: [],
            edges: [],
            meta: {
                ...baseMeta,
                mode: 'simple_operator',
                execution_target: executionTarget,
                runtime_profile_id: selectedProfileId || undefined,
                runtime_profile_label: selectedRuntimeProfile?.label || undefined,
                runtime_profile_provider: selectedRuntimeProfile?.provider || undefined,
                runtime_profile_model: selectedRuntimeProfile?.model || undefined,
                operator: {
                    modelId: nextOperator.modelId,
                    agentRole: nextOperator.agentRole,
                    duty: nextOperator.duty,
                    systemPrompt: nextOperator.systemPrompt,
                    userGoal: nextOperator.userGoal,
                    connection: {
                        provider: nextConnection.provider,
                        mode: nextConnection.mode,
                        credentialId: nextConnection.credentialId,
                    },
                },
            },
        };
    }, [executionTarget, selectedProfileId, selectedRuntimeProfile]);

    const buildCanvasDefinition = useCallback((baseDefinition: WorkflowShape['definition'], nextNodes: CanvasWorkflowNode[], nextEdges: CanvasWorkflowEdge[]) => {
        const baseMeta = baseDefinition?.meta || {};
        const baseDefaults = isRecord(baseDefinition?.defaults) ? baseDefinition.defaults : {};
        const baseRuntimeDefaults = isRecord(baseDefaults.runtime) ? baseDefaults.runtime : {};
        return {
            version: 'empyralist.workflow.v2',
            nodes: serializeCanvasNodes(nextNodes),
            edges: nextEdges.map((edge) => ({
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
                    provider_profile_id: selectedProfileId || undefined,
                    provider: selectedRuntimeProfile?.provider || undefined,
                    model: selectedRuntimeProfile?.model || undefined,
                },
            },
            resources: isRecord(baseDefinition?.resources) ? baseDefinition.resources : {},
            policy: isRecord(baseDefinition?.policy) ? baseDefinition.policy : {},
            meta: {
                ...baseMeta,
                mode: 'visual_builder',
                execution_target: executionTarget,
                runtime_profile_id: selectedProfileId || undefined,
                runtime_profile_label: selectedRuntimeProfile?.label || undefined,
                runtime_profile_provider: selectedRuntimeProfile?.provider || undefined,
                runtime_profile_model: selectedRuntimeProfile?.model || undefined,
            },
        };
    }, [executionTarget, selectedProfileId, selectedRuntimeProfile]);

    const fetchProviders = useCallback(async () => {
        setProvidersLoading(true);
        try {
            const res = await controlPlaneFetch('/api/control-plane/providers');
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to load providers.');
            }
            const payload = await res.json();
            const items = Array.isArray(payload?.providers) ? payload.providers : [];
            const mapped = items.map((item: unknown) => {
                if (!item || typeof item !== 'object') return item;
                const providerInfo = item as ProviderInfo;
                const providerId = normalizeProvider(typeof providerInfo.id === 'string' ? providerInfo.id : 'openai');
                const rawDefaultModel = typeof providerInfo.default_model === 'string' ? providerInfo.default_model : '';
                return {
                    ...providerInfo,
                    default_model: resolveModelAlias(providerId, rawDefaultModel, effectiveModelAliases) || rawDefaultModel,
                } satisfies ProviderInfo;
            });
            setProviders(mapped);
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Providers', message: getErrorMessage(error, 'Unable to load providers.') });
        } finally {
            setProvidersLoading(false);
        }
    }, [controlPlaneFetch, addToast, effectiveModelAliases]);

    const fetchModelAliases = useCallback(async (): Promise<ModelAliasOption[]> => {
        try {
            const res = await controlPlaneFetch('/api/control-plane/providers/model-aliases');
            if (!res.ok) {
                throw new Error('Failed to load model aliases.');
            }
            const payload = await res.json();
            const items = Array.isArray(payload?.models) ? payload.models : [];
            const mapped = items
                .map((item: unknown) => {
                    const value = item as {
                        alias?: unknown;
                        provider?: unknown;
                        model?: unknown;
                        resolved_model?: unknown;
                        is_global_default?: unknown;
                        is_provider_default?: unknown;
                    };
                    const rawProvider = typeof value.provider === 'string' ? value.provider.trim().toLowerCase() : '';
                    const providerId = normalizeProviderId(rawProvider);
                    const alias = typeof value.alias === 'string' ? value.alias.trim() : '';
                    const model = typeof value.model === 'string' ? value.model.trim() : '';
                    const resolvedModel = typeof value.resolved_model === 'string' ? value.resolved_model.trim() : '';
                    if (!rawProvider || !alias || !model || !resolvedModel) return null;
                    return {
                        alias,
                        provider: providerId,
                        model,
                        resolvedModel,
                        isGlobalDefault: Boolean(value.is_global_default),
                        isProviderDefault: Boolean(value.is_provider_default),
                    } satisfies ModelAliasOption;
                })
                .filter((item: ModelAliasOption | null): item is ModelAliasOption => item !== null);
            if (mapped.length > 0) {
                setModelAliases(mapped);
                return mapped;
            }
        } catch {
            // Keep built-in aliases when the catalog cannot be loaded.
        }
        return effectiveModelAliases;
    }, [controlPlaneFetch, effectiveModelAliases]);

    const fetchCredentials = useCallback(async () => {
        setCredentialsLoading(true);
        try {
            const res = await controlPlaneFetch(`/api/control-plane/credentials?workspace_id=${encodeURIComponent(workspaceId)}`);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to load credentials.');
            }
            const payload = await res.json();
            const items = Array.isArray(payload?.items) ? payload.items : [];
            setCredentials(items);
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Credentials', message: getErrorMessage(error, 'Unable to load credentials.') });
        } finally {
            setCredentialsLoading(false);
        }
    }, [controlPlaneFetch, addToast, workspaceId]);

    const fetchRuntimeProfiles = useCallback(async () => {
        try {
            const res = await controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(workspaceId)}`);
            if (!res.ok) {
                throw new Error('Failed to load runtime profiles.');
            }
            const payload = await res.json().catch(() => ({}));
            const rows = Array.isArray((payload as { items?: unknown[] }).items)
                ? (payload as { items: unknown[] }).items.reduce<RuntimeProfileRow[]>((acc, item) => {
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
            const sorted = sortRuntimeProfiles(rows);
            setRuntimeProfiles(sorted);
            setSelectedProfileId((current) => {
                if (current && sorted.some((item) => item.id === current)) return current;
                const defaultReadyProfile = sorted.find((item) => String(item.health || '').trim().toLowerCase() === 'healthy');
                return defaultReadyProfile?.id || current;
            });
        } catch {
            setRuntimeProfiles([]);
        }
    }, [controlPlaneFetch, workspaceId]);

    const fetchConnectedChannels = useCallback(async () => {
        try {
            const res = await controlPlaneFetch(`/api/control-plane/connectors?workspace_id=${encodeURIComponent(workspaceId)}`);
            if (!res.ok) return;
            const payload = await res.json().catch(() => ({}));
            const items = Array.isArray((payload as { items?: unknown[] }).items) ? (payload as { items: unknown[] }).items : [];
            const nextChannels = items
                .filter((item): item is WorkflowConnectorItem => typeof item === 'object' && item !== null)
                .filter((item) => {
                    const connector = String(item.connector || '').trim();
                    if (!connector) return false;
                    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
                    return metadata.paused !== true;
                })
                .map((item) => String(item.connector || '').trim())
                .filter(Boolean);
            setConnectedChannels(nextChannels);
        } catch {
            setConnectedChannels([]);
        }
    }, [controlPlaneFetch, workspaceId]);

    const fetchRuntimeMachinesState = useCallback(async () => {
        try {
            const res = await controlPlaneFetch('/api/runtime/machines');
            if (!res.ok) {
                setHasLocalRuntime(false);
                return;
            }
            const payload = await res.json().catch(() => ({ items: [] }));
            setHasLocalRuntime(hasOnlineLocalRuntime(payload));
        } catch {
            setHasLocalRuntime(false);
        }
    }, [controlPlaneFetch]);

    const loadDoctorDecision = useCallback(async (silent = false) => {
        const runtimeProvider = String(selectedRuntimeProfile?.provider || connection.provider).trim() || 'openai';
        if (!silent) setIsPreflightChecking(true);
        try {
            const nextDecision = await fetchDoctorRunGate(
                {
                    executionTarget,
                    runtimeProvider,
                    usesManagedOpenAi: runtimeProvider === 'openai' && !selectedProfileId && connection.mode === 'managed',
                },
            );
            setDoctorDecision(nextDecision);
            return nextDecision;
        } finally {
            if (!silent) setIsPreflightChecking(false);
        }
    }, [connection.mode, connection.provider, executionTarget, selectedProfileId, selectedRuntimeProfile]);

    const fetchModels = useCallback(async (provider: ProviderId, credentialId?: string, suppressToast?: boolean) => {
        setModelsLoading(true);
        try {
            const aliases = await fetchModelAliases();
            const params = new URLSearchParams();
            if (credentialId) params.set('credential_id', credentialId);
            if (workspaceId) params.set('workspace_id', workspaceId);
            const qs = params.toString();
            const res = await controlPlaneFetch(`/api/control-plane/providers/${provider}/models${qs ? `?${qs}` : ''}`);
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to load models.');
            }
            const payload = await res.json();
            const providerModels = Array.isArray(payload?.models) ? payload.models : [];
            const normalizedModels = mapModelOptionsToAliases(
                provider,
                providerModels.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0),
                aliases,
            );
            setModels(normalizedModels);
            if (normalizedModels.length > 0) {
                setOperator((prev) => {
                    const resolvedCurrent = resolveModelAlias(provider, prev.modelId, aliases) || prev.modelId;
                    if (resolvedCurrent && normalizedModels.includes(resolvedCurrent)) {
                        return { ...prev, modelId: resolvedCurrent };
                    }
                    return { ...prev, modelId: normalizedModels[0] };
                });
            }
        } catch (error: unknown) {
            setModels([]);
            if (!suppressToast) {
                addToast({ type: 'error', title: 'Models', message: getErrorMessage(error, 'Unable to load models.') });
            }
        } finally {
            setModelsLoading(false);
        }
    }, [controlPlaneFetch, addToast, fetchModelAliases, workspaceId]);

    const loadWorkflow = useCallback(async () => {
        if (!workflowId) {
            const nextNodes = buildDefaultCanvasNodes();
            setWorkflow(buildEmptyWorkflowShape());
            setWorkspaceId('default');
            setCanvasNodes(nextNodes);
            setCanvasEdges([]);
            setSelectedNodeId(nextNodes[0]?.id || null);
            setSelectedEdgeId(null);
            setLastSavedAt(null);
            setIsLoading(false);
            return;
        }
        try {
            const wf = await getWorkflow(workflowId);
            setWorkflow(wf);
            const wfWorkspaceId = typeof (wf as WorkflowShape)?.workspaceId === 'string'
                ? (wf as WorkflowShape).workspaceId!
                : 'default';
            setWorkspaceId(wfWorkspaceId || 'default');
            const operatorStored = wf?.definition?.meta?.operator as Record<string, unknown> | undefined;
            const connectionStored = operatorStored?.connection as Record<string, unknown> | undefined;
            const resolvedProvider = normalizeProvider(
                typeof connectionStored?.provider === 'string' ? connectionStored.provider : DEFAULT_CONNECTION.provider,
            );
            const storedModelId = typeof operatorStored?.modelId === 'string' ? operatorStored.modelId : DEFAULT_OPERATOR.modelId;

            setOperator({
                modelId: resolveModelAlias(resolvedProvider, storedModelId, effectiveModelAliases) || storedModelId,
                agentRole: isAgentRoleId(operatorStored?.agentRole) ? operatorStored.agentRole : DEFAULT_OPERATOR.agentRole,
                duty: typeof operatorStored?.duty === 'string' ? operatorStored.duty : DEFAULT_OPERATOR.duty,
                systemPrompt: typeof operatorStored?.systemPrompt === 'string' ? operatorStored.systemPrompt : DEFAULT_OPERATOR.systemPrompt,
                userGoal: typeof operatorStored?.userGoal === 'string' ? operatorStored.userGoal : '',
            });

            setConnection({
                provider: resolvedProvider,
                mode: connectionStored?.mode === 'managed' ? 'managed' : 'byok',
                credentialId: typeof connectionStored?.credentialId === 'string' ? connectionStored.credentialId : '',
            });
            setSelectedProfileId(typeof wf?.definition?.meta?.runtime_profile_id === 'string' ? wf.definition.meta.runtime_profile_id : '');
            setExecutionTarget(normalizeExecutionTarget(wf?.definition?.meta?.execution_target));
            const parsedNodes = parseCanvasNodes(wf?.definition?.nodes);
            const nextNodes = parsedNodes.length > 0 ? parsedNodes : buildDefaultCanvasNodes();
            setCanvasNodes(nextNodes);
            setCanvasEdges(parseCanvasEdges(wf?.definition?.edges, nextNodes));
            setSelectedNodeId(nextNodes[0]?.id || null);
            setSelectedEdgeId(null);
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Load Failed', message: getErrorMessage(error, 'Unable to load workflow.') });
        } finally {
            setIsLoading(false);
        }
    }, [workflowId, addToast, effectiveModelAliases]);

    useEffect(() => {
        void fetchModelAliases();
        loadWorkflow();
        fetchProviders();
        fetchCredentials();
        fetchRuntimeProfiles();
        fetchRuntimeMachinesState();
        fetchConnectedChannels();
        return () => {
            if (streamRef.current) streamRef.current.close();
        };
    }, [fetchConnectedChannels, fetchCredentials, fetchModelAliases, fetchProviders, fetchRuntimeMachinesState, fetchRuntimeProfiles, loadWorkflow]);

    useEffect(() => {
        void loadDoctorDecision(true);
    }, [loadDoctorDecision]);

    useEffect(() => {
        if (connection.mode === 'managed') {
            fetchModels(connection.provider, undefined, true);
            return;
        }
        if (connection.credentialId) {
            fetchModels(connection.provider, connection.credentialId, true);
            return;
        }
        setModels([]);
    }, [connection.provider, connection.mode, connection.credentialId, fetchModels]);

    useEffect(() => {
        if (providerAuthOptions.some((item) => item.id === providerAuthMode)) return;
        setProviderAuthMode(selectedProvider?.default_auth_mode || providerAuthOptions[0]?.id || 'api_key');
    }, [providerAuthMode, providerAuthOptions, selectedProvider]);

    useEffect(() => {
        if (onboardingToastShownRef.current) return;
        if (searchParams.get('onboarding') !== 'activate-telegram') return;
        onboardingToastShownRef.current = true;
        addToast({
            type: 'success',
            title: 'Done!',
            message: 'Connect Telegram to receive notifications.',
            duration: 5000,
        });
    }, [addToast, searchParams]);

    const saveWorkflowState = useCallback(async () => {
        setIsSaving(true);
        try {
            const nextDefinition = Array.isArray(workflow?.definition?.nodes)
                ? buildCanvasDefinition(workflow?.definition, canvasNodes, canvasEdges)
                : buildDefinition(workflow?.definition, operator, connection);
            const savedWorkflow = workflowId
                ? await updateWorkflow(workflowId, nextDefinition)
                : await createWorkflow(
                    buildWorkflowDraftName(canvasNodes, operator.userGoal),
                    buildWorkflowDraftDescription(canvasNodes, operator.userGoal),
                    workspaceId || 'default',
                    nextDefinition,
                );
            setWorkflow(savedWorkflow);
            const now = new Date().toISOString();
            setLastSavedAt(now);
            if (!workflowId && savedWorkflow?.id) {
                router.replace(`/workflows/${encodeURIComponent(savedWorkflow.id)}`);
            }
            addToast({ type: 'success', title: workflowId ? 'Saved' : 'Created', message: workflowId ? 'Workflow saved.' : 'Workflow draft created.' });
            return savedWorkflow;
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Save Failed', message: getErrorMessage(error, 'Unable to save workflow.') });
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [workflowId, workflow, operator, connection, canvasNodes, canvasEdges, buildDefinition, buildCanvasDefinition, addToast, router, workspaceId]);

    const isCanvasMode = Array.isArray(workflow?.definition?.nodes);
    const isOnboardingWorkflow = Boolean(workflow?.definition?.meta && typeof workflow.definition.meta === 'object' && 'onboarding_request' in workflow.definition.meta);
    const isSimplifiedCanvasWorkflow = isCanvasMode && isOnboardingWorkflow;
    const isWorkflowActive = String(workflow?.status || '').trim().toLowerCase() === 'published';
    const workflowStatusSentence = useMemo(() => {
        if (!channelConnected) {
            return '⚠ Connect a channel to activate this workflow';
        }
        if (isWorkflowActive) {
            return `✓ Active — running ${triggerSummary} and sending alerts to ${statusChannel.label}`;
        }
        return '○ Not active — turn on to start receiving alerts';
    }, [channelConnected, isWorkflowActive, statusChannel.label, triggerSummary]);
    const routeBlocked = executionTarget === 'local_companion' && !hasLocalRuntime;
    const doctorBlocked = Boolean(doctorDecision?.blocking);

    const selectedNode = useMemo(
        () => canvasNodes.find((node) => node.id === selectedNodeId) || null,
        [canvasNodes, selectedNodeId],
    );
    const {
        refreshRunDetail,
        activeRunNodeId,
        finalRunNodeId,
        selectedRunNodeState,
        renderedNodes: renderedCanvasNodes,
    } = useWorkflowRunTelemetry<CanvasWorkflowNode>({
        runId,
        nodes: canvasNodes,
        selectedNodeId,
        controlPlaneFetch,
    });
    const selectedCanonicalNode = useMemo(
        () => (selectedNode ? readCanonicalInspectorNode(selectedNode) : null),
        [selectedNode],
    );
    const workflowNodeLabels = useMemo(
        () => Object.fromEntries(canvasNodes.map((node) => [node.id, String((node.data as Record<string, unknown>)?.label || node.id).trim() || node.id])),
        [canvasNodes],
    );
    const hasWorkflowValidationIssues = Boolean(
        workflow?.validation
        && (
            workflow.validation.publishErrorCount > 0
            || workflow.validation.publishWarningCount > 0
            || workflow.validation.draftErrorCount > 0
            || workflow.validation.draftWarningCount > 0
        ),
    );
    const availableSubflowTargets = useMemo(
        () => availableWorkflows.filter((item) => item.id !== workflowId),
        [availableWorkflows, workflowId],
    );

    const renderedCanvasEdges = useMemo<Edge[]>(
        () => canvasEdges.map((edge) => ({
            ...edge,
            type: 'smoothstep' as const,
            animated: false,
            selected: selectedEdgeId === edge.id,
            style: {
                stroke: 'var(--canvas-edge--color)',
                strokeWidth: 2,
                strokeLinecap: 'square' as const,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: BRAND.accentColor,
            },
            interactionWidth: 40,
            data: {
                onAdd: (edgeId: string, point: { x: number; y: number }) => {
                    const hostRect = canvasHostRef.current?.getBoundingClientRect();
                    const currentEdge = canvasEdges.find((item) => item.id === edgeId);
                    if (!hostRect || !currentEdge) return;
                    const sourceNode = canvasNodes.find((node) => node.id === currentEdge.source);
                    const targetNode = canvasNodes.find((node) => node.id === currentEdge.target);
                    const flowX = ((sourceNode?.position.x || CANVAS_NODE_X) + (targetNode?.position.x || CANVAS_NODE_X)) / 2;
                    const flowY = ((sourceNode?.position.y || CANVAS_NODE_TOP) + (targetNode?.position.y || CANVAS_NODE_TOP)) / 2;
                    setSelectedNodeId(null);
                    setSelectedEdgeId(edgeId);
                    setCanvasNodeSearch({
                        screenX: Math.max(12, Math.min(point.x, hostRect.width - 240)),
                        screenY: Math.max(12, Math.min(point.y, hostRect.height - 220)),
                        flowX,
                        flowY,
                        query: '',
                        insertEdgeId: edgeId,
                    });
                },
                onDelete: (edgeId: string) => {
                    setCanvasEdges((prev) => prev.filter((item) => item.id !== edgeId));
                    setSelectedEdgeId(null);
                    setCanvasNodeSearch(null);
                },
            } satisfies SmoothActionEdgeData,
        })),
        [canvasEdges, canvasNodes, selectedEdgeId],
    );

    const handleCanvasInit = useCallback((instance: ReactFlowInstance<CanvasWorkflowNode, Edge>) => {
        flowInstanceRef.current = instance;
        instance.fitView({ padding: 0.4, duration: 400, maxZoom: 1.1 });
    }, []);

    const addCanvasNode = useCallback((item: CanvasLibraryItem, position?: { x: number; y: number }) => {
        const insertEdgeId = canvasNodeSearch?.insertEdgeId;
        const edgeToSplit = insertEdgeId ? canvasEdges.find((edge) => edge.id === insertEdgeId) || null : null;
        setCanvasNodes((prev) => {
            if (item.type === 'trigger') {
                const existingTrigger = prev.find((node) => node.type === 'trigger');
                if (existingTrigger) {
                    setSelectedNodeId(existingTrigger.id);
                    setSelectedEdgeId(null);
                    return prev;
                }
            }
            const maxY = prev.length > 0 ? Math.max(...prev.map((node) => Number(node.position.y) || CANVAS_NODE_TOP)) : (CANVAS_NODE_TOP - CANVAS_NODE_GAP);
            const nextNodeId = makeNodeId(item.type);
            const nextNodes = [
                ...prev,
                {
                    id: nextNodeId,
                    type: item.type,
                    position: position || { x: CANVAS_NODE_X, y: maxY + CANVAS_NODE_GAP },
                    data: buildNodeDataFromLibraryItem(item),
                },
            ];
            setSelectedNodeId(nextNodeId);
            setSelectedEdgeId(null);
            if (edgeToSplit) {
                setCanvasEdges((currentEdges) => [
                    ...currentEdges.filter((edge) => edge.id !== edgeToSplit.id),
                    {
                        id: `edge-${edgeToSplit.source}-${nextNodeId}-${Date.now()}`,
                        source: edgeToSplit.source,
                        target: nextNodeId,
                        sourceHandle: edgeToSplit.sourceHandle,
                        targetHandle: 'top',
                    },
                    {
                        id: `edge-${nextNodeId}-${edgeToSplit.target}-${Date.now() + 1}`,
                        source: nextNodeId,
                        target: edgeToSplit.target,
                        sourceHandle: 'bottom',
                        targetHandle: edgeToSplit.targetHandle,
                    },
                ]);
            }
            return nextNodes;
        });
        setCanvasNodeSearch(null);
    }, [canvasEdges, canvasNodeSearch?.insertEdgeId]);

    const updateSelectedNode = useCallback((updater: (node: CanvasWorkflowNode) => CanvasWorkflowNode) => {
        if (!selectedNodeId) return;
        setCanvasNodes((prev) => prev.map((node) => (node.id === selectedNodeId ? updater(node) : node)));
    }, [selectedNodeId]);

    const updateSelectedCanonicalNode = useCallback((
        updater: (node: CanonicalInspectorNode) => Partial<CanonicalInspectorNode> & { displayData?: Partial<CanvasNodeData> },
    ) => {
        updateSelectedNode((node) => {
            const current = readCanonicalInspectorNode(node);
            const next = updater(current);
            return rebuildCanvasNodeFromCanonical(
                node,
                {
                    canonicalType: next.canonicalType ?? current.canonicalType,
                    canonicalVariant: next.canonicalVariant === undefined ? current.canonicalVariant : next.canonicalVariant,
                    config: isRecord(next.config) ? next.config : current.config,
                    resources: isRecord(next.resources) ? next.resources : current.resources,
                    policy: isRecord(next.policy) ? next.policy : current.policy,
                },
                isRecord(next.displayData) ? next.displayData : undefined,
            );
        });
    }, [updateSelectedNode]);

    const renderFileMountGrantFields = useCallback((
        grants: unknown,
        onChange: (next: Array<{ mount: typeof FILE_MOUNT_OPTIONS[number]; grant: typeof FILE_GRANT_OPTIONS[number] }>) => void,
    ) => {
        const rows = normalizeFileMountGrantRows(grants);
        return (
            <div style={workflowSectionDividerStyle}>
                <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>File mounts</div>
                <div style={{ display: 'grid', gap: 8 }}>
                    {rows.map((row) => (
                        <div key={row.mount} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 8, alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{row.mount}</div>
                                <div style={workflowMutedCopyStyle}>
                                    {row.mount === 'local_root'
                                        ? 'Available only on the local companion.'
                                        : row.mount === 'artifacts'
                                            ? 'Runtime outputs and generated files.'
                                            : 'Shared runtime mount.'}
                                </div>
                            </div>
                            <select
                                value={row.grant}
                                onChange={(event) => {
                                    const next = rows.map((item) => (
                                        item.mount === row.mount
                                            ? { ...item, grant: event.target.value as typeof FILE_GRANT_OPTIONS[number] }
                                            : item
                                    ));
                                    onChange(next);
                                }}
                                style={workflowInputSurfaceStyle}
                            >
                                {FILE_GRANT_OPTIONS.map((grant) => (
                                    <option key={grant} value={grant}>{grant}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        );
    }, []);

    const renderCanvasInspector = useCallback(() => {
        if (!selectedNode || !selectedCanonicalNode) {
            return <div style={workflowMutedCopyStyle}>Select a node on the canvas to edit its configuration.</div>;
        }

        const canonicalType = selectedCanonicalNode.canonicalType;
        const canonicalVariant = selectedCanonicalNode.canonicalVariant || '';
        const config = selectedCanonicalNode.config;
        const executionSummary = workflowRunNodeSummary(selectedRunNodeState);
        const executionStatusLabel = formatWorkflowRunNodeStatusLabel(selectedRunNodeState?.status);
        const isActiveRunNode = Boolean(activeRunNodeId && selectedNode.id === activeRunNodeId);
        const isFinalRunNode = Boolean(finalRunNodeId && selectedNode.id === finalRunNodeId);
        const executionSurfaceStyle = {
            ...workflowInputSurfaceStyle,
            minHeight: 0,
            padding: '10px 12px',
            whiteSpace: 'pre-wrap' as const,
            lineHeight: 1.5,
        };

        return (
            <>
                {selectedRunNodeState ? (
                    <div style={workflowSectionDividerStyle}>
                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Node execution</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                            <div>
                                <label style={workflowLabelStyle}>Status</label>
                                <div style={executionSurfaceStyle}>{executionStatusLabel}</div>
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>Run role</label>
                                <div style={executionSurfaceStyle}>
                                    {[isActiveRunNode ? 'Active node' : null, isFinalRunNode ? 'Final node' : null].filter(Boolean).join(' · ') || 'Visited in this run'}
                                </div>
                            </div>
                        </div>
                        {executionSummary ? (
                            <div>
                                <label style={workflowLabelStyle}>Summary</label>
                                <div style={executionSurfaceStyle}>{executionSummary}</div>
                            </div>
                        ) : null}
                        {selectedRunNodeState.input_preview ? (
                            <div>
                                <label style={workflowLabelStyle}>Input preview</label>
                                <div style={executionSurfaceStyle}>{String(selectedRunNodeState.input_preview)}</div>
                            </div>
                        ) : null}
                        {selectedRunNodeState.output_preview ? (
                            <div>
                                <label style={workflowLabelStyle}>Output preview</label>
                                <div style={executionSurfaceStyle}>{String(selectedRunNodeState.output_preview)}</div>
                            </div>
                        ) : null}
                        {selectedRunNodeState.error ? (
                            <div>
                                <label style={workflowLabelStyle}>Error</label>
                                <div style={{ ...executionSurfaceStyle, color: 'var(--danger-fg)', borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}>
                                    {String(selectedRunNodeState.error)}
                                </div>
                            </div>
                        ) : null}
                        {selectedRunNodeState.child_run_id ? (
                            <div>
                                <label style={workflowLabelStyle}>Child run</label>
                                <div style={executionSurfaceStyle}>
                                    <a
                                        href={`/runs/${encodeURIComponent(String(selectedRunNodeState.child_run_id))}?focus=workflow`}
                                        style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}
                                    >
                                        Open run {String(selectedRunNodeState.child_run_id)}
                                    </a>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : runId ? (
                    <div style={workflowSectionDividerStyle}>
                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Node execution</div>
                        <div style={workflowMutedCopyStyle}>
                            No execution data for this node in run {runId} yet.
                        </div>
                    </div>
                ) : null}

                <div>
                    <label style={workflowLabelStyle}>Node label</label>
                    <input
                        value={String((selectedNode.data as { label?: string })?.label || '')}
                        onChange={(e) => updateSelectedCanonicalNode((current) => ({
                            ...current,
                            displayData: { label: e.target.value },
                        }))}
                        style={workflowInputSurfaceStyle}
                    />
                </div>

                {canonicalType === 'trigger' ? (() => {
                    const triggerConfig = config;
                    const triggerConnector = String(triggerConfig.connector || '').trim();
                    const triggerManifest = connectorManifests.find((item) => item.id === triggerConnector) || null;
                    const triggerEvents = Array.isArray(triggerManifest?.triggers) ? triggerManifest.triggers : [];
                    const scheduleConfig = ensureRecord(triggerConfig.schedule);
                    const webhookConfig = ensureRecord(triggerConfig.webhook);
                    const fileWatchConfig = ensureRecord(triggerConfig.file_watch);
                    return (
                        <>
                            <div>
                                <label style={workflowLabelStyle}>Trigger type</label>
                                <select
                                    value={canonicalVariant || 'manual'}
                                    onChange={(e) => {
                                        const nextVariant = e.target.value;
                                        updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            canonicalType: 'trigger',
                                            canonicalVariant: nextVariant,
                                            config: resetCanonicalConfigForVariant('trigger', nextVariant, current.config),
                                        }));
                                    }}
                                    style={workflowInputSurfaceStyle}
                                >
                                    <option value="manual">Manual</option>
                                    <option value="connector_event">Connector event</option>
                                    <option value="schedule">Schedule</option>
                                    <option value="webhook">Webhook</option>
                                    <option value="workflow">Workflow trigger</option>
                                    <option value="file_watch">File watch</option>
                                </select>
                            </div>

                            {canonicalVariant === 'connector_event' ? (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Connector</label>
                                        <select
                                            value={triggerConnector}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    connector: e.target.value,
                                                    event: '',
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                        >
                                            <option value="">Choose connector</option>
                                            {connectorManifests.map((item) => (
                                                <option key={item.id} value={item.id}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={workflowLabelStyle}>Event</label>
                                        <select
                                            value={String(triggerConfig.event || '').trim()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    event: e.target.value,
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                            disabled={!triggerConnector}
                                        >
                                            <option value="">{triggerConnector ? 'Choose event' : 'Choose connector first'}</option>
                                            {triggerEvents.map((item) => (
                                                <option key={item.id} value={item.id}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {triggerManifest?.notes?.length ? (
                                        <div style={workflowMutedCopyStyle}>{triggerManifest.notes[0]}</div>
                                    ) : null}
                                </>
                            ) : null}

                            {canonicalVariant === 'schedule' ? (
                                <div>
                                    <label style={workflowLabelStyle}>Schedule expression</label>
                                    <input
                                        value={String(scheduleConfig.expression || scheduleConfig.cron || '').trim()}
                                        onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            config: {
                                                ...current.config,
                                                schedule: {
                                                    ...ensureRecord(current.config.schedule),
                                                    expression: e.target.value,
                                                },
                                            },
                                        }))}
                                        placeholder="0 9 * * 1-5"
                                        style={workflowInputSurfaceStyle}
                                    />
                                </div>
                            ) : null}

                            {canonicalVariant === 'webhook' ? (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Method</label>
                                        <select
                                            value={String(webhookConfig.method || 'POST').trim().toUpperCase()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    webhook: {
                                                        ...ensureRecord(current.config.webhook),
                                                        method: e.target.value,
                                                    },
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                        >
                                            <option value="POST">POST</option>
                                            <option value="GET">GET</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={workflowLabelStyle}>Path</label>
                                        <input
                                            value={String(webhookConfig.path || '').trim()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    webhook: {
                                                        ...ensureRecord(current.config.webhook),
                                                        path: e.target.value,
                                                    },
                                                },
                                            }))}
                                            placeholder="/webhooks/inbound"
                                            style={workflowInputSurfaceStyle}
                                        />
                                    </div>
                                </>
                            ) : null}

                            {canonicalVariant === 'workflow' ? (
                                <div>
                                    <label style={workflowLabelStyle}>Source workflow</label>
                                    <select
                                        value={String(triggerConfig.workflow_id || '').trim()}
                                        onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            config: {
                                                ...current.config,
                                                workflow_id: e.target.value,
                                            },
                                        }))}
                                        style={workflowInputSurfaceStyle}
                                    >
                                        <option value="">Choose workflow</option>
                                        {availableSubflowTargets.map((item) => (
                                            <option key={item.id} value={item.id}>{item.name || item.id}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}

                            {canonicalVariant === 'file_watch' ? (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Watch path</label>
                                        <input
                                            value={String(fileWatchConfig.path || '').trim()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    file_watch: {
                                                        ...ensureRecord(current.config.file_watch),
                                                        path: e.target.value,
                                                    },
                                                },
                                            }))}
                                            placeholder="/watch/invoices"
                                            style={workflowInputSurfaceStyle}
                                        />
                                    </div>
                                    <div style={workflowMutedCopyStyle}>
                                        File watch triggers are valid in schema and drafts, but publish stays blocked until local trigger runtime support is added.
                                    </div>
                                </>
                            ) : null}

                            {canonicalVariant === 'manual' ? (
                                <div style={workflowMutedCopyStyle}>
                                    Manual triggers are for draft testing only. Published workflows must include a real trigger.
                                </div>
                            ) : null}
                        </>
                    );
                })() : null}

                {canonicalType === 'agent' ? (
                    <>
                        {isSimplifiedCanvasWorkflow && !showAdvancedSettings ? (
                            <div style={workflowMutedCopyStyle}>
                                Advanced agent settings are hidden for onboarding workflows. Open <strong style={{ color: 'var(--text-primary)' }}>Advanced settings</strong> to adjust runtime, skills, tools, memory, and permissions.
                            </div>
                        ) : (() => {
                            const identity = ensureRecord(config.identity);
                            const runtime = ensureRecord(config.runtime);
                            const skills = ensureRecord(config.skills);
                            const tools = ensureRecord(config.tools);
                            const memory = ensureRecord(config.memory);
                            const connectors = ensureRecord(config.connectors);
                            const permissions = ensureRecord(config.permissions);
                            const bindings = Array.isArray(connectors.bindings) ? connectors.bindings : [];
                            const boundConnectorIds = bindings
                                .filter((item) => isRecord(item) && typeof item.connector_id === 'string')
                                .map((item) => String((item as Record<string, unknown>).connector_id || '').trim())
                                .filter(Boolean);
                            const connectorPermissions = normalizeStringList(permissions.connector_permissions);
                            const browserPermissions = ensureRecord(permissions.browser_permissions);
                            return (
                                <>
                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Identity</div>
                                        <div>
                                            <label style={workflowLabelStyle}>Name</label>
                                            <input
                                                value={String(identity.name || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        identity: {
                                                            ...ensureRecord(current.config.identity),
                                                            name: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Role</label>
                                            <input
                                                value={String(identity.role || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        identity: {
                                                            ...ensureRecord(current.config.identity),
                                                            role: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Goal</label>
                                            <textarea
                                                value={String(identity.goal || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        identity: {
                                                            ...ensureRecord(current.config.identity),
                                                            goal: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                rows={4}
                                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Success condition</label>
                                            <textarea
                                                value={String(identity.success_condition || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        identity: {
                                                            ...ensureRecord(current.config.identity),
                                                            success_condition: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                rows={3}
                                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Output contract</label>
                                            <textarea
                                                value={String(identity.output_contract || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        identity: {
                                                            ...ensureRecord(current.config.identity),
                                                            output_contract: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                rows={3}
                                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Runtime</div>
                                        <div>
                                            <label style={workflowLabelStyle}>Provider profile</label>
                                            <select
                                                value={String(runtime.provider_profile_id || '').trim()}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        runtime: {
                                                            ...ensureRecord(current.config.runtime),
                                                            provider_profile_id: e.target.value || null,
                                                        },
                                                    },
                                                }))}
                                                style={workflowInputSurfaceStyle}
                                            >
                                                <option value="">Smart routing</option>
                                                {groupedRuntimeProfiles.map(([provider, profiles]) => (
                                                    <optgroup key={provider} label={provider}>
                                                        {profiles.map((profile) => (
                                                            <option key={profile.id} value={profile.id}>
                                                                {profile.label}{profile.model ? ` · ${profile.model}` : ''}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                                            <div>
                                                <label style={workflowLabelStyle}>Provider</label>
                                                <select
                                                    value={String(runtime.provider || connection.provider || 'openai').trim()}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            runtime: {
                                                                ...ensureRecord(current.config.runtime),
                                                                provider: e.target.value,
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                >
                                                    {providerOptions.map((provider) => (
                                                        <option key={provider.id} value={normalizeProvider(provider.id)}>{provider.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={workflowLabelStyle}>Model</label>
                                                <select
                                                    value={String(runtime.model || '').trim()}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            runtime: {
                                                                ...ensureRecord(current.config.runtime),
                                                                model: e.target.value,
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                >
                                                    {(models.length > 0 ? models : [String(runtime.model || operator.modelId || 'gpt-4o-mini')]).map((model) => (
                                                        <option key={model} value={model}>{model}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                                            <div>
                                                <label style={workflowLabelStyle}>Run location</label>
                                                <select
                                                    value={String(runtime.execution_target || 'auto').trim()}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            runtime: {
                                                                ...ensureRecord(current.config.runtime),
                                                                execution_target: e.target.value,
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                >
                                                    <option value="auto">Smart routing</option>
                                                    <option value="cloud">Cloud runtime</option>
                                                    <option value="local_companion">Local machine</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={workflowLabelStyle}>Timeout (sec)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={String(runtime.timeout_seconds ?? 300)}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            runtime: {
                                                                ...ensureRecord(current.config.runtime),
                                                                timeout_seconds: Number(e.target.value || 0),
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                />
                                            </div>
                                            <div>
                                                <label style={workflowLabelStyle}>Retries</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={String(ensureRecord(runtime.retry_policy).max_attempts ?? 1)}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            runtime: {
                                                                ...ensureRecord(current.config.runtime),
                                                                retry_policy: {
                                                                    ...ensureRecord(ensureRecord(current.config.runtime).retry_policy),
                                                                    max_attempts: Number(e.target.value || 0),
                                                                },
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Token budget</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={runtime.token_budget == null ? '' : String(runtime.token_budget)}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        runtime: {
                                                            ...ensureRecord(current.config.runtime),
                                                            token_budget: e.target.value ? Number(e.target.value) : null,
                                                        },
                                                    },
                                                }))}
                                                placeholder="Optional"
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Skills</div>
                                        <div>
                                            <label style={workflowLabelStyle}>Skill bundles</label>
                                            <input
                                                value={normalizeStringList(skills.skill_bundle_ids).join(', ')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        skills: {
                                                            ...ensureRecord(current.config.skills),
                                                            skill_bundle_ids: normalizeCsvList(e.target.value),
                                                        },
                                                    },
                                                }))}
                                                placeholder="customer-ops, routing"
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Prompt append</label>
                                            <textarea
                                                value={String(skills.prompt_append || '')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        skills: {
                                                            ...ensureRecord(current.config.skills),
                                                            prompt_append: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                rows={3}
                                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                            />
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Tools</div>
                                        <div>
                                            <label style={workflowLabelStyle}>Dynamic allowed</label>
                                            <input
                                                value={normalizeStringList(tools.dynamic_allowed).join(', ')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        tools: {
                                                            ...ensureRecord(current.config.tools),
                                                            dynamic_allowed: normalizeCsvList(e.target.value),
                                                        },
                                                    },
                                                }))}
                                                placeholder="Leave empty to require explicit tool nodes"
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                        <div>
                                            <label style={workflowLabelStyle}>Explicit required</label>
                                            <input
                                                value={normalizeStringList(tools.explicit_required).join(', ')}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        tools: {
                                                            ...ensureRecord(current.config.tools),
                                                            explicit_required: normalizeCsvList(e.target.value),
                                                        },
                                                    },
                                                }))}
                                                placeholder="draft_email, send_message"
                                                style={workflowInputSurfaceStyle}
                                            />
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Memory</div>
                                        <div style={{ display: 'grid', gap: 8 }}>
                                            <div>
                                                <label style={workflowLabelStyle}>Read scopes</label>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {MEMORY_SCOPE_OPTIONS.map((scope) => {
                                                        const values = normalizeStringList(memory.read_scopes, MEMORY_SCOPE_OPTIONS);
                                                        return (
                                                            <label key={scope} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={values.includes(scope)}
                                                                    onChange={(e) => updateSelectedCanonicalNode((current) => {
                                                                        const currentMemory = ensureRecord(current.config.memory);
                                                                        const currentValues = normalizeStringList(currentMemory.read_scopes, MEMORY_SCOPE_OPTIONS);
                                                                        return {
                                                                            ...current,
                                                                            config: {
                                                                                ...current.config,
                                                                                memory: {
                                                                                    ...currentMemory,
                                                                                    read_scopes: toggleStringList(currentValues, scope, e.target.checked),
                                                                                },
                                                                            },
                                                                        };
                                                                    })}
                                                                />
                                                                {scope}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={workflowLabelStyle}>Write scopes</label>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {MEMORY_SCOPE_OPTIONS.map((scope) => {
                                                        const values = normalizeStringList(memory.write_scopes, MEMORY_SCOPE_OPTIONS);
                                                        return (
                                                            <label key={scope} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={values.includes(scope)}
                                                                    onChange={(e) => updateSelectedCanonicalNode((current) => {
                                                                        const currentMemory = ensureRecord(current.config.memory);
                                                                        const currentValues = normalizeStringList(currentMemory.write_scopes, MEMORY_SCOPE_OPTIONS);
                                                                        return {
                                                                            ...current,
                                                                            config: {
                                                                                ...current.config,
                                                                                memory: {
                                                                                    ...currentMemory,
                                                                                    write_scopes: toggleStringList(currentValues, scope, e.target.checked),
                                                                                },
                                                                            },
                                                                        };
                                                                    })}
                                                                />
                                                                {scope}
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={workflowLabelStyle}>Retrieval</label>
                                                <select
                                                    value={String(memory.retrieval_policy || 'recent').trim()}
                                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                        ...current,
                                                        config: {
                                                            ...current.config,
                                                            memory: {
                                                                ...ensureRecord(current.config.memory),
                                                                retrieval_policy: e.target.value,
                                                            },
                                                        },
                                                    }))}
                                                    style={workflowInputSurfaceStyle}
                                                >
                                                    {MEMORY_RETRIEVAL_OPTIONS.map((item) => (
                                                        <option key={item} value={item}>{item}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Connectors</div>
                                        <div style={{ display: 'grid', gap: 8 }}>
                                            {connectorManifests.map((manifest) => (
                                                <div key={manifest.id} style={{ display: 'grid', gap: 6, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-panel-muted)' }}>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{manifest.label}</div>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={boundConnectorIds.includes(manifest.id)}
                                                            onChange={(e) => updateSelectedCanonicalNode((current) => {
                                                                const currentConnectors = ensureRecord(current.config.connectors);
                                                                const currentBindings = Array.isArray(currentConnectors.bindings) ? currentConnectors.bindings.filter((item) => isRecord(item)) : [];
                                                                const nextBindings = e.target.checked
                                                                    ? [
                                                                        ...currentBindings.filter((item) => String(item.connector_id || '').trim() !== manifest.id),
                                                                        { connector_id: manifest.id, binding_id: null, resource: null },
                                                                    ]
                                                                    : currentBindings.filter((item) => String(item.connector_id || '').trim() !== manifest.id);
                                                                return {
                                                                    ...current,
                                                                    config: {
                                                                        ...current.config,
                                                                        connectors: {
                                                                            ...currentConnectors,
                                                                            bindings: nextBindings,
                                                                        },
                                                                    },
                                                                };
                                                            })}
                                                        />
                                                        Bind connector
                                                    </label>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={connectorPermissions.includes(manifest.id)}
                                                            onChange={(e) => updateSelectedCanonicalNode((current) => {
                                                                const currentPermissions = ensureRecord(current.config.permissions);
                                                                const currentValues = normalizeStringList(currentPermissions.connector_permissions);
                                                                return {
                                                                    ...current,
                                                                    config: {
                                                                        ...current.config,
                                                                        permissions: {
                                                                            ...currentPermissions,
                                                                            connector_permissions: toggleStringList(currentValues, manifest.id, e.target.checked),
                                                                        },
                                                                    },
                                                                };
                                                            })}
                                                        />
                                                        Allow connector
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={workflowSectionDividerStyle}>
                                        <div className="workflow-pro-section-title" style={{ marginBottom: 0 }}>Permissions</div>
                                        <div>
                                            <label style={workflowLabelStyle}>Action policy</label>
                                            <select
                                                value={String(permissions.action_policy || 'guarded').trim()}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        permissions: {
                                                            ...ensureRecord(current.config.permissions),
                                                            action_policy: e.target.value,
                                                        },
                                                    },
                                                }))}
                                                style={workflowInputSurfaceStyle}
                                            >
                                                {ACTION_POLICY_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(browserPermissions.allow)}
                                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                    ...current,
                                                    config: {
                                                        ...current.config,
                                                        permissions: {
                                                            ...ensureRecord(current.config.permissions),
                                                            browser_permissions: {
                                                                ...ensureRecord(ensureRecord(current.config.permissions).browser_permissions),
                                                                allow: e.target.checked,
                                                            },
                                                        },
                                                    },
                                                }))}
                                            />
                                            Allow browser automation
                                        </label>
                                        {renderFileMountGrantFields(
                                            permissions.file_mount_grants,
                                            (next) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    permissions: {
                                                        ...ensureRecord(current.config.permissions),
                                                        file_mount_grants: next,
                                                    },
                                                },
                                            })),
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </>
                ) : null}

                {canonicalType === 'tool' ? (() => {
                    const toolConfig = config;
                    const toolPermissions = ensureRecord(toolConfig.permissions);
                    const toolVariant = canonicalVariant || 'connector_action';
                    const toolConnectorId = String(toolConfig.connector || '').trim();
                    const toolManifest = connectorManifests.find((item) => item.id === toolConnectorId) || null;
                    const toolActions = Array.isArray(toolManifest?.actions) ? toolManifest.actions : [];
                    return (
                        <>
                            <div>
                                <label style={workflowLabelStyle}>Tool type</label>
                                <select
                                    value={toolVariant}
                                    onChange={(e) => {
                                        const nextVariant = e.target.value;
                                        updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            canonicalType: 'tool',
                                            canonicalVariant: nextVariant,
                                            config: resetCanonicalConfigForVariant('tool', nextVariant, current.config),
                                        }));
                                    }}
                                    style={workflowInputSurfaceStyle}
                                >
                                    <option value="connector_action">Connector action</option>
                                    <option value="http">HTTP request</option>
                                    <option value="browser">Browser</option>
                                    <option value="file">File</option>
                                    <option value="shell">Shell</option>
                                    <option value="document">Document</option>
                                    <option value="spreadsheet">Spreadsheet</option>
                                    <option value="code">Code</option>
                                </select>
                            </div>

                            {toolVariant === 'connector_action' ? (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Connector</label>
                                        <select
                                            value={toolConnectorId}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    connector: e.target.value,
                                                    action_id: '',
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                        >
                                            <option value="">Choose connector</option>
                                            {connectorManifests.map((item) => (
                                                <option key={item.id} value={item.id}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={workflowLabelStyle}>Action</label>
                                        <select
                                            value={String(toolConfig.action_id || '').trim()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    action_id: e.target.value,
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                            disabled={!toolConnectorId}
                                        >
                                            <option value="">{toolConnectorId ? 'Choose action' : 'Choose connector first'}</option>
                                            {toolActions.map((item) => (
                                                <option key={item.id} value={item.id}>{item.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            ) : null}

                            {toolVariant === 'http' ? (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Method</label>
                                        <select
                                            value={String(toolConfig.method || 'GET').trim().toUpperCase()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    method: e.target.value,
                                                },
                                            }))}
                                            style={workflowInputSurfaceStyle}
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                            <option value="PUT">PUT</option>
                                            <option value="PATCH">PATCH</option>
                                            <option value="DELETE">DELETE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={workflowLabelStyle}>URL</label>
                                        <input
                                            value={String(toolConfig.url || '').trim()}
                                            onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                                ...current,
                                                config: {
                                                    ...current.config,
                                                    url: e.target.value,
                                                },
                                            }))}
                                            placeholder="https://api.example.com"
                                            style={workflowInputSurfaceStyle}
                                        />
                                    </div>
                                </>
                            ) : null}

                            <div>
                                <label style={workflowLabelStyle}>Execution target</label>
                                <select
                                    value={String(toolConfig.execution_target || (toolVariant === 'shell' ? 'local_companion' : 'auto')).trim()}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            execution_target: e.target.value,
                                        },
                                    }))}
                                    style={workflowInputSurfaceStyle}
                                >
                                    <option value="auto">Smart routing</option>
                                    <option value="cloud">Cloud runtime</option>
                                    <option value="local_companion">Local machine</option>
                                </select>
                            </div>

                            <div>
                                <label style={workflowLabelStyle}>Summary</label>
                                <input
                                    value={String(toolConfig.summary || '').trim()}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            summary: e.target.value,
                                        },
                                    }))}
                                    placeholder="What this tool does"
                                    style={workflowInputSurfaceStyle}
                                />
                            </div>

                            {toolVariant === 'code' ? (
                                <div>
                                    <label style={workflowLabelStyle}>Code</label>
                                    <textarea
                                        value={String(toolConfig.code || '')}
                                        onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            config: {
                                                ...current.config,
                                                code: e.target.value,
                                            },
                                        }))}
                                        rows={6}
                                        style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                    />
                                </div>
                            ) : null}

                            {renderFileMountGrantFields(
                                toolPermissions.file_mount_grants,
                                (next) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        permissions: {
                                            ...ensureRecord(current.config.permissions),
                                            file_mount_grants: next,
                                        },
                                    },
                                })),
                            )}
                        </>
                    );
                })() : null}

                {canonicalType === 'human' ? (() => {
                    const humanConfig = config;
                    return (
                        <>
                            <div>
                                <label style={workflowLabelStyle}>Checkpoint type</label>
                                <select
                                    value={canonicalVariant || 'approval'}
                                    onChange={(e) => {
                                        const nextVariant = e.target.value;
                                        updateSelectedCanonicalNode((current) => ({
                                            ...current,
                                            canonicalType: 'human',
                                            canonicalVariant: nextVariant,
                                            config: resetCanonicalConfigForVariant('human', nextVariant, current.config),
                                        }));
                                    }}
                                    style={workflowInputSurfaceStyle}
                                >
                                    <option value="approval">Approval</option>
                                    <option value="review">Review</option>
                                    <option value="wait_for_reply">Wait for reply</option>
                                </select>
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>Title</label>
                                <input
                                    value={String(humanConfig.title || '').trim()}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            title: e.target.value,
                                        },
                                    }))}
                                    style={workflowInputSurfaceStyle}
                                />
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>Instructions</label>
                                <textarea
                                    value={String(humanConfig.instructions || '')}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            instructions: e.target.value,
                                        },
                                    }))}
                                    rows={4}
                                    style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>Decision options</label>
                                <input
                                    value={normalizeStringList(humanConfig.decision_options).join(', ')}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            decision_options: normalizeCsvList(e.target.value),
                                        },
                                    }))}
                                    placeholder="approve, reject"
                                    style={workflowInputSurfaceStyle}
                                />
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>Timeout (sec)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={humanConfig.timeout_seconds == null ? '' : String(humanConfig.timeout_seconds)}
                                    onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        config: {
                                            ...current.config,
                                            timeout_seconds: e.target.value ? Number(e.target.value) : null,
                                        },
                                    }))}
                                    style={workflowInputSurfaceStyle}
                                />
                            </div>
                        </>
                    );
                })() : null}

                {canonicalType === 'decision' ? (
                    <>
                        <div>
                            <label style={workflowLabelStyle}>Decision type</label>
                            <select
                                value={canonicalVariant || 'if_else'}
                                onChange={(e) => {
                                    const nextVariant = e.target.value;
                                    updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        canonicalType: 'decision',
                                        canonicalVariant: nextVariant,
                                        config: resetCanonicalConfigForVariant('decision', nextVariant, current.config),
                                    }));
                                }}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="if_else">If / else</option>
                                <option value="classifier">Classifier</option>
                                <option value="field_router">Field router</option>
                            </select>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Expression</label>
                            <textarea
                                value={String(config.expression || '').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        expression: e.target.value,
                                    },
                                }))}
                                rows={3}
                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                            />
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Field</label>
                            <input
                                value={String(config.field || '').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        field: e.target.value,
                                    },
                                }))}
                                placeholder="priority"
                                style={workflowInputSurfaceStyle}
                            />
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Routes</label>
                            <input
                                value={normalizeStringList(config.routes).join(', ')}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        routes: normalizeCsvList(e.target.value),
                                    },
                                }))}
                                placeholder="high, medium, low"
                                style={workflowInputSurfaceStyle}
                            />
                        </div>
                    </>
                ) : null}

                {canonicalType === 'data' ? (
                    <>
                        <div>
                            <label style={workflowLabelStyle}>Data step</label>
                            <select
                                value={canonicalVariant || 'transform'}
                                onChange={(e) => {
                                    const nextVariant = e.target.value;
                                    updateSelectedCanonicalNode((current) => ({
                                        ...current,
                                        canonicalType: 'data',
                                        canonicalVariant: nextVariant,
                                        config: resetCanonicalConfigForVariant('data', nextVariant, current.config),
                                    }));
                                }}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="transform">Transform</option>
                                <option value="compose">Compose</option>
                                <option value="validate">Validate</option>
                            </select>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Mapping</label>
                            <textarea
                                value={String(config.mapping || '').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        mapping: e.target.value,
                                    },
                                }))}
                                rows={4}
                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                            />
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Template</label>
                            <textarea
                                value={String(config.template || '').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        template: e.target.value,
                                    },
                                }))}
                                rows={4}
                                style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                            />
                        </div>
                    </>
                ) : null}

                {canonicalType === 'subflow' ? (
                    <>
                        <div>
                            <label style={workflowLabelStyle}>Subflow target</label>
                            <select
                                value={String(config.workflow_id || '').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    canonicalType: 'subflow',
                                    canonicalVariant: 'call_workflow',
                                    config: {
                                        ...current.config,
                                        workflow_id: e.target.value,
                                    },
                                }))}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="">Choose workflow</option>
                                {availableSubflowTargets.map((item) => (
                                    <option key={item.id} value={item.id}>{item.name || item.id}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Mode</label>
                            <select
                                value={String(config.mode || 'sync').trim()}
                                onChange={(e) => updateSelectedCanonicalNode((current) => ({
                                    ...current,
                                    config: {
                                        ...current.config,
                                        mode: e.target.value,
                                    },
                                }))}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="sync">Sync</option>
                            </select>
                        </div>
                    </>
                ) : null}
            </>
        );
    }, [
        availableSubflowTargets,
        connectorManifests,
        groupedRuntimeProfiles,
        isSimplifiedCanvasWorkflow,
        models,
        operator.modelId,
        providerOptions,
        activeRunNodeId,
        finalRunNodeId,
        renderFileMountGrantFields,
        selectedCanonicalNode,
        selectedNode,
        selectedRunNodeState,
        showAdvancedSettings,
        updateSelectedCanonicalNode,
        connection.provider,
        runId,
    ]);

    const handleCanvasNodesChange = useCallback((changes: NodeChange<CanvasWorkflowNode>[]) => {
        setCanvasNodes((prev) => applyNodeChanges(changes, prev));
    }, []);

    const handleCanvasEdgesChange = useCallback((changes: EdgeChange<CanvasWorkflowEdge>[]) => {
        setCanvasEdges((prev) => applyEdgeChanges(changes, prev));
    }, []);

    const handleCanvasConnect = useCallback((connection: Connection) => {
        setCanvasEdges((prev) => addEdge({
            ...connection,
            id: `edge-${connection.source || 'source'}-${connection.target || 'target'}-${Date.now()}`,
            type: 'smoothstep',
            animated: false,
            style: {
                stroke: 'var(--canvas-edge--color)',
                strokeWidth: 2,
                strokeLinecap: 'square' as const,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: BRAND.accentColor,
            },
            interactionWidth: 40,
        }, prev));
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setCanvasNodeSearch(null);
    }, []);

    const handleCanvasPaneClick = useCallback((event: React.MouseEvent) => {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        const hostRect = canvasHostRef.current?.getBoundingClientRect();
        const reactFlow = flowInstanceRef.current;
        if (!hostRect || !reactFlow) return;
        const flowPoint = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        setCanvasNodeSearch({
            screenX: Math.max(12, event.clientX - hostRect.left),
            screenY: Math.max(12, event.clientY - hostRect.top),
            flowX: flowPoint.x,
            flowY: flowPoint.y,
            query: '',
        });
    }, []);

    const filteredCanvasNodeLibrary = useMemo(() => {
        const query = String(canvasNodeSearch?.query || '').trim().toLowerCase();
        const library = canvasNodeSearch?.insertEdgeId
            ? CANVAS_NODE_LIBRARY.filter((item) => item.type !== 'trigger')
            : CANVAS_NODE_LIBRARY;
        if (!query) return library;
        return library.filter((item) => item.label.toLowerCase().includes(query));
    }, [canvasNodeSearch?.insertEdgeId, canvasNodeSearch?.query]);

    const groupedCanvasNodeLibrary = useMemo(
        () =>
            CANVAS_NODE_GROUPS.map((group) => ({
                ...group,
                items: group.items
                    .map((itemId) => filteredCanvasNodeLibrary.find((item) => item.id === itemId) || null)
                    .filter((item): item is CanvasLibraryItem => item !== null),
            })).filter((group) => group.items.length > 0),
        [filteredCanvasNodeLibrary],
    );

    useEffect(() => {
        if (!canvasNodeSearch) return;
        window.setTimeout(() => canvasSearchInputRef.current?.focus(), 0);
    }, [canvasNodeSearch]);

    useEffect(() => {
        if (!isCanvasMode) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Backspace') return;
            const tagName = (document.activeElement?.tagName || '').toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
            event.preventDefault();
            if (selectedEdgeId) {
                setCanvasEdges((prev) => prev.filter((edge) => edge.id !== selectedEdgeId));
                setSelectedEdgeId(null);
                return;
            }
            if (!selectedNodeId) return;
            setCanvasNodes((prev) => {
                const remaining = prev.filter((node) => node.id !== selectedNodeId);
                setCanvasEdges((edges) => edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
                setSelectedNodeId(remaining[0]?.id || null);
                return remaining;
            });
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCanvasMode, selectedEdgeId, selectedNodeId]);

    const handlePublish = useCallback(async () => {
        try {
            const savedWorkflow = await saveWorkflowState();
            const nextWorkflowId = String(savedWorkflow?.id || workflowId || '').trim();
            if (!nextWorkflowId) return;
            const publishedWorkflow = await publishWorkflow(nextWorkflowId);
            setWorkflow(publishedWorkflow);
            addToast({ type: 'success', title: 'Published', message: 'Workflow published.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Publish Failed', message: getErrorMessage(error, 'Unable to publish workflow.') });
        }
    }, [workflowId, saveWorkflowState, addToast]);

    const handleActivationToggle = useCallback(async () => {
        if (isWorkflowActive) {
            addToast({ type: 'info', title: 'Already active', message: 'This workflow is already turned on.' });
            return;
        }
        await handlePublish();
    }, [addToast, handlePublish, isWorkflowActive]);

    const resetCredentialForm = useCallback(() => {
        setNewCredentialLabel('');
        setOpenaiKey('');
        setAnthropicKey('');
        setGeminiKey('');
        setVertexToken('');
        setVertexProject('');
        setVertexLocation('us-central1');
    }, []);

    const currentCredentialPayload = useMemo(() => {
        if (connection.provider === 'anthropic') {
            if (activeProviderAuthMode === 'local_cli') return { auth_mode: 'local_cli' };
            return { api_key: anthropicKey.trim(), auth_mode: activeProviderAuthMode };
        }
        if (connection.provider === 'gemini') return { api_key: geminiKey.trim(), auth_mode: activeProviderAuthMode };
        if (connection.provider === 'vertex') {
            return {
                access_token: vertexToken.trim(),
                project_id: vertexProject.trim(),
                location: vertexLocation.trim() || 'us-central1',
                auth_mode: activeProviderAuthMode,
            };
        }
        const token = openaiKey.trim();
        if (activeProviderAuthMode === 'oauth_token') return { oauth_token: token, auth_mode: 'oauth_token' };
        if (activeProviderAuthMode === 'access_token') return { access_token: token, auth_mode: 'access_token' };
        return { api_key: token, auth_mode: 'api_key' };
    }, [connection.provider, activeProviderAuthMode, openaiKey, anthropicKey, geminiKey, vertexToken, vertexProject, vertexLocation]);

    const saveCredential = useCallback(async () => {
        if (!newCredentialLabel.trim()) {
            addToast({ type: 'error', title: 'Label Required', message: 'Please name this credential.' });
            return;
        }
        if (providerAuthNeedsSecret && connection.provider === 'anthropic' && !anthropicKey.trim()) {
            addToast({ type: 'error', title: 'Key Required', message: 'Enter your Anthropic API key first.' });
            return;
        }
        setCredentialBusy(true);
        try {
            const res = await controlPlaneFetch('/api/control-plane/credentials', {
                method: 'POST',
                body: JSON.stringify({
                    label: newCredentialLabel.trim(),
                    provider: connection.provider,
                    workspace_id: workspaceId,
                    mode: 'byok',
                    credentials: currentCredentialPayload,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to save credential.');
            }
            const payload = await res.json();
            const id = typeof payload?.id === 'string' ? payload.id : '';
            await fetchCredentials();
            if (id) {
                setConnection((prev) => ({ ...prev, credentialId: id }));
                await fetchModels(connection.provider, id, true);
            }
            resetCredentialForm();
            addToast({ type: 'success', title: 'Credential Saved', message: 'Connection added to secure vault.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Credential Error', message: getErrorMessage(error, 'Unable to save credential.') });
        } finally {
            setCredentialBusy(false);
        }
    }, [
        newCredentialLabel,
        connection.provider,
        currentCredentialPayload,
        controlPlaneFetch,
        fetchCredentials,
        fetchModels,
        providerAuthNeedsSecret,
        anthropicKey,
        resetCredentialForm,
        workspaceId,
        addToast,
    ]);

    const testSelectedCredential = useCallback(async () => {
        if (connection.mode === 'managed') {
            addToast({ type: 'info', title: 'Managed Mode', message: 'Managed mode uses server-side runtime credentials.' });
            return;
        }
        if (!connection.credentialId) {
            addToast({ type: 'error', title: 'Credential Required', message: 'Pick a credential first.' });
            return;
        }
        setCredentialBusy(true);
        try {
            const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(connection.credentialId)}/test?workspace_id=${encodeURIComponent(workspaceId)}`, {
                method: 'POST',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Credential test failed.');
            }
            const payload = await res.json();
            const preview = Array.isArray(payload?.models_preview) ? payload.models_preview : [];
            const normalizedPreview = mapModelOptionsToAliases(
                connection.provider,
                preview.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0),
                effectiveModelAliases,
            );
            setModels(normalizedPreview);
            if (normalizedPreview.length > 0) {
                setOperator((prev) => {
                    const resolvedCurrent = resolveModelAlias(connection.provider, prev.modelId, effectiveModelAliases) || prev.modelId;
                    return {
                        ...prev,
                        modelId: normalizedPreview.includes(resolvedCurrent) ? resolvedCurrent : normalizedPreview[0],
                    };
                });
            }
            addToast({ type: 'success', title: 'Connected', message: payload?.message || 'Credential is valid.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Connection Failed', message: getErrorMessage(error, 'Unable to validate credential.') });
        } finally {
            setCredentialBusy(false);
        }
    }, [connection.mode, connection.credentialId, connection.provider, controlPlaneFetch, addToast, effectiveModelAliases, workspaceId]);

    const deleteCredential = useCallback(async (credentialId: string) => {
        try {
            const res = await controlPlaneFetch(`/api/control-plane/credentials/${encodeURIComponent(credentialId)}?workspace_id=${encodeURIComponent(workspaceId)}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to delete credential.');
            }
            if (connection.credentialId === credentialId) {
                setConnection((prev) => ({ ...prev, credentialId: '' }));
            }
            await fetchCredentials();
            addToast({ type: 'success', title: 'Deleted', message: 'Credential removed from vault.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Delete Failed', message: getErrorMessage(error, 'Unable to delete credential.') });
        }
    }, [controlPlaneFetch, fetchCredentials, connection.credentialId, addToast, workspaceId]);

    const exportVaultBundle = useCallback(async () => {
        if (!vaultPassphrase.trim()) {
            addToast({ type: 'error', title: 'Passphrase Required', message: 'Enter a passphrase to export.' });
            return;
        }
        setVaultBusy(true);
        try {
            const res = await controlPlaneFetch('/api/control-plane/credentials/export', {
                method: 'POST',
                body: JSON.stringify({ workspace_id: workspaceId, passphrase: vaultPassphrase.trim() }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to export vault.');
            }
            const payload = await res.json();
            const bundle = typeof payload?.bundle === 'string' ? payload.bundle : '';
            setVaultBundle(bundle);
            addToast({
                type: 'success',
                title: 'Export Ready',
                message: `Exported ${Number(payload?.count || 0)} credential(s).`,
            });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Export Failed', message: getErrorMessage(error, 'Unable to export vault.') });
        } finally {
            setVaultBusy(false);
        }
    }, [vaultPassphrase, controlPlaneFetch, workspaceId, addToast]);

    const importVaultBundle = useCallback(async () => {
        if (!vaultPassphrase.trim()) {
            addToast({ type: 'error', title: 'Passphrase Required', message: 'Enter the export passphrase first.' });
            return;
        }
        if (!vaultBundle.trim()) {
            addToast({ type: 'error', title: 'Bundle Required', message: 'Paste an encrypted vault bundle first.' });
            return;
        }
        setVaultBusy(true);
        try {
            const res = await controlPlaneFetch('/api/control-plane/credentials/import', {
                method: 'POST',
                body: JSON.stringify({
                    workspace_id: workspaceId,
                    passphrase: vaultPassphrase.trim(),
                    bundle: vaultBundle.trim(),
                    overwrite: vaultImportOverwrite,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to import vault bundle.');
            }
            const payload = await res.json();
            await fetchCredentials();
            addToast({
                type: 'success',
                title: 'Import Complete',
                message: `Imported ${Number(payload?.imported || 0)}, overwritten ${Number(payload?.overwritten || 0)}, skipped ${Number(payload?.skipped || 0)}.`,
            });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Import Failed', message: getErrorMessage(error, 'Unable to import vault bundle.') });
        } finally {
            setVaultBusy(false);
        }
    }, [vaultPassphrase, vaultBundle, vaultImportOverwrite, controlPlaneFetch, workspaceId, fetchCredentials, addToast]);

    const rotateVaultKey = useCallback(async () => {
        if (!newVaultPassphrase.trim()) {
            addToast({ type: 'error', title: 'New Key Required', message: 'Enter a new vault key passphrase.' });
            return;
        }
        setVaultBusy(true);
        try {
            const res = await controlPlaneFetch('/api/control-plane/credentials/rotate-key', {
                method: 'POST',
                body: JSON.stringify({ new_passphrase: newVaultPassphrase.trim() }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to rotate vault key.');
            }
            const payload = await res.json();
            setNewVaultPassphrase('');
            addToast({
                type: 'success',
                title: 'Vault Key Rotated',
                message: `Re-encrypted ${Number(payload?.rotated || 0)} credential(s).`,
            });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Rotation Failed', message: getErrorMessage(error, 'Unable to rotate vault key.') });
        } finally {
            setVaultBusy(false);
        }
    }, [newVaultPassphrase, controlPlaneFetch, addToast]);

    const closeStream = useCallback(() => {
        if (!streamRef.current) return;
        streamRef.current.close();
        streamRef.current = null;
    }, []);

    const submitDecision = useCallback(async (decision: 'Proceed' | 'Hold') => {
        if (!runId) return;
        try {
            const res = await controlPlaneFetch(`/api/runs/${encodeURIComponent(runId)}/decision`, {
                method: 'POST',
                body: JSON.stringify({ decision }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to send decision.');
            }
            appendLog(`Decision sent: ${decision}`);
            setRunStatus('running');
        } catch (error: unknown) {
            setRunStatus('error');
            appendLog(getErrorMessage(error, 'Failed to send decision.'), 'error');
        }
    }, [runId, controlPlaneFetch, appendLog]);

    const startRun = useCallback(async () => {
        if (!operator.userGoal.trim()) {
            addToast({ type: 'error', title: 'Goal Required', message: 'Describe what you want done first.' });
            return;
        }
        if (!selectedProfileId && connection.mode === 'byok' && !connection.credentialId) {
            addToast({ type: 'error', title: 'Credential Required', message: 'Connect a key before running.' });
            return;
        }
        if (executionTarget === 'local_companion' && !hasLocalRuntime) {
            addToast({
                type: 'error',
                title: 'Local Machine Unavailable',
                message: 'No local machine is online. Choose Smart routing or Cloud runtime, or connect a local runtime first.',
            });
            return;
        }
        if (!operator.modelId.trim()) {
            addToast({ type: 'error', title: 'Model Required', message: 'Pick a model before running.' });
            return;
        }

        closeStream();
        setLogs([]);
        setUsageTelemetry(null);
        setRunStatus('running');

        try {
            const runtimeProvider = String(selectedRuntimeProfile?.provider || connection.provider).trim() || 'openai';
            const runtimeModel = String(selectedRuntimeProfile?.model || operator.modelId).trim() || 'gpt-4o-mini';
            const runtimeCredentialId = selectedProfileId ? undefined : connection.mode === 'byok' ? connection.credentialId : undefined;
            const primaryAgentNode = canvasNodes.find((node) => node.type === 'agent') || null;
            const primaryAgentMeta = primaryAgentNode ? deriveCanvasMeta(primaryAgentNode.data) : {};
            const primaryAgentConfig = ensureRecord(primaryAgentMeta.__canonicalConfig);
            const primaryPermissions = ensureRecord(primaryAgentConfig.permissions);
            const trustPreset = String(primaryPermissions.trust_preset || 'standard_local').trim() || 'standard_local';
            const rememberedGrants = {
                folders: normalizeStringList(ensureRecord(primaryPermissions.remembered_grants).folders),
                browser_session: Boolean(ensureRecord(primaryPermissions.remembered_grants).browser_session),
                shell_capabilities: normalizeStringList(ensureRecord(primaryPermissions.remembered_grants).shell_capabilities),
            };
            const doctorGate = await loadDoctorDecision();
            if (doctorGate?.blocking) {
                throw new Error(doctorGate.detail);
            }

            const businessPlan = [
                `Automation: ${workflow?.name || workflowId || 'Untitled'}`,
                `Goal: ${operator.userGoal.trim()}`,
                `Agent Role: ${operator.agentRole}`,
                `Duty: ${operator.duty.trim()}`,
                `Prompt: ${operator.systemPrompt.trim()}`,
                `Execution Route: ${formatExecutionTargetLabel(executionTarget)}`,
                `Provider: ${runtimeProvider}`,
                `Mode: ${selectedProfileId ? 'runtime_profile' : connection.mode}`,
                `Model: ${runtimeModel}`,
                selectedRuntimeProfile ? `Runtime Profile: ${selectedRuntimeProfile.label}` : '',
                `Trust Mode: ${trustMode}`,
            ].filter(Boolean).join('\n');

            const res = await controlPlaneFetch('/api/runs/start', {
                method: 'POST',
                body: JSON.stringify({
                    engine: 'codex',
                    workflow_id: workflowId,
                    workspace_id: workspaceId,
                    user_goal: operator.userGoal.trim(),
                    business_plan: businessPlan,
                    agent_role: operator.agentRole,
                    provider: runtimeProvider,
                    model: runtimeModel,
                    credential_id: runtimeCredentialId || undefined,
                    agents: [
                        {
                            role: operator.agentRole,
                            modelId: runtimeModel,
                            provider: runtimeProvider,
                        },
                    ],
                    metadata: {
                        workspace_id: workspaceId,
                        agent_role: operator.agentRole,
                        provider: runtimeProvider,
                        model: runtimeModel,
                        execution_target: executionTarget,
                        execution_target_requested: executionTarget,
                        mode: selectedProfileId ? 'runtime_profile' : connection.mode,
                        profile_id: selectedProfileId || undefined,
                        runtime_profile_id: selectedProfileId || undefined,
                        trust_mode: trustMode,
                        trust_preset: trustPreset,
                        remembered_grants: rememberedGrants,
                    },
                }),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to start run.');
            }

            const payload = await res.json();
            const nextRunId = typeof payload?.run_id === 'string' ? payload.run_id : '';
            if (!nextRunId) throw new Error('Run ID missing from backend response.');
            upsertSeededRuntimeRun({
                run_id: nextRunId,
                status: 'running',
                workflow_name: String(workflow?.name || workflowId || 'Workflow').trim() || 'Workflow',
                user_goal: operator.userGoal.trim(),
                created_at: new Date().toISOString(),
                agent_role: operator.agentRole,
                triggered_by: 'Direct',
                active_profile_id:
                    typeof payload?.active_profile_id === 'string' ? payload.active_profile_id : selectedProfileId || null,
                active_profile_label:
                    typeof payload?.active_profile_label === 'string'
                        ? payload.active_profile_label
                        : selectedRuntimeProfile?.label || null,
                active_profile_provider:
                    typeof payload?.active_profile_provider === 'string' ? payload.active_profile_provider : runtimeProvider,
                active_profile_model:
                    typeof payload?.active_profile_model === 'string' ? payload.active_profile_model : runtimeModel,
                execution_target_selected:
                    typeof payload?.execution_target_selected === 'string'
                        ? payload.execution_target_selected
                        : executionTarget,
            });
            setRunId(nextRunId);
            appendLog(buildRunStartedMessage(selectedRuntimeProfile?.label, runtimeProvider, runtimeModel));
            void refreshRunDetail(nextRunId);

            const streamUrl = `/api/runs/${encodeURIComponent(nextRunId)}/stream`;
            const eventSource = openAuthenticatedEventStream({
                url: streamUrl,
                onEvent: (event) => {
                    if (event.event === 'pause') {
                        setRunStatus('waiting');
                        appendLog(RUN_WAITING_STATUS_COPY, 'warn');
                        void refreshRunDetail(nextRunId);
                        return;
                    }
                    if (event.event !== 'log') {
                        appendLog(String(event.data || ''));
                        return;
                    }
                    const parsed = parseJson(event.data);
                    if (isStreamPayload(parsed)) {
                        const evt = String(parsed.event || '');
                        const rawMessage = String(parsed.message || event.data);
                        const prettyMessage = evt === 'run_error' ? humanizeRuntimeError(rawMessage) : rawMessage;
                        appendLog(prettyMessage, (parsed.level as LogLevel) || 'info');
                        if (evt === 'run_complete') {
                            setRunStatus('completed');
                            void refreshRunDetail(nextRunId);
                        }
                        if (evt === 'run_error') {
                            setRunStatus('error');
                            void refreshRunDetail(nextRunId);
                        }
                        if (evt === 'run_stopped' || evt === 'timeout' || evt.startsWith('approval_') || evt === 'node_state') {
                            void refreshRunDetail(nextRunId);
                        }
                        if (evt === 'usage_masked' && parsed.data && typeof parsed.data === 'object') {
                            const usage = parsed.data as Partial<MaskedUsageTelemetry>;
                            if (
                                typeof usage.provider === 'string' &&
                                typeof usage.model === 'string' &&
                                typeof usage.input_tokens_est === 'number' &&
                                typeof usage.output_tokens_est === 'number' &&
                                typeof usage.total_tokens_est === 'number' &&
                                typeof usage.cost_est_usd === 'number' &&
                                typeof usage.cost_band === 'string'
                            ) {
                                setUsageTelemetry({
                                    provider: usage.provider,
                                    model: usage.model,
                                    input_tokens_est: usage.input_tokens_est,
                                    output_tokens_est: usage.output_tokens_est,
                                    total_tokens_est: usage.total_tokens_est,
                                    cost_est_usd: usage.cost_est_usd,
                                    cost_band: usage.cost_band,
                                });
                            }
                        }
                        return;
                    }
                    appendLog(String(event.data));
                },
                onError: () => {
                    eventSource.close();
                    if (streamRef.current === eventSource) streamRef.current = null;
                    setRunStatus((prev) => (prev === 'running' ? 'completed' : prev));
                    void refreshRunDetail(nextRunId);
                },
                onClose: () => {
                    if (streamRef.current === eventSource) streamRef.current = null;
                },
            });
            streamRef.current = eventSource;
        } catch (error: unknown) {
            setRunStatus('error');
            const message = humanizeRuntimeError(getErrorMessage(error, 'Run failed to start.'));
            appendLog(message, 'error');
            addToast({ type: 'error', title: 'Run Failed', message });
        } finally {
            setIsPreflightChecking(false);
        }
    }, [operator, connection, workflow, workflowId, workspaceId, trustMode, controlPlaneFetch, closeStream, appendLog, addToast, executionTarget, hasLocalRuntime, loadDoctorDecision, refreshRunDetail, selectedProfileId, selectedRuntimeProfile]);

    const runBadge = useMemo(() => {
        if (runStatus === 'running') return { label: 'Running', color: 'var(--success-fg)', bg: 'var(--success-bg)', border: 'var(--success-border)' };
        if (runStatus === 'waiting') return { label: 'Needs your approval', color: 'var(--warning-fg)', bg: 'var(--warning-bg)', border: 'var(--warning-border)' };
        if (runStatus === 'completed') return { label: 'Completed', color: 'var(--primary-base)', bg: 'var(--primary-soft)', border: 'var(--primary-border-soft)' };
        if (runStatus === 'error') return { label: 'Error', color: 'var(--error-fg)', bg: 'var(--error-bg)', border: 'var(--error-border)' };
        return { label: 'Ready', color: 'var(--text-tertiary)', bg: 'var(--bg-element)', border: 'var(--border-default)' };
    }, [runStatus]);

    if (isLoading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <Loader2 size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
                Loading workflow...
            </div>
        );
    }

    return (
        <div
            className="orion-animate-in"
            style={{
                height: 'calc(100vh - var(--topbar-height))',
                minHeight: 'calc(100vh - var(--topbar-height))',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-app)',
                color: 'var(--text-primary)',
                overflow: 'hidden',
            }}
        >
            <div className="workflow-pro-toolbar">
                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div className="workflow-pro-log-title">{workflow?.name || (workflowId ? 'Workflow' : 'New workflow')}</div>
                        <span style={{
                            borderRadius: 10,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            background: isSimplifiedCanvasWorkflow
                                ? (isWorkflowActive ? 'var(--success-bg)' : 'var(--bg-element)')
                                : runBadge.bg,
                            color: isSimplifiedCanvasWorkflow
                                ? (isWorkflowActive ? 'var(--success-fg)' : 'var(--text-secondary)')
                                : runBadge.color,
                            border: `1px solid ${isSimplifiedCanvasWorkflow ? (isWorkflowActive ? 'var(--success-border)' : 'var(--border-default)') : runBadge.border}`,
                        }}>
                            {isSimplifiedCanvasWorkflow ? (isWorkflowActive ? 'Active' : 'Inactive') : runBadge.label}
                        </span>
                    </div>
                    {isSimplifiedCanvasWorkflow ? (
                        <div style={{ fontSize: 13, color: channelConnected ? 'var(--text-secondary)' : 'var(--warning-fg)' }}>
                            {workflowStatusSentence}
                        </div>
                    ) : null}
                </div>
                <div className="workflow-pro-toolbar-actions">
                    {isSimplifiedCanvasWorkflow ? (
                        <>
                            <button
                                onClick={() => setShowAdvancedSettings((prev) => !prev)}
                                className="orion-btn orion-btn-ghost"
                            >
                                {showAdvancedSettings ? 'Hide advanced settings' : 'Advanced settings'}
                            </button>
                            <button
                                onClick={startRun}
                                disabled={runStatus === 'running' || isPreflightChecking || routeBlocked || doctorBlocked}
                                className="orion-btn orion-btn-ghost"
                            >
                                <Play size={14} />
                                {runStatus === 'running' ? 'Testing…' : isPreflightChecking ? 'Preparing…' : 'Test once'}
                            </button>
                            {runId ? (
                                <button
                                    onClick={() => router.push(`/runs/${encodeURIComponent(runId)}/inspect?focus=timeline`)}
                                    className="orion-btn orion-btn-ghost"
                                >
                                    {OPEN_LIVE_RUN_LABEL}
                                </button>
                            ) : null}
                            <button
                                onClick={() => void handleActivationToggle()}
                                className={`orion-btn ${isWorkflowActive ? 'orion-btn-success' : 'orion-btn-primary'}`}
                                disabled={isSaving}
                            >
                                {isWorkflowActive ? 'ON' : 'OFF'}
                            </button>
                        </>
                    ) : (
                        <>
                            {lastSavedAt && (
                                <span style={workflowMutedCopyStyle}>
                                    Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            <button
                                onClick={saveWorkflowState}
                                disabled={isSaving}
                                className="orion-btn orion-btn-ghost"
                            >
                                <Save size={14} />
                                {isSaving ? 'Saving...' : workflowId ? 'Save' : 'Create draft'}
                            </button>
                            <button
                                onClick={handlePublish}
                                className="orion-btn orion-btn-primary"
                            >
                                <UploadCloud size={14} />
                                Publish
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className={`workflow-pro-toolbar-note${routeBlocked ? ' is-warning' : ''}`.trim()}>
                Route: {formatExecutionTargetLabel(executionTarget)}. {describeExecutionTarget(executionTarget, hasLocalRuntime)}
            </div>
            {hasWorkflowValidationIssues ? (
                <div style={{ padding: '0 12px 12px' }}>
                    <WorkflowValidationPanel
                        validation={workflow?.validation}
                        nodeLabels={workflowNodeLabels}
                    />
                </div>
            ) : null}
            <div style={{ padding: '0 12px' }}>
                <DoctorPreflightNotice decision={doctorDecision} />
            </div>
            {routeBlocked ? (
                <div style={{ padding: '0 12px 12px' }}>
                    <LocalRuntimeRecoveryCard
                        title="Local machine required"
                        copy="Start the local runtime on this device, then return here and test the workflow locally."
                        onStatusRefresh={fetchRuntimeMachinesState}
                    />
                </div>
            ) : null}

            {searchParams.get('onboarding') === 'activate-telegram' ? (
                <div
                    className="workflow-pro-panel"
                    style={{
                        margin: '12px 12px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '14px 16px',
                    }}
                >
                    <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Done! Connect Telegram to receive notifications.
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Use BotFather once, paste the token, then message your bot to activate delivery.
                        </div>
                    </div>
                    <button
                        className="orion-btn orion-btn-primary"
                        onClick={() => router.push('/credentials?connector=telegram_bot&onboarding=1')}
                    >
                        Connect Telegram
                    </button>
                </div>
            ) : null}

            {isSimplifiedCanvasWorkflow && showAdvancedSettings ? (
                <div
                    className="workflow-pro-panel"
                    style={{
                        margin: '12px 12px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '12px 16px',
                    }}
                >
                    <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Advanced settings</div>
                        <div style={{ ...workflowMutedCopyStyle, fontSize: 12 }}>
                            Save canvas edits, inspect node configuration, and adjust technical details only if needed.
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {lastSavedAt ? (
                            <span style={workflowMutedCopyStyle}>
                                Saved {new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        ) : null}
                        <button
                            onClick={saveWorkflowState}
                            disabled={isSaving}
                            className="orion-btn orion-btn-ghost"
                        >
                            <Save size={14} />
                            {isSaving ? 'Saving...' : workflowId ? 'Save' : 'Create draft'}
                        </button>
                    </div>
                </div>
            ) : null}

            {isCanvasMode ? (
                <div style={{ flex: 1, minHeight: 0, height: '100%', padding: 12 }}>
                    <div
                        className="workflow-pro-grid"
                        style={{
                            height: 'calc(100vh - 120px)',
                            minHeight: 0,
                            display: 'grid',
                            gridTemplateColumns: '220px minmax(0, 1fr) 320px',
                            gap: 12,
                            alignItems: 'stretch',
                        }}
                    >
                        <section className="workflow-pro-panel" style={{ overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
                            <div className="workflow-pro-section-title">Palette</div>
                            {groupedCanvasNodeLibrary.map((group) => (
                                <div key={group.label} style={{ display: 'grid', gap: 8 }}>
                                    <div className="workflow-pro-section-title" style={{ fontSize: 11 }}>{group.label}</div>
                                    {group.items.map((item) => (
                                        <button
                                            key={item.id}
                                            className="btn-secondary workflow-canvas-palette-btn"
                                            onClick={() => addCanvasNode(item)}
                                            style={{ ['--workflow-palette-accent' as string]: item.accent }}
                                        >
                                            <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${item.accent}1f`, color: item.accent }}>
                                                {item.icon}
                                            </span>
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            ))}
                            <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.5 }}>
                                Add triggers, agents, tools, human checkpoints, decisions, data steps, and subflows. Drag handles to connect steps. Press Backspace to delete the selected node or edge.
                            </div>
                        </section>

                        <section ref={canvasHostRef} className="workflow-pro-panel workflow-canvas-panel" style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex', position: 'relative' }}>
                            <ReactFlow
                                style={{ flex: 1, minHeight: 0, height: 'calc(100vh - 120px)' }}
                                nodes={renderedCanvasNodes}
                                edges={renderedCanvasEdges}
                                nodeTypes={CANVAS_NODE_TYPES}
                                edgeTypes={CANVAS_EDGE_TYPES}
                                fitView
                                fitViewOptions={{ padding: 0.38 }}
                                onInit={handleCanvasInit}
                                onNodesChange={handleCanvasNodesChange}
                                onEdgesChange={handleCanvasEdgesChange}
                                onConnect={handleCanvasConnect}
                                onNodeClick={(_event: unknown, node: CanvasWorkflowNode) => {
                                    setSelectedNodeId(node.id);
                                    setSelectedEdgeId(null);
                                    setCanvasNodeSearch(null);
                                }}
                                onPaneClick={handleCanvasPaneClick}
                                onEdgeClick={(_event: unknown, edge: CanvasWorkflowEdge) => {
                                    setSelectedNodeId(null);
                                    setSelectedEdgeId(edge.id);
                                    setCanvasNodeSearch(null);
                                }}
                                onEdgeContextMenu={(event: React.MouseEvent, edge: CanvasWorkflowEdge) => {
                                    event.preventDefault();
                                    setCanvasEdges((prev) => prev.filter((item) => item.id !== edge.id));
                                    setSelectedEdgeId((prev) => (prev === edge.id ? null : prev));
                                }}
                                panOnDrag
                                zoomOnScroll
                                zoomOnPinch
                                connectionLineComponent={SmoothConnectionLine}
                                snapToGrid
                                snapGrid={[20, 20]}
                                nodesConnectable
                                elementsSelectable
                                edgesFocusable
                                proOptions={{ hideAttribution: true }}
                                defaultEdgeOptions={{
                                    type: 'smoothstep',
                                    animated: false,
                                    selectable: true,
                                    interactionWidth: 40,
                                    style: {
                                        stroke: 'var(--canvas-edge--color)',
                                        strokeWidth: 2,
                                        strokeLinecap: 'square',
                                    },
                                    markerEnd: {
                                        type: MarkerType.ArrowClosed,
                                        color: BRAND.accentColor,
                                    },
                                }}
                            >
                                <Background
                                    variant={BackgroundVariant.Dots}
                                    gap={16}
                                    size={1.5}
                                    color="var(--canvas--dot--color)"
                                />
                                <Controls position="bottom-left" showInteractive={false} showFitView />
                            </ReactFlow>
                            {canvasNodeSearch ? (
                                <div
                                    className="workflow-pro-panel"
                                    style={{
                                        position: 'absolute',
                                        top: Math.max(12, Math.min(canvasNodeSearch.screenY, (canvasHostRef.current?.clientHeight || 0) - 220)),
                                        left: Math.max(12, Math.min(canvasNodeSearch.screenX, (canvasHostRef.current?.clientWidth || 0) - 240)),
                                        width: 220,
                                        padding: 10,
                                        zIndex: 20,
                                        display: 'grid',
                                        gap: 8,
                                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Search size={14} color="var(--text-tertiary)" />
                                        <input
                                            ref={canvasSearchInputRef}
                                            value={canvasNodeSearch.query}
                                            onChange={(event) => setCanvasNodeSearch((prev) => prev ? { ...prev, query: event.target.value } : prev)}
                                            placeholder="Search nodes"
                                            style={{ ...workflowInputSurfaceStyle, minWidth: 0 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn-ghost"
                                            onClick={() => setCanvasNodeSearch(null)}
                                            style={{ padding: 0, width: 28, minWidth: 28 }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                                        {filteredCanvasNodeLibrary.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => addCanvasNode(item, { x: canvasNodeSearch.flowX, y: canvasNodeSearch.flowY })}
                                                style={{ justifyContent: 'flex-start', borderLeft: `3px solid ${item.accent}` }}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                        {filteredCanvasNodeLibrary.length === 0 ? (
                                            <div style={{ ...workflowMutedCopyStyle, padding: '4px 2px' }}>No matching nodes</div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        <section className="workflow-pro-panel" style={{ overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
                            <div className="workflow-pro-section-title">Inspector</div>
                            {renderCanvasInspector()}
                        </section>
                    </div>
                </div>
            ) : (
            <div className="workflow-pro-grid" style={{ flex: 1, minHeight: 0, padding: 12 }}>
                <section className="workflow-pro-panel" style={{ overflowY: 'auto' }}>
                    <div className="workflow-pro-section-title">Goal</div>

                    <div>
                        <label style={workflowLabelStyle}>What do you want done?</label>
                        <textarea
                            value={operator.userGoal}
                            onChange={(e) => setOperator((prev) => ({ ...prev, userGoal: e.target.value }))}
                            placeholder="Example: Triage leads, draft follow-ups, and propose booking slots."
                            rows={5}
                            style={{
                                ...workflowInputSurfaceStyle,
                                borderRadius: 10,
                                padding: 10,
                                fontSize: 14,
                                resize: 'vertical',
                            }}
                        />
                    </div>

                    <div>
                        <label style={workflowLabelStyle}>Quick starts</label>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {AUTOPILOT_PACKS.map((pack) => (
                                <button
                                    key={pack.id}
                                    type="button"
                                    onClick={() => applyAutopilotPack(pack)}
                                    className="orion-btn orion-btn-ghost"
                                    style={{ minHeight: 30, padding: '0 10px' }}
                                >
                                    {pack.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            AI: {formatExecutionTargetLabel(executionTarget)} · {selectedRuntimeProfile
                                ? `${selectedRuntimeProfile.label} · ${String(selectedRuntimeProfile.model || operator.modelId).trim() || operator.modelId}`
                                : `${connection.provider.toUpperCase()} · ${formatConnectionModeLabel(connection.mode)} · ${operator.modelId}`} · {AGENT_ROLE_OPTIONS.find((item) => item.id === operator.agentRole)?.label || operator.agentRole}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAdvanced((prev) => !prev)}
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 30, padding: '0 10px' }}
                        >
                            {showAdvanced ? 'Hide advanced' : 'Open advanced'}
                        </button>
                    </div>

                    {showAdvanced && (
                        <>

                    <div className="workflow-pro-two-col">
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={workflowLabelStyle}>Runtime Profile</label>
                            <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(e.target.value)}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="">Manual provider settings</option>
                                {runtimeProfiles.map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.label} · {String(profile.provider || '').trim().toUpperCase()}
                                        {profile.model ? ` · ${profile.model}` : ''}
                                    </option>
                                ))}
                            </select>
                            <div style={{ ...workflowMutedCopyStyle, marginTop: 6 }}>
                                {selectedRuntimeProfile
                                    ? `Runs use ${selectedRuntimeProfile.label} for provider routing. The execution route below decides where the run happens.`
                                    : 'Choose a saved runtime profile to control provider routing and fallback for this workflow.'}
                            </div>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Execution Route</label>
                            <select
                                value={executionTarget}
                                onChange={(e) => setExecutionTarget(normalizeExecutionTarget(e.target.value))}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="auto">Smart routing</option>
                                <option value="local_companion" disabled={!hasLocalRuntime}>Local machine</option>
                                <option value="cloud">Cloud runtime</option>
                            </select>
                            <div style={{ ...workflowMutedCopyStyle, marginTop: 6 }}>
                                {describeExecutionTarget(executionTarget, hasLocalRuntime)}
                            </div>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Provider</label>
                            <select
                                value={connection.provider}
                                onChange={(e) => setConnection((prev) => ({
                                    ...prev,
                                    provider: normalizeProvider(e.target.value),
                                    credentialId: '',
                                }))}
                                style={workflowInputSurfaceStyle}
                            >
                                {providerOptions.map((provider) => (
                                    <option key={provider.id} value={normalizeProvider(provider.id)}>{provider.label}</option>
                                ))}
                            </select>
                            {providersLoading && <div style={{ ...workflowMutedCopyStyle, marginTop: 6 }}>Loading providers…</div>}
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Auth Method</label>
                            <select
                                value={activeProviderAuthMode}
                                onChange={(e) => setProviderAuthMode(e.target.value)}
                                style={workflowInputSurfaceStyle}
                                disabled={providerAuthOptions.length <= 1}
                            >
                                {providerAuthOptions.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={workflowLabelStyle}>Account source</label>
                            <select
                                value={connection.mode}
                                onChange={(e) => setConnection((prev) => ({
                                    ...prev,
                                    mode: e.target.value === 'managed' ? 'managed' : 'byok',
                                }))}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="managed">Runtime account</option>
                                <option value="byok">Saved AI account</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={workflowLabelStyle}>Runtime session</label>
                        <div style={workflowInputSurfaceStyle}>
                            Provided by your admin session for this workspace.
                        </div>
                        <div style={workflowMutedCopyStyle}>
                            Direct runtime keys are no longer stored in this editor.
                        </div>
                    </div>

                    {connection.mode === 'byok' && (
                        <div style={workflowSectionDividerStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ fontSize: 12, fontWeight: 700 }}>Channels</div>
                                <button
                                    onClick={fetchCredentials}
                                    className="orion-btn orion-btn-ghost"
                                >
                                    Refresh
                                </button>
                            </div>

                            <div style={{ display: 'grid', gap: 8 }}>
                                <select
                                    value={connection.credentialId}
                                    onChange={(e) => setConnection((prev) => ({ ...prev, credentialId: e.target.value }))}
                                    style={workflowInputSurfaceStyle}
                                >
                                    <option value="">Select a saved account</option>
                                    {filteredCredentials.map((cred) => (
                                        <option key={cred.id} value={cred.id}>
                                            {cred.label}
                                            {connection.provider === 'anthropic' && cred.metadata?.auth_mode === 'local_cli' ? ' (Claude subscription)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button
                                        onClick={testSelectedCredential}
                                        disabled={credentialBusy || !connection.credentialId}
                                        className="orion-btn orion-btn-success"
                                    >
                                        Test Connection
                                    </button>
                                    {connection.credentialId && (
                                        <button
                                            onClick={() => deleteCredential(connection.credentialId)}
                                            disabled={credentialBusy}
                                            className="orion-btn orion-btn-danger"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                                {credentialsLoading && <div style={workflowMutedCopyStyle}>Loading credentials…</div>}
                            </div>

                            <div style={{ marginTop: 12, ...workflowSectionDividerStyle }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>Add New Account</div>
                                <input
                                    value={newCredentialLabel}
                                    onChange={(e) => setNewCredentialLabel(e.target.value)}
                                    placeholder={connection.provider === 'anthropic' && activeProviderAuthMode === 'local_cli' ? 'Claude subscription label' : 'Credential label'}
                                    style={workflowInputSurfaceStyle}
                                />
                                {connection.provider === 'openai' && (
                                    <>
                                        <input
                                            value={openaiKey}
                                            onChange={(e) => setOpenaiKey(e.target.value)}
                                            placeholder={openAiCredentialPlaceholder}
                                            type="password"
                                            style={workflowInputSurfaceStyle}
                                        />
                                        <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.6 }}>
                                            {providerCredentialGuidance}
                                        </div>
                                    </>
                                )}
                                {connection.provider === 'anthropic' && (
                                    providerAuthNeedsSecret ? (
                                        <>
                                            <input
                                                value={anthropicKey}
                                                onChange={(e) => setAnthropicKey(e.target.value)}
                                                placeholder="Anthropic API key"
                                                type="password"
                                                style={workflowInputSurfaceStyle}
                                            />
                                            <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.6 }}>
                                                {providerCredentialGuidance}
                                            </div>
                                        </>
                                    ) : (
                                        <div
                                            style={{
                                                ...workflowInputSurfaceStyle,
                                                minHeight: 44,
                                                display: 'grid',
                                                alignItems: 'center',
                                                color: 'var(--text-secondary)',
                                            }}
                                        >
                                            No API key needed. This uses the local Claude subscription already signed into the `claude` CLI.
                                        </div>
                                    )
                                )}
                                {connection.provider === 'gemini' && (
                                    <>
                                        <input
                                            value={geminiKey}
                                            onChange={(e) => setGeminiKey(e.target.value)}
                                            placeholder="Gemini API key"
                                            type="password"
                                            style={workflowInputSurfaceStyle}
                                        />
                                        <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.6 }}>
                                            {providerCredentialGuidance}
                                        </div>
                                    </>
                                )}
                                {connection.provider === 'vertex' && (
                                    <>
                                        <input
                                            value={vertexToken}
                                            onChange={(e) => setVertexToken(e.target.value)}
                                            placeholder="Vertex access token"
                                            type="password"
                                            style={workflowInputSurfaceStyle}
                                        />
                                        <input
                                            value={vertexProject}
                                            onChange={(e) => setVertexProject(e.target.value)}
                                            placeholder="Vertex project ID"
                                            style={workflowInputSurfaceStyle}
                                        />
                                        <input
                                            value={vertexLocation}
                                            onChange={(e) => setVertexLocation(e.target.value)}
                                            placeholder="Vertex location (e.g. us-central1)"
                                            style={workflowInputSurfaceStyle}
                                        />
                                        <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.6 }}>
                                            {providerCredentialGuidance}
                                        </div>
                                    </>
                                )}
                                <button
                                    onClick={saveCredential}
                                    disabled={credentialBusy}
                                    className="orion-btn orion-btn-primary"
                                >
                                    Save Credential
                                </button>

                                <div style={{ marginTop: 8, ...workflowSectionDividerStyle }}>
                                    <div style={{ fontSize: 12, fontWeight: 700 }}>Vault Operations</div>
                                    <input
                                        value={vaultPassphrase}
                                        onChange={(e) => setVaultPassphrase(e.target.value)}
                                        placeholder="Export/Import passphrase"
                                        type="password"
                                        style={workflowInputSurfaceStyle}
                                    />
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <button
                                            onClick={exportVaultBundle}
                                            disabled={vaultBusy}
                                            className="orion-btn orion-btn-ghost"
                                        >
                                            Export Bundle
                                        </button>
                                        <button
                                            onClick={importVaultBundle}
                                            disabled={vaultBusy}
                                            className="orion-btn orion-btn-success"
                                        >
                                            Import Bundle
                                        </button>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                                        <input
                                            type="checkbox"
                                            checked={vaultImportOverwrite}
                                            onChange={(e) => setVaultImportOverwrite(e.target.checked)}
                                        />
                                        Overwrite duplicates on import
                                    </label>
                                    <textarea
                                        value={vaultBundle}
                                        onChange={(e) => setVaultBundle(e.target.value)}
                                        placeholder="Encrypted vault bundle appears here after export, or paste one to import."
                                        rows={4}
                                        style={{ ...workflowInputSurfaceStyle, resize: 'vertical', fontSize: 12 }}
                                    />

                                    <input
                                        value={newVaultPassphrase}
                                        onChange={(e) => setNewVaultPassphrase(e.target.value)}
                                        placeholder="New vault key (min 16 chars)"
                                        type="password"
                                        style={workflowInputSurfaceStyle}
                                    />
                                    <button
                                        onClick={rotateVaultKey}
                                        disabled={vaultBusy}
                                        className="orion-btn orion-btn-ghost"
                                    >
                                        Rotate Vault Key
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={workflowLabelStyle}>Model</label>
                        <select
                            value={operator.modelId}
                            onChange={(e) => setOperator((prev) => ({ ...prev, modelId: e.target.value }))}
                            style={workflowInputSurfaceStyle}
                        >
                            {models.length === 0 ? (
                                <option value={operator.modelId}>{operator.modelId || 'Load models...'}</option>
                            ) : (
                                models.map((model) => <option key={model} value={model}>{model}</option>)
                            )}
                        </select>
                        {modelsLoading && <div style={{ ...workflowMutedCopyStyle, marginTop: 6 }}>Loading models…</div>}
                    </div>

                        </>
                    )}

                    <div className="workflow-pro-section-title">Run</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setShowBehavior((prev) => !prev)}
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 30, padding: '0 10px' }}
                        >
                            {showBehavior ? 'Hide behavior' : 'Show behavior'}
                        </button>
                        <select
                            value={operator.agentRole}
                            onChange={(e) => setOperator((prev) => ({
                                ...prev,
                                agentRole: isAgentRoleId(e.target.value) ? e.target.value : DEFAULT_AGENT_ROLE_ID,
                            }))}
                            style={workflowCompactSelectStyle}
                        >
                            {AGENT_ROLE_OPTIONS.map((role) => (
                                <option key={role.id} value={role.id}>{role.label}</option>
                            ))}
                        </select>
                        <select
                            value={trustMode}
                            onChange={(e) => setTrustMode(e.target.value === 'auto' ? 'auto' : 'ask')}
                            style={workflowCompactSelectStyle}
                        >
                            <option value="ask">Ask me before risky actions</option>
                            <option value="auto">Auto-run low-risk actions</option>
                        </select>
                            <button
                                onClick={startRun}
                            disabled={runStatus === 'running' || isPreflightChecking || doctorBlocked}
                            className="orion-btn orion-btn-primary"
                            style={{
                                minHeight: 40,
                                fontSize: 14,
                                background: runStatus === 'running' || isPreflightChecking ? 'var(--bg-hover)' : undefined,
                                borderColor: runStatus === 'running' || isPreflightChecking ? 'var(--border-subtle)' : undefined,
                            }}
                        >
                            <Play size={14} />
                            {runStatus === 'running' ? 'Running...' : isPreflightChecking ? 'Checking setup...' : 'Run'}
                        </button>
                    </div>

                    {showBehavior && (
                        <div style={workflowSectionDividerStyle}>
                            <div>
                                <label style={workflowLabelStyle}>Duty</label>
                                <textarea
                                    value={operator.duty}
                                    onChange={(e) => setOperator((prev) => ({ ...prev, duty: e.target.value }))}
                                    rows={3}
                                    style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={workflowLabelStyle}>System Prompt</label>
                                <textarea
                                    value={operator.systemPrompt}
                                    onChange={(e) => setOperator((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                                    rows={4}
                                    style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 8, padding: 10, borderLeft: '2px solid var(--success-border)', background: 'var(--success-bg)' }}>
                        <ShieldCheck size={16} color="var(--success-fg)" style={{ marginTop: 2 }} />
                        <div style={{ fontSize: 12, color: 'var(--success-fg)', lineHeight: 1.45 }}>
                            Credential values are stored encrypted in local vault files. Your run uses the selected provider and model.
                        </div>
                    </div>
                </section>

                <section className="workflow-pro-panel log">
                    <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                            <div className="workflow-pro-log-title">{isSimplifiedCanvasWorkflow ? 'Recent runs' : 'Live run log'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {isSimplifiedCanvasWorkflow ? 'What happened the last time you tested this workflow.' : 'Time-stamped events.'}
                            </div>
                        </div>
                        {runStatus === 'waiting' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => submitDecision('Proceed')}
                                    className="orion-btn orion-btn-success"
                                >
                                    Approve
                                </button>
                                <button
                                    onClick={() => submitDecision('Hold')}
                                    className="orion-btn orion-btn-ghost"
                                >
                                    Hold
                                </button>
                            </div>
                        )}
                        {runId ? (
                            <button
                                onClick={() => router.push(`/runs/${encodeURIComponent(runId)}/inspect?focus=timeline`)}
                                className="orion-btn orion-btn-ghost"
                            >
                                {OPEN_LIVE_RUN_LABEL}
                            </button>
                        ) : null}
                    </div>

                    {usageTelemetry && (
                        <div style={{
                            marginBottom: 10,
                            borderTop: '1px solid var(--primary-border-soft)',
                            borderBottom: '1px solid var(--border-subtle)',
                            background: 'var(--primary-soft)',
                            padding: '10px 0',
                            display: 'grid',
                            gap: 4,
                        }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Usage Snapshot (Masked)
                        </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {usageTelemetry.provider}:{usageTelemetry.model}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                Tokens~ {usageTelemetry.total_tokens_est.toLocaleString()} ({usageTelemetry.input_tokens_est.toLocaleString()} in / {usageTelemetry.output_tokens_est.toLocaleString()} out)
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                Estimated cost band: {usageTelemetry.cost_band}
                            </div>
                        </div>
                    )}

                    <div style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: 'auto',
                        borderTop: '1px solid var(--border-subtle)',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        padding: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}>
                        {logs.length === 0 ? (
                            <div style={{ padding: '12px 10px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13 }}>
                                <CheckCircle2 size={14} />
                                {isSimplifiedCanvasWorkflow ? 'Nothing to show yet. Try it once to see run details here.' : 'No events yet. Press Run to start.'}
                            </div>
                        ) : (
                            logs.map((entry, idx) => {
                                const color = entry.level === 'error' ? 'var(--error-fg)' : entry.level === 'warn' ? 'var(--warning-fg)' : 'var(--primary-hover)';
                                return (
                                    <div
                                        key={`${entry.ts}-${idx}`}
                                        className="orion-log-entry"
                                        style={{
                                            padding: '9px 10px',
                                            borderBottom: idx < logs.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, color, fontWeight: 700 }}>{entry.level.toUpperCase()}</span>
                                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatTime(entry.ts)}</span>
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{entry.message}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {runStatus === 'error' && (
                        <div style={{
                            marginTop: 10,
                            borderLeft: '2px solid var(--error-border)',
                            background: 'var(--error-bg)',
                            color: 'var(--error-fg)',
                            fontSize: 12,
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <AlertTriangle size={14} />
                            {isSimplifiedCanvasWorkflow ? 'This test did not complete. Check your connection and try again.' : 'Run failed. Check the connection or model and try again.'}
                        </div>
                    )}
                </section>
            </div>
            )}
        </div>
    );
}
