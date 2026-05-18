import {
  Activity,
  CircleAlert,
  Coins,
  Cpu,
  LayoutGrid,
  LifeBuoy,
  Puzzle,
  SquareActivity,
  Table,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { WorkspaceRouteId } from '../../../shared/nav-manifest';

export type SageCommandActionKind =
  | 'open_status'
  | 'open_proof'
  | 'open_usage'
  | 'open_tools'
  | 'open_runtime'
  | 'run_doctor';

export type SageCommandMetadata = {
  id: string;
  slash: `/${string}`;
  title: string;
  description: string;
  actionKind: SageCommandActionKind;
  icon: LucideIcon;
  keywords?: string[];
};

export type SageWorkspaceCommandMetadata = {
  id: string;
  title: string;
  description: string;
  routeId: WorkspaceRouteId;
  icon: LucideIcon;
  keywords?: string[];
};

export const SAGE_COMMAND_CATALOG: readonly SageCommandMetadata[] = [
  {
    id: 'status',
    slash: '/status',
    title: 'Status',
    description: 'Show Sage health, readiness, and connectivity.',
    actionKind: 'open_status',
    icon: Activity,
    keywords: ['system', 'health', 'ready'],
  },
  {
    id: 'usage',
    slash: '/usage',
    title: 'Credits and usage',
    description: 'Open credits, estimated cost, and recent usage signals.',
    actionKind: 'open_usage',
    icon: Coins,
    keywords: ['quota', 'cost', 'billing', 'stats'],
  },
  {
    id: 'proof',
    slash: '/proof',
    title: 'Show proof',
    description: 'Open session evidence, computer proofs, artifacts, and audit trail.',
    actionKind: 'open_proof',
    icon: Table,
    keywords: ['activity', 'evidence', 'computer', 'browser', 'audit', 'artifact'],
  },
  {
    id: 'tools',
    slash: '/tools',
    title: 'What Sage can use',
    description: 'Show connected tools, apps, and callable capabilities.',
    actionKind: 'open_tools',
    icon: Puzzle,
    keywords: ['integrations', 'tooling', 'actions', 'capabilities'],
  },
  {
    id: 'runtime',
    slash: '/runtime',
    title: 'AI setup',
    description: 'Check which AI path Sage will use and where to manage it.',
    actionKind: 'open_runtime',
    icon: Cpu,
    keywords: ['target', 'provider', 'local', 'cloud', 'deployment'],
  },
  {
    id: 'doctor',
    slash: '/doctor',
    title: 'Check setup',
    description: 'Run a Sage readiness and connectivity check.',
    actionKind: 'run_doctor',
    icon: LifeBuoy,
    keywords: ['health check', 'diagnostic', 'connectivity', 'connectors', 'gateway'],
  },
];

export const SAGE_WORKSPACE_COMMAND_CATALOG: readonly SageWorkspaceCommandMetadata[] = [
  {
    id: 'skills',
    title: 'Installed skills',
    description: 'Open the skill catalog and inspect installed AI extensions.',
    routeId: 'skills',
    icon: Puzzle,
    keywords: ['extensions', 'skills', 'install', 'tool server', 'playbook'],
  },
  {
    id: 'tasks',
    title: 'Sage tasks',
    description: 'Open scheduled actions and pending automation tasks.',
    routeId: 'heartbeat',
    icon: SquareActivity,
    keywords: ['heartbeat', 'tasks', 'scheduler', 'next action', 'automation'],
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Open memory surfaces for facts, corrections, and preferences.',
    routeId: 'memory',
    icon: Table,
    keywords: ['context', 'facts', 'profile', 'knowledge', 'preference'],
  },
  {
    id: 'approvals',
    title: 'Approvals',
    description: 'Open pending approval requests awaiting user confirmation.',
    routeId: 'approvals',
    icon: CircleAlert,
    keywords: ['review', 'approve', 'pending', 'guarded action', 'ok'],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Open integrated services and third-party app connections.',
    routeId: 'integrations',
    icon: LayoutGrid,
    keywords: ['connect', 'apps', 'providers', 'channels', 'services'],
  },
  {
    id: 'activity',
    title: 'Activity',
    description: 'Open run and event activity for recent work in this workspace.',
    routeId: 'activity',
    icon: Activity,
    keywords: ['events', 'audit', 'timeline', 'history', 'runs'],
  },
];

export function normalizeSageCommandSlash(value: string): string {
  return value.trim().toLowerCase();
}

export function isSageCommandSlash(value: string): value is `/${string}` {
  return normalizeSageCommandSlash(value).startsWith('/');
}

export function resolveSageCommandBySlash(slash: string): SageCommandMetadata | null {
  const normalized = normalizeSageCommandSlash(slash);
  if (!isSageCommandSlash(normalized)) {
    return null;
  }
  return SAGE_COMMAND_CATALOG.find((command) => command.slash === normalized) ?? null;
}

export function resolveSageCommandById(id: string): SageCommandMetadata | null {
  return SAGE_COMMAND_CATALOG.find((command) => command.id === id.trim().toLowerCase()) ?? null;
}
