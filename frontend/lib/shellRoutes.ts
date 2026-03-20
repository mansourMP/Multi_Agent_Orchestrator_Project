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
    breadcrumb: 'Workspace',
    slotLabel: 'Talk to your assistant and get work done',
    match: (pathname: string) => pathname === '/',
  },
  {
    id: 'advanced-workspace',
    title: SINGLE_AGENT_MODE ? 'Advanced Workspace' : 'Workspace',
    breadcrumb: 'Control Center',
    slotLabel: SINGLE_AGENT_MODE ? 'Assistant control and inspect' : 'Workers, routing, and inspect',
    match: (pathname: string) => pathname === '/workspace',
  },
  {
    id: 'automations',
    title: 'Automations',
    breadcrumb: 'Control Center',
    slotLabel: 'Reusable systems',
    match: (pathname: string) => pathname === '/workflows',
  },
  {
    id: 'automation-editor',
    title: 'Automation',
    breadcrumb: 'Automations',
    slotLabel: 'Build and run system',
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
    breadcrumb: 'Control Center',
    slotLabel: 'People, roles, and access',
    match: (pathname: string) => pathname === '/team',
  },
  {
    id: 'approvals',
    title: 'Approvals',
    breadcrumb: 'Control Center',
    slotLabel: 'Review before sensitive actions',
    match: (pathname: string) => pathname === '/approvals',
  },
  {
    id: 'runs',
    title: 'Runs',
    breadcrumb: 'Control Center',
    slotLabel: 'Execution history',
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
    title: 'Outputs',
    breadcrumb: 'Control Center',
    slotLabel: 'Finished work and traces',
    match: (pathname: string) => pathname === '/artifacts',
  },
  {
    id: 'control-center',
    title: 'Control Center',
    breadcrumb: 'Control Center',
    slotLabel: 'Advanced workspace controls',
    match: (pathname: string) => pathname === '/control-center',
  },
  {
    id: 'connections',
    title: 'Connections',
    breadcrumb: 'Workspace',
    slotLabel: 'Connected tools and channels',
    match: (pathname: string) => pathname === '/credentials',
  },
  {
    id: 'setup',
    title: 'Setup',
    breadcrumb: 'Control Center',
    slotLabel: 'Finish workspace readiness',
    match: (pathname: string) => pathname === '/setup',
  },
  {
    id: 'settings',
    title: 'Settings',
    breadcrumb: 'Control Center',
    slotLabel: 'Workspace preferences',
    match: (pathname: string) => pathname === '/settings',
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    breadcrumb: 'Control Center',
    slotLabel: 'Skills, access, and execution policy',
    match: (pathname: string) => pathname === '/skills',
  },
  {
    id: 'account',
    title: 'Account',
    breadcrumb: 'Team',
    slotLabel: 'Identity and profile',
    match: (pathname: string) => pathname === '/account',
  },
  {
    id: 'health',
    title: 'Health',
    breadcrumb: 'Control Center',
    slotLabel: 'Runtime and trace diagnostics',
    match: (pathname: string) => pathname === '/health',
  },
];

const FALLBACK_ROUTE: ShellRouteMeta = {
  id: 'workspace',
  title: 'Workspace',
  breadcrumb: 'Workspace',
  slotLabel: 'Navigate and operate',
};

export function resolveShellRouteMeta(pathname: string): ShellRouteMeta {
  return SHELL_ROUTE_DEFS.find((item) => item.match(pathname)) ?? FALLBACK_ROUTE;
}
