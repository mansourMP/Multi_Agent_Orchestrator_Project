const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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
    const res = await fetch(`${API_URL}${endpoint}`, options);

    if (!res.ok) {
        let errorMsg = `API Error: ${res.status} ${res.statusText}`;
        try {
            const body = await res.json();
            if (body && body.message) {
                errorMsg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
            }
        } catch (e) {
            // No JSON body, use default status text
        }
        throw new ApiError(errorMsg, res.status);
    }

    return res.json();
}

export async function fetchWorkflows(workspaceId: string = 'default') {
    return apiFetch(`/workflows?workspaceId=${workspaceId}`);
}

export async function createWorkflow(
    name: string,
    description: string,
    workspaceId: string = 'default',
    definition: any = { nodes: [], edges: [] }
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

export async function updateWorkflow(id: string, definition: any) {
    return apiFetch(`/workflows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
    });
}

export async function runWorkflow(id: string, credentials: any[] = [], variables: any[] = []) {
    return apiFetch(`/executions/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials, variables }),
    });
}

export async function resumeWorkflow(executionId: string, data: any = {}) {
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

// --- SQUAD AGENTS API ---

export async function startSquadSession(config: { agents: any[], userGoal: string }) {
    // Uses SSE
    const response = await fetch(`${API_URL}/agents/squad/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Failed to start squad session (${response.status}): ${text || response.statusText}`);
    }
    return response.body; // Stream
}
