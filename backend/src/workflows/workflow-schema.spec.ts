import {
  EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
  normalizeWorkflowDefinition,
  validateWorkflowDefinition,
} from './workflow-schema';

describe('workflow schema normalization', () => {
  it('normalizes legacy builder nodes into canonical families', () => {
    const normalized = normalizeWorkflowDefinition({
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 10, y: 20 },
          data: { label: 'Start', triggerType: 'manual' },
        },
        {
          id: 'agent-2',
          type: 'agent',
          position: { x: 220, y: 20 },
          data: { label: 'Planner', role: 'Planner', prompt: 'Plan the next move', modelId: 'gpt-5.4' },
        },
        {
          id: 'http-3',
          type: 'http_request',
          position: { x: 440, y: 20 },
          data: { label: 'Lookup', method: 'GET', url: 'https://api.example.com' },
        },
        {
          id: 'condition-4',
          type: 'condition',
          position: { x: 660, y: 20 },
          data: { label: 'Check', condition: 'value > 10' },
        },
      ],
      edges: [
        { source: 'trigger-1', target: 'agent-2' },
        { source: 'agent-2', target: 'http-3' },
      ],
      meta: {
        execution_target: 'local',
        runtime_profile_id: 'prof_123',
      },
    });

    expect(normalized.version).toBe(EMPYRALIST_WORKFLOW_SCHEMA_VERSION);
    expect(normalized.nodes.map((node) => `${node.type}:${node.variant || 'default'}`)).toEqual([
      'trigger:manual',
      'agent:default',
      'tool:http',
      'decision:if_else',
    ]);
    expect(normalized.defaults?.runtime?.execution_target).toBe('local_companion');
    expect(normalized.meta?.execution_target).toBe('local_companion');
    expect(normalized.nodes[1]?.config?.runtime?.provider_profile_id).toBe('prof_123');
    expect(normalized.nodes[2]?.data?.legacyType).toBe('http_request');
  });

  it('blocks publish when only a manual trigger exists', () => {
    const issues = validateWorkflowDefinition(
      {
        version: EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            variant: 'manual',
            config: { test_only: true },
          },
        ],
        edges: [],
      },
      { forPublish: true },
    );

    expect(issues.some((issue) => issue.code === 'manual_trigger_only' && issue.level === 'error')).toBe(true);
  });

  it('blocks local_root grants on cloud execution', () => {
    const issues = validateWorkflowDefinition(
      {
        nodes: [
          {
            id: 'agent_1',
            type: 'agent',
            config: {
              identity: { name: 'Agent', role: 'Agent' },
              runtime: { execution_target: 'cloud' },
              permissions: {
                file_mount_grants: [
                  { mount: 'local_root', grant: 'read' },
                ],
              },
            },
          },
        ],
        edges: [],
      },
      { forPublish: false },
    );

    expect(issues.some((issue) => issue.code === 'local_root_requires_local_companion')).toBe(true);
  });

  it('blocks file watch publish until runtime support exists', () => {
    const issues = validateWorkflowDefinition(
      {
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            variant: 'file_watch',
            config: {},
          },
        ],
        edges: [],
      },
      { forPublish: true },
    );

    expect(issues.some((issue) => issue.code === 'file_watch_not_executable_yet' && issue.level === 'error')).toBe(true);
  });

  it('accepts connector triggers for publish', () => {
    const issues = validateWorkflowDefinition(
      {
        version: EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            variant: 'connector_event',
            config: { connector: 'telegram_bot', event: 'inbound_message' },
          },
          {
            id: 'agent_1',
            type: 'agent',
            config: {
              identity: { name: 'Triage', role: 'Triage', goal: 'Classify the request' },
              runtime: { execution_target: 'auto' },
              permissions: { file_mount_grants: [] },
            },
          },
        ],
        edges: [{ id: 'edge-1', source: 'trigger_1', target: 'agent_1' }],
      },
      { forPublish: true },
    );

    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
  });

  it('normalizes human approval nodes with default decision options', () => {
    const normalized = normalizeWorkflowDefinition(
      {
        version: EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            variant: 'schedule',
            config: { schedule: { cron: '0 9 * * 1-5' } },
          },
          {
            id: 'human_1',
            type: 'human',
            variant: 'approval',
            config: {
              title: 'Review outgoing message',
              decision_options: [],
            },
          },
        ],
        edges: [{ id: 'edge-1', source: 'trigger_1', target: 'human_1' }],
      }
    );

    expect(normalized.nodes[1]?.type).toBe('human');
    expect(normalized.nodes[1]?.variant).toBe('approval');
    expect(normalized.nodes[1]?.config?.decision_options).toEqual(['approve', 'reject']);
  });

  it('requires workflow_id for subflow nodes', () => {
    const issues = validateWorkflowDefinition(
      {
        version: EMPYRALIST_WORKFLOW_SCHEMA_VERSION,
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            variant: 'workflow',
            config: { workflow_id: 'parent' },
          },
          {
            id: 'subflow_1',
            type: 'subflow',
            variant: 'call_workflow',
            config: { mode: 'sync' },
          },
        ],
        edges: [{ id: 'edge-1', source: 'trigger_1', target: 'subflow_1' }],
      },
      { forPublish: true },
    );

    expect(issues.some((issue) => issue.code === 'subflow_target_missing' && issue.level === 'error')).toBe(true);
  });
});
