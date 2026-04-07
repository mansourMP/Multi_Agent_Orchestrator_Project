type WorkflowNodeType = 'trigger' | 'agent' | 'tool' | 'decision' | 'human' | 'data' | 'subflow' | 'loop';

function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

const WORKFLOW_NODE_CAPABILITY_IDS: Record<string, string> = {
  'trigger:manual': 'workflow.trigger.manual',
  'trigger:schedule': 'workflow.trigger.schedule',
  'trigger:webhook': 'workflow.trigger.webhook',
  'trigger:connector_event': 'workflow.trigger.connector_event',
  'trigger:workflow': 'workflow.trigger.workflow',
  'trigger:file_watch': 'workflow.trigger.file_watch',
  'agent:': 'workflow.agent.execute',
  'decision:if_else': 'workflow.decision.if_else',
  'decision:classifier': 'workflow.decision.classifier',
  'decision:field_router': 'workflow.decision.field_router',
  'human:approval': 'workflow.human.approval',
  'human:review': 'workflow.human.review',
  'human:wait_for_reply': 'workflow.human.wait_for_reply',
  'data:transform': 'workflow.data.transform',
  'data:compose': 'workflow.data.compose',
  'data:validate': 'workflow.data.validate',
  'subflow:call_workflow': 'workflow.subflow.call_workflow',
  'loop:for_each': 'workflow.loop.for_each',
  'loop:while': 'workflow.loop.while',
  'loop:repeat': 'workflow.loop.repeat',
};

const CONNECTOR_ACTION_CAPABILITY_MAP: Record<string, string> = {
  send_email: 'send_message',
  send_message: 'send_message',
  send_embed: 'send_message',
  send_dm: 'send_message',
  delete_message: 'send_message',
  post_reply: 'send_message',
  publish_reply: 'send_message',
  send_media: 'send_message',
  update_message: 'send_message',
  upload_file: 'send_message',
  create_issue: 'issue_write',
  comment_on_issue: 'issue_write',
  update_issue: 'issue_write',
  add_comment: 'issue_write',
  create_pull_request: 'pr_write',
  create_or_update_file: 'repo_write',
  create_page: 'notion_write',
  update_page: 'notion_write',
  append_blocks: 'notion_write',
  create_database_item: 'notion_write',
  draft_email: 'draft_email',
  create_calendar_event: 'create_calendar_event',
  create_doc: 'document_create',
  create_document: 'document_create',
  create_sheet: 'spreadsheet_create',
  create_spreadsheet: 'spreadsheet_create',
  upload_drive_file: 'filesystem.read_write',
  http_request: 'http_request',
  signed_webhook: 'http_request',
  delete: 'storage_write',
  move: 'storage_write',
  delete_object: 'storage_write',
  create_bucket: 'storage_write',
  publish_content: 'publish_content',
  external_research: 'external_research',
};

const READ_ONLY_CONNECTOR_ACTIONS = new Set([
  'fetch_emails',
  'list_channels',
  'get_history',
  'list_guilds',
  'list_members',
  'get_message_history',
  'list_repos',
  'get_repo',
  'list_issues',
  'list_pull_requests',
  'get_file_content',
  'list_buckets',
  'list_objects',
  'download_file',
  'get_presigned_url',
  'list_folder',
  'search',
  'get_page',
  'query_database',
  'list_teams',
  'list_projects',
  'get_issue',
  'list_commits',
]);

export function workflowToolCapabilityId(
  variant: unknown,
  config: Record<string, unknown> = {},
): string {
  const cleanVariant = normalizeToken(variant);
  if (cleanVariant === 'browser') return 'browser_automation.interactive';
  if (cleanVariant === 'file') return 'filesystem.read_write';
  if (cleanVariant === 'shell') return 'shell.execute';
  if (cleanVariant === 'code') return 'code.execute_reviewed';
  if (cleanVariant === 'http') return 'http_request';
  if (cleanVariant === 'document') {
    const operation = normalizeToken(config.operation || config.mode || 'create');
    const filePath = String(config.file_path || config.path || '').trim().toLowerCase();
    if (filePath.endsWith('.pptx')) {
      return operation === 'update' || operation === 'edit' || operation === 'append'
        ? 'presentation_update'
        : 'presentation_create';
    }
    return operation === 'update' || operation === 'edit' || operation === 'append'
      ? 'document_update'
      : 'document_create';
  }
  if (cleanVariant === 'spreadsheet') {
    const operation = normalizeToken(config.operation || config.mode || 'read');
    if (operation === 'append') return 'spreadsheet_append';
    if (operation === 'update' || operation === 'edit') return 'spreadsheet_update';
    if (operation === 'create' || operation === 'new') return 'spreadsheet_create';
    return 'spreadsheet_read';
  }
  if (cleanVariant === 'connector_action') {
    const actionId = normalizeToken(config.action_id);
    const connectorId = normalizeToken(config.connector);
    if (actionId && CONNECTOR_ACTION_CAPABILITY_MAP[actionId]) return CONNECTOR_ACTION_CAPABILITY_MAP[actionId];
    if (connectorId === 'custom_api' && (actionId === 'http_request' || actionId === 'signed_webhook')) return 'http_request';
    if (READ_ONLY_CONNECTOR_ACTIONS.has(actionId)) return 'connector.action.read';
    if (actionId) return 'connector.action.write';
  }
  return 'connector.action.execute';
}

export function workflowCapabilityIdForNode(
  nodeType: WorkflowNodeType,
  variant?: unknown,
  config: Record<string, unknown> = {},
  policy: Record<string, unknown> = {},
): string {
  const existing = normalizeToken(policy.capability_id);
  if (existing) return existing;
  const cleanType = normalizeToken(nodeType);
  const cleanVariant = normalizeToken(variant);
  if (cleanType === 'tool') {
    return workflowToolCapabilityId(cleanVariant, config);
  }
  return WORKFLOW_NODE_CAPABILITY_IDS[`${cleanType}:${cleanVariant}`] || WORKFLOW_NODE_CAPABILITY_IDS[`${cleanType}:`] || 'connector.action.execute';
}
