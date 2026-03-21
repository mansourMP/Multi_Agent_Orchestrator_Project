'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, Play, Save, Send, ShieldCheck, UploadCloud, Zap } from 'lucide-react';
import { ReactFlow, Controls, Background, BackgroundVariant, MarkerType, applyNodeChanges, useNodesInitialized, useReactFlow, type Edge, type Node, type NodeChange, type NodeTypes, type ReactFlowInstance } from '@xyflow/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getWorkflow, publishWorkflow, updateWorkflow } from '@/lib/api';
import { useToast } from '@/components/Toast';
import {
    AGENT_ROLE_OPTIONS,
    DEFAULT_AGENT_ROLE_ID,
    isAgentRoleId,
    type AgentRoleId,
} from '@/app/page.catalog';
import { BRAND } from '@/lib/brand';
import { readRuntimeApiKeyFromStorage, writeRuntimeApiKeyToStorage } from '@/lib/runtimeKey';
import AgentNode from '@/components/nodes/AgentNode';
import TriggerNode from '@/components/nodes/TriggerNode';
import ActionNode from '@/components/nodes/ActionNode';

const ORION_API_URL =
    process.env.NEXT_PUBLIC_ORION_API_URL || 'http://127.0.0.1:8001';
const ORION_API_KEY =
    process.env.NEXT_PUBLIC_ORION_API_KEY || '';

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
        nodes?: unknown[];
        edges?: unknown[];
        meta?: Record<string, unknown>;
    };
}

interface ProviderInfo {
    id: string;
    label: string;
    auth: string[];
    auth_modes?: Array<{ id?: string; label?: string; secret_required?: boolean }>;
    default_auth_mode?: string;
    default_model?: string;
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

interface DoctorCheck {
    name: string;
    status: 'pass' | 'warn' | 'fail' | string;
    detail?: string;
    recommendation?: string;
}

interface AutopilotPack {
    id: string;
    label: string;
    goal: string;
    duty: string;
    prompt: string;
}

type CanvasNodeType = 'trigger' | 'agent' | 'action';
type TriggerKind = 'schedule' | 'webhook' | 'manual';
type ActionKind = 'send_wechat' | 'send_telegram' | 'send_whatsapp' | 'send_email' | 'write_file';

type TriggerCanvasData = {
    label: string;
    triggerType: TriggerKind;
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
};

type ActionCanvasData = {
    label: string;
    actionType: ActionKind;
};

type CanvasNodeData = TriggerCanvasData | AgentCanvasData | ActionCanvasData;
type CanvasWorkflowNode = Node<CanvasNodeData>;
type CanvasWorkflowEdge = Edge;
const CANVAS_NODE_WIDTH = 220;
const CANVAS_NODE_X = 265;
const CANVAS_NODE_TOP = 50;
const CANVAS_NODE_GAP = 170;

const DEFAULT_OPERATOR: OperatorConfig = {
    modelId: 'gpt-4.1',
    agentRole: DEFAULT_AGENT_ROLE_ID,
    duty: 'Run automations reliably, explain what is happening, and ask before risky actions.',
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function makeNodeId(type: CanvasNodeType): string {
    return `${type}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultNodeData(type: CanvasNodeType): CanvasNodeData {
    if (type === 'trigger') {
        return {
            label: 'Start Trigger',
            triggerType: 'manual',
        };
    }
    if (type === 'action') {
        return {
            label: 'Send WhatsApp',
            actionType: 'send_whatsapp',
        };
    }
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
        const base: ActionCanvasData = { label: 'Send WhatsApp', actionType: 'send_whatsapp' };
        const actionType = String(raw.actionType || base.actionType).trim().toLowerCase();
        return {
            label: String(raw.label || base.label).trim() || base.label,
            actionType:
                actionType === 'send_wechat'
                || actionType === 'send_telegram'
                || actionType === 'send_whatsapp'
                || actionType === 'send_email'
                || actionType === 'write_file'
                    ? actionType
                    : 'send_whatsapp',
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

function layoutCanvasNodes(nodes: CanvasWorkflowNode[]): CanvasWorkflowNode[] {
    return nodes.map((node, index) => ({
        ...node,
        position: {
            x: CANVAS_NODE_X,
            y: CANVAS_NODE_TOP + (index * CANVAS_NODE_GAP),
        },
    }));
}

function buildLinearEdges(nodes: CanvasWorkflowNode[]): CanvasWorkflowEdge[] {
    return nodes.slice(0, -1).map((node, index) => ({
        id: `edge-${String(node.id)}-${String(nodes[index + 1].id)}`,
        source: String(node.id),
        target: String(nodes[index + 1].id),
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
        animated: true,
        selectable: false,
        style: {
            stroke: '#7c3aed',
            strokeWidth: 2,
            opacity: 0.7,
        },
    }));
}

function parseCanvasNodes(rawNodes: unknown): CanvasWorkflowNode[] {
    if (!Array.isArray(rawNodes)) return [];
    const parsed: CanvasWorkflowNode[] = [];
    for (const item of rawNodes) {
        if (!isRecord(item)) continue;
        const type = String(item.type || '').trim().toLowerCase();
        if (type !== 'trigger' && type !== 'agent' && type !== 'action') continue;
        const position = isRecord(item.position) ? item.position : {};
        const x = Number(position.x);
        const y = Number(position.y);
        parsed.push({
            id: String(item.id || makeNodeId(type)).trim() || makeNodeId(type),
            type,
            position: {
                x: Number.isFinite(x) ? x : -(CANVAS_NODE_WIDTH / 2),
                y: Number.isFinite(y) ? y : CANVAS_NODE_TOP + (parsed.length * CANVAS_NODE_GAP),
            },
            data: normalizeCanvasNodeData(type, item.data),
        });
    }
    return parsed;
}

function buildDefaultCanvasNodes(): CanvasWorkflowNode[] {
    return layoutCanvasNodes([
        {
            id: 'trigger-default',
            type: 'trigger',
            position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP },
            data: { label: 'Start Trigger', triggerType: 'manual' },
        },
        {
            id: 'agent-default',
            type: 'agent',
            position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP + CANVAS_NODE_GAP },
            data: {
                label: 'AI Agent',
                modelId: 'gpt-4.1',
                prompt: 'Describe the task for this agent.',
                tools: [],
                provider: 'openai',
                role: 'Worker',
                duty: 'Complete the assigned task clearly and reliably.',
                status: 'ready',
                description: 'Autonomous reasoning',
            },
        },
        {
            id: 'action-default',
            type: 'action',
            position: { x: CANVAS_NODE_X, y: CANVAS_NODE_TOP + (CANVAS_NODE_GAP * 2) },
            data: { label: 'Send Telegram', actionType: 'send_telegram' },
        },
    ]);
}

function resolveCanvasCenterX(
    reactFlow: Pick<ReactFlowInstance<CanvasWorkflowNode, Edge>, 'screenToFlowPosition'>,
    host: HTMLDivElement | null,
): number | null {
    const rect = host?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const center = reactFlow.screenToFlowPosition({
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
    });
    return Number.isFinite(center.x) ? center.x : null;
}

function CanvasViewportCenter({
    hostRef,
    onCenterChange,
}: {
    hostRef: React.RefObject<HTMLDivElement | null>;
    onCenterChange: (centerX: number) => void;
}) {
    const reactFlow = useReactFlow<CanvasWorkflowNode, Edge>();
    const nodesInitialized = useNodesInitialized();
    const hasSyncedRef = useRef(false);

    useEffect(() => {
        if (!nodesInitialized || hasSyncedRef.current) return;
        const centerX = resolveCanvasCenterX(reactFlow, hostRef.current);
        if (centerX === null) return;
        hasSyncedRef.current = true;
        onCenterChange(centerX);
    }, [hostRef, nodesInitialized, onCenterChange, reactFlow]);

    return null;
}

function serializeCanvasNodes(nodes: CanvasWorkflowNode[]): Array<Record<string, unknown>> {
    return nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
    }));
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

export default function WorkflowEditorInnerPro({ workflowId }: WorkflowEditorInnerProProps) {
    const { addToast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const streamRef = useRef<EventSource | null>(null);
    const flowInstanceRef = useRef<ReactFlowInstance<CanvasWorkflowNode, Edge> | null>(null);
    const canvasHostRef = useRef<HTMLDivElement | null>(null);
    const onboardingToastShownRef = useRef(false);
    const [canvasNodes, setCanvasNodes] = useState<CanvasWorkflowNode[]>(() => {
        return buildDefaultCanvasNodes();
    });
    const [canvasEdges, setCanvasEdges] = useState<CanvasWorkflowEdge[]>(() => {
        const initialNodes = buildDefaultCanvasNodes();
        return buildLinearEdges(initialNodes);
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [workflow, setWorkflow] = useState<WorkflowShape | null>(null);
    const [workspaceId, setWorkspaceId] = useState<string>('default');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const [runStatus, setRunStatus] = useState<RunStatus>('idle');
    const [runId, setRunId] = useState<string | null>(null);
    const [logs, setLogs] = useState<RunLogEntry[]>([]);
    const [usageTelemetry, setUsageTelemetry] = useState<MaskedUsageTelemetry | null>(null);

    const [operator, setOperator] = useState<OperatorConfig>(DEFAULT_OPERATOR);
    const [connection, setConnection] = useState<ConnectionConfig>(DEFAULT_CONNECTION);
    const [providerAuthMode, setProviderAuthMode] = useState('api_key');
    const [runtimeApiKey, setRuntimeApiKey] = useState(ORION_API_KEY);
    const [showBehavior, setShowBehavior] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [trustMode, setTrustMode] = useState<TrustMode>('ask');
    const [isPreflightChecking, setIsPreflightChecking] = useState(false);

    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
    const [models, setModels] = useState<string[]>([]);
    const [providersLoading, setProvidersLoading] = useState(false);
    const [credentialsLoading, setCredentialsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [credentialBusy, setCredentialBusy] = useState(false);
    const [connectedChannels, setConnectedChannels] = useState<string[]>([]);

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

    const buildHeaders = useMemo(() => {
        return (withJson: boolean): HeadersInit => {
            const headers = new Headers();
            if (withJson) headers.set('Content-Type', 'application/json');
            if (runtimeApiKey) headers.set('X-API-Key', runtimeApiKey);
            return headers;
        };
    }, [runtimeApiKey]);

    const withWorkspaceQuery = useCallback((path: string): string => {
        if (!workspaceId) return path;
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}workspace_id=${encodeURIComponent(workspaceId)}`;
    }, [workspaceId]);

    const providerOptions = useMemo(() => {
        return providers.length > 0
            ? providers
            : [
                { id: 'openai', label: 'OpenAI', auth: ['api_key'], auth_modes: [{ id: 'api_key', label: 'API Key', secret_required: true }], default_auth_mode: 'api_key', default_model: 'gpt-4.1' },
                { id: 'anthropic', label: 'Anthropic', auth: ['api_key', 'local_cli'], auth_modes: [{ id: 'api_key', label: 'API Key', secret_required: true }, { id: 'local_cli', label: 'Claude Subscription', secret_required: false }], default_auth_mode: 'api_key', default_model: 'claude-3-5-sonnet-20241022' },
                { id: 'gemini', label: 'Google Gemini', auth: ['api_key'], auth_modes: [{ id: 'api_key', label: 'API Key', secret_required: true }], default_auth_mode: 'api_key', default_model: 'gemini-2.0-flash' },
                { id: 'vertex', label: 'Google Vertex AI', auth: ['access_token', 'project_id', 'location'], auth_modes: [{ id: 'access_token', label: 'Access Token', secret_required: true }], default_auth_mode: 'access_token', default_model: 'gemini-2.0-flash-001' },
            ];
    }, [providers]);

    const selectedProvider = useMemo(() => {
        return providerOptions.find((item) => normalizeProvider(item.id) === connection.provider) || providerOptions[0];
    }, [providerOptions, connection.provider]);

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

    const filteredCredentials = useMemo(() => {
        return credentials.filter((item) => normalizeProvider(item.provider) === connection.provider);
    }, [credentials, connection.provider]);

    const appendLog = useCallback((message: string, level: LogLevel = 'info') => {
        setLogs((prev) => [...prev, { ts: new Date().toISOString(), level, message }]);
    }, []);

    useEffect(() => {
        const stored = readRuntimeApiKeyFromStorage('');
        if (stored) setRuntimeApiKey(stored);
    }, []);

    useEffect(() => {
        writeRuntimeApiKeyToStorage(runtimeApiKey);
    }, [runtimeApiKey]);

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
    }, []);

    const buildCanvasDefinition = useCallback((baseDefinition: WorkflowShape['definition'], nextNodes: CanvasWorkflowNode[], nextEdges: CanvasWorkflowEdge[]) => {
        const baseMeta = baseDefinition?.meta || {};
        return {
            nodes: serializeCanvasNodes(nextNodes),
            edges: nextEdges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            })),
            meta: {
                ...baseMeta,
                mode: 'visual_builder',
            },
        };
    }, []);

    const fetchProviders = useCallback(async () => {
        setProvidersLoading(true);
        try {
            const res = await fetch(`${ORION_API_URL}/providers`, { headers: buildHeaders(false) });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to load providers.');
            }
            const payload = await res.json();
            const items = Array.isArray(payload?.providers) ? payload.providers : [];
            setProviders(items);
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Providers', message: getErrorMessage(error, 'Unable to load providers.') });
        } finally {
            setProvidersLoading(false);
        }
    }, [buildHeaders, addToast]);

    const fetchCredentials = useCallback(async () => {
        setCredentialsLoading(true);
        try {
            const res = await fetch(`${ORION_API_URL}${withWorkspaceQuery('/credentials/vault')}`, { headers: buildHeaders(false) });
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
    }, [buildHeaders, addToast, withWorkspaceQuery]);

    const fetchConnectedChannels = useCallback(async () => {
        try {
            const res = await fetch(`${ORION_API_URL}/connectors/vault?workspace_id=${encodeURIComponent(workspaceId)}`, {
                headers: buildHeaders(false),
            });
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
    }, [buildHeaders, workspaceId]);

    const fetchModels = useCallback(async (provider: ProviderId, credentialId?: string, suppressToast?: boolean) => {
        setModelsLoading(true);
        try {
            const params = new URLSearchParams();
            if (credentialId) params.set('credential_id', credentialId);
            if (workspaceId) params.set('workspace_id', workspaceId);
            const qs = params.toString();
            const res = await fetch(`${ORION_API_URL}/providers/${provider}/models${qs ? `?${qs}` : ''}`, { headers: buildHeaders(false) });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Failed to load models.');
            }
            const payload = await res.json();
            const providerModels = Array.isArray(payload?.models) ? payload.models : [];
            setModels(providerModels);
            if (providerModels.length > 0) {
                setOperator((prev) => {
                    if (prev.modelId && providerModels.includes(prev.modelId)) return prev;
                    return { ...prev, modelId: providerModels[0] };
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
    }, [buildHeaders, addToast, workspaceId]);

    const loadWorkflow = useCallback(async () => {
        if (!workflowId) {
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

            setOperator({
                modelId: typeof operatorStored?.modelId === 'string' ? operatorStored.modelId : DEFAULT_OPERATOR.modelId,
                agentRole: isAgentRoleId(operatorStored?.agentRole) ? operatorStored.agentRole : DEFAULT_OPERATOR.agentRole,
                duty: typeof operatorStored?.duty === 'string' ? operatorStored.duty : DEFAULT_OPERATOR.duty,
                systemPrompt: typeof operatorStored?.systemPrompt === 'string' ? operatorStored.systemPrompt : DEFAULT_OPERATOR.systemPrompt,
                userGoal: typeof operatorStored?.userGoal === 'string' ? operatorStored.userGoal : '',
            });

            setConnection({
                provider: normalizeProvider(typeof connectionStored?.provider === 'string' ? connectionStored.provider : DEFAULT_CONNECTION.provider),
                mode: connectionStored?.mode === 'managed' ? 'managed' : 'byok',
                credentialId: typeof connectionStored?.credentialId === 'string' ? connectionStored.credentialId : '',
            });
            const parsedNodes = parseCanvasNodes(wf?.definition?.nodes);
            const orderedNodes = parsedNodes.length > 0
                ? layoutCanvasNodes(
                    [...parsedNodes].sort((left, right) => (left.position.y - right.position.y) || (left.position.x - right.position.x)),
                )
                : buildDefaultCanvasNodes();
            setCanvasNodes(orderedNodes);
            setCanvasEdges(buildLinearEdges(orderedNodes));
            setSelectedNodeId(orderedNodes[0]?.id || null);
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Load Failed', message: getErrorMessage(error, 'Unable to load workflow.') });
        } finally {
            setIsLoading(false);
        }
    }, [workflowId, addToast]);

    useEffect(() => {
        loadWorkflow();
        fetchProviders();
        fetchCredentials();
        fetchConnectedChannels();
        return () => {
            if (streamRef.current) streamRef.current.close();
        };
    }, [loadWorkflow, fetchProviders, fetchCredentials, fetchConnectedChannels]);

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
        if (!workflowId) return;
        setIsSaving(true);
        try {
            const nextDefinition = Array.isArray(workflow?.definition?.nodes)
                ? buildCanvasDefinition(workflow?.definition, canvasNodes, canvasEdges)
                : buildDefinition(workflow?.definition, operator, connection);
            await updateWorkflow(workflowId, nextDefinition);
            setWorkflow((prev) => ({ ...(prev || {}), definition: nextDefinition }));
            const now = new Date().toISOString();
            setLastSavedAt(now);
            addToast({ type: 'success', title: 'Saved', message: 'Workflow saved.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Save Failed', message: getErrorMessage(error, 'Unable to save workflow.') });
        } finally {
            setIsSaving(false);
        }
    }, [workflowId, workflow, operator, connection, canvasNodes, canvasEdges, buildDefinition, buildCanvasDefinition, addToast]);

    const isCanvasMode = Array.isArray(workflow?.definition?.nodes);
    const isOnboardingWorkflow = Boolean(workflow?.definition?.meta && typeof workflow.definition.meta === 'object' && 'onboarding_request' in workflow.definition.meta);
    const isSimplifiedCanvasWorkflow = isCanvasMode && isOnboardingWorkflow;
    const isWorkflowActive = String(workflow?.status || '').trim().toLowerCase() === 'published';
    const workflowStatusSentence = useMemo(() => {
        if (!channelConnected) {
            return '⚠ Connect a channel to activate this automation';
        }
        if (isWorkflowActive) {
            return `✓ Active — running ${triggerSummary} and sending alerts to ${statusChannel.label}`;
        }
        return '○ Not active — turn on to start receiving alerts';
    }, [channelConnected, isWorkflowActive, statusChannel.label, triggerSummary]);

    const selectedNode = useMemo(
        () => canvasNodes.find((node) => node.id === selectedNodeId) || null,
        [canvasNodes, selectedNodeId],
    );

    const renderedCanvasEdges = useMemo<Edge[]>(
        () => canvasEdges.map((edge) => ({
            ...edge,
            type: 'smoothstep' as const,
            animated: runStatus === 'running',
            style: {
                stroke: '#7c3aed',
                strokeWidth: 2,
                opacity: 0.7,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
        })),
        [canvasEdges, runStatus],
    );

    const handleCanvasCenterChange = useCallback(() => {
        setCanvasNodes((prev) => layoutCanvasNodes(prev));
    }, []);

    const handleCanvasInit = useCallback((instance: ReactFlowInstance<CanvasWorkflowNode, Edge>) => {
        flowInstanceRef.current = instance;
        const nextCenterX = resolveCanvasCenterX(instance, canvasHostRef.current);
        if (nextCenterX !== null) {
            setCanvasNodes((prev) => layoutCanvasNodes(prev));
        }
        instance.fitView({ padding: 0.4, duration: 400, maxZoom: 1.1 });
    }, []);

    const addCanvasNode = useCallback((type: CanvasNodeType) => {
        setCanvasNodes((prev) => {
            const maxY = prev.length > 0 ? Math.max(...prev.map((node) => Number(node.position.y) || CANVAS_NODE_TOP)) : (CANVAS_NODE_TOP - CANVAS_NODE_GAP);
            const nextNodes = [
                ...prev,
                {
                    id: makeNodeId(type),
                    type,
                    position: { x: CANVAS_NODE_X, y: maxY + CANVAS_NODE_GAP },
                    data: defaultNodeData(type),
                },
            ];
            setCanvasEdges(buildLinearEdges(nextNodes));
            setSelectedNodeId(nextNodes[nextNodes.length - 1]?.id || null);
            return nextNodes;
        });
    }, []);

    const updateSelectedNode = useCallback((updater: (node: CanvasWorkflowNode) => CanvasWorkflowNode) => {
        if (!selectedNodeId) return;
        setCanvasNodes((prev) => prev.map((node) => (node.id === selectedNodeId ? updater(node) : node)));
    }, [selectedNodeId]);

    const handleCanvasNodesChange = useCallback((changes: NodeChange<CanvasWorkflowNode>[]) => {
        setCanvasNodes((prev) => applyNodeChanges(changes, prev));
    }, []);

    useEffect(() => {
        if (!isCanvasMode || !selectedNodeId) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Backspace') return;
            const tagName = (document.activeElement?.tagName || '').toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;
            event.preventDefault();
            setCanvasNodes((prev) => {
                const remaining = prev.filter((node) => node.id !== selectedNodeId);
                setCanvasEdges(buildLinearEdges(remaining));
                setSelectedNodeId(remaining[0]?.id || null);
                return remaining;
            });
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCanvasMode, selectedNodeId]);

    const handlePublish = useCallback(async () => {
        if (!workflowId) return;
        try {
            await saveWorkflowState();
            await publishWorkflow(workflowId);
            setWorkflow((prev) => ({ ...(prev || {}), status: 'published' }));
            addToast({ type: 'success', title: 'Published', message: 'Workflow published.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Publish Failed', message: getErrorMessage(error, 'Unable to publish workflow.') });
        }
    }, [workflowId, saveWorkflowState, addToast]);

    const handleActivationToggle = useCallback(async () => {
        if (isWorkflowActive) {
            addToast({ type: 'info', title: 'Already active', message: 'This automation is already turned on.' });
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
        if (connection.provider === 'gemini') return { api_key: geminiKey.trim() };
        if (connection.provider === 'vertex') {
            return {
                access_token: vertexToken.trim(),
                project_id: vertexProject.trim(),
                location: vertexLocation.trim() || 'us-central1',
            };
        }
        const token = openaiKey.trim();
        return { api_key: token, access_token: token, oauth_token: token };
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
            const res = await fetch(`${ORION_API_URL}/credentials/vault`, {
                method: 'POST',
                headers: buildHeaders(true),
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
        buildHeaders,
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
            const res = await fetch(`${ORION_API_URL}${withWorkspaceQuery(`/credentials/vault/${connection.credentialId}/test`)}`, {
                method: 'POST',
                headers: buildHeaders(false),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'Credential test failed.');
            }
            const payload = await res.json();
            const preview = Array.isArray(payload?.models_preview) ? payload.models_preview : [];
            setModels(preview);
            if (preview.length > 0) {
                setOperator((prev) => ({ ...prev, modelId: preview.includes(prev.modelId) ? prev.modelId : preview[0] }));
            }
            addToast({ type: 'success', title: 'Connected', message: payload?.message || 'Credential is valid.' });
        } catch (error: unknown) {
            addToast({ type: 'error', title: 'Connection Failed', message: getErrorMessage(error, 'Unable to validate credential.') });
        } finally {
            setCredentialBusy(false);
        }
    }, [connection.mode, connection.credentialId, buildHeaders, addToast, withWorkspaceQuery]);

    const deleteCredential = useCallback(async (credentialId: string) => {
        try {
            const res = await fetch(`${ORION_API_URL}${withWorkspaceQuery(`/credentials/vault/${credentialId}`)}`, {
                method: 'DELETE',
                headers: buildHeaders(false),
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
    }, [buildHeaders, fetchCredentials, connection.credentialId, addToast, withWorkspaceQuery]);

    const exportVaultBundle = useCallback(async () => {
        if (!vaultPassphrase.trim()) {
            addToast({ type: 'error', title: 'Passphrase Required', message: 'Enter a passphrase to export.' });
            return;
        }
        setVaultBusy(true);
        try {
            const res = await fetch(`${ORION_API_URL}/credentials/vault/export`, {
                method: 'POST',
                headers: buildHeaders(true),
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
    }, [vaultPassphrase, buildHeaders, workspaceId, addToast]);

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
            const res = await fetch(`${ORION_API_URL}/credentials/vault/import`, {
                method: 'POST',
                headers: buildHeaders(true),
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
    }, [vaultPassphrase, vaultBundle, vaultImportOverwrite, buildHeaders, workspaceId, fetchCredentials, addToast]);

    const rotateVaultKey = useCallback(async () => {
        if (!newVaultPassphrase.trim()) {
            addToast({ type: 'error', title: 'New Key Required', message: 'Enter a new vault key passphrase.' });
            return;
        }
        setVaultBusy(true);
        try {
            const res = await fetch(`${ORION_API_URL}/credentials/vault/rotate-key`, {
                method: 'POST',
                headers: buildHeaders(true),
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
    }, [newVaultPassphrase, buildHeaders, addToast]);

    const closeStream = useCallback(() => {
        if (!streamRef.current) return;
        streamRef.current.close();
        streamRef.current = null;
    }, []);

    const submitDecision = useCallback(async (decision: 'Proceed' | 'Hold') => {
        if (!runId) return;
        try {
            const res = await fetch(`${ORION_API_URL}/runs/${runId}/decision`, {
                method: 'POST',
                headers: buildHeaders(true),
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
    }, [runId, buildHeaders, appendLog]);

    const startRun = useCallback(async () => {
        if (!operator.userGoal.trim()) {
            addToast({ type: 'error', title: 'Goal Required', message: 'Describe what you want done first.' });
            return;
        }
        if (connection.mode === 'byok' && !connection.credentialId) {
            addToast({ type: 'error', title: 'Credential Required', message: 'Connect a key before running.' });
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
            setIsPreflightChecking(true);
            const doctorRes = await fetch(`${ORION_API_URL}/doctor`, { headers: buildHeaders(false) });
            if (doctorRes.ok) {
                const doctorPayload = await doctorRes.json();
                const checks = Array.isArray(doctorPayload?.checks) ? (doctorPayload.checks as DoctorCheck[]) : [];
                const failing = checks.find((check) => check.status === 'fail');
                if (failing) {
                    const guidance = [failing.detail || 'System preflight failed.', failing.recommendation || '']
                        .filter(Boolean)
                        .join(' ');
                    throw new Error(guidance);
                }
                const openaiWarn = checks.find(
                    (check) => check.name === 'openai_connectivity' && check.status === 'warn',
                );
                if (openaiWarn && connection.provider === 'openai' && connection.mode === 'managed') {
                    throw new Error(
                        'OpenAI connection is not ready. Open advanced setup and reconnect your OpenAI account.',
                    );
                }
            }

            const businessPlan = [
                `Automation: ${workflow?.name || workflowId || 'Untitled'}`,
                `Goal: ${operator.userGoal.trim()}`,
                `Agent Role: ${operator.agentRole}`,
                `Duty: ${operator.duty.trim()}`,
                `Prompt: ${operator.systemPrompt.trim()}`,
                `Provider: ${connection.provider}`,
                `Mode: ${connection.mode}`,
                `Model: ${operator.modelId}`,
                `Trust Mode: ${trustMode}`,
            ].join('\n');

            const res = await fetch(`${ORION_API_URL}/runs/start`, {
                method: 'POST',
                headers: buildHeaders(true),
                body: JSON.stringify({
                    engine: 'codex',
                    workflow_id: workflowId,
                    workspace_id: workspaceId,
                    user_goal: operator.userGoal.trim(),
                    business_plan: businessPlan,
                    agent_role: operator.agentRole,
                    provider: connection.provider,
                    model: operator.modelId.trim(),
                    credential_id: connection.mode === 'byok' ? connection.credentialId : undefined,
                    agents: [
                        {
                            role: operator.agentRole,
                            modelId: operator.modelId.trim(),
                            provider: connection.provider,
                        },
                    ],
                    metadata: {
                        workspace_id: workspaceId,
                        agent_role: operator.agentRole,
                        provider: connection.provider,
                        model: operator.modelId.trim(),
                        mode: connection.mode,
                        trust_mode: trustMode,
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
            setRunId(nextRunId);
            appendLog(`Autopilot started using ${connection.provider}:${operator.modelId}.`);

            const streamUrl = runtimeApiKey
                ? `${ORION_API_URL}/runs/${nextRunId}/stream?api_key=${encodeURIComponent(runtimeApiKey)}`
                : `${ORION_API_URL}/runs/${nextRunId}/stream`;
            const eventSource = new EventSource(streamUrl);
            streamRef.current = eventSource;

            eventSource.addEventListener('log', (event: MessageEvent) => {
                const parsed = parseJson(event.data);
                if (isStreamPayload(parsed)) {
                    const evt = String(parsed.event || '');
                    const rawMessage = String(parsed.message || event.data);
                    const prettyMessage = evt === 'run_error' ? humanizeRuntimeError(rawMessage) : rawMessage;
                    appendLog(prettyMessage, (parsed.level as LogLevel) || 'info');
                    if (evt === 'run_complete') setRunStatus('completed');
                    if (evt === 'run_error') setRunStatus('error');
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
            });

            eventSource.addEventListener('pause', () => {
                setRunStatus('waiting');
                appendLog('Approval required before continuing.', 'warn');
            });

            eventSource.onerror = () => {
                eventSource.close();
                streamRef.current = null;
                setRunStatus((prev) => (prev === 'running' ? 'completed' : prev));
            };
        } catch (error: unknown) {
            setRunStatus('error');
            const message = humanizeRuntimeError(getErrorMessage(error, 'Run failed to start.'));
            appendLog(message, 'error');
            addToast({ type: 'error', title: 'Run Failed', message });
        } finally {
            setIsPreflightChecking(false);
        }
    }, [operator, connection, workflow, workflowId, workspaceId, trustMode, runtimeApiKey, buildHeaders, closeStream, appendLog, addToast]);

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
                Loading automation...
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
                        <div className="workflow-pro-log-title">{workflow?.name || 'Automation'}</div>
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
                                disabled={runStatus === 'running' || isPreflightChecking}
                                className="orion-btn orion-btn-ghost"
                            >
                                <Play size={14} />
                                {runStatus === 'running' ? 'Testing…' : isPreflightChecking ? 'Preparing…' : 'Test once'}
                            </button>
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
                                {isSaving ? 'Saving...' : 'Save'}
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
                            {isSaving ? 'Saving...' : 'Save'}
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
                            <button
                                className="workflow-canvas-palette-btn"
                                onClick={() => addCanvasNode('trigger')}
                                style={{ ['--workflow-palette-accent' as string]: '#f59e0b' }}
                            >
                                <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                                    <Zap size={14} />
                                </span>
                                Trigger
                            </button>
                            <button
                                className="workflow-canvas-palette-btn"
                                onClick={() => addCanvasNode('agent')}
                                style={{ ['--workflow-palette-accent' as string]: '#7c3aed' }}
                            >
                                <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
                                    <BrainCircuit size={14} />
                                </span>
                                Agent
                            </button>
                            <button
                                className="workflow-canvas-palette-btn"
                                onClick={() => addCanvasNode('action')}
                                style={{ ['--workflow-palette-accent' as string]: '#10b981' }}
                            >
                                <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                    <Send size={14} />
                                </span>
                                Action
                            </button>
                            <div style={{ ...workflowMutedCopyStyle, lineHeight: 1.5 }}>
                                Click a node type to add it. Drag nodes to reposition them on the canvas. Press Backspace to delete the selected node.
                            </div>
                        </section>

                        <section ref={canvasHostRef} className="workflow-pro-panel workflow-canvas-panel" style={{ padding: 0, overflow: 'hidden', height: '100%', display: 'flex' }}>
                            <ReactFlow
                                style={{ flex: 1, minHeight: 0, height: 'calc(100vh - 120px)' }}
                                nodes={canvasNodes}
                                edges={renderedCanvasEdges}
                                nodeTypes={CANVAS_NODE_TYPES}
                                fitView
                                fitViewOptions={{ padding: 0.4 }}
                                onInit={handleCanvasInit}
                                onNodesChange={handleCanvasNodesChange}
                                onNodeClick={(_event: unknown, node: CanvasWorkflowNode) => setSelectedNodeId(node.id)}
                                onPaneClick={() => setSelectedNodeId(null)}
                                panOnDrag
                                zoomOnScroll
                                zoomOnPinch
                                snapToGrid
                                snapGrid={[20, 20]}
                                nodesConnectable={false}
                                elementsSelectable
                                proOptions={{ hideAttribution: true }}
                                defaultEdgeOptions={{
                                    type: 'smoothstep',
                                    animated: runStatus === 'running',
                                    markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed' },
                                    selectable: false,
                                    style: { stroke: '#7c3aed', strokeWidth: 2, opacity: 0.7 },
                                }}
                            >
                                <Background
                                    variant={BackgroundVariant.Dots}
                                    gap={20}
                                    size={1.5}
                                    color="#c4c4c4"
                                />
                                <CanvasViewportCenter hostRef={canvasHostRef} onCenterChange={handleCanvasCenterChange} />
                                <Controls position="bottom-right" showInteractive={false} showFitView />
                            </ReactFlow>
                        </section>

                        <section className="workflow-pro-panel" style={{ overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start' }}>
                            <div className="workflow-pro-section-title">Inspector</div>
                            {!selectedNode ? (
                                <div style={workflowMutedCopyStyle}>Select a node on the canvas to edit its configuration.</div>
                            ) : (
                                <>
                                    <div>
                                        <label style={workflowLabelStyle}>Label</label>
                                        <input
                                            value={String((selectedNode.data as { label?: string })?.label || '')}
                                            onChange={(e) => updateSelectedNode((node) => ({ ...node, data: { ...node.data, label: e.target.value } }))}
                                            style={workflowInputSurfaceStyle}
                                        />
                                    </div>

                                    {selectedNode.type === 'trigger' ? (
                                        <div>
                                            <label style={workflowLabelStyle}>Trigger type</label>
                                            <select
                                                value={String((selectedNode.data as TriggerCanvasData).triggerType || 'manual')}
                                                onChange={(e) => updateSelectedNode((node) => ({ ...node, data: { ...node.data, triggerType: e.target.value as TriggerKind } }))}
                                                style={workflowInputSurfaceStyle}
                                            >
                                                <option value="manual">Manual</option>
                                                <option value="schedule">Schedule</option>
                                                <option value="webhook">Webhook</option>
                                            </select>
                                        </div>
                                    ) : null}

                                    {selectedNode.type === 'agent' ? (
                                        <>
                                            {isSimplifiedCanvasWorkflow && !showAdvancedSettings ? (
                                                <div style={workflowMutedCopyStyle}>
                                                    Advanced agent settings are hidden for onboarding workflows. Open <strong style={{ color: 'var(--text-primary)' }}>Advanced settings</strong> to adjust the model, prompt, or tools.
                                                </div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label style={workflowLabelStyle}>Model</label>
                                                        <select
                                                            value={String((selectedNode.data as AgentCanvasData).modelId || operator.modelId)}
                                                            onChange={(e) => updateSelectedNode((node) => ({ ...node, data: { ...node.data, modelId: e.target.value } }))}
                                                            style={workflowInputSurfaceStyle}
                                                        >
                                                            {(models.length > 0 ? models : [operator.modelId || 'gpt-4.1']).map((model) => (
                                                                <option key={model} value={model}>{model}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label style={workflowLabelStyle}>Prompt</label>
                                                        <textarea
                                                            value={String((selectedNode.data as AgentCanvasData).prompt || '')}
                                                            onChange={(e) => updateSelectedNode((node) => ({ ...node, data: { ...node.data, prompt: e.target.value } }))}
                                                            rows={5}
                                                            style={{ ...workflowInputSurfaceStyle, padding: 10, resize: 'vertical' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={workflowLabelStyle}>Tools</label>
                                                        <input
                                                            value={String(((selectedNode.data as AgentCanvasData).tools || []).join(', '))}
                                                            onChange={(e) => updateSelectedNode((node) => ({
                                                                ...node,
                                                                data: {
                                                                    ...node.data,
                                                                    tools: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                                                                },
                                                            }))}
                                                            placeholder="browser, telegram, files"
                                                            style={workflowInputSurfaceStyle}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    ) : null}

                                    {selectedNode.type === 'action' ? (
                                        <div>
                                            <label style={workflowLabelStyle}>Action</label>
                                            <select
                                                value={String((selectedNode.data as ActionCanvasData).actionType || 'send_whatsapp')}
                                                onChange={(e) => updateSelectedNode((node) => ({ ...node, data: { ...node.data, actionType: e.target.value as ActionKind } }))}
                                                style={workflowInputSurfaceStyle}
                                            >
                                                <option value="send_whatsapp">Send WhatsApp</option>
                                                <option value="send_email">Send Email</option>
                                                <option value="send_wechat">Send WeChat</option>
                                                <option value="send_telegram">Send Telegram</option>
                                                <option value="write_file">Write File</option>
                                            </select>
                                        </div>
                                    ) : null}
                                </>
                            )}
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
                            AI: {connection.provider.toUpperCase()} · {connection.mode === 'managed' ? 'Managed' : 'Your Key'} · {operator.modelId} · {AGENT_ROLE_OPTIONS.find((item) => item.id === operator.agentRole)?.label || operator.agentRole}
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
                            <label style={workflowLabelStyle}>Connection Mode</label>
                            <select
                                value={connection.mode}
                                onChange={(e) => setConnection((prev) => ({
                                    ...prev,
                                    mode: e.target.value === 'managed' ? 'managed' : 'byok',
                                }))}
                                style={workflowInputSurfaceStyle}
                            >
                                <option value="managed">Managed by platform</option>
                                <option value="byok">Use my own API key</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                        <label style={workflowLabelStyle}>Runtime access key (if enabled)</label>
                        <input
                            value={runtimeApiKey}
                            onChange={(e) => setRuntimeApiKey(e.target.value)}
                            placeholder="Optional for local dev, required when ORION_AUTH_REQUIRED=1"
                            type="password"
                            style={workflowInputSurfaceStyle}
                        />
                        <div style={workflowMutedCopyStyle}>
                            Saved locally in your browser for this device.
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
                                    <input
                                        value={openaiKey}
                                        onChange={(e) => setOpenaiKey(e.target.value)}
                                        placeholder="OpenAI API key or Codex OAuth access token"
                                        type="password"
                                        style={workflowInputSurfaceStyle}
                                    />
                                )}
                                {connection.provider === 'anthropic' && (
                                    providerAuthNeedsSecret ? (
                                        <input
                                            value={anthropicKey}
                                            onChange={(e) => setAnthropicKey(e.target.value)}
                                            placeholder="Anthropic API key"
                                            type="password"
                                            style={workflowInputSurfaceStyle}
                                        />
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
                                    <input
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="Gemini API key"
                                        type="password"
                                        style={workflowInputSurfaceStyle}
                                    />
                                )}
                                {connection.provider === 'vertex' && (
                                    <>
                                        <input
                                            value={vertexToken}
                                            onChange={(e) => setVertexToken(e.target.value)}
                                            placeholder="Vertex OAuth access token"
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
                            disabled={runStatus === 'running' || isPreflightChecking}
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
                            <div className="workflow-pro-log-title">{isSimplifiedCanvasWorkflow ? 'Recent activity' : 'Live Activity'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                {isSimplifiedCanvasWorkflow ? 'What happened the last time you tested this automation.' : 'Time-stamped events.'}
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
                                {isSimplifiedCanvasWorkflow ? 'Nothing to show yet. Try it once to see activity here.' : 'No events yet. Press Run to start.'}
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
