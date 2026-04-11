const LIGHTWEIGHT_DIRECT_CHAT_PREFIXES = [
  'what ',
  "what's ",
  'whats ',
  'why ',
  'how ',
  'who ',
  'when ',
  'where ',
  'which ',
  'is ',
  'are ',
  'can ',
  'could ',
  'would ',
  'will ',
  'should ',
  'do ',
  'does ',
  'did ',
  'tell me ',
  'explain ',
];

const SERIOUS_TASK_MARKERS = [
  'research',
  'draft',
  'prepare',
  'create',
  'generate',
  'build',
  'write',
  'review',
  'summarize',
  'summarise',
  'analyze',
  'analyse',
  'investigate',
  'inspect',
  'check',
  'organize',
  'compile',
  'open',
  'run',
  'send',
];

const SERIOUS_SEQUENCE_MARKERS = [' and ', ' then ', ' after ', ' before '];
const SERIOUS_OUTCOME_MARKERS = [
  ' summary',
  ' report',
  ' plan',
  ' draft',
  ' checklist',
  ' artifact',
  ' file',
  ' slides',
  ' presentation',
  ' email',
  ' notes',
];

function compactTurnText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function looksLikeLightweightDirectChat(compactMessage) {
  if (!compactMessage) return true;
  if (compactMessage.endsWith('?')) return true;
  return LIGHTWEIGHT_DIRECT_CHAT_PREFIXES.some((prefix) => compactMessage.startsWith(prefix));
}

function seriousTaskMarkerCount(compactMessage) {
  if (!compactMessage) return 0;
  return SERIOUS_TASK_MARKERS.reduce((count, marker) => (
    new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(compactMessage)
      ? count + 1
      : count
  ), 0);
}

export function shouldUseDurableRunForTaskRequest(message) {
  const compactMessage = compactTurnText(message);
  if (!compactMessage || looksLikeLightweightDirectChat(compactMessage)) {
    return false;
  }
  const markerCount = seriousTaskMarkerCount(compactMessage);
  const sequenceRequested = SERIOUS_SEQUENCE_MARKERS.some((marker) => compactMessage.includes(marker));
  const outcomeRequested = SERIOUS_OUTCOME_MARKERS.some((marker) => compactMessage.includes(marker));
  if (markerCount >= 2) return true;
  return markerCount >= 1 && (sequenceRequested || outcomeRequested || compactMessage.length >= 48);
}
