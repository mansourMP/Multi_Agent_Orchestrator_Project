import {
  Activity,
  CircleAlert,
  Coins,
  SquareActivity,
  Table,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { WorkspaceRouteId } from '../../../shared/nav-manifest';

export type SageCommandActionKind =
  | 'open_status'
  | 'open_usage';

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
];

export const SAGE_WORKSPACE_COMMAND_CATALOG: readonly SageWorkspaceCommandMetadata[] = [
  {
    id: 'tasks',
    title: 'Sage tasks',
    description: 'Open scheduled actions and pending automation tasks.',
    routeId: 'tasks',
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
