import { PACKAGED_SOLUTIONS_ENABLED, SINGLE_AGENT_MODE } from '@/lib/appFlags';

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
    title: 'Agents',
    breadcrumb: 'Agents',
    slotLabel: 'Reusable agents and templates',
    match: (pathname: string) => pathname === '/builder',
  },
  {
    id: 'builder-editor',
    title: 'Agent Editor',
    breadcrumb: 'Agents',
    slotLabel: 'Design reusable agent systems visually',
    match: (pathname: string) => pathname.startsWith('/builder/'),
  },
  {
    id: 'automations',
    title: 'Workflows',
    breadcrumb: 'Workflows',
    slotLabel: 'Reusable workflows and playbooks',
    match: (pathname: string) => pathname === '/workflows',
  },
  {
    id: 'automation-editor',
    title: 'Workflow Editor',
    breadcrumb: 'Workflows',
    slotLabel: 'Edit workflow graph',
    match: (pathname: string) => pathname.startsWith('/workflows/'),
  },
  {
    id: 'agents',
    title: AGENT_SURFACE_TITLE,
    breadcrumb: 'Agents',
    slotLabel: 'Reusable agents and templates',
    match: (pathname: string) => pathname === '/agents',
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
  ...(PACKAGED_SOLUTIONS_ENABLED
    ? [
        {
          id: 'solutions',
          title: 'Packages',
          breadcrumb: 'Packages',
          slotLabel: 'Optional packaged capability layers',
          match: (pathname: string) => pathname.startsWith('/solutions/'),
        },
      ]
    : []),
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
    match: (pathname: string) => pathname === '/connectors' || pathname === '/credentials',
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
    id: 'machines',
    title: 'Machines',
    breadcrumb: 'Settings',
    slotLabel: 'Local machine status and runtime controls',
    match: (pathname: string) => pathname === '/machines',
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    breadcrumb: 'Admin',
    slotLabel: 'Skills, access, and execution policy',
    match: (pathname: string) => pathname === '/skills' || pathname === '/library',
  },
  {
    id: 'account',
    title: 'Profile',
    breadcrumb: 'Settings',
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
