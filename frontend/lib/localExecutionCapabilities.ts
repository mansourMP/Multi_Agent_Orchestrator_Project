export type LocalExecutionCapabilityId =
  | 'stack.start'
  | 'stack.status'
  | 'stack.logs'
  | 'device.sleep'
  | 'device.display_sleep'
  | 'device.lock_screen'
  | 'screenshot.capture';

type LocalExecutionCapabilityDefinition = {
  id: LocalExecutionCapabilityId;
  title: string;
};

const LOCAL_EXECUTION_CAPABILITIES: LocalExecutionCapabilityDefinition[] = [
  { id: 'stack.start', title: 'Start local stack' },
  { id: 'stack.status', title: 'Check local stack status' },
  { id: 'stack.logs', title: 'Open local stack logs' },
  { id: 'device.sleep', title: 'Sleep computer' },
  { id: 'device.display_sleep', title: 'Sleep display' },
  { id: 'device.lock_screen', title: 'Lock screen' },
  { id: 'screenshot.capture', title: 'Capture screenshot' },
];

function normalizeCommand(command: string): string {
  return String(command || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ');
}

export function getLocalExecutionCapabilityTitle(capabilityId: string | null | undefined): string {
  const clean = String(capabilityId || '').trim().toLowerCase();
  if (!clean) return '';
  return LOCAL_EXECUTION_CAPABILITIES.find((item) => item.id === clean)?.title || clean;
}

export function inferLocalExecutionCapabilityFromCommand(command: string): LocalExecutionCapabilityId | null {
  const normalized = normalizeCommand(command);
  if (!normalized) return null;
  if (
    normalized.includes('scripts/start_empyralis_local_stack.sh') ||
    normalized.includes('scripts/start_orion_local_stack.sh') ||
    normalized.includes('scripts/start_empyralis_local_stack.ps1') ||
    normalized.includes('scripts/start_orion_local_stack.ps1')
  ) {
    return 'stack.start';
  }
  if (
    normalized.includes('scripts/status_empyralis_local_stack.sh') ||
    normalized.includes('scripts/status_orion_local_stack.sh') ||
    normalized.includes('scripts/status_empyralis_local_stack.ps1') ||
    normalized.includes('scripts/status_orion_local_stack.ps1')
  ) {
    return 'stack.status';
  }
  if (
    normalized.includes('scripts/logs_empyralis_local_stack.sh') ||
    normalized.includes('scripts/logs_orion_local_stack.sh') ||
    normalized.includes('scripts/logs_empyralis_local_stack.ps1') ||
    normalized.includes('scripts/logs_orion_local_stack.ps1')
  ) {
    return 'stack.logs';
  }
  if (normalized === 'pmset sleepnow') return 'device.sleep';
  if (normalized === 'pmset displaysleepnow') return 'device.display_sleep';
  if (normalized.includes('/cgsession') && normalized.includes('-suspend')) return 'device.lock_screen';
  return null;
}
