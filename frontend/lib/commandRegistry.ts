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
    id: 'nav.home',
    title: 'Go to Home',
    description: 'Open the workspace overview and recent workflows.',
    group: 'Navigate',
    keywords: ['home', 'overview', 'recent', 'workspace'],
    action: { type: 'navigate', href: '/home' },
  },
  {
    id: 'nav.agents',
    title: SINGLE_AGENT_MODE ? 'Go to Assistant' : 'Go to Agents',
    description: SINGLE_AGENT_MODE ? 'Inspect the single assistant workspace, inbox, and live channels.' : 'Inspect workers, collaborations, and current workload.',
    group: 'Navigate',
    keywords: SINGLE_AGENT_MODE ? ['assistant', 'inbox', 'channels', 'activity'] : ['workers', 'agents', 'activity', 'collaboration'],
    action: { type: 'navigate', href: '/agents' },
  },
  {
    id: 'nav.integrations',
    title: 'Go to Integrations',
    description: 'Connect tools, channels, and accounts.',
    group: 'Navigate',
    keywords: ['connections', 'integrations', 'credentials', 'connectors', 'channels'],
    action: { type: 'navigate', href: '/credentials' },
  },
  {
    id: 'nav.setup',
    title: 'Go to Setup',
    description: 'Finish platform setup and required access.',
    group: 'Navigate',
    keywords: ['configure', 'onboarding', 'wizard', 'launch assistant'],
    action: { type: 'navigate', href: '/setup' },
  },
  {
    id: 'nav.control_center',
    title: 'Go to Admin',
    description: 'Open advanced controls, diagnostics, and history.',
    group: 'Navigate',
    keywords: ['advanced', 'diagnostics', 'setup', 'admin', 'history'],
    action: { type: 'navigate', href: '/control-center' },
  },
  {
    id: 'nav.chat',
    title: 'Go to Chat',
    description: 'Open the assistant conversation.',
    group: 'Navigate',
    keywords: ['chat', 'assistant', 'conversation'],
    action: { type: 'navigate', href: '/' },
  },
  {
    id: 'nav.builder',
    title: 'Go to Builder',
    description: 'Open the workflow builder and design a new workflow visually.',
    group: 'Navigate',
    keywords: ['builder', 'workflow', 'canvas', 'editor', 'design'],
    action: { type: 'navigate', href: '/builder' },
  },
  {
    id: 'nav.files',
    title: 'Go to Assets',
    description: 'Browse finished work, evidence, and generated files.',
    group: 'Navigate',
    keywords: ['outputs', 'files', 'artifacts', 'deliverables', 'archive'],
    action: { type: 'navigate', href: '/artifacts' },
  },
  {
    id: 'nav.runs',
    title: 'Go to Runs',
    description: 'Review run traces, statuses, and output summaries.',
    group: 'Navigate',
    keywords: ['history', 'runs', 'executions', 'activity', 'logs'],
    action: { type: 'navigate', href: '/executions' },
  },
  {
    id: 'nav.solutions',
    title: 'Go to Solutions',
    description: 'Browse packaged experiences built on the core platform.',
    group: 'Navigate',
    keywords: ['solutions', 'packages', 'apps', 'hotel vision'],
    action: { type: 'navigate', href: '/solutions' },
  },
  {
    id: 'nav.workflows',
    title: 'Go to Workflows',
    description: 'Open reusable workflows and the saved workflow library.',
    group: 'Navigate',
    keywords: ['flows', 'automation', 'builder', 'automations'],
    action: { type: 'navigate', href: '/workflows' },
  },
  {
    id: 'nav.approvals',
    title: 'Go to Approvals',
    description: 'Review and resolve pending approvals.',
    group: 'Navigate',
    keywords: ['approval', 'pending', 'review', 'risk'],
    action: { type: 'navigate', href: '/approvals' },
  },
  {
    id: 'nav.team',
    title: 'Go to Team',
    description: 'Manage people, roles, and platform access.',
    group: 'Navigate',
    keywords: ['team', 'people', 'roles', 'owner', 'admin', 'viewer', 'access'],
    action: { type: 'navigate', href: '/team' },
  },
  {
    id: 'nav.capabilities',
    title: 'Go to Capabilities',
    description: 'Manage assistant skills, capability packs, and execution policy.',
    group: 'Navigate',
    keywords: ['capabilities', 'skills', 'marketplace', 'plugins'],
    action: { type: 'navigate', href: '/skills' },
  },
  {
    id: 'nav.health',
    title: 'Go to System Health',
    description: 'Check runtime diagnostics and dependency status.',
    group: 'Navigate',
    keywords: ['doctor', 'checks', 'status'],
    action: { type: 'navigate', href: '/health' },
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
