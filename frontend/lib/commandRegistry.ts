import { BRAND } from '@/lib/brand';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';

export type PlatformLocalOpsAction =
  | 'start_services'
  | 'restart_services'
  | 'readiness'
  | 'release_status'
  | 'telegram_rebind'
  | 'ops_daemon_status'
  | 'ops_daemon_restart';

export type PlatformGlobalUiEvent = 'focus_command' | 'focus_goal' | 'run_autopilot';

export type PlatformGlobalCommandEventDetail = {
  type: PlatformGlobalUiEvent;
};

export const GLOBAL_COMMAND_EVENT = 'empyralis:global-command';
export const LEGACY_ORION_GLOBAL_COMMAND_EVENT = 'orion:global-command';
export const GLOBAL_COMMAND_EVENTS = [GLOBAL_COMMAND_EVENT, LEGACY_ORION_GLOBAL_COMMAND_EVENT] as const;

export const PENDING_GLOBAL_COMMAND_STORAGE_KEY = 'empyralis:pending-global-command';
export const LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY = 'orion:pending-global-command';
export const PENDING_GLOBAL_COMMAND_STORAGE_KEYS = [
  PENDING_GLOBAL_COMMAND_STORAGE_KEY,
  LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY,
] as const;

export type PlatformCommand = {
  id: string;
  title: string;
  description: string;
  group: 'Navigate' | 'Run' | 'Operations';
  keywords: string[];
  shortcut?: string;
  action:
    | { type: 'navigate'; href: string }
    | { type: 'local_op'; action: PlatformLocalOpsAction }
    | { type: 'ui_event'; event: PlatformGlobalUiEvent };
};

const BASE_COMMANDS: PlatformCommand[] = [
  {
    id: 'nav.sage',
    title: 'Go to Sage',
    description: 'Open the master thread with Sage.',
    group: 'Navigate',
    keywords: ['sage', 'assistant', 'chat', 'master thread'],
    action: { type: 'navigate', href: '/' },
  },
  {
    id: 'nav.runs',
    title: 'Go to Runs',
    description: 'Open operational work, approvals, and live run history.',
    group: 'Navigate',
    keywords: ['runs', 'history', 'approvals', 'cockpit', 'operations'],
    action: { type: 'navigate', href: '/runs' },
  },
  {
    id: 'nav.agents',
    title: SINGLE_AGENT_MODE ? 'Go to Specialists' : 'Go to Agents',
    description: SINGLE_AGENT_MODE ? 'Open installed specialists and availability.' : 'Open installed agents and specialist availability.',
    group: 'Navigate',
    keywords: ['agents', 'specialists', 'installs', 'availability'],
    action: { type: 'navigate', href: '/agents' },
  },
  {
    id: 'nav.forge',
    title: 'Open Forge',
    description: 'Create a specialist, import a blueprint, or refine draft channels.',
    group: 'Navigate',
    keywords: ['forge', 'agents', 'blueprint', 'create specialist'],
    action: { type: 'navigate', href: '/agents' },
  },
  {
    id: 'nav.integrations',
    title: 'Go to Integrations',
    description: 'Manage connectors, credentials, machines, health, and runtime access.',
    group: 'Navigate',
    keywords: ['integrations', 'credentials', 'connectors', 'machines', 'health', 'runtime'],
    action: { type: 'navigate', href: '/integrations' },
  },
  {
    id: 'nav.settings',
    title: 'Go to Settings',
    description: 'Update keys, UI preferences, and default behaviors.',
    group: 'Navigate',
    keywords: ['preferences', 'provider', 'theme'],
    action: { type: 'navigate', href: '/settings' },
  },
  {
    id: 'run.focus_goal',
    title: 'Focus Outcome Prompt',
    description: 'Jump to the goal editor and continue your plan.',
    group: 'Run',
    keywords: ['goal', 'prompt', 'outcome', 'editor'],
    shortcut: 'G',
    action: { type: 'ui_event', event: 'focus_goal' },
  },
  {
    id: 'run.focus_command',
    title: 'Focus Command Bar',
    description: 'Jump to slash command input in the Home workspace.',
    group: 'Run',
    keywords: ['slash', 'command', 'terminal'],
    shortcut: '/',
    action: { type: 'ui_event', event: 'focus_command' },
  },
  {
    id: 'run.start_autopilot',
    title: 'Start Autopilot Now',
    description: 'Trigger run execution from Home using current settings.',
    group: 'Run',
    keywords: ['start', 'run', 'execute', 'autopilot'],
    shortcut: 'Enter',
    action: { type: 'ui_event', event: 'run_autopilot' },
  },
  {
    id: 'ops.readiness',
    title: 'Run Environment Readiness',
    description: 'Run full readiness checks from web ops.',
    group: 'Operations',
    keywords: ['check', 'environment', 'health', 'diagnostic'],
    action: { type: 'local_op', action: 'readiness' },
  },
  {
    id: 'ops.restart_services',
    title: `Restart ${BRAND.company} Services`,
    description: 'Restart runtime/backend/frontend and worker services.',
    group: 'Operations',
    keywords: ['restart', 'stack', 'runtime', 'backend', 'worker'],
    action: { type: 'local_op', action: 'restart_services' },
  },
  {
    id: 'ops.start_services',
    title: `Start ${BRAND.company} Services`,
    description: `Start local ${BRAND.company} runtime stack from web ops.`,
    group: 'Operations',
    keywords: ['boot', 'start', 'stack'],
    action: { type: 'local_op', action: 'start_services' },
  },
  {
    id: 'ops.telegram_rebind',
    title: 'Rebind Telegram Connector',
    description: 'Rebind and send probe for Telegram autopilot.',
    group: 'Operations',
    keywords: ['telegram', 'rebind', 'probe', 'channel'],
    action: { type: 'local_op', action: 'telegram_rebind' },
  },
  {
    id: 'ops.daemon_restart',
    title: 'Restart Ops Daemon',
    description: 'Restart ops daemon watchdog and status service.',
    group: 'Operations',
    keywords: ['daemon', 'watchdog', 'ops'],
    action: { type: 'local_op', action: 'ops_daemon_restart' },
  },
];

function scoreCommand(command: PlatformCommand, terms: string[]): number | null {
  const title = command.title.toLowerCase();
  const description = command.description.toLowerCase();
  const keywords = command.keywords.join(' ').toLowerCase();
  const id = command.id.toLowerCase();
  const corpus = `${title} ${description} ${keywords} ${id}`;

  let score = 0;
  for (const term of terms) {
    if (title.startsWith(term)) {
      score += 12;
      continue;
    }
    if (title.includes(term)) {
      score += 8;
      continue;
    }
    if (keywords.includes(term)) {
      score += 6;
      continue;
    }
    if (description.includes(term)) {
      score += 4;
      continue;
    }
    if (corpus.includes(term)) {
      score += 2;
      continue;
    }
    return null;
  }

  if (command.group === 'Navigate') score += 2;
  if (command.group === 'Run') score += 1;
  return score;
}

export function listPlatformCommands(): PlatformCommand[] {
  return [...BASE_COMMANDS];
}

export function searchPlatformCommands(commands: PlatformCommand[], query: string): PlatformCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;

  const terms = normalized.split(/\s+/).filter(Boolean);
  return commands
    .map((command) => {
      const score = scoreCommand(command, terms);
      return score === null ? null : { command, score };
    })
    .filter((item): item is { command: PlatformCommand; score: number } => item !== null)
    .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
    .map((item) => item.command);
}

export type OrionLocalOpsAction = PlatformLocalOpsAction;
export type OrionGlobalUiEvent = PlatformGlobalUiEvent;
export type OrionGlobalCommandEventDetail = PlatformGlobalCommandEventDetail;
export type OrionCommand = PlatformCommand;
export const EMPYRALIS_GLOBAL_COMMAND_EVENT = GLOBAL_COMMAND_EVENT;
export const ORION_GLOBAL_COMMAND_EVENT = LEGACY_ORION_GLOBAL_COMMAND_EVENT;
export const EMPYRALIS_PENDING_COMMAND_STORAGE_KEY = PENDING_GLOBAL_COMMAND_STORAGE_KEY;
export const ORION_PENDING_COMMAND_STORAGE_KEY = LEGACY_ORION_PENDING_COMMAND_STORAGE_KEY;
export const listOrionCommands = listPlatformCommands;
export const searchOrionCommands = searchPlatformCommands;
