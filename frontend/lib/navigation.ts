export type NavigationSectionId =
  | 'sage'
  | 'runs'
  | 'agents'
  | 'usage'
  | 'account'
  | 'settings';

export type NavigationSection = {
  id: NavigationSectionId;
  label: string;
  href: string;
  summary: string;
  kind: 'primary' | 'utility';
  exact: string[];
  prefixes?: string[];
};

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || '').trim();
  if (!normalized) return '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: 'sage',
    label: 'Sage',
    href: '/',
    summary: 'Your primary relationship for planning, delegation, approvals, and execution.',
    kind: 'primary',
    exact: ['/', '/home'],
  },
  {
    id: 'runs',
    label: 'Runs',
    href: '/runs',
    summary: 'Operational work in motion, approvals, outputs, and live cockpit visibility.',
    kind: 'primary',
    exact: ['/runs', '/executions', '/history', '/approvals', '/artifacts'],
    prefixes: ['/runs/'],
  },
  {
    id: 'agents',
    label: 'Agents',
    href: '/agents',
    summary: 'Creation Forge, specialist channels, and owner refinement.',
    kind: 'primary',
    exact: ['/agents', '/store', '/library', '/workflows', '/builder', '/skills', '/solutions', '/apps'],
    prefixes: ['/agents/'],
  },
  {
    id: 'usage',
    label: 'Usage',
    href: '/usage',
    summary: 'Consumption, throughput, and operational usage trends.',
    kind: 'utility',
    exact: ['/usage'],
  },
  {
    id: 'account',
    label: 'Account',
    href: '/account',
    summary: 'Identity, session, and personal preferences.',
    kind: 'utility',
    exact: ['/account'],
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    summary: 'Workspace defaults, policy, governance, and connected system health.',
    kind: 'utility',
    exact: ['/settings', '/workspace', '/team', '/admin', '/feedback', '/integrations', '/connectors', '/credentials', '/machines', '/health', '/connect-ai'],
    prefixes: ['/integrations/'],
  },
];

export const PRIMARY_NAV_ITEMS = NAVIGATION_SECTIONS.filter((section) => section.kind === 'primary');
export const UTILITY_NAV_ITEMS = NAVIGATION_SECTIONS.filter((section) => section.kind === 'utility');

export function getNavigationSection(sectionId: NavigationSectionId): NavigationSection {
  return NAVIGATION_SECTIONS.find((section) => section.id === sectionId) || NAVIGATION_SECTIONS[0]!;
}

export function resolveNavigationSection(pathname: string): NavigationSectionId {
  const normalized = normalizePathname(pathname);
  for (const section of NAVIGATION_SECTIONS) {
    if (section.exact.includes(normalized)) {
      return section.id;
    }
    if (section.prefixes?.some((prefix) => normalized.startsWith(prefix))) {
      return section.id;
    }
  }
  return 'settings';
}
