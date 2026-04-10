export type ProductSectionId =
  | 'sage'
  | 'runs'
  | 'agents'
  | 'integrations'
  | 'usage'
  | 'account'
  | 'settings';

export type ProductShapeRole =
  | 'master_agent'
  | 'operations'
  | 'specialists'
  | 'capabilities'
  | 'utility';

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
    id: 'sage',
    label: 'Sage',
    href: '/',
    role: 'master_agent',
    summary: 'Your primary relationship for planning, delegation, approvals, and execution.',
  },
  {
    id: 'runs',
    label: 'Runs',
    href: '/runs',
    role: 'operations',
    summary: 'Operational work in motion, approvals, outputs, and live cockpit visibility.',
  },
  {
    id: 'agents',
    label: 'Agents',
    href: '/agents',
    role: 'specialists',
    summary: 'Creation Forge, specialist channels, and owner refinement.',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    href: '/integrations',
    role: 'capabilities',
    summary: 'Connected tools, credentials, machines, and runtime health.',
  },
  {
    id: 'usage',
    label: 'Usage',
    href: '/usage',
    role: 'utility',
    summary: 'Consumption, throughput, and operational usage trends.',
  },
  {
    id: 'account',
    label: 'Account',
    href: '/account',
    role: 'utility',
    summary: 'Identity, session, and personal preferences.',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    role: 'utility',
    summary: 'Workspace defaults, policy, governance, and advanced configuration.',
  },
];

export const PRIMARY_NAV_SECTION_IDS: ProductSectionId[] = [
  'sage',
  'runs',
  'agents',
  'integrations',
];

export const UTILITY_NAV_SECTION_IDS: ProductSectionId[] = [
  'usage',
  'account',
  'settings',
];

export const CANONICAL_PRODUCT_OBJECTS: CanonicalProductObject[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    whatItIs: 'The operating environment that contains Sage, specialists, integrations, policy, and work history.',
    navOwner: 'sage',
    linksTo: ['agent', 'integration', 'machine_runtime_target', 'run', 'approval', 'memory_item'],
    isNot: 'It is not a single builder graph or one isolated chat message.',
  },
  {
    id: 'chat_session',
    label: 'Chat Session',
    whatItIs: 'A live conversation with Sage used to ask for work, review outputs, and launch durable runs.',
    navOwner: 'sage',
    linksTo: ['agent', 'run', 'artifact', 'memory_item'],
    isNot: 'It is not the reusable specialist definition itself.',
  },
  {
    id: 'agent',
    label: 'Agent',
    whatItIs: 'An installed specialist with scope, capabilities, and deployment context.',
    navOwner: 'agents',
    linksTo: ['chat_session', 'workflow', 'integration', 'run', 'memory_item'],
    isNot: 'It is not just a one-off run or a generic template.',
  },
  {
    id: 'agent_template',
    label: 'Agent Template',
    whatItIs: 'A reusable starting pattern that can be installed into a workspace.',
    navOwner: 'agents',
    linksTo: ['agent', 'workflow', 'skill', 'pack_solution_kit'],
    isNot: 'It is not an already configured live agent in the workspace.',
  },
  {
    id: 'workflow',
    label: 'Workflow',
    whatItIs: 'An internal reusable execution asset that powers automation and advanced creator tooling.',
    navOwner: 'agents',
    linksTo: ['agent', 'run', 'artifact', 'integration'],
    isNot: 'It is not the primary consumer-facing surface of the product.',
  },
  {
    id: 'skill',
    label: 'Skill',
    whatItIs: 'A reusable capability module the workspace can install and use.',
    navOwner: 'agents',
    linksTo: ['agent', 'agent_template', 'pack_solution_kit'],
    isNot: 'It is not the workspace itself or a connector account.',
  },
  {
    id: 'pack_solution_kit',
    label: 'Pack / Solution Kit',
    whatItIs: 'A reusable starter bundle around a job to be done.',
    navOwner: 'agents',
    linksTo: ['agent_template', 'workflow', 'skill'],
    isNot: 'It is not a live run or a raw integration credential.',
  },
  {
    id: 'integration',
    label: 'Integration',
    whatItIs: 'A connected system, channel, credentialed provider, or workspace capability.',
    navOwner: 'integrations',
    linksTo: ['agent', 'workflow', 'run', 'machine_runtime_target'],
    isNot: 'It is not the place where Sage or a specialist is configured.',
  },
  {
    id: 'machine_runtime_target',
    label: 'Machine / Runtime Target',
    whatItIs: 'A local or hosted execution destination the workspace can use to perform work.',
    navOwner: 'integrations',
    linksTo: ['integration', 'run', 'approval'],
    isNot: 'It is not a standalone product surface.',
  },
  {
    id: 'run',
    label: 'Run',
    whatItIs: 'A concrete piece of work in motion or completed, with lifecycle, status, diagnostics, and outputs.',
    navOwner: 'runs',
    linksTo: ['agent', 'workflow', 'approval', 'artifact', 'machine_runtime_target'],
    isNot: 'It is not a reusable asset.',
  },
  {
    id: 'approval',
    label: 'Approval',
    whatItIs: 'A workspace intervention request for confirmation, recovery, or policy-gated continuation.',
    navOwner: 'runs',
    linksTo: ['run', 'agent', 'machine_runtime_target'],
    isNot: 'It is not a settings page or a full run history item.',
  },
  {
    id: 'artifact',
    label: 'Output',
    whatItIs: 'A result produced by work: text, file, image, output package, or generated document.',
    navOwner: 'runs',
    linksTo: ['run', 'workflow', 'chat_session'],
    isNot: 'It is not the execution plan or the agent itself.',
  },
  {
    id: 'memory_item',
    label: 'Memory Item',
    whatItIs: 'Stored context the workspace can retrieve and use again across runs, agents, and chats.',
    navOwner: 'sage',
    linksTo: ['workspace', 'agent', 'chat_session', 'run'],
    isNot: 'It is not merely a transient log line.',
  },
];

export const PRODUCT_ROUTE_RULES: ProductRouteRule[] = [
  { section: 'sage', title: 'Sage', exact: ['/', '/home'] },
  { section: 'runs', title: 'Runs', exact: ['/runs', '/executions', '/history'] },
  { section: 'runs', title: 'Approvals', exact: ['/approvals'] },
  { section: 'runs', title: 'Outputs', exact: ['/artifacts'] },
  { section: 'runs', title: 'Cockpit', prefixes: ['/runs/'] },
  { section: 'agents', title: 'Agents', exact: ['/agents', '/store', '/library'] },
  { section: 'agents', title: 'Agent Configuration', prefixes: ['/agents/'] },
  { section: 'agents', title: 'Blueprint Import', exact: ['/workflows', '/builder', '/skills', '/solutions', '/apps'] },
  { section: 'integrations', title: 'Integrations', exact: ['/integrations', '/connectors', '/credentials', '/connect-ai'] },
  { section: 'integrations', title: 'Runtime Targets', exact: ['/machines', '/health', '/setup'] },
  { section: 'usage', title: 'Usage', exact: ['/usage'] },
  { section: 'account', title: 'Account', exact: ['/account'] },
  { section: 'settings', title: 'Settings', exact: ['/settings', '/workspace', '/team', '/admin', '/feedback'] },
];

export const PRODUCT_SECTION_BOUNDARIES: ProductSectionBoundary[] = [
  {
    sectionId: 'runs',
    owns: ['Runs', 'Approvals', 'Outputs', 'Run diagnostics', 'Cockpit interventions'],
    firstClass: ['Inspect run', 'Resolve approval', 'Open output', 'Kill execution'],
    notHere: ['Reusable templates', 'Raw connector credentials', 'Advanced builder authoring'],
    relatedLinks: [
      { label: 'Sage', href: '/', reason: 'Start work and review inline intervention cards in the master thread.' },
      { label: 'Agents', href: '/agents', reason: 'See which specialist or install produced the work.' },
    ],
  },
  {
    sectionId: 'agents',
    owns: ['Creation Forge', 'Installed specialists', 'Blueprint import', 'Specialist configuration'],
    firstClass: ['Create specialist', 'Open owner mode', 'Open customer mode', 'Import blueprint'],
    notHere: ['Marketplace storefronts', 'Low-level runtime health', 'Standalone workflow graph editing'],
    relatedLinks: [
      { label: 'Runs', href: '/runs', reason: 'Inspect what specialists are doing in production.' },
      { label: 'Settings', href: '/settings', reason: 'Manage the connected systems specialists depend on.' },
    ],
  },
  {
    sectionId: 'integrations',
    owns: ['Connectors', 'Credentials', 'Machines', 'Health', 'Runtime availability'],
    firstClass: ['Connect tool', 'Review credentials', 'Check machine availability', 'Inspect runtime status'],
    notHere: ['Marketplace browsing', 'Sage conversation history', 'Customer channel creation'],
    relatedLinks: [
      { label: 'Agents', href: '/agents', reason: 'See which specialists depend on those capabilities.' },
      { label: 'Runs', href: '/runs', reason: 'Inspect work blocked by capability health or missing access.' },
    ],
  },
  {
    sectionId: 'settings',
    owns: ['Workspace defaults', 'Policy', 'Governance', 'Advanced configuration'],
    firstClass: ['Review workspace policy', 'Adjust defaults', 'Manage governance', 'Update advanced configuration'],
    notHere: ['Connected tool operations', 'Runtime target health', 'Reusable blueprint browsing'],
    relatedLinks: [
      { label: 'Integrations', href: '/integrations', reason: 'Open connected systems, runtime targets, and capability health.' },
      { label: 'Agents', href: '/agents', reason: 'See which specialists use those capabilities.' },
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
    ? 'Sage'
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
