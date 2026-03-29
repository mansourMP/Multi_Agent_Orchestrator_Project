import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { formatExecutionTargetLabel, normalizeExecutionTarget } from '@/lib/executionTargets';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';

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
    id?: string;
    name?: string;
    description?: string;
    workspaceId?: string;
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
    id?: string;
    name?: string;
    description?: string;
    workspaceId?: string;
    status?: string;
    definition?: WorkflowExecutionShape['definition'];
    validation?: WorkflowValidationSummary;
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
        workspaceId: String(workflow.workspaceId || meta.workspace_id || 'default').trim() || 'default',
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

export async function fetchWorkflows(workspaceId: string = 'default') {
    return internalApiFetch(`/api/workflows?workspaceId=${encodeURIComponent(workspaceId)}`);
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
    workspaceId: string = 'default',
    definition: unknown = { nodes: [], edges: [] }
) : Promise<WorkflowRecordShape> {
    return internalApiFetch(`/api/workflows?workspaceId=${encodeURIComponent(workspaceId)}`, {
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
        method: 'PATCH',
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
            workspace_id: config.workspaceId,
            user_goal: config.userGoal,
            business_plan: config.businessPlan,
            agent_role: config.agentRole,
            provider: config.provider,
            model: config.model,
            credential_id: config.credentialId || undefined,
            agents: config.agents,
            metadata: {
                workspace_id: config.workspaceId,
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
    const runId = typeof payload?.run_id === 'string' ? payload.run_id.trim() : '';
    if (runId) {
        upsertSeededRuntimeRun({
            run_id: runId,
            status: 'running',
            workflow_name: String(workflow.name || id).trim() || id,
            user_goal: config.userGoal,
            created_at: new Date().toISOString(),
            agent_role: config.agentRole,
            triggered_by: 'Direct',
            active_profile_id: typeof payload?.active_profile_id === 'string' ? payload.active_profile_id : null,
            active_profile_label: typeof payload?.active_profile_label === 'string' ? payload.active_profile_label : null,
            active_profile_provider:
                typeof payload?.active_profile_provider === 'string' ? payload.active_profile_provider : null,
            active_profile_model:
                typeof payload?.active_profile_model === 'string' ? payload.active_profile_model : null,
            requested_provider:
                typeof payload?.requested_provider === 'string' ? payload.requested_provider : null,
            effective_provider:
                typeof payload?.effective_provider === 'string'
                    ? payload.effective_provider
                    : null,
            requested_model:
                typeof payload?.requested_model === 'string' ? payload.requested_model : null,
            effective_model:
                typeof payload?.effective_model === 'string'
                    ? payload.effective_model
                    : null,
            provider_overridden: typeof payload?.provider_overridden === 'boolean' ? payload.provider_overridden : undefined,
            model_overridden: typeof payload?.model_overridden === 'boolean' ? payload.model_overridden : undefined,
            fallback_used: typeof payload?.fallback_used === 'boolean' ? payload.fallback_used : undefined,
            execution_target_selected:
                typeof payload?.execution_target_selected === 'string'
                    ? payload.execution_target_selected
                    : config.executionTarget,
        });
    }

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
    return internalApiFetch('/api/runtime/machines', { cache: 'no-store' });
}

export async function fetchExecution(id: string) {
    return internalApiFetch(`/api/executions/${encodeURIComponent(id)}`);
}

export async function fetchAgents() {
    return internalApiFetch('/api/agents');
}
