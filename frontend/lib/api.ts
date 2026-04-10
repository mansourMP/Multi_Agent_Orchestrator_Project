import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { formatExecutionTargetLabel, normalizeExecutionTarget } from '@/lib/executionTargets';
import {
    agentBiblePath,
    agentChannelsPath,
    agentConnectorsPath,
    agentDetailPath,
    agentManifestPath,
    agentRuntimePath,
    agentsCollectionPath,
    agentsListPath,
    agentSkillsPath,
    installedAgentRunPath,
} from '@/lib/agentApiPaths.js';

/**
 * Enhanced fetch wrapper to handle JSON errors and provide better feedback
 */

export class ApiError extends Error {
    /** HTTP status code returned by the backend */
    readonly status: number;
    readonly details?: unknown;

    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

type ParsedApiError = {
    message: string;
    details?: unknown;
};

async function parseApiError(res: Response): Promise<ParsedApiError> {
    let errorMsg = `API Error: ${res.status} ${res.statusText}`;
    let details: unknown;
    try {
        const body = await res.json();
        details = body;
        if (body && typeof body.detail === 'string' && body.detail.trim()) {
            errorMsg = body.detail.trim();
        } else if (body && typeof body.error === 'string' && body.error.trim()) {
            errorMsg = body.error.trim();
        } else if (body && body.message) {
            errorMsg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
        }
    } catch {
        // No JSON body, use default status text
    }
    return {
        message: errorMsg,
        details,
    };
}

async function jsonFetch(url: string, options: RequestInit = {}, connectionError: string) {
    let res: Response;
    try {
        res = await fetch(url, options);
    } catch {
        throw new ApiError(connectionError, 0);
    }

    if (!res.ok) {
        const parsed = await parseApiError(res);
        throw new ApiError(parsed.message, res.status, parsed.details);
    }

    return res.json();
}

async function internalApiFetch(endpoint: string, options: RequestInit = {}) {
    await ensureControlPlaneSession();
    return jsonFetch(endpoint, options, `Cannot reach the internal API route on ${endpoint}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeStringList(value: unknown): string[] {
    const items = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
        const token = String(item || '').trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        out.push(token);
    }
    return out;
}

function normalizeRememberedGrants(value: unknown): {
    folders: string[];
    browser_session: boolean;
    shell_capabilities: string[];
} {
    const source = isRecord(value) ? value : {};
    return {
        folders: normalizeStringList(source.folders),
        browser_session: Boolean(source.browser_session),
        shell_capabilities: normalizeStringList(source.shell_capabilities),
    };
}

type WorkflowExecutionShape = {
    id: string;
    name?: string;
    description?: string;
    tenantId?: string;
    workspaceId?: string;
    currentVersionId?: string;
    publishedVersionId?: string;
    workflowVersionId?: string;
    versionNumber?: number;
    definition?: {
        version?: string;
        nodes?: Record<string, unknown>[];
        edges?: Record<string, unknown>[];
        defaults?: Record<string, unknown>;
        resources?: Record<string, unknown>;
        policy?: Record<string, unknown>;
        meta?: Record<string, unknown>;
    };
    validation?: WorkflowValidationSummary;
};

export interface WorkflowValidationIssue {
    code: string;
    message: string;
    level: 'error' | 'warning';
    nodeId?: string;
}

export interface WorkflowValidationSummary {
    draftIssues: WorkflowValidationIssue[];
    publishIssues: WorkflowValidationIssue[];
    hasDraftErrors: boolean;
    hasPublishErrors: boolean;
    draftErrorCount: number;
    publishErrorCount: number;
    draftWarningCount: number;
    publishWarningCount: number;
}

export interface WorkflowRecordShape {
    id: string;
    name?: string;
    description?: string;
    tenantId?: string;
    workspaceId?: string;
    status?: string;
    currentVersionId?: string;
    publishedVersionId?: string;
    workflowVersionId?: string;
    versionNumber?: number;
    definition?: WorkflowExecutionShape['definition'];
    validation?: WorkflowValidationSummary;
}

function workflowCollectionPath(workspaceId?: string | null): string {
    const token = String(workspaceId || '').trim();
    return token
        ? `/api/workflows?workspaceId=${encodeURIComponent(token)}`
        : '/api/workflows';
}

function normalizeWorkflowList(payload: unknown): WorkflowRecordShape[] {
    const normalizeItems = (items: unknown[]): WorkflowRecordShape[] =>
        items.filter((item): item is WorkflowRecordShape => isRecord(item) && typeof item.id === 'string' && item.id.trim().length > 0);
    if (Array.isArray(payload)) {
        return normalizeItems(payload);
    }
    const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
        ? (payload as { items: unknown[] }).items
        : [];
    return normalizeItems(items);
}

function extractWorkflowRunConfig(workflow: WorkflowExecutionShape, workflowId: string) {
    const definition = isRecord(workflow.definition) ? workflow.definition : {};
    const meta = isRecord(definition.meta) ? definition.meta : {};
    const defaults = isRecord(definition.defaults) ? definition.defaults : {};
    const runtimeDefaults = isRecord(defaults.runtime) ? defaults.runtime : {};
    const operator = isRecord(meta.operator) ? meta.operator : {};
    const connection = isRecord(operator.connection) ? operator.connection : {};
    const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
    const agentNodes = nodes.filter((node) => isRecord(node) && String(node.type || '').trim() === 'agent');
    const firstAgentNode = agentNodes.length > 0 && isRecord(agentNodes[0]) ? agentNodes[0] : {};
    const firstAgentData = isRecord(firstAgentNode.data) ? firstAgentNode.data : {};
    const firstAgentConfig = isRecord(firstAgentNode.config) ? firstAgentNode.config : {};
    const identity = isRecord(firstAgentConfig.identity) ? firstAgentConfig.identity : {};
    const runtime = isRecord(firstAgentConfig.runtime) ? firstAgentConfig.runtime : {};
    const permissions = isRecord(firstAgentConfig.permissions) ? firstAgentConfig.permissions : {};
    const runtimeProfileId = String(runtime.provider_profile_id || runtimeDefaults.provider_profile_id || meta.runtime_profile_id || '').trim();
    const executionTarget = normalizeExecutionTarget(runtime.execution_target || runtimeDefaults.execution_target || meta.execution_target);
    const provider = String(
        runtime.provider || firstAgentData.provider || connection.provider || runtimeDefaults.provider || meta.provider || 'openai',
    ).trim() || 'openai';
    const model = String(
        runtime.model || firstAgentData.modelId || operator.modelId || runtimeDefaults.model || meta.model || 'gpt-4o-mini',
    ).trim() || 'gpt-4o-mini';
    const userGoal = String(identity.goal || operator.userGoal || workflow.description || workflow.name || 'Run workflow').trim()
        || 'Run workflow';
    const agentRole = String(identity.role || operator.agentRole || meta.agent_role || 'operator').trim() || 'operator';
    const trustMode = String(permissions.action_policy || meta.trust_mode || 'guarded').trim() || 'guarded';
    const trustPreset = String(permissions.trust_preset || meta.trust_preset || 'standard_local').trim() || 'standard_local';
    const rememberedGrants = normalizeRememberedGrants(permissions.remembered_grants || meta.remembered_grants);
    const credentialId = runtimeProfileId
        ? ''
        : String(connection.mode || '').trim() === 'byok'
            ? String(connection.credentialId || '').trim()
            : '';
    const agents = agentNodes.map((node) => {
        const data = isRecord(node) && isRecord(node.data) ? node.data : {};
        const config = isRecord(node) && isRecord(node.config) ? node.config : {};
        const agentIdentity = isRecord(config.identity) ? config.identity : {};
        const agentRuntime = isRecord(config.runtime) ? config.runtime : {};
        return {
            role: String(agentIdentity.role || data.role || data.label || 'Agent').trim() || 'Agent',
            modelId: String(agentRuntime.model || data.modelId || model).trim() || model,
            provider: String(agentRuntime.provider || data.provider || provider).trim() || provider,
            duty: String(agentIdentity.success_condition || agentIdentity.goal || data.duty || data.description || '').trim(),
        };
    });
    const businessPlan = [
        `Workflow: ${String(workflow.name || workflowId).trim() || workflowId}`,
        `Goal: ${userGoal}`,
        `Provider: ${provider}`,
        `Model: ${model}`,
        runtimeProfileId ? `Runtime Profile: ${runtimeProfileId}` : '',
        `Execution route: ${formatExecutionTargetLabel(executionTarget)}`,
        `Agents: ${agents.length || 1}`,
    ].filter(Boolean).join('\n');

    return {
        workspaceId: String(workflow.workspaceId || meta.workspace_id || '').trim(),
        workflowVersionId: String(workflow.currentVersionId || workflow.workflowVersionId || '').trim(),
        provider,
        model,
        userGoal,
        agentRole,
        credentialId,
        runtimeProfileId,
        executionTarget,
        trustMode,
        trustPreset,
        rememberedGrants,
        connectorPermissions: Array.isArray(permissions.connector_permissions)
            ? permissions.connector_permissions.map((item) => String(item || '').trim()).filter(Boolean)
            : [],
        browserPermissions: isRecord(permissions.browser_permissions) ? permissions.browser_permissions : undefined,
        fileMountGrants: Array.isArray(permissions.file_mount_grants)
            ? permissions.file_mount_grants.filter((item) => isRecord(item))
            : [],
        businessPlan,
        agents,
    };
}

export async function fetchWorkflows(workspaceId?: string | null): Promise<WorkflowRecordShape[]> {
    const payload = await internalApiFetch(workflowCollectionPath(workspaceId));
    return normalizeWorkflowList(payload);
}

export interface BuilderConnectorManifestItem {
    id: string;
    label: string;
    auth?: {
        required_fields?: string[];
    };
    triggers?: Array<{
        id: string;
        label: string;
        description?: string;
    }>;
    actions?: Array<{
        id: string;
        label: string;
        description?: string;
    }>;
    resources?: Array<{
        id: string;
        label: string;
        access?: string[];
    }>;
    runtime_constraints?: {
        supported_targets?: string[];
    };
    notes?: string[];
    future_capabilities?: string[];
}

export async function fetchBuilderConnectorManifests(): Promise<BuilderConnectorManifestItem[]> {
    const payload = await internalApiFetch('/api/builder/manifests/connectors');
    const items = Array.isArray(payload?.items) ? payload.items as unknown[] : [];
    return items.filter((item): item is BuilderConnectorManifestItem => isRecord(item) && typeof item.id === 'string');
}

export async function createWorkflow(
    name: string,
    description: string,
    workspaceId?: string | null,
    definition: unknown = { nodes: [], edges: [] }
) : Promise<WorkflowRecordShape> {
    return internalApiFetch(workflowCollectionPath(workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description,
            definition
        }),
    });
}

export async function getWorkflow(id: string): Promise<WorkflowRecordShape> {
    return internalApiFetch(`/api/workflows/${encodeURIComponent(id)}`);
}

export async function updateWorkflow(id: string, definition: unknown): Promise<WorkflowRecordShape> {
    return internalApiFetch(`/api/workflows/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
    });
}

export async function runWorkflow(id: string, credentials: unknown[] = [], variables: unknown[] = []) {
    void credentials;
    void variables;

    const workflow = await getWorkflow(id) as WorkflowExecutionShape;
    const config = extractWorkflowRunConfig(workflow, id);
    await ensureControlPlaneSession();
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            engine: 'orion',
            workflow_id: id,
            workflow_version_id: config.workflowVersionId || undefined,
            workspace_id: config.workspaceId || undefined,
            user_goal: config.userGoal,
            business_plan: config.businessPlan,
            agent_role: config.agentRole,
            provider: config.provider,
            model: config.model,
            credential_id: config.credentialId || undefined,
            agents: config.agents,
            metadata: {
                workspace_id: config.workspaceId || undefined,
                workflow_version_id: config.workflowVersionId || undefined,
                origin: 'workflow_library',
                agent_role: config.agentRole,
                provider: config.provider,
                model: config.model,
                trust_mode: config.trustMode,
                trust_preset: config.trustPreset,
                remembered_grants: config.rememberedGrants,
                connector_permissions: config.connectorPermissions,
                browser_permissions: config.browserPermissions,
                file_mount_grants: config.fileMountGrants,
                execution_target: config.executionTarget,
                execution_target_requested: config.executionTarget,
                profile_id: config.runtimeProfileId || undefined,
                runtime_profile_id: config.runtimeProfileId || undefined,
            },
        }),
    });

    if (!response.ok) {
        let errorMsg = `API Error: ${response.status} ${response.statusText}`;
        try {
            const body = await response.json();
            if (body && typeof body.detail === 'string' && body.detail.trim()) errorMsg = body.detail.trim();
            else if (body && typeof body.error === 'string' && body.error.trim()) errorMsg = body.error.trim();
        } catch {
            // Ignore invalid JSON bodies.
        }
        throw new ApiError(errorMsg, response.status);
    }

    const payload = await response.json();
    return payload;
}

export async function resumeWorkflow(executionId: string, data: unknown = {}) {
    return internalApiFetch(`/api/executions/${encodeURIComponent(executionId)}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

export async function publishWorkflow(id: string): Promise<WorkflowRecordShape> {
    return internalApiFetch(`/api/workflows/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function deleteWorkflow(id: string) {
    return internalApiFetch(`/api/workflows/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}

export async function fetchExecutions() {
    return internalApiFetch('/api/executions/list');
}

export async function fetchExecutionHistory(limit: number = 200, workspaceId: string = 'default') {
    const query = new URLSearchParams({
        limit: String(limit),
        workspace_id: workspaceId,
    });
    return internalApiFetch(`/api/executions/history?${query.toString()}`);
}

export async function fetchRuntimeMachines() {
    return internalApiFetch('/api/machines', { cache: 'no-store' });
}

export async function fetchExecution(id: string) {
    return internalApiFetch(`/api/executions/${encodeURIComponent(id)}`);
}

export type AgentCapabilityToggle = {
    id: string;
    label: string;
    description?: string;
    default_enabled?: boolean;
};

export type AgentDefinitionRecord = {
    id: string;
    tenant_id?: string | null;
    workspace_id?: string | null;
    slug?: string | null;
    name: string;
    description?: string;
    agent_kind?: string;
    visibility?: string;
    status?: string;
    category?: string | null;
    icon?: string | null;
    current_version?: {
        id?: string | null;
        version_number?: number;
        status?: string;
        manifest?: Record<string, unknown>;
        capability_manifest?: {
            toggles?: AgentCapabilityToggle[];
        } | Record<string, unknown>;
        policy_manifest?: Record<string, unknown>;
        placement_manifest?: Record<string, unknown>;
    } | null;
};

export type RuntimeProfileRecord = {
    id: string;
    tenant_id?: string | null;
    workspace_id?: string | null;
    slug?: string | null;
    label?: string | null;
    runtime_class?: string;
    placement_mode?: string;
    runtime_id?: string | null;
    machine_id?: string | null;
    default_execution_target?: string;
    supported_capabilities?: string[];
    root_folder_uri?: string | null;
    allowed_connector_scopes?: string[];
    status?: string;
};

export type WorkspaceAgentInstallRecord = {
    id: string;
    tenant_id?: string | null;
    workspace_id?: string | null;
    agent_definition_id?: string | null;
    agent_definition_version_id?: string | null;
    label?: string | null;
    status?: string;
    enabled?: boolean;
    runtime_profile_id?: string | null;
    runtime_mode?: 'hosted_secure' | 'local_secure' | 'privileged_device';
    compiled_workflow_version_id?: string | null;
    root_folder_uri?: string | null;
    tool_toggles?: Record<string, boolean>;
    folder_grants?: string[];
    connector_bindings?: Record<string, unknown>;
    memory_scope_overrides?: Record<string, unknown>;
    policy_context_overrides?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    thread_id?: string | null;
    agent_definition?: {
        id?: string | null;
        slug?: string | null;
        name?: string;
        description?: string;
        category?: string | null;
        icon?: string | null;
        agent_kind?: string;
    } | null;
    agent_definition_version?: {
        id?: string | null;
        version_number?: number;
        manifest?: Record<string, unknown>;
        capability_manifest?: {
            toggles?: AgentCapabilityToggle[];
        } | Record<string, unknown>;
        policy_manifest?: Record<string, unknown>;
        placement_manifest?: Record<string, unknown>;
    } | null;
    runtime_profile?: RuntimeProfileRecord | null;
};

export type MasterChatContextRecord = {
    workspace_id: string;
    tenant_id?: string | null;
    thread_id: string;
    master_install: WorkspaceAgentInstallRecord | null;
    specialist_installs: WorkspaceAgentInstallRecord[];
    thread?: Record<string, unknown> | null;
    personal_context: {
        recent_changes: Record<string, unknown>[];
        summary: Record<string, unknown>;
    } | null;
    unified_memory: {
        layer_order: string[];
        summary: Record<string, unknown>;
        boundary_map: Record<string, unknown>;
    } | null;
    runtime_attachments: {
        deployment_mode?: string | null;
        attachments: Array<Record<string, unknown>>;
        selection_policy: Record<string, unknown>;
    } | null;
    scheduler: Record<string, unknown> | null;
    recent_activity: {
        items: Array<Record<string, unknown>>;
        summary: Record<string, unknown>;
    } | null;
};

export type ActivityTimelineRecord = {
    id: string;
    actor_type?: string | null;
    actor_id?: string | null;
    install_id?: string | null;
    app_id?: string | null;
    event_class?: string | null;
    action?: string | null;
    title?: string | null;
    summary?: string | null;
    created_at?: string | null;
    review_required?: boolean;
    artifacts: Array<Record<string, unknown>>;
    metadata: Record<string, unknown>;
};

export type ActivityTimelinePayload = {
    count: number;
    summary: Record<string, unknown>;
    items: ActivityTimelineRecord[];
};

function normalizeDefinitionList(payload: unknown): AgentDefinitionRecord[] {
    const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
        ? (payload as { items: unknown[] }).items
        : [];
    return items.filter((item): item is AgentDefinitionRecord => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string');
}

function normalizeInstallList(payload: unknown): WorkspaceAgentInstallRecord[] {
    const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
        ? (payload as { items: unknown[] }).items
        : [];
    return items.filter((item): item is WorkspaceAgentInstallRecord => isRecord(item) && typeof item.id === 'string');
}

function normalizeRuntimeProfileList(payload: unknown): RuntimeProfileRecord[] {
    const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
        ? (payload as { items: unknown[] }).items
        : [];
    return items.filter((item): item is RuntimeProfileRecord => isRecord(item) && typeof item.id === 'string');
}

function normalizeMasterChatContext(payload: unknown): MasterChatContextRecord {
    const record = isRecord(payload) ? payload : {};
    return {
        workspace_id: String(record.workspace_id || 'default').trim() || 'default',
        tenant_id: typeof record.tenant_id === 'string' ? record.tenant_id : null,
        thread_id: String(record.thread_id || '').trim(),
        master_install: isRecord(record.master_install) ? record.master_install as WorkspaceAgentInstallRecord : null,
        specialist_installs: normalizeInstallList({ items: Array.isArray(record.specialist_installs) ? record.specialist_installs : [] }),
        thread: isRecord(record.thread) ? record.thread : null,
        personal_context: isRecord(record.personal_context)
            ? {
                recent_changes: Array.isArray(record.personal_context.recent_changes)
                    ? record.personal_context.recent_changes.filter((item): item is Record<string, unknown> => isRecord(item))
                    : [],
                summary: isRecord(record.personal_context.summary) ? record.personal_context.summary : {},
            }
            : null,
        unified_memory: isRecord(record.unified_memory)
            ? {
                layer_order: Array.isArray(record.unified_memory.layer_order)
                    ? record.unified_memory.layer_order.map((item) => String(item || '').trim()).filter(Boolean)
                    : [],
                summary: isRecord(record.unified_memory.summary) ? record.unified_memory.summary : {},
                boundary_map: isRecord(record.unified_memory.boundary_map) ? record.unified_memory.boundary_map : {},
            }
            : null,
        runtime_attachments: isRecord(record.runtime_attachments)
            ? {
                deployment_mode: typeof record.runtime_attachments.deployment_mode === 'string'
                    ? record.runtime_attachments.deployment_mode
                    : null,
                attachments: Array.isArray(record.runtime_attachments.attachments)
                    ? record.runtime_attachments.attachments.filter((item): item is Record<string, unknown> => isRecord(item))
                    : [],
                selection_policy: isRecord(record.runtime_attachments.selection_policy)
                    ? record.runtime_attachments.selection_policy
                    : {},
            }
            : null,
        scheduler: isRecord(record.scheduler) ? record.scheduler : null,
        recent_activity: isRecord(record.recent_activity)
            ? {
                items: Array.isArray(record.recent_activity.items)
                    ? record.recent_activity.items.filter((item): item is Record<string, unknown> => isRecord(item))
                    : [],
                summary: isRecord(record.recent_activity.summary) ? record.recent_activity.summary : {},
            }
            : null,
    };
}

function normalizeActivityTimeline(payload: unknown): ActivityTimelinePayload {
    const record = isRecord(payload) ? payload : {};
    const items = Array.isArray(record.items) ? record.items : [];
    return {
        count: Number(record.count) > 0 ? Number(record.count) : items.length,
        summary: isRecord(record.summary) ? record.summary : {},
        items: items
            .filter((item): item is Record<string, unknown> => isRecord(item))
            .map((item) => ({
                id: String(item.id || '').trim(),
                actor_type: typeof item.actor_type === 'string' ? item.actor_type : null,
                actor_id: typeof item.actor_id === 'string' ? item.actor_id : null,
                install_id: typeof item.install_id === 'string' ? item.install_id : null,
                app_id: typeof item.app_id === 'string' ? item.app_id : null,
                event_class: typeof item.event_class === 'string' ? item.event_class : null,
                action: typeof item.action === 'string' ? item.action : null,
                title: typeof item.title === 'string' ? item.title : null,
                summary: typeof item.summary === 'string' ? item.summary : null,
                created_at: typeof item.created_at === 'string' ? item.created_at : null,
                review_required: item.review_required === true,
                artifacts: Array.isArray(item.artifacts)
                    ? item.artifacts.filter((artifact): artifact is Record<string, unknown> => isRecord(artifact))
                    : [],
                metadata: isRecord(item.metadata) ? item.metadata : {},
            }))
            .filter((item) => item.id.length > 0),
    };
}

export async function fetchAgentStore(workspaceId: string): Promise<AgentDefinitionRecord[]> {
    const query = new URLSearchParams({ workspace_id: workspaceId });
    const payload = await internalApiFetch(`/api/store/agents?${query.toString()}`);
    return normalizeDefinitionList(payload);
}

export async function fetchAgentDefinition(id: string, workspaceId: string): Promise<AgentDefinitionRecord> {
    const query = new URLSearchParams({ workspace_id: workspaceId });
    return internalApiFetch(`/api/store/agents/${encodeURIComponent(id)}?${query.toString()}`);
}

export async function fetchRuntimeProfiles(workspaceId: string): Promise<RuntimeProfileRecord[]> {
    const query = new URLSearchParams({ workspace_id: workspaceId });
    const payload = await internalApiFetch(`/api/runtime-profiles?${query.toString()}`);
    return normalizeRuntimeProfileList(payload);
}

export async function fetchAgents(workspaceId: string): Promise<WorkspaceAgentInstallRecord[]> {
    const payload = await internalApiFetch(agentsListPath(workspaceId));
    return normalizeInstallList(payload);
}

export async function fetchAgentInstall(id: string, workspaceId: string): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentDetailPath(id, workspaceId));
}

export async function fetchMasterChatContext(workspaceId: string): Promise<MasterChatContextRecord> {
    const query = new URLSearchParams({ workspace_id: workspaceId });
    const payload = await internalApiFetch(`/api/chat/master-context?${query.toString()}`);
    return normalizeMasterChatContext(payload);
}

export async function fetchActivityTimeline(workspaceId: string, limit = 8): Promise<ActivityTimelinePayload> {
    const query = new URLSearchParams({
        workspace_id: workspaceId,
        limit: String(Math.max(1, Math.min(limit, 24))),
    });
    const payload = await internalApiFetch(`/api/activity/timeline?${query.toString()}`);
    return normalizeActivityTimeline(payload);
}

export type AgentInstallUpsertPayload = {
    workspace_id: string;
    agent_definition_id?: string;
    agent_definition_version_id?: string;
    label?: string;
    runtime_profile_id?: string;
    root_folder_uri?: string;
    tool_toggles?: Record<string, boolean>;
    folder_grants?: string[];
    connector_bindings?: Record<string, unknown>;
    memory_scope_overrides?: Record<string, unknown>;
    policy_context_overrides?: Record<string, unknown>;
    enabled?: boolean;
    status?: string;
    metadata?: Record<string, unknown>;
};

export type SpecialistCreatePayload = {
    workspace_id: string;
    label?: string;
    manifest: Record<string, unknown>;
    runtime_profile_id?: string;
    runtime_mode?: 'hosted_secure' | 'local_secure' | 'privileged_device';
    connector_bindings?: Record<string, unknown>;
    channel_bindings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export type SpecialistManifestUpdatePayload = {
    workspace_id: string;
    manifest: Record<string, unknown>;
    runtime_profile_id?: string;
    runtime_mode?: 'hosted_secure' | 'local_secure' | 'privileged_device';
    connector_bindings?: Record<string, unknown>;
    channel_bindings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

export async function createAgentInstall(payload: AgentInstallUpsertPayload): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentsCollectionPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateAgentInstall(id: string, payload: AgentInstallUpsertPayload): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(`${agentsCollectionPath()}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function createSpecialistAgent(payload: SpecialistCreatePayload): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentsCollectionPath(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateSpecialistManifest(id: string, payload: SpecialistManifestUpdatePayload): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentManifestPath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function saveSpecialistBible(id: string, payload: { workspace_id: string; bible: string }): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentBiblePath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function saveSpecialistSkillBindings(id: string, payload: { workspace_id: string; skill_ids: string[] }): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentSkillsPath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function saveSpecialistConnectorBindings(id: string, payload: { workspace_id: string; connector_bindings: Record<string, unknown> }): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentConnectorsPath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function saveSpecialistChannelBindings(id: string, payload: { workspace_id: string; channel_bindings: Record<string, unknown> }): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentChannelsPath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function saveSpecialistRuntimeProfile(
    id: string,
    payload: {
        workspace_id: string;
        runtime_profile_id?: string;
        runtime_mode: 'hosted_secure' | 'local_secure' | 'privileged_device';
    },
): Promise<WorkspaceAgentInstallRecord> {
    return internalApiFetch(agentRuntimePath(id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function runInstalledAgent(installId: string, payload: Record<string, unknown> = {}) {
    return internalApiFetch(installedAgentRunPath(installId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function hardKillRun(runId: string, reason?: string) {
    return internalApiFetch(`/api/runs/${encodeURIComponent(runId)}/hard-kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
    });
}

export async function hardKillMachine(machineId: string, reason?: string) {
    return internalApiFetch(`/api/machines/${encodeURIComponent(machineId)}/hard-kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
    });
}
