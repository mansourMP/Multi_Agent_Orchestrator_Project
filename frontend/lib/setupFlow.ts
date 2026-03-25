import type { ConnectorId } from '@/app/page.catalog';

export type SetupToolId = 'gmail' | 'slack' | 'notion' | 'calendar' | 'hubspot';

export type SetupTool = {
  id: SetupToolId;
  label: string;
  reason: string;
  connectorId: ConnectorId | null;
  connectHref: string;
  supported: boolean;
  blocking: boolean;
};

export type SetupPlanStep = {
  id: string;
  title: string;
  description: string;
  tool: SetupToolId | null;
  type: string;
};

const SETUP_RETURN_TO = encodeURIComponent('/setup');

const TOOL_DIRECTORY: Record<SetupToolId, SetupTool> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail',
    reason: 'Read email threads and prepare summaries or follow-ups.',
    connectorId: 'google_workspace',
    connectHref: `/credentials?onboarding=1&connector=google_workspace&return_to=${SETUP_RETURN_TO}`,
    supported: true,
    blocking: true,
  },
  slack: {
    id: 'slack',
    label: 'Slack',
    reason: 'Send updates or drafts to your team.',
    connectorId: null,
    connectHref: `/credentials?onboarding=1&return_to=${SETUP_RETURN_TO}`,
    supported: false,
    blocking: false,
  },
  notion: {
    id: 'notion',
    label: 'Notion',
    reason: 'Read or update workspace pages and notes.',
    connectorId: null,
    connectHref: `/credentials?onboarding=1&return_to=${SETUP_RETURN_TO}`,
    supported: false,
    blocking: false,
  },
  calendar: {
    id: 'calendar',
    label: 'Google Calendar',
    reason: 'Check events, timing, and scheduled follow-ups.',
    connectorId: 'google_workspace',
    connectHref: `/credentials?onboarding=1&connector=google_workspace&return_to=${SETUP_RETURN_TO}`,
    supported: true,
    blocking: true,
  },
  hubspot: {
    id: 'hubspot',
    label: 'HubSpot',
    reason: 'Read lead records and update CRM progress.',
    connectorId: null,
    connectHref: `/credentials?onboarding=1&return_to=${SETUP_RETURN_TO}`,
    supported: false,
    blocking: false,
  },
};

const TOOL_KEYWORDS: Array<{ id: SetupToolId; patterns: RegExp[] }> = [
  { id: 'gmail', patterns: [/\bemail\b/i, /\bemails\b/i, /\bgmail\b/i, /\binbox\b/i, /\bmail\b/i] },
  { id: 'slack', patterns: [/\bslack\b/i] },
  { id: 'notion', patterns: [/\bnotion\b/i] },
  { id: 'calendar', patterns: [/\bcalendar\b/i, /\bmeeting\b/i, /\bschedule\b/i] },
  { id: 'hubspot', patterns: [/\bleads\b/i, /\blead\b/i, /\bcrm\b/i, /\bhubspot\b/i] },
];

function compactText(value: string, maxLength = 120): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function includesKeyword(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferToolFromText(text: string): SetupToolId | null {
  for (const item of TOOL_KEYWORDS) {
    if (includesKeyword(text, item.patterns)) return item.id;
  }
  return null;
}

function toolById(id: SetupToolId): SetupTool {
  return { ...TOOL_DIRECTORY[id] };
}

function uniqueTools(ids: SetupToolId[]): SetupTool[] {
  const seen = new Set<SetupToolId>();
  const items: SetupTool[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(toolById(id));
    if (items.length >= 3) break;
  }
  return items;
}

export function inferRequiredTools(prompt: string): SetupTool[] {
  const text = String(prompt || '').trim();
  if (!text) return [];
  const inferred: SetupToolId[] = [];
  for (const item of TOOL_KEYWORDS) {
    if (includesKeyword(text, item.patterns)) inferred.push(item.id);
  }
  return uniqueTools(inferred);
}

function defaultStepDescription(type: string, label: string, subtitle: string, prompt: string): string {
  const lowerType = String(type || '').trim().toLowerCase();
  const cleanLabel = compactText(label || subtitle || prompt, 84);
  const cleanSubtitle = compactText(subtitle || label, 100);

  if (lowerType === 'trigger') {
    if (/schedule|daily|weekly|morning/i.test(cleanSubtitle)) return 'Start the task on the right schedule.';
    return 'Start the task when you ask it to run.';
  }
  if (lowerType === 'agent') {
    return cleanSubtitle || cleanLabel || 'Analyze the request and decide what to do next.';
  }
  if (lowerType === 'condition') {
    return cleanSubtitle || 'Check whether the right condition is met before continuing.';
  }
  if (lowerType === 'transform') {
    return cleanSubtitle || 'Format the information into a clean output.';
  }
  if (lowerType === 'http_request') {
    return cleanSubtitle || 'Call an external service if more data is needed.';
  }
  if (lowerType === 'code') {
    return cleanSubtitle || 'Handle a custom logic step.';
  }
  if (lowerType === 'action') {
    if (/email/i.test(cleanSubtitle)) return 'Send the result by email.';
    if (/slack/i.test(cleanSubtitle)) return 'Send the result to Slack.';
    return cleanSubtitle || 'Deliver the result to the right destination.';
  }
  return cleanSubtitle || cleanLabel || 'Complete the next part of the task.';
}

function normalizeNodeRecord(node: unknown): { id: string; type: string; label: string; subtitle: string } | null {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : {};
  const id = String(record.id || '').trim();
  const type = String(record.type || '').trim();
  if (!id || !type) return null;
  const label = compactText(
    String(record.label || data.label || data.title || '').trim(),
    72,
  );
  const subtitle = compactText(
    String(
      record.subtitle
      || data.subtitle
      || data.description
      || data.duty
      || data.summary
      || data.condition
      || data.mapping
      || '',
    ).trim(),
    110,
  );
  return { id, type, label, subtitle };
}

export function buildFallbackPlan(prompt: string, tools: SetupTool[]): SetupPlanStep[] {
  const relevantTool = tools[0] || null;
  const steps: SetupPlanStep[] = [
    {
      id: 'understand',
      title: 'Understand the task',
      description: 'Review the request and decide the right workflow for it.',
      tool: null,
      type: 'agent',
    },
    {
      id: 'collect',
      title: 'Collect the context',
      description: relevantTool
        ? `Gather the information needed from ${relevantTool.label}.`
        : /research|competitor|market/i.test(prompt)
          ? 'Gather the information needed from the web and internal context.'
          : 'Gather the information needed to complete the task.',
      tool: relevantTool?.id || (/research|competitor|market/i.test(prompt) ? null : null),
      type: relevantTool ? 'tool' : 'agent',
    },
    {
      id: 'draft',
      title: 'Prepare the result',
      description: /follow up|reply|email/i.test(prompt)
        ? 'Draft the response or follow-up in plain language.'
        : 'Prepare a clean result you can review.',
      tool: inferToolFromText(prompt),
      type: 'action',
    },
    {
      id: 'review',
      title: 'Pause for review',
      description: 'Show you the output before anything is sent or changed.',
      tool: null,
      type: 'approval',
    },
  ];
  return steps.slice(0, 5);
}

export function workflowToPlainSteps(
  workflow: unknown,
  prompt: string,
  baseTools: SetupTool[] = inferRequiredTools(prompt),
): SetupPlanStep[] {
  const nodes = Array.isArray((workflow as { nodes?: unknown[] } | null | undefined)?.nodes)
    ? ((workflow as { nodes: unknown[] }).nodes)
    : [];

  const mapped = nodes
    .map((node) => normalizeNodeRecord(node))
    .filter((node): node is NonNullable<ReturnType<typeof normalizeNodeRecord>> => node !== null)
    .map((node, index) => {
      const description = defaultStepDescription(node.type, node.label, node.subtitle, prompt);
      const tool = inferToolFromText(`${node.label} ${node.subtitle}`);
      return {
        id: node.id,
        title: node.label || `Step ${index + 1}`,
        description,
        tool,
        type: node.type,
      } satisfies SetupPlanStep;
    })
    .filter((step, index, items) => {
      const signature = `${step.type}:${step.description.toLowerCase()}`;
      return items.findIndex((candidate) => `${candidate.type}:${candidate.description.toLowerCase()}` === signature) === index;
    });

  const fromWorkflow = mapped.slice(0, 5);
  if (fromWorkflow.length >= 3) return fromWorkflow;

  const fallback = buildFallbackPlan(prompt, baseTools);
  const merged = [...fromWorkflow];
  for (const step of fallback) {
    if (merged.some((candidate) => candidate.description.toLowerCase() === step.description.toLowerCase())) continue;
    merged.push(step);
    if (merged.length >= 5) break;
  }
  return merged.slice(0, 5);
}

export function buildTaskSummary(prompt: string, maxLength = 120): string {
  const normalized = compactText(prompt, maxLength);
  return normalized || 'No task description provided.';
}
