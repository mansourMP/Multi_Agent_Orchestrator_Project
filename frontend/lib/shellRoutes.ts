import { SINGLE_AGENT_MODE } from '@/lib/appFlags';

export type ShellRouteMeta = {
  id: string;
  title: string;
  breadcrumb: string;
  slotLabel: string;
};

type ShellRouteDef = ShellRouteMeta & {
  match: (pathname: string) => boolean;
};

const AGENT_SURFACE_TITLE = SINGLE_AGENT_MODE ? 'Assistant' : 'Agents';
const AGENT_SURFACE_SLOT = SINGLE_AGENT_MODE ? 'Inbox, channels, and live work' : 'Workers and live collaborations';

const SHELL_ROUTE_DEFS: ShellRouteDef[] = [
  {
    id: 'home',
    title: 'Chat',
    breadcrumb: 'Chat',
    slotLabel: 'Talk to your assistant',
    match: (pathname: string) => pathname === '/',
  },
  {
    id: 'platform-home',
    title: 'Home',
    breadcrumb: 'Home',
    slotLabel: 'Overview of your workspace and recent workflows',
    match: (pathname: string) => pathname === '/home',
  },
  {
    id: 'builder',
    title: 'Agent Builder',
    breadcrumb: 'Builder',
    slotLabel: 'Create and manage workflows',
    match: (pathname: string) => pathname === '/builder',
  },
  {
    id: 'builder-editor',
    title: 'Workflow Editor',
    breadcrumb: 'Builder',
    slotLabel: 'Design workflows visually',
    match: (pathname: string) => pathname.startsWith('/builder/'),
  },
  {
    id: 'automations',
    title: 'Workflows',
    breadcrumb: 'Workflows',
    slotLabel: 'Build and run workflows',
    match: (pathname: string) => pathname === '/workflows',
  },
  {
    id: 'automation-editor',
    title: 'Automation',
    breadcrumb: 'Workflows',
    slotLabel: 'Edit workflow graph',
    match: (pathname: string) => pathname.startsWith('/workflows/'),
  },
  {
    id: 'agents',
    title: AGENT_SURFACE_TITLE,
    breadcrumb: 'Workspace',
    slotLabel: AGENT_SURFACE_SLOT,
    match: (pathname: string) => pathname === '/agents',
  },
  {
    id: 'team',
    title: 'Team',
    breadcrumb: 'Admin',
    slotLabel: 'People, roles, and access',
    match: (pathname: string) => pathname === '/team',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    breadcrumb: 'Admin',
    slotLabel: 'Review before sensitive actions',
    match: (pathname: string) => pathname === '/approvals',
  },
  {
    id: 'runs',
    title: 'Runs',
    breadcrumb: 'Runs',
    slotLabel: 'Runs and approvals',
    match: (pathname: string) => pathname === '/executions',
  },
  {
    id: 'run-inspect',
    title: 'Run Inspect',
    breadcrumb: 'Runs',
    slotLabel: 'Evidence and trace',
    match: (pathname: string) => pathname.startsWith('/runs/'),
  },
  {
    id: 'files',
    title: 'Assets',
    breadcrumb: 'Assets',
    slotLabel: 'Outputs and results',
    match: (pathname: string) => pathname === '/artifacts',
  },
  {
    id: 'solutions',
    title: 'Solutions',
    breadcrumb: 'Solutions',
    slotLabel: 'Packaged workflows built on the core platform',
    match: (pathname: string) => pathname.startsWith('/solutions/'),
  },
  {
    id: 'control-center',
    title: 'Admin',
    breadcrumb: 'Admin',
    slotLabel: 'Advanced platform controls',
    match: (pathname: string) => pathname === '/control-center',
  },
  {
    id: 'connections',
    title: 'Integrations',
    breadcrumb: 'Integrations',
    slotLabel: 'Connect tools and channels',
    match: (pathname: string) => pathname === '/credentials',
  },
  {
    id: 'usage',
    title: 'Usage',
    breadcrumb: 'Usage',
    slotLabel: 'Track platform consumption and limits',
    match: (pathname: string) => pathname === '/usage',
  },
  {
    id: 'setup',
    title: 'Setup',
    breadcrumb: 'Admin',
    slotLabel: 'Finish platform setup',
    match: (pathname: string) => pathname === '/setup',
  },
  {
    id: 'settings',
    title: 'Settings',
    breadcrumb: 'Settings',
    slotLabel: 'Platform preferences',
    match: (pathname: string) => pathname === '/settings',
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    breadcrumb: 'Admin',
    slotLabel: 'Skills, access, and execution policy',
    match: (pathname: string) => pathname === '/skills',
  },
  {
    id: 'account',
    title: 'Account',
    breadcrumb: 'Account',
    slotLabel: 'Identity and profile',
    match: (pathname: string) => pathname === '/account',
  },
  {
    id: 'health',
    title: 'Health',
    breadcrumb: 'Admin',
    slotLabel: 'Runtime and trace diagnostics',
    match: (pathname: string) => pathname === '/health',
  },
];

const FALLBACK_ROUTE: ShellRouteMeta = {
  id: 'platform',
  title: 'Empyralis',
  breadcrumb: 'Platform',
  slotLabel: '',
};

export function resolveShellRouteMeta(pathname: string): ShellRouteMeta {
  return SHELL_ROUTE_DEFS.find((item) => item.match(pathname)) ?? FALLBACK_ROUTE;
}
