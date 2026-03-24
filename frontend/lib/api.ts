import { API_BASE } from '@/lib/config';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';

const ORION_API_URL = process.env.NEXT_PUBLIC_ORION_API_URL ?? API_BASE;

/**
 * Enhanced fetch wrapper to handle JSON errors and provide better feedback
 */

export class ApiError extends Error {
    /** HTTP status code returned by the backend */
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    const runtimeApiKey = readRuntimeApiKeyFromStorage('');
    if (runtimeApiKey && !headers.has('X-API-Key')) {
        headers.set('X-API-Key', runtimeApiKey);
    }

    let res: Response;
    try {
        res = await fetch(`${ORION_API_URL}${endpoint}`, {
            ...options,
            headers,
        });
    } catch {
        throw new ApiError(`Cannot reach the backend API on ${ORION_API_URL}.`, 0);
    }

    if (!res.ok) {
        let errorMsg = `API Error: ${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            if (body && body.message) {
                errorMsg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
            }
        } catch {
            // No JSON body, use default status text
        }
        throw new ApiError(errorMsg, res.status);
    }

    return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

type WorkflowExecutionShape = {
    id?: string;
    name?: string;
    description?: string;
    workspaceId?: string;
    definition?: {
        nodes?: unknown[];
        edges?: unknown[];
        meta?: Record<string, unknown>;
    };
};

function extractWorkflowRunConfig(workflow: WorkflowExecutionShape, workflowId: string) {
    const definition = isRecord(workflow.definition) ? workflow.definition : {};
    const meta = isRecord(definition.meta) ? definition.meta : {};
    const operator = isRecord(meta.operator) ? meta.operator : {};
    const connection = isRecord(operator.connection) ? operator.connection : {};
    const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
    const agentNodes = nodes.filter((node) => isRecord(node) && String(node.type || '').trim() === 'agent');
    const firstAgentData = agentNodes.length > 0 && isRecord(agentNodes[0]) && isRecord(agentNodes[0].data)
        ? agentNodes[0].data
        : {};
    const runtimeProfileId = String(meta.runtime_profile_id || '').trim();
    const provider = String(
        firstAgentData.provider || connection.provider || meta.provider || 'openai',
    ).trim() || 'openai';
    const model = String(
        firstAgentData.modelId || operator.modelId || meta.model || 'gpt-4o-mini',
    ).trim() || 'gpt-4o-mini';
    const userGoal = String(operator.userGoal || workflow.description || workflow.name || 'Run workflow').trim()
        || 'Run workflow';
    const agentRole = String(operator.agentRole || meta.agent_role || 'operator').trim() || 'operator';
    const credentialId = runtimeProfileId
        ? ''
        : String(connection.mode || '').trim() === 'byok'
            ? String(connection.credentialId || '').trim()
            : '';
    const agents = agentNodes.map((node) => {
        const data = isRecord(node) && isRecord(node.data) ? node.data : {};
        return {
            role: String(data.role || data.label || 'Agent').trim() || 'Agent',
            modelId: String(data.modelId || model).trim() || model,
            provider: String(data.provider || provider).trim() || provider,
            duty: String(data.duty || data.description || '').trim(),
        };
    });
    const businessPlan = [
        `Workflow: ${String(workflow.name || workflowId).trim() || workflowId}`,
        `Goal: ${userGoal}`,
        `Provider: ${provider}`,
        `Model: ${model}`,
        runtimeProfileId ? `Runtime Profile: ${runtimeProfileId}` : '',
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
        businessPlan,
        agents,
    };
}

export async function fetchWorkflows(workspaceId: string = 'default') {
    return apiFetch(`/workflows?workspaceId=${workspaceId}`);
}

export async function createWorkflow(
    name: string,
    description: string,
    workspaceId: string = 'default',
    definition: unknown = { nodes: [], edges: [] }
) {
    return apiFetch(`/workflows?workspaceId=${workspaceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description,
            definition
        }),
    });
}

export async function getWorkflow(id: string) {
    return apiFetch(`/workflows/${id}`);
}

export async function updateWorkflow(id: string, definition: unknown) {
    return apiFetch(`/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
    });
}

export async function runWorkflow(id: string, credentials: unknown[] = [], variables: unknown[] = []) {
    void credentials;
    void variables;

    const runtimeApiKey = readRuntimeApiKeyFromStorage('');
    if (!runtimeApiKey) {
        throw new ApiError('Add your runtime access key before starting a test run.', 400);
    }

    const workflow = await getWorkflow(id) as WorkflowExecutionShape;
    const config = extractWorkflowRunConfig(workflow, id);
    const response = await fetch(`${ORION_API_URL}/runs/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': runtimeApiKey,
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
            active_profile_id: typeof payload?.active_profile_id === 'string' ? payload.active_profile_id : config.runtimeProfileId || null,
            active_profile_label: typeof payload?.active_profile_label === 'string' ? payload.active_profile_label : null,
            active_profile_provider:
                typeof payload?.active_profile_provider === 'string' ? payload.active_profile_provider : config.provider,
            active_profile_model:
                typeof payload?.active_profile_model === 'string' ? payload.active_profile_model : config.model,
        });
    }

    return payload;
}

export async function resumeWorkflow(executionId: string, data: unknown = {}) {
    return apiFetch(`/executions/${executionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

export async function publishWorkflow(id: string) {
    return apiFetch(`/workflows/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function deleteWorkflow(id: string) {
    return apiFetch(`/workflows/${id}`, {
        method: 'DELETE',
    });
}

export async function fetchExecutions() {
    return apiFetch(`/executions`);
}

export async function fetchExecution(id: string) {
    return apiFetch(`/executions/${id}`);
}

export async function fetchAgents() {
    return apiFetch(`/agents`);
}
