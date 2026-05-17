import type { WorkspaceRouteId } from '../../../shared/nav-manifest';

import type { WorkstationSageSkillRecord } from '@/lib/workspace/workstation-client';

export type SageCommandActionKind =
  | 'open_status'
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
  keywords?: string[];
};

export type SageWorkspaceCommandMetadata = {
  id: string;
  title: string;
  description: string;
  routeId: WorkspaceRouteId;
  keywords?: string[];
};

export type SageSkillCommandMacro = {
  id: string;
  slash: `/${string}`;
  title: string;
  description: string;
  skillId: string;
  skillName: string;
  draftValue: string;
  keywords: string[];
};

export const SAGE_COMMAND_CATALOG: readonly SageCommandMetadata[] = [
  {
    id: 'status',
    slash: '/status',
    title: "What's Sage doing?",
    description: 'Show Sage health, readiness, and the latest run summary.',
    actionKind: 'open_status',
    keywords: ['system', 'health', 'ready', 'state', 'ready state'],
  },
  {
    id: 'usage',
    slash: '/usage',
    title: 'Credits and usage',
    description: 'Open credits, estimated cost, and recent usage signals.',
    actionKind: 'open_usage',
    keywords: ['quota', 'cost', 'billing', 'trace', 'stats'],
  },
  {
    id: 'tools',
    slash: '/tools',
    title: 'What Sage can use',
    description: 'Show connected tools, apps, and callable capabilities.',
    actionKind: 'open_tools',
    keywords: ['integrations', 'tooling', 'actions', 'capabilities'],
  },
  {
    id: 'runtime',
    slash: '/runtime',
    title: 'AI setup',
    description: 'Check which AI path Sage will use and where to manage it.',
    actionKind: 'open_runtime',
    keywords: ['target', 'provider', 'local', 'cloud', 'deployment'],
  },
  {
    id: 'doctor',
    slash: '/doctor',
    title: 'Check setup',
    description: 'Run a Sage readiness and connectivity check.',
    actionKind: 'run_doctor',
    keywords: ['health check', 'diagnostic', 'connectivity', 'connectors', 'gateway'],
  },
];

export const SAGE_WORKSPACE_COMMAND_CATALOG: readonly SageWorkspaceCommandMetadata[] = [
  {
    id: 'skills',
    title: 'Installed skills',
    description: 'Open the skill catalog and inspect installed AI extensions.',
    routeId: 'skills',
    keywords: ['extensions', 'skills', 'install', 'tool server', 'playbook'],
  },
  {
    id: 'tasks',
    title: 'Sage tasks',
    description: 'Open scheduled actions and pending automation tasks.',
    routeId: 'heartbeat',
    keywords: ['heartbeat', 'tasks', 'scheduler', 'next action', 'automation'],
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Open memory surfaces for facts, corrections, and preferences.',
    routeId: 'memory',
    keywords: ['context', 'facts', 'profile', 'knowledge', 'preference'],
  },
  {
    id: 'approvals',
    title: 'Needs your OK',
    description: 'Open pending approval requests awaiting user confirmation.',
    routeId: 'approvals',
    keywords: ['review', 'approve', 'pending', 'guarded action', 'ok'],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Open integrated services and third-party app connections.',
    routeId: 'integrations',
    keywords: ['connect', 'apps', 'providers', 'channels', 'services'],
  },
  {
    id: 'activity',
    title: 'Activity',
    description: 'Open run and event activity for recent work in this workspace.',
    routeId: 'activity',
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

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const token = readString(item);
        return token ? [token] : [];
      })
    : [];
}

function normalizeSlashToken(value: unknown): `/${string}` | null {
  const normalized = readString(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  const token = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (/\s/.test(token)) {
    return null;
  }
  return token as `/${string}`;
}

export function buildSageSkillCommandMacros(payload: unknown): SageSkillCommandMacro[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(record.items) ? record.items : [];
  const macros: SageSkillCommandMacro[] = [];
  const seen = new Set<string>(SAGE_COMMAND_CATALOG.map((command) => command.slash));

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const skill = item as WorkstationSageSkillRecord;
    if (readString(skill.status).toLowerCase() !== 'ready') {
      continue;
    }
    const skillId = readString(skill.id) || 'skill';
    const skillName = readString(skill.name) || 'Skill';
    const description =
      readString(skill.what_it_does)
      || readString(skill.description)
      || `${skillName} capability`;
    const keywords = [
      skillName,
      description,
      ...readStringList(skill.tools),
      ...readStringList(skill.supported_os),
      ...readStringList(skill.allowed_runtime_modes),
    ];

    for (const token of readStringList(skill.slash_commands)) {
      const slash = normalizeSlashToken(token);
      if (!slash || seen.has(slash)) {
        continue;
      }
      seen.add(slash);
      macros.push({
        id: `skill:${skillId}:${slash.slice(1)}`,
        slash,
        title: skillName,
        description,
        skillId,
        skillName,
        draftValue: `${slash} `,
        keywords,
      });
    }
  }

  return macros.sort((left, right) => left.title.localeCompare(right.title) || left.slash.localeCompare(right.slash));
}

export function expandSageSkillSlashCommand(
  message: string,
  macros: readonly SageSkillCommandMacro[],
): {
  displayMessage: string;
  submittedMessage: string;
  matchedMacro: SageSkillCommandMacro | null;
} {
  const displayMessage = message.trim();
  if (!displayMessage.startsWith('/')) {
    return {
      displayMessage,
      submittedMessage: displayMessage,
      matchedMacro: null,
    };
  }

  const [rawSlash = '', ...rest] = displayMessage.split(/\s+/);
  const slash = normalizeSlashToken(rawSlash);
  if (!slash) {
    return {
      displayMessage,
      submittedMessage: displayMessage,
      matchedMacro: null,
    };
  }

  const matchedMacro = macros.find((macro) => macro.slash === slash) ?? null;
  if (!matchedMacro) {
    return {
      displayMessage,
      submittedMessage: displayMessage,
      matchedMacro: null,
    };
  }

  const request = rest.join(' ').trim() || 'Help me with this capability.';
  const submittedMessage = [
    `The user invoked the \`${matchedMacro.slash}\` command for the "${matchedMacro.skillName}" skill.`,
    `Skill summary: ${matchedMacro.description}`,
    `User request: ${request}`,
  ].join('\n');

  return {
    displayMessage,
    submittedMessage,
    matchedMacro,
  };
}
