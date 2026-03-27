import { obviousPrivateUrlReason } from '../security/url-guards';

export const EMPYRALIST_WORKFLOW_SCHEMA_VERSION = 'empyralist.workflow.v2';

export type ExecutionTarget = 'auto' | 'cloud' | 'local_companion';
export type FileMountId =
    | 'artifacts'
    | 'project'
    | 'shared'
    | 'knowledge'
    | 'local_root'
    | 'connector_files';
export type FileGrant = 'none' | 'read' | 'read_write' | 'create_only' | 'append_only';
export type TriggerVariant =
    | 'connector_event'
    | 'schedule'
    | 'webhook'
    | 'workflow'
    | 'file_watch'
    | 'manual';
export type ToolVariant =
    | 'connector_action'
    | 'http'
    | 'browser'
    | 'file'
    | 'shell'
    | 'document'
    | 'spreadsheet'
    | 'code';
export type DecisionVariant = 'if_else' | 'classifier' | 'field_router';
export type HumanVariant = 'approval' | 'review' | 'wait_for_reply';
export type DataVariant = 'transform' | 'compose' | 'validate';
export type SubflowVariant = 'call_workflow';
export type WorkflowNodeType = 'trigger' | 'agent' | 'tool' | 'decision' | 'human' | 'data' | 'subflow';

export type FileMountGrant = {
    mount: FileMountId;
    grant: FileGrant;
};

export type CanonicalWorkflowNode = {
    id: string;
    type: WorkflowNodeType;
    variant?: string;
    config: Record<string, any>;
    resources?: Record<string, any>;
    policy?: Record<string, any>;
    position?: { x: number; y: number };
    data?: Record<string, any>;
};

export type CanonicalWorkflowEdge = {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
};

export type CanonicalWorkflowDefinition = {
    version: string;
    nodes: CanonicalWorkflowNode[];
    edges: CanonicalWorkflowEdge[];
    defaults?: Record<string, any>;
    resources?: Record<string, any>;
    policy?: Record<string, any>;
    meta?: Record<string, any>;
};

export type WorkflowValidationIssue = {
    code: string;
    message: string;
    level: 'error' | 'warning';
    nodeId?: string;
};

const LEGACY_NODE_TYPES = new Set([
    'trigger',
    'agent',
    'action',
    'http_request',
    'condition',
    'transform',
    'code',
    'logic',
    'approval',
    'subflow',
]);
const WORKFLOW_NODE_TYPES = new Set<WorkflowNodeType>([
    'trigger',
    'agent',
    'tool',
    'decision',
    'human',
    'data',
    'subflow',
]);
const TRIGGER_VARIANTS = new Set<TriggerVariant>([
    'connector_event',
    'schedule',
    'webhook',
    'workflow',
    'file_watch',
    'manual',
]);
const TOOL_VARIANTS = new Set<ToolVariant>([
    'connector_action',
    'http',
    'browser',
    'file',
    'shell',
    'document',
    'spreadsheet',
    'code',
]);
const DECISION_VARIANTS = new Set<DecisionVariant>(['if_else', 'classifier', 'field_router']);
const HUMAN_VARIANTS = new Set<HumanVariant>(['approval', 'review', 'wait_for_reply']);
const DATA_VARIANTS = new Set<DataVariant>(['transform', 'compose', 'validate']);
const SUBFLOW_VARIANTS = new Set<SubflowVariant>(['call_workflow']);
const FILE_MOUNTS: FileMountId[] = ['artifacts', 'project', 'shared', 'knowledge', 'local_root', 'connector_files'];
const FILE_GRANTS = new Set<FileGrant>(['none', 'read', 'read_write', 'create_only', 'append_only']);
const BROWSER_INTERACTIVE_ACTIONS = new Set([
    'type',
    'click',
    'select',
    'upload',
    'download',
    'open_popup',
    'open_tab',
    'switch_tab',
    'close_tab',
    'navigate',
]);

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactText(value: unknown, max = 160): string {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function asArray<T = unknown>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function normalizeExecutionTarget(value: unknown): ExecutionTarget {
    const token = String(value || '').trim().toLowerCase();
    if (token === 'local') return 'local_companion';
    if (token === 'cloud') return 'cloud';
    if (token === 'local_companion') return 'local_companion';
    return 'auto';
}

function parseInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function sanitizeFileMountId(value: unknown): FileMountId | null {
    const token = String(value || '').trim().toLowerCase();
    return FILE_MOUNTS.includes(token as FileMountId) ? token as FileMountId : null;
}

function sanitizeFileGrant(value: unknown): FileGrant | null {
    const token = String(value || '').trim().toLowerCase();
    return FILE_GRANTS.has(token as FileGrant) ? token as FileGrant : null;
}

function dedupeStrings(value: unknown): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of asArray(value)) {
        const token = String(item || '').trim();
        if (!token || seen.has(token)) continue;
        seen.add(token);
        out.push(token);
    }
    return out;
}

function normalizePosition(rawNode: Record<string, any>, index: number): { x: number; y: number } {
    const position = isRecord(rawNode.position) ? rawNode.position : {};
    const x = Number(position.x);
    const y = Number(position.y);
    return {
        x: Number.isFinite(x) ? x : 180 + index * 220,
        y: Number.isFinite(y) ? y : 160,
    };
}

function defaultFileMountGrants(): FileMountGrant[] {
    return [
        { mount: 'artifacts', grant: 'read_write' },
        { mount: 'project', grant: 'read' },
        { mount: 'shared', grant: 'read' },
        { mount: 'knowledge', grant: 'read' },
        { mount: 'local_root', grant: 'none' },
        { mount: 'connector_files', grant: 'read' },
    ];
}

function normalizeFileMountGrants(raw: unknown, target: ExecutionTarget): FileMountGrant[] {
    const normalized = new Map<FileMountId, FileGrant>();
    for (const item of defaultFileMountGrants()) {
        normalized.set(item.mount, item.grant);
    }
    for (const item of asArray(raw)) {
        if (!isRecord(item)) continue;
        const mount = sanitizeFileMountId(item.mount);
        const grant = sanitizeFileGrant(item.grant);
        if (!mount || !grant) continue;
        normalized.set(mount, grant);
    }
    return FILE_MOUNTS.map((mount) => ({
        mount,
        grant: normalized.get(mount) || 'none',
    }));
}

function defaultAgentConfig(
    rawNode: Record<string, any>,
    meta: Record<string, any>,
): Record<string, any> {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const runtime = isRecord(rawConfig.runtime) ? rawConfig.runtime : {};
    const skills = isRecord(rawConfig.skills) ? rawConfig.skills : {};
    const tools = isRecord(rawConfig.tools) ? rawConfig.tools : {};
    const memory = isRecord(rawConfig.memory) ? rawConfig.memory : {};
    const permissions = isRecord(rawConfig.permissions) ? rawConfig.permissions : {};
    const executionTarget = normalizeExecutionTarget(runtime.execution_target ?? meta.execution_target);

    return {
        identity: {
            name: compactText(rawConfig.identity?.name ?? rawData.label ?? rawNode.label ?? 'Agent', 80) || 'Agent',
            role: compactText(rawConfig.identity?.role ?? rawData.role ?? rawData.label ?? 'Agent', 80) || 'Agent',
            goal: compactText(rawConfig.identity?.goal ?? rawData.prompt ?? rawData.duty ?? '', 500),
            success_condition: compactText(rawConfig.identity?.success_condition ?? '', 300),
            output_contract: compactText(rawConfig.identity?.output_contract ?? '', 300),
        },
        runtime: {
            provider_profile_id: compactText(runtime.provider_profile_id ?? meta.runtime_profile_id ?? '', 128) || null,
            model: compactText(runtime.model ?? rawData.modelId ?? meta.runtime_profile_model ?? '', 128) || null,
            provider: compactText(runtime.provider ?? rawData.provider ?? meta.runtime_profile_provider ?? '', 80) || null,
            execution_target: executionTarget,
            timeout_seconds: parseInteger(runtime.timeout_seconds, 300),
            token_budget: runtime.token_budget == null ? null : parseInteger(runtime.token_budget, 0),
            retry_policy: isRecord(runtime.retry_policy)
                ? runtime.retry_policy
                : {
                    max_attempts: 1,
                },
        },
        skills: {
            skill_bundle_ids: dedupeStrings(skills.skill_bundle_ids),
            overrides: isRecord(skills.overrides) ? skills.overrides : {},
            prompt_append: compactText(skills.prompt_append ?? '', 4000),
        },
        tools: {
            dynamic_allowed: dedupeStrings(tools.dynamic_allowed),
            explicit_required: dedupeStrings(tools.explicit_required ?? rawData.tools),
        },
        memory: {
            read_scopes: dedupeStrings(memory.read_scopes).filter((item) => ['session', 'project', 'profile'].includes(item)),
            write_scopes: dedupeStrings(memory.write_scopes).filter((item) => ['session', 'project', 'profile'].includes(item)),
            retrieval_policy: compactText(memory.retrieval_policy ?? 'recent', 40) || 'recent',
            retention: isRecord(memory.retention) ? memory.retention : {},
        },
        connectors: {
            bindings: asArray(rawConfig.connectors?.bindings ?? rawConfig.connector_bindings)
                .filter((item) => isRecord(item))
                .map((item) => ({
                    connector_id: compactText(item.connector_id ?? item.connector ?? '', 80),
                    binding_id: compactText(item.binding_id ?? item.id ?? '', 160) || null,
                    resource: compactText(item.resource ?? '', 160) || null,
                }))
                .filter((item) => item.connector_id),
        },
        permissions: {
            action_policy: compactText(permissions.action_policy ?? meta.action_policy ?? 'guarded', 40) || 'guarded',
            connector_permissions: dedupeStrings(permissions.connector_permissions ?? permissions.connectors),
            browser_permissions: isRecord(permissions.browser_permissions)
                ? permissions.browser_permissions
                : { allow: false },
            file_mount_grants: normalizeFileMountGrants(permissions.file_mount_grants, executionTarget),
        },
    };
}

function buildLegacyAgentData(config: Record<string, any>): Record<string, any> {
    const identity = isRecord(config.identity) ? config.identity : {};
    const runtime = isRecord(config.runtime) ? config.runtime : {};
    const tools = isRecord(config.tools) ? config.tools : {};

    return {
        label: compactText(identity.name ?? identity.role ?? 'Agent', 80) || 'Agent',
        modelId: compactText(runtime.model ?? '', 120),
        prompt: compactText(identity.goal ?? '', 1000),
        tools: dedupeStrings(tools.explicit_required ?? []),
        provider: compactText(runtime.provider ?? '', 80),
        role: compactText(identity.role ?? identity.name ?? 'Agent', 80) || 'Agent',
        duty: compactText(identity.goal ?? '', 200),
        status: '',
        description: compactText(identity.success_condition ?? identity.output_contract ?? '', 160),
    };
}

function normalizeTriggerNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const requestedVariant = compactText(rawNode.variant ?? rawConfig.variant ?? rawData.triggerType ?? '', 40).toLowerCase();
    const variant: TriggerVariant = TRIGGER_VARIANTS.has(requestedVariant as TriggerVariant)
        ? requestedVariant as TriggerVariant
        : requestedVariant === 'schedule'
            ? 'schedule'
            : requestedVariant === 'webhook'
                ? 'webhook'
                : 'manual';
    const config = {
        connector: compactText(rawConfig.connector ?? '', 80),
        event: compactText(rawConfig.event ?? '', 120),
        schedule: isRecord(rawConfig.schedule) ? rawConfig.schedule : {},
        webhook: isRecord(rawConfig.webhook) ? rawConfig.webhook : {},
        workflow_id: compactText(rawConfig.workflow_id ?? '', 120),
        file_watch: isRecord(rawConfig.file_watch) ? rawConfig.file_watch : {},
        test_only: variant === 'manual',
    };
    return {
        id: compactText(rawNode.id || `trigger-${index + 1}`, 120) || `trigger-${index + 1}`,
        type: 'trigger',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            label: compactText(rawData.label ?? rawNode.label ?? 'Start', 80) || 'Start',
            triggerType: variant === 'schedule' ? 'schedule' : variant === 'webhook' ? 'webhook' : 'manual',
        },
    };
}

function normalizeToolNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const rawType = String(rawNode.type || '').trim().toLowerCase();
    const rawVariant = compactText(rawNode.variant ?? rawConfig.variant ?? '', 40).toLowerCase();
    let variant: ToolVariant = 'connector_action';

    if (rawType === 'http_request' || rawVariant === 'http') variant = 'http';
    else if (rawType === 'code' || rawVariant === 'code') variant = 'code';
    else if (rawVariant && TOOL_VARIANTS.has(rawVariant as ToolVariant)) variant = rawVariant as ToolVariant;
    else if (String(rawData.actionType || '').trim().toLowerCase() === 'write_file') variant = 'file';

    const config = {
        action_id: compactText(rawConfig.action_id ?? rawData.actionType ?? '', 120),
        connector: compactText(rawConfig.connector ?? '', 80),
        method: compactText(rawConfig.method ?? rawData.method ?? '', 12) || (variant === 'http' ? 'GET' : ''),
        url: compactText(rawConfig.url ?? rawData.url ?? '', 500),
        summary: compactText(rawConfig.summary ?? rawData.summary ?? '', 300),
        code: compactText(rawConfig.code ?? rawData.code ?? '', 4000),
        execution_target: normalizeExecutionTarget(rawConfig.execution_target),
        command: compactText(rawConfig.command ?? '', 4000),
        argv: asArray(rawConfig.argv).map((item) => compactText(item, 400)).filter(Boolean),
        cwd: compactText(rawConfig.cwd ?? '', 400),
        timeout_seconds: rawConfig.timeout_seconds == null ? null : parseInteger(rawConfig.timeout_seconds, 0),
        path: compactText(rawConfig.path ?? '', 600),
        file_path: compactText(rawConfig.file_path ?? '', 600),
        content: rawConfig.content ?? null,
        content_type: compactText(rawConfig.content_type ?? '', 160),
        payload: isRecord(rawConfig.payload) || Array.isArray(rawConfig.payload) ? rawConfig.payload : rawConfig.payload ?? null,
        headers: isRecord(rawConfig.headers) ? rawConfig.headers : {},
        signing_secret: compactText(rawConfig.signing_secret ?? '', 300),
        capability: compactText(rawConfig.capability ?? '', 160),
        mode: compactText(rawConfig.mode ?? rawConfig.operation ?? '', 80),
        title: compactText(rawConfig.title ?? '', 160),
        to_email: compactText(rawConfig.to_email ?? rawConfig.to ?? rawConfig.email ?? rawConfig.recipient ?? '', 200),
        subject: compactText(rawConfig.subject ?? '', 240),
        chat_id: compactText(rawConfig.chat_id ?? '', 160),
        channel_id: compactText(rawConfig.channel_id ?? '', 160),
        from_number: compactText(rawConfig.from_number ?? '', 80),
        to_number: compactText(rawConfig.to_number ?? rawConfig.recipient ?? '', 80),
        webhook_url: compactText(rawConfig.webhook_url ?? '', 500),
        page_id: compactText(rawConfig.page_id ?? '', 120),
        recipient_id: compactText(rawConfig.recipient_id ?? rawConfig.recipient ?? rawConfig.user_id ?? rawConfig.instagram_user_id ?? '', 160),
        comment_id: compactText(rawConfig.comment_id ?? rawConfig.media_comment_id ?? '', 160),
        session_profile: compactText(rawConfig.session_profile ?? '', 160),
        browser_actions: asArray(rawConfig.browser_actions).filter(isRecord),
        permissions: isRecord(rawConfig.permissions) ? rawConfig.permissions : {},
    };

    const legacyType =
        variant === 'http'
            ? 'http_request'
            : variant === 'code'
                ? 'code'
                : 'action';
    const data =
        legacyType === 'http_request'
            ? {
                label: compactText(rawData.label ?? rawNode.label ?? 'HTTP Request', 80) || 'HTTP Request',
                method: config.method,
                url: config.url,
            }
            : legacyType === 'code'
                ? {
                    label: compactText(rawData.label ?? rawNode.label ?? 'Code', 80) || 'Code',
                    summary: config.summary || 'Run custom logic',
                    code: config.code || 'return input;',
                }
                : {
                    label: compactText(rawData.label ?? rawNode.label ?? 'Action', 80) || 'Action',
                    actionType: compactText(rawData.actionType ?? config.action_id ?? 'send_telegram', 80) || 'send_telegram',
                };

    return {
        id: compactText(rawNode.id || `tool-${index + 1}`, 120) || `tool-${index + 1}`,
        type: 'tool',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            ...data,
            legacyType,
        },
    };
}

function normalizeDecisionNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const rawVariant = compactText(rawNode.variant ?? rawConfig.variant ?? '', 40).toLowerCase();
    const variant: DecisionVariant = DECISION_VARIANTS.has(rawVariant as DecisionVariant)
        ? rawVariant as DecisionVariant
        : 'if_else';
    const config = {
        expression: compactText(rawConfig.expression ?? rawData.condition ?? '', 500),
        field: compactText(rawConfig.field ?? '', 120),
        routes: asArray(rawConfig.routes),
    };
    return {
        id: compactText(rawNode.id || `decision-${index + 1}`, 120) || `decision-${index + 1}`,
        type: 'decision',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            label: compactText(rawData.label ?? rawNode.label ?? 'Condition', 80) || 'Condition',
            condition: config.expression || 'Continue when the condition is true',
        },
    };
}

function normalizeHumanNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const rawVariant = compactText(rawNode.variant ?? rawConfig.variant ?? (String(rawNode.type || '').trim().toLowerCase() === 'approval' ? 'approval' : ''), 40).toLowerCase();
    const variant: HumanVariant = HUMAN_VARIANTS.has(rawVariant as HumanVariant)
        ? rawVariant as HumanVariant
        : 'approval';
    const config = {
        title: compactText(rawConfig.title ?? rawData.label ?? rawNode.label ?? 'Approval', 120) || 'Approval',
        instructions: compactText(rawConfig.instructions ?? rawData.description ?? '', 1000),
        decision_options: dedupeStrings(rawConfig.decision_options).length > 0
            ? dedupeStrings(rawConfig.decision_options)
            : ['approve', 'reject'],
        timeout_seconds: rawConfig.timeout_seconds == null ? null : parseInteger(rawConfig.timeout_seconds, 0),
    };
    return {
        id: compactText(rawNode.id || `human-${index + 1}`, 120) || `human-${index + 1}`,
        type: 'human',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            label: config.title,
            description: config.instructions,
        },
    };
}

function normalizeDataNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const rawVariant = compactText(rawNode.variant ?? rawConfig.variant ?? '', 40).toLowerCase();
    const variant: DataVariant = DATA_VARIANTS.has(rawVariant as DataVariant)
        ? rawVariant as DataVariant
        : 'transform';
    const config = {
        mapping: compactText(rawConfig.mapping ?? rawData.mapping ?? '', 1000),
        template: compactText(rawConfig.template ?? '', 2000),
        schema: isRecord(rawConfig.schema) ? rawConfig.schema : {},
    };
    return {
        id: compactText(rawNode.id || `data-${index + 1}`, 120) || `data-${index + 1}`,
        type: 'data',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            label: compactText(rawData.label ?? rawNode.label ?? 'Transform', 80) || 'Transform',
            mapping: config.mapping || 'Map fields to output payload',
        },
    };
}

function normalizeSubflowNode(rawNode: Record<string, any>, index: number): CanonicalWorkflowNode {
    const rawData = isRecord(rawNode.data) ? rawNode.data : {};
    const rawConfig = isRecord(rawNode.config) ? rawNode.config : {};
    const rawVariant = compactText(rawNode.variant ?? rawConfig.variant ?? '', 40).toLowerCase();
    const variant: SubflowVariant = SUBFLOW_VARIANTS.has(rawVariant as SubflowVariant)
        ? rawVariant as SubflowVariant
        : 'call_workflow';
    const config = {
        workflow_id: compactText(rawConfig.workflow_id ?? rawData.workflow_id ?? '', 160),
        mode: compactText(rawConfig.mode ?? 'sync', 40) || 'sync',
        input_mapping: isRecord(rawConfig.input_mapping) ? rawConfig.input_mapping : {},
    };
    return {
        id: compactText(rawNode.id || `subflow-${index + 1}`, 120) || `subflow-${index + 1}`,
        type: 'subflow',
        variant,
        config,
        position: normalizePosition(rawNode, index),
        data: {
            label: compactText(rawData.label ?? rawNode.label ?? 'Call workflow', 80) || 'Call workflow',
            description: compactText(rawData.description ?? '', 200),
        },
    };
}

function normalizeAgentNode(
    rawNode: Record<string, any>,
    index: number,
    meta: Record<string, any>,
): CanonicalWorkflowNode {
    const config = defaultAgentConfig(rawNode, meta);
    return {
        id: compactText(rawNode.id || `agent-${index + 1}`, 120) || `agent-${index + 1}`,
        type: 'agent',
        config,
        position: normalizePosition(rawNode, index),
        data: buildLegacyAgentData(config),
    };
}

function normalizeNode(rawNode: unknown, index: number, meta: Record<string, any>): CanonicalWorkflowNode | null {
    if (!isRecord(rawNode)) return null;
    const rawType = String(rawNode.type || '').trim().toLowerCase();
    const canonicalType = WORKFLOW_NODE_TYPES.has(rawType as WorkflowNodeType)
        ? rawType as WorkflowNodeType
        : LEGACY_NODE_TYPES.has(rawType)
            ? rawType
            : '';
    if (!canonicalType) return null;

    if (canonicalType === 'trigger') return normalizeTriggerNode(rawNode, index);
    if (canonicalType === 'agent') return normalizeAgentNode(rawNode, index, meta);
    if (canonicalType === 'tool' || canonicalType === 'action' || canonicalType === 'http_request' || canonicalType === 'code') {
        return normalizeToolNode(rawNode, index);
    }
    if (canonicalType === 'decision' || canonicalType === 'condition' || canonicalType === 'logic') {
        return normalizeDecisionNode(rawNode, index);
    }
    if (canonicalType === 'human' || canonicalType === 'approval') {
        return normalizeHumanNode(rawNode, index);
    }
    if (canonicalType === 'data' || canonicalType === 'transform') {
        return normalizeDataNode(rawNode, index);
    }
    if (canonicalType === 'subflow') {
        return normalizeSubflowNode(rawNode, index);
    }
    return null;
}

function normalizeEdges(rawEdges: unknown, nodeIds: Set<string>): CanonicalWorkflowEdge[] {
    return asArray(rawEdges).reduce<CanonicalWorkflowEdge[]>((acc, item, index) => {
        if (!isRecord(item)) return acc;
        const source = compactText(item.source, 120);
        const target = compactText(item.target, 120);
        if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return acc;
        acc.push({
            id: compactText(item.id ?? `edge-${source}-${target}-${index + 1}`, 160) || `edge-${source}-${target}-${index + 1}`,
            source,
            target,
            sourceHandle: compactText(item.sourceHandle ?? '', 80) || undefined,
            targetHandle: compactText(item.targetHandle ?? '', 80) || undefined,
        });
        return acc;
    }, []);
}

function buildCompatibilityMeta(
    baseMeta: Record<string, any>,
    defaults: Record<string, any>,
): Record<string, any> {
    const runtime = isRecord(defaults.runtime) ? defaults.runtime : {};
    return {
        ...baseMeta,
        mode: compactText(baseMeta.mode ?? 'visual_builder', 80) || 'visual_builder',
        origin: compactText(baseMeta.origin ?? 'builder', 80) || 'builder',
        draft_goal: compactText(baseMeta.draft_goal ?? '', 500),
        execution_target: normalizeExecutionTarget(runtime.execution_target ?? baseMeta.execution_target),
        runtime_profile_id: compactText(runtime.provider_profile_id ?? baseMeta.runtime_profile_id ?? '', 160) || undefined,
        runtime_profile_label: compactText(runtime.runtime_profile_label ?? baseMeta.runtime_profile_label ?? '', 160) || undefined,
        runtime_profile_provider: compactText(runtime.provider ?? baseMeta.runtime_profile_provider ?? '', 80) || undefined,
        runtime_profile_model: compactText(runtime.model ?? baseMeta.runtime_profile_model ?? '', 120) || undefined,
    };
}

export function normalizeWorkflowDefinition(input: unknown): CanonicalWorkflowDefinition {
    const raw = isRecord(input) ? input : {};
    const rawMeta = isRecord(raw.meta) ? raw.meta : {};
    const rawDefaults = isRecord(raw.defaults) ? raw.defaults : {};
    const runtimeDefaults = isRecord(rawDefaults.runtime) ? rawDefaults.runtime : {};
    const defaults = {
        ...rawDefaults,
        runtime: {
            ...runtimeDefaults,
            execution_target: normalizeExecutionTarget(runtimeDefaults.execution_target ?? rawMeta.execution_target),
            provider_profile_id: compactText(runtimeDefaults.provider_profile_id ?? rawMeta.runtime_profile_id ?? '', 160) || undefined,
            provider: compactText(runtimeDefaults.provider ?? rawMeta.runtime_profile_provider ?? '', 80) || undefined,
            model: compactText(runtimeDefaults.model ?? rawMeta.runtime_profile_model ?? '', 120) || undefined,
        },
    };

    const nodes = asArray(raw.nodes)
        .map((node, index) => normalizeNode(node, index, rawMeta))
        .filter((node): node is CanonicalWorkflowNode => node !== null);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = normalizeEdges(raw.edges, nodeIds);

    return {
        version: compactText(raw.version, 80) || EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        nodes,
        edges,
        defaults,
        resources: isRecord(raw.resources) ? raw.resources : {},
        policy: isRecord(raw.policy) ? raw.policy : {},
        meta: buildCompatibilityMeta(rawMeta, defaults),
    };
}

function validateAgentConfig(node: CanonicalWorkflowNode, issues: WorkflowValidationIssue[]): void {
    const config = isRecord(node.config) ? node.config : {};
    const identity = isRecord(config.identity) ? config.identity : {};
    const runtime = isRecord(config.runtime) ? config.runtime : {};
    const permissions = isRecord(config.permissions) ? config.permissions : {};
    const target = normalizeExecutionTarget(runtime.execution_target);

    if (!compactText(identity.name ?? identity.role ?? '', 80)) {
        issues.push({ code: 'agent_identity_missing', message: 'Agent identity requires a name or role.', level: 'error', nodeId: node.id });
    }
    if (!compactText(identity.goal ?? '', 500)) {
        issues.push({ code: 'agent_goal_missing', message: 'Agent nodes should declare a goal.', level: 'warning', nodeId: node.id });
    }
    const grants = normalizeFileMountGrants(permissions.file_mount_grants, target);
    if (grants.some((grant) => grant.mount === 'local_root' && grant.grant !== 'none') && target !== 'local_companion') {
        issues.push({
            code: 'local_root_requires_local_companion',
            message: 'local_root mount grants require the local_companion execution target.',
            level: 'error',
            nodeId: node.id,
        });
    }
}

function validateTriggerNode(node: CanonicalWorkflowNode, issues: WorkflowValidationIssue[], forPublish: boolean): void {
    const variant = String(node.variant || '').trim();
    if (!TRIGGER_VARIANTS.has(variant as TriggerVariant)) {
        issues.push({ code: 'trigger_variant_invalid', message: `Trigger variant '${variant || 'unknown'}' is not supported.`, level: 'error', nodeId: node.id });
        return;
    }
    const config = isRecord(node.config) ? node.config : {};
    const schedule = isRecord(config.schedule) ? config.schedule : {};
    const webhook = isRecord(config.webhook) ? config.webhook : {};
    const fileWatch = isRecord(config.file_watch) ? config.file_watch : {};
    if (variant === 'connector_event') {
        if (!compactText(config.connector ?? '', 120)) {
            issues.push({ code: 'trigger_connector_missing', message: 'Connector event triggers require a connector id.', level: 'error', nodeId: node.id });
        }
        if (!compactText(config.event ?? '', 160)) {
            issues.push({ code: 'trigger_event_missing', message: 'Connector event triggers require an event id.', level: 'error', nodeId: node.id });
        }
    }
    if (variant === 'schedule' && !compactText(schedule.cron ?? config.cron ?? '', 200)) {
        issues.push({ code: 'trigger_schedule_missing', message: 'Schedule triggers require a cron expression.', level: 'error', nodeId: node.id });
    }
    if (variant === 'webhook' && !compactText(webhook.path ?? config.path ?? webhook.url ?? config.url ?? '', 500)) {
        issues.push({ code: 'trigger_webhook_path_missing', message: 'Webhook triggers require a path or URL.', level: 'error', nodeId: node.id });
    }
    if (variant === 'workflow' && !compactText(config.workflow_id ?? '', 160)) {
        issues.push({ code: 'trigger_workflow_id_missing', message: 'Workflow triggers require workflow_id.', level: 'error', nodeId: node.id });
    }
    if (variant === 'file_watch' && !compactText(fileWatch.path ?? config.path ?? '', 600)) {
        issues.push({ code: 'trigger_file_watch_path_missing', message: 'file_watch triggers require a path.', level: 'error', nodeId: node.id });
    }
    if (variant === 'file_watch') {
        issues.push({
            code: 'file_watch_not_executable_yet',
            message: forPublish
                ? 'file_watch triggers are schema-valid but cannot be published until local trigger runtime support is added.'
                : 'file_watch triggers are not executable yet.',
            level: forPublish ? 'error' : 'warning',
            nodeId: node.id,
        });
    }
}

function validateHumanNode(node: CanonicalWorkflowNode, issues: WorkflowValidationIssue[]): void {
    const variant = String(node.variant || '').trim();
    if (!HUMAN_VARIANTS.has(variant as HumanVariant)) {
        issues.push({ code: 'human_variant_invalid', message: `Human node variant '${variant || 'unknown'}' is not supported.`, level: 'error', nodeId: node.id });
        return;
    }
    if (variant === 'approval') {
        const config = isRecord(node.config) ? node.config : {};
        const options = dedupeStrings(config.decision_options);
        if (options.length === 0) {
            issues.push({ code: 'approval_options_missing', message: 'Approval nodes require at least one decision option.', level: 'error', nodeId: node.id });
        }
    }
}

function validateSubflowNode(node: CanonicalWorkflowNode, issues: WorkflowValidationIssue[]): void {
    const variant = String(node.variant || '').trim();
    if (!SUBFLOW_VARIANTS.has(variant as SubflowVariant)) {
        issues.push({ code: 'subflow_variant_invalid', message: `Subflow node variant '${variant || 'unknown'}' is not supported.`, level: 'error', nodeId: node.id });
        return;
    }
    const workflowId = compactText(isRecord(node.config) ? node.config.workflow_id : '', 160);
    if (!workflowId) {
        issues.push({ code: 'subflow_target_missing', message: 'Subflow nodes require a target workflow_id.', level: 'error', nodeId: node.id });
    }
}

function validateToolNode(node: CanonicalWorkflowNode, issues: WorkflowValidationIssue[]): void {
    const variant = String(node.variant || '').trim();
    if (!TOOL_VARIANTS.has(variant as ToolVariant)) {
        issues.push({ code: 'tool_variant_invalid', message: `Tool node variant '${variant || 'unknown'}' is not supported.`, level: 'error', nodeId: node.id });
        return;
    }
    const config = isRecord(node.config) ? node.config : {};
    const permissions = isRecord(config.permissions) ? config.permissions : {};
    const target = normalizeExecutionTarget(config.execution_target ?? permissions.execution_target);
    const grants = normalizeFileMountGrants(permissions.file_mount_grants, target);
    if (grants.some((grant) => grant.mount === 'local_root' && grant.grant !== 'none') && target !== 'local_companion') {
        issues.push({
            code: 'tool_local_root_requires_local_companion',
            message: 'local_root mount grants require the local_companion execution target.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'shell' && target === 'cloud') {
        issues.push({
            code: 'shell_requires_local_companion_or_auto',
            message: 'Shell tool nodes cannot target cloud directly; use local_companion or auto.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'code' && target === 'cloud') {
        issues.push({
            code: 'code_requires_local_companion_or_auto',
            message: 'Code tool nodes cannot target cloud directly; use local_companion or auto.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'code') {
        const command = compactText(config.command ?? '', 2000);
        const argv = dedupeStrings(config.argv);
        const capability = compactText(config.capability ?? '', 160);
        if (command || argv.length > 0 || capability) {
            issues.push({
                code: 'code_shell_fields_disallowed',
                message: 'Code tool nodes cannot use command, argv, or capability in the current runtime.',
                level: 'error',
                nodeId: node.id,
            });
        }
        issues.push({
            code: 'code_reviewed_execution_path_required',
            message: 'Code tool nodes are not executable in local companion V1; they require a reviewed higher-trust execution path.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'browser' && target === 'cloud') {
        issues.push({
            code: 'browser_requires_local_companion_or_auto',
            message: 'Browser tool nodes cannot target cloud directly; use local_companion or auto.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'shell') {
        const command = compactText(config.command ?? '', 2000);
        const argv = dedupeStrings(config.argv);
        const capability = compactText(config.capability ?? '', 160);
        if (!command && argv.length === 0) {
            issues.push({
                code: `${variant}_command_missing`,
                message: `${variant} tool nodes require command or argv.`,
                level: 'error',
                nodeId: node.id,
            });
        }
        if ((command || argv.length > 0) && !capability) {
            issues.push({
                code: `${variant}_raw_command_high_trust`,
                message: `${variant} tool nodes using raw command or argv are blocked by default policy. Prefer capability-based local actions.`,
                level: 'warning',
                nodeId: node.id,
            });
        }
        if (capability && (command || argv.length > 0)) {
            issues.push({
                code: `${variant}_capability_conflict`,
                message: `${variant} tool nodes cannot mix capability with command or argv.`,
                level: 'error',
                nodeId: node.id,
            });
        }
    }
    if (variant === 'browser' && !compactText(config.url ?? '', 1200)) {
        issues.push({
            code: 'browser_url_missing',
            message: 'Browser tool nodes require a URL.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'browser') {
        const browserPermissions = isRecord(permissions.browser_permissions) ? permissions.browser_permissions : {};
        const browserAllowed = Boolean(browserPermissions.allow);
        const sessionProfile = compactText(config.session_profile ?? '', 160);
        const browserActions = asArray(config.browser_actions).filter(isRecord);
        if (sessionProfile) {
            issues.push({
                code: 'browser_session_requires_approval',
                message: 'Session-backed browser automation requires approval in guarded or strict policy modes.',
                level: 'warning',
                nodeId: node.id,
            });
        }
        if ((sessionProfile || browserActions.length > 0) && !browserAllowed) {
            issues.push({
                code: 'browser_permission_required',
                message: 'Browser tool nodes with session_profile or browser_actions require browser_permissions.allow = true.',
                level: 'error',
                nodeId: node.id,
            });
        }
        const interactive = browserActions
            .map((item) => compactText(item.action ?? '', 80).toLowerCase())
            .filter((action) => action && BROWSER_INTERACTIVE_ACTIONS.has(action));
        if (sessionProfile && interactive.length > 0) {
            issues.push({
                code: 'browser_authenticated_interactive_not_supported',
                message: 'Session-backed interactive browser automation is not executable in local companion V1.',
                level: 'error',
                nodeId: node.id,
            });
        }
    }
    if (variant === 'http') {
        const httpUrl = compactText(config.url ?? '', 1200);
        if (!httpUrl) {
            issues.push({
                code: 'http_url_missing',
                message: 'HTTP tool nodes require a URL.',
                level: 'error',
                nodeId: node.id,
            });
        }
        const privateUrlReason = httpUrl ? obviousPrivateUrlReason(httpUrl) : null;
        if (privateUrlReason) {
            issues.push({
                code: 'http_private_url_disallowed',
                message: `HTTP tool nodes cannot target private or unsupported hosts (${privateUrlReason}).`,
                level: 'error',
                nodeId: node.id,
            });
        }
    }
    if (variant === 'file' && !compactText(config.path ?? config.file_path ?? '', 1200)) {
        issues.push({
            code: 'file_path_missing',
            message: 'File tool nodes require path or file_path.',
            level: 'error',
            nodeId: node.id,
        });
    }
    if (variant === 'connector_action') {
        const connector = compactText(config.connector ?? '', 120);
        const actionId = compactText(config.action_id ?? '', 160);
        if (!connector) {
            issues.push({
                code: 'tool_connector_missing',
                message: 'Connector action nodes require a connector id.',
                level: 'error',
                nodeId: node.id,
            });
        }
        if (!actionId) {
            issues.push({
                code: 'tool_action_missing',
                message: 'Connector action nodes require an action_id.',
                level: 'error',
                nodeId: node.id,
            });
        }
        if (connector === 'custom_api') {
            const customApiUrl = compactText(config.url ?? '', 600);
            if ((actionId === 'http_request' || actionId === 'signed_webhook') && !customApiUrl) {
                issues.push({
                    code: 'custom_api_url_missing',
                    message: 'Custom API connector actions require a URL.',
                    level: 'error',
                    nodeId: node.id,
                });
            }
            const privateUrlReason = customApiUrl ? obviousPrivateUrlReason(customApiUrl) : null;
            if ((actionId === 'http_request' || actionId === 'signed_webhook') && privateUrlReason) {
                issues.push({
                    code: 'custom_api_private_url_disallowed',
                    message: `Custom API connector actions cannot target private or unsupported hosts (${privateUrlReason}).`,
                    level: 'error',
                    nodeId: node.id,
                });
            }
            if (actionId === 'signed_webhook' && !compactText(config.signing_secret ?? '', 300)) {
                issues.push({
                    code: 'custom_api_signing_secret_missing',
                    message: 'signed_webhook actions require signing_secret.',
                    level: 'error',
                    nodeId: node.id,
                });
            }
        }
        if (connector === 'microsoft_365' && actionId === 'upload_drive_file' && !compactText(config.path ?? config.file_path ?? '', 600)) {
            issues.push({
                code: 'upload_drive_file_path_missing',
                message: 'upload_drive_file requires a path or file_path.',
                level: 'error',
                nodeId: node.id,
            });
        }
        if (connector === 'instagram_business') {
            if (actionId === 'publish_reply' && !compactText(config.comment_id ?? config.media_comment_id ?? '', 160)) {
                issues.push({
                    code: 'instagram_comment_id_missing',
                    message: 'instagram_business.publish_reply requires comment_id.',
                    level: 'error',
                    nodeId: node.id,
                });
            }
            if (
                actionId === 'send_dm'
                && !compactText(config.recipient_id ?? config.recipient ?? config.user_id ?? config.instagram_user_id ?? '', 160)
            ) {
                issues.push({
                    code: 'instagram_recipient_missing',
                    message: 'instagram_business.send_dm requires recipient_id.',
                    level: 'error',
                    nodeId: node.id,
                });
            }
        }
    }
}

export function validateWorkflowDefinition(
    definitionInput: unknown,
    options: { forPublish?: boolean } = {},
): WorkflowValidationIssue[] {
    const definition = normalizeWorkflowDefinition(definitionInput);
    const issues: WorkflowValidationIssue[] = [];
    const forPublish = Boolean(options.forPublish);
    const triggers = definition.nodes.filter((node) => node.type === 'trigger');

    if (definition.nodes.length === 0) {
        issues.push({ code: 'workflow_nodes_missing', message: 'Workflow must contain at least one node.', level: 'error' });
    }
    if (triggers.length === 0) {
        issues.push({ code: 'workflow_trigger_missing', message: 'Workflow must contain at least one trigger node.', level: 'error' });
    }
    if (forPublish) {
        const nonManualTriggers = triggers.filter((node) => String(node.variant || '').trim() !== 'manual');
        if (nonManualTriggers.length === 0) {
            issues.push({
                code: 'manual_trigger_only',
                message: 'Published workflows require at least one non-manual trigger.',
                level: 'error',
            });
        }
    }

    for (const node of definition.nodes) {
        if (node.type === 'trigger') validateTriggerNode(node, issues, forPublish);
        if (node.type === 'agent') validateAgentConfig(node, issues);
        if (node.type === 'tool') validateToolNode(node, issues);
        if (node.type === 'human') validateHumanNode(node, issues);
        if (node.type === 'subflow') validateSubflowNode(node, issues);
    }

    return issues;
}
