export type ProductSectionId =
  | 'home'
  | 'chat'
  | 'agents'
  | 'library'
  | 'integrations'
  | 'usage'
  | 'account'
  | 'settings';

export type ProductShapeRole =
  | 'work_now'
  | 'reusable_agents'
  | 'reusable_assets'
  | 'workspace_capabilities'
  | 'operational_usage'
  | 'account_controls';

export type CanonicalProductObjectId =
  | 'workspace'
  | 'chat_session'
  | 'agent'
  | 'agent_template'
  | 'workflow'
  | 'skill'
  | 'pack_solution_kit'
  | 'integration'
  | 'machine_runtime_target'
  | 'run'
  | 'approval'
  | 'artifact'
  | 'memory_item';

export type CanonicalProductObject = {
  id: CanonicalProductObjectId;
  label: string;
  whatItIs: string;
  navOwner: ProductSectionId;
  linksTo: string[];
  isNot: string;
};

export type ProductSectionDefinition = {
  id: ProductSectionId;
  label: string;
  href: string;
  role: ProductShapeRole;
  summary: string;
};

export type ProductSectionBoundary = {
  sectionId: ProductSectionId;
  owns: string[];
  firstClass: string[];
  notHere: string[];
  relatedLinks: Array<{ label: string; href: string; reason: string }>;
};

type ProductRouteRule = {
  section: ProductSectionId;
  title: string;
  exact?: string[];
  prefixes?: string[];
};

export const PRODUCT_SECTIONS: ProductSectionDefinition[] = [
  {
    id: 'home',
    label: 'Overview',
    href: '/home',
    role: 'work_now',
    summary: 'Current work, approvals, run history, and next actions.',
  },
  {
    id: 'chat',
    label: 'Sage',
    href: '/',
    role: 'work_now',
    summary: 'Your primary conversation with Sage and the current workspace context.',
  },
  {
    id: 'agents',
    label: 'Agents',
    href: '/agents',
    role: 'reusable_agents',
    summary: 'Installed specialists, their status, and where they run.',
  },
  {
    id: 'library',
    label: 'Blueprints',
    href: '/library',
    role: 'reusable_assets',
    summary: 'Reusable blueprints, packs, and capability assets.',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    href: '/connectors',
    role: 'workspace_capabilities',
    summary: 'Workspace-level capabilities: connected systems, machines, health, and runtime access.',
  },
  {
    id: 'usage',
    label: 'Usage',
    href: '/usage',
    role: 'operational_usage',
    summary: 'Consumption, throughput, and operational usage trends.',
  },
  {
    id: 'account',
    label: 'Account',
    href: '/account',
    role: 'account_controls',
    summary: 'Personal identity, preferences, and personal session state.',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    role: 'account_controls',
    summary: 'Workspace policy, defaults, governance, and advanced configuration.',
  },
];

export const CANONICAL_PRODUCT_OBJECTS: CanonicalProductObject[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    whatItIs: 'The operating environment that contains agents, memory, integrations, machines, policy, and work history.',
    navOwner: 'home',
    linksTo: ['agent', 'integration', 'machine_runtime_target', 'run', 'approval', 'memory_item'],
    isNot: 'It is not a single chat thread or a single workflow.',
  },
  {
    id: 'chat_session',
    label: 'Chat Session',
    whatItIs: 'A live conversation used to ask for work, review outputs, and hand work into durable runs.',
    navOwner: 'chat',
    linksTo: ['agent', 'run', 'artifact', 'memory_item'],
    isNot: 'It is not the reusable agent definition itself.',
  },
  {
    id: 'agent',
    label: 'Agent',
    whatItIs: 'A reusable operator system with role, scope, capabilities, and deployment context.',
    navOwner: 'agents',
    linksTo: ['chat_session', 'workflow', 'integration', 'run', 'memory_item'],
    isNot: 'It is not just a one-off run or a generic template.',
  },
  {
    id: 'agent_template',
    label: 'Agent Template',
    whatItIs: 'A reusable starting pattern for creating a workspace agent.',
    navOwner: 'library',
    linksTo: ['agent', 'workflow', 'skill', 'pack_solution_kit'],
    isNot: 'It is not an already configured live agent in the workspace.',
  },
  {
    id: 'workflow',
    label: 'Workflow',
    whatItIs: 'A reusable execution asset that defines repeatable steps, decisions, and automation flow.',
    navOwner: 'library',
    linksTo: ['agent', 'run', 'artifact', 'integration'],
    isNot: 'It is not the live operational history of a task.',
  },
  {
    id: 'skill',
    label: 'Skill',
    whatItIs: 'A reusable capability module the workspace can install and use.',
    navOwner: 'library',
    linksTo: ['agent', 'agent_template', 'pack_solution_kit'],
    isNot: 'It is not the workspace itself or a connector account.',
  },
  {
    id: 'pack_solution_kit',
    label: 'Pack / Solution Kit',
    whatItIs: 'A reusable starter bundle that groups templates, workflows, roles, and capabilities around a job to be done.',
    navOwner: 'library',
    linksTo: ['agent_template', 'workflow', 'skill'],
    isNot: 'It is not a live run or a raw integration credential.',
  },
  {
    id: 'integration',
    label: 'Integration',
    whatItIs: 'A workspace-level connected system, channel, or credentialed external capability.',
    navOwner: 'integrations',
    linksTo: ['agent', 'workflow', 'run', 'machine_runtime_target'],
    isNot: 'It is not the place where an agent’s behavior is defined.',
  },
  {
    id: 'machine_runtime_target',
    label: 'Machine / Runtime Target',
    whatItIs: 'A local or hosted execution destination the workspace can use to perform work.',
    navOwner: 'integrations',
    linksTo: ['integration', 'run', 'approval'],
    isNot: 'It is not a standalone product outside the workspace.',
  },
  {
    id: 'run',
    label: 'Run',
    whatItIs: 'A concrete piece of work in motion or completed, with lifecycle, status, diagnostics, and outputs.',
    navOwner: 'home',
    linksTo: ['agent', 'workflow', 'approval', 'artifact', 'machine_runtime_target'],
    isNot: 'It is not a reusable asset.',
  },
  {
    id: 'approval',
    label: 'Approval',
    whatItIs: 'A workspace intervention request for confirmation, recovery, or policy-gated continuation.',
    navOwner: 'home',
    linksTo: ['run', 'agent', 'machine_runtime_target'],
    isNot: 'It is not a full run history item or a settings page.',
  },
  {
    id: 'artifact',
    label: 'Artifact',
    whatItIs: 'A result produced by work: text, file, image, output package, or generated document.',
    navOwner: 'home',
    linksTo: ['run', 'workflow', 'chat_session'],
    isNot: 'It is not the execution plan or the agent itself.',
  },
  {
    id: 'memory_item',
    label: 'Memory Item / Context Asset',
    whatItIs: 'Stored context the workspace can retrieve and use again across runs, agents, and chats.',
    navOwner: 'library',
    linksTo: ['workspace', 'agent', 'chat_session', 'run'],
    isNot: 'It is not merely a transient log line.',
  },
];

export const PRODUCT_ROUTE_RULES: ProductRouteRule[] = [
  { section: 'chat', title: 'Sage', exact: ['/'] },
  { section: 'home', title: 'Overview', exact: ['/home'] },
  { section: 'home', title: 'Runs', exact: ['/runs', '/executions', '/history', '/approvals', '/artifacts'] },
  { section: 'home', title: 'Run', prefixes: ['/runs/'] },
  { section: 'agents', title: 'Agents', exact: ['/agents'] },
  { section: 'library', title: 'Blueprints', exact: ['/library', '/skills'] },
  { section: 'library', title: 'Blueprints', exact: ['/workflows'] },
  { section: 'library', title: 'Composer', exact: ['/builder'] },
  { section: 'library', title: 'Solutions', exact: ['/solutions', '/apps'] },
  { section: 'integrations', title: 'Integrations', exact: ['/connectors', '/credentials', '/connect-ai', '/integrations'] },
  { section: 'integrations', title: 'Machines', exact: ['/machines'] },
  { section: 'integrations', title: 'Health', exact: ['/health', '/setup'] },
  { section: 'integrations', title: 'Variables', exact: ['/variables'] },
  { section: 'usage', title: 'Usage', exact: ['/usage'] },
  { section: 'account', title: 'Account', exact: ['/account'] },
  { section: 'settings', title: 'Settings', exact: ['/settings', '/workspace', '/team', '/admin', '/feedback'] },
];

export const PRODUCT_SECTION_BOUNDARIES: ProductSectionBoundary[] = [
  {
    sectionId: 'agents',
    owns: [
      'Reusable agents',
      'Agent drafts',
      'Live agent definitions',
      'Agent-specific deployment and capability summaries',
    ],
    firstClass: [
      'Chat with agent',
      'Edit agent',
      'Duplicate agent',
      'See what the agent uses',
    ],
    notHere: [
      'Marketplace skills',
      'Raw connectors and credentials',
      'Machines and health infrastructure',
      'Generic workflow/template catalog browsing',
    ],
    relatedLinks: [
      { label: 'Library', href: '/library', reason: 'Start from reusable templates, packs, workflows, and skills.' },
      { label: 'Integrations', href: '/connectors', reason: 'Connect workspace systems, channels, machines, and credentials.' },
    ],
  },
  {
    sectionId: 'library',
    owns: [
      'Skills',
      'Templates',
      'Workflows',
      'Packs and solution kits',
      'Reusable context and starter assets',
    ],
    firstClass: [
      'Install asset',
      'Browse marketplace',
      'Start from template',
      'Open reusable workflow or pack',
    ],
    notHere: [
      'Live agent roster',
      'Connector account management',
      'Machine/runtime health',
      'Blocked run operations',
    ],
    relatedLinks: [
      { label: 'Agents', href: '/agents', reason: 'Work with configured reusable agents already in this workspace.' },
      { label: 'Integrations', href: '/connectors', reason: 'Manage workspace capabilities that assets can depend on.' },
    ],
  },
  {
    sectionId: 'integrations',
    owns: [
      'Connectors',
      'Credentials',
      'Channels',
      'Machine and runtime targets',
      'Health and infrastructure access surfaces',
    ],
    firstClass: [
      'Connect tool',
      'Test access',
      'See machine/runtime availability',
      'Review health and channel bindings',
    ],
    notHere: [
      'Reusable agent definitions',
      'Marketplace asset browsing',
      'Workflow catalog ownership',
      'General work inbox and run history',
    ],
    relatedLinks: [
      { label: 'Agents', href: '/agents', reason: 'See which reusable agents use those capabilities.' },
      { label: 'Library', href: '/library', reason: 'See reusable assets that can consume those capabilities.' },
    ],
  },
];

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || '').trim();
  if (!normalized) return '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
}

export function getProductSection(sectionId: ProductSectionId): ProductSectionDefinition {
  return PRODUCT_SECTIONS.find((section) => section.id === sectionId) || PRODUCT_SECTIONS[0]!;
}

export function getProductSectionBoundary(sectionId: ProductSectionId): ProductSectionBoundary | null {
  return PRODUCT_SECTION_BOUNDARIES.find((section) => section.sectionId === sectionId) || null;
}

export function resolveProductSection(pathname: string): ProductSectionId {
  return resolveProductRoute(pathname).section.id;
}

export function resolveProductRoute(pathname: string): {
  section: ProductSectionDefinition;
  title: string;
} {
  const normalized = normalizePathname(pathname);
  for (const rule of PRODUCT_ROUTE_RULES) {
    if (rule.exact && rule.exact.includes(normalized)) {
      return { section: getProductSection(rule.section), title: rule.title };
    }
    if (rule.prefixes && rule.prefixes.some((prefix) => normalized.startsWith(prefix))) {
      return { section: getProductSection(rule.section), title: rule.title };
    }
  }
  const segments = normalized.split('/').filter(Boolean);
  const fallbackTitle = segments.length === 0
    ? 'Chat'
    : segments[segments.length - 1]!
      .split('-')
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(' ');
  return {
    section: getProductSection('settings'),
    title: fallbackTitle,
  };
}
