'use client';

import type { WorkspaceAgentInstallRecord } from '@/lib/api';

export type AgentForgeArchetype = 'support_specialist' | 'task_automator' | 'intelligence_researcher';
export type AgentManifestArchetype = AgentForgeArchetype | 'master_os';

export type AgentBoundSkillId =
  | 'email-access'
  | 'web-search'
  | 'calendar-access'
  | 'task-runner'
  | 'inventory-tool'
  | 'crm-notes';

export type AgentSkillDefinition = {
  id: AgentBoundSkillId;
  label: string;
  description: string;
  permissionLabel: string;
  executionMode: 'live' | 'preview' | 'manual';
  triggerTerms: string[];
  recommendedFor: AgentForgeArchetype[];
};

export type AgentManifestSkillBinding = {
  id: AgentBoundSkillId;
  enabled: boolean;
};

export type AgentManifestChannelBindings = {
  web_chat: boolean;
  email: boolean;
  phone: boolean;
  whatsapp: boolean;
  telegram: boolean;
};

export type AgentRuntimeMode = 'hosted_secure' | 'local_secure' | 'privileged_device';

export type AgentChannelBindingKey = keyof AgentManifestChannelBindings;

export type AgentChannelBindingRecord = {
  enabled: boolean;
  is_inbound_owner: boolean;
  endpoint_key: string;
};

export type AgentManifestBible = {
  mission: string;
  hard_context: string;
  operational_policy: string;
  core_responsibilities: string;
  guardrails: string;
  escalation_triggers: string;
};

export type AgentManifestRoleProfile = {
  job_to_be_done: string;
  success_definition: string;
  escalation_owner: string;
};

export type AgentManifestVoiceProfile = {
  tone: string;
  response_style: string;
  service_boundaries: string;
};

export type AgentManifestConnectors = {
  requested: string[];
  bound: string[];
};

export type AgentManifestRuntime = {
  mode: AgentRuntimeMode;
  profile_id?: string;
};

export type AgentManifest = {
  version: 'empyralis.agent-manifest.v1';
  manifest_id: string;
  engine: 'universal_operator';
  scope: 'global_master' | 'specialist';
  identity: {
    name: string;
    role: string;
    archetype: AgentManifestArchetype;
    summary: string;
    owner_mode_enabled: boolean;
    customer_mode_enabled: boolean;
  };
  role: AgentManifestRoleProfile;
  voice: AgentManifestVoiceProfile;
  bible: AgentManifestBible;
  skills: AgentManifestSkillBinding[];
  connectors: AgentManifestConnectors;
  channels: AgentManifestChannelBindings;
  runtime: AgentManifestRuntime;
  policy: {
    reflection_enabled: boolean;
    approval_mode: 'system' | 'guarded' | 'strict';
  };
  blueprint: {
    source: 'system' | 'forge' | 'imported_blueprint';
    id?: string;
    title?: string;
  };
};

const BIBLE_HEADINGS = [
  'Mission',
  'Hard Context',
  'Operational Policy',
  'Core Responsibilities',
  'Guardrails',
  'Escalation Triggers',
] as const;

type BibleHeading = typeof BIBLE_HEADINGS[number];

export type AgentBibleSections = Record<Lowercase<BibleHeading>, string>;

export const AGENT_SKILL_LIBRARY: AgentSkillDefinition[] = [
  {
    id: 'email-access',
    label: 'Email Access',
    description: 'Read, draft, and route customer emails without exposing the full inbox as raw context.',
    permissionLabel: 'Inbox scope',
    executionMode: 'manual',
    triggerTerms: ['email', 'inbox', 'reply', 'respond by email'],
    recommendedFor: ['support_specialist'],
  },
  {
    id: 'web-search',
    label: 'Web Search',
    description: 'Research public facts and fetch live references only when the Bible or owner policy allows it.',
    permissionLabel: 'Public web',
    executionMode: 'preview',
    triggerTerms: ['latest', 'research', 'search', 'find online', 'web', 'source', 'look up', 'compare'],
    recommendedFor: ['intelligence_researcher', 'support_specialist'],
  },
  {
    id: 'calendar-access',
    label: 'Calendar Access',
    description: 'Create, move, or confirm appointments with explicit owner-safe scheduling rules.',
    permissionLabel: 'Calendar scope',
    executionMode: 'manual',
    triggerTerms: ['appointment', 'book', 'schedule', 'calendar', 'reschedule'],
    recommendedFor: ['support_specialist'],
  },
  {
    id: 'task-runner',
    label: 'Task Runner',
    description: 'Chain operational tools behind approvals so the agent can actually finish the work it plans.',
    permissionLabel: 'Operational tools',
    executionMode: 'manual',
    triggerTerms: ['run task', 'execute', 'automation', 'update system'],
    recommendedFor: ['task_automator'],
  },
  {
    id: 'inventory-tool',
    label: 'Inventory Tool',
    description: 'Check stock, confirm availability, and stage inventory actions without exposing raw tables to customers.',
    permissionLabel: 'Inventory scope',
    executionMode: 'live',
    triggerTerms: ['inventory', 'stock', 'availability', 'fitment', 'sku', 'part', 'parts', 'wiper', 'brake', 'rotor', 'filter', 'tesla', 'toyota', 'model 3', 'delivery', 'eta'],
    recommendedFor: ['task_automator', 'support_specialist'],
  },
  {
    id: 'crm-notes',
    label: 'CRM Notes',
    description: 'Write structured conversation notes, lead updates, and escalation summaries back into the system of record.',
    permissionLabel: 'CRM writeback',
    executionMode: 'manual',
    triggerTerms: ['crm', 'lead note', 'follow up note', 'save note'],
    recommendedFor: ['support_specialist', 'intelligence_researcher'],
  },
];

const DEFAULT_SKILLS_BY_ARCHETYPE: Record<AgentForgeArchetype, AgentBoundSkillId[]> = {
  support_specialist: ['email-access', 'inventory-tool'],
  task_automator: ['task-runner', 'inventory-tool'],
  intelligence_researcher: ['web-search', 'crm-notes'],
};

const DEFAULT_CHANNELS: AgentManifestChannelBindings = {
  web_chat: true,
  email: false,
  phone: false,
  whatsapp: false,
  telegram: false,
};

const CONNECTOR_SUGGESTIONS_BY_SKILL: Record<AgentBoundSkillId, string[]> = {
  'email-access': ['email'],
  'web-search': ['web'],
  'calendar-access': ['calendar'],
  'task-runner': ['automation'],
  'inventory-tool': ['inventory'],
  'crm-notes': ['crm'],
};

export const AGENT_CHANNEL_KEYS: AgentChannelBindingKey[] = [
  'web_chat',
  'email',
  'phone',
  'whatsapp',
  'telegram',
];

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

function defaultToneForArchetype(archetype: AgentManifestArchetype): string {
  if (archetype === 'task_automator') return 'Direct, structured, and action-oriented.';
  if (archetype === 'intelligence_researcher') return 'Analytical, evidence-based, and calm.';
  if (archetype === 'master_os') return 'Clear, supervisory, and orchestrated.';
  return 'Warm, concise, and reassuring.';
}

function defaultResponseStyleForArchetype(archetype: AgentManifestArchetype): string {
  if (archetype === 'task_automator') return 'Use short operational steps, confirm constraints, and make next actions explicit.';
  if (archetype === 'intelligence_researcher') return 'Lead with the answer, then cite the reasoning and open questions.';
  if (archetype === 'master_os') return 'Summarize, route, and surface approvals without leaking internal complexity.';
  return 'Answer like a polished service specialist with clear next steps and clean customer language.';
}

function connectorSuggestionsForSkills(skillIds: AgentBoundSkillId[]): string[] {
  return uniqueStrings(skillIds.flatMap((skillId) => CONNECTOR_SUGGESTIONS_BY_SKILL[skillId] || []));
}

function defaultRoleProfile(input: {
  name: string;
  prompt: string;
  archetype: AgentManifestArchetype;
}): AgentManifestRoleProfile {
  return {
    job_to_be_done: input.prompt.trim() || `${input.name} should handle its assigned specialist work.`,
    success_definition: input.archetype === 'intelligence_researcher'
      ? 'Deliver reliable findings, highlight uncertainty, and recommend the next decision.'
      : input.archetype === 'task_automator'
        ? 'Complete the task safely, keep the audit trail legible, and escalate irreversible actions.'
        : 'Resolve the customer request quickly, safely, and without inventing live business facts.',
    escalation_owner: 'Workspace owner',
  };
}

function defaultVoiceProfile(input: {
  archetype: AgentManifestArchetype;
  behaviorPrompt?: string;
}): AgentManifestVoiceProfile {
  return {
    tone: input.behaviorPrompt?.trim() || defaultToneForArchetype(input.archetype),
    response_style: defaultResponseStyleForArchetype(input.archetype),
    service_boundaries: 'Never promise inventory, scheduling, pricing, or approvals without the correct bound skill or owner confirmation.',
  };
}

export function getRuntimeMode(install: WorkspaceAgentInstallRecord): AgentRuntimeMode {
  const runtimeBinding = install.metadata?.['runtime_binding'] as { runtime_mode?: string } | undefined;
  const token = String(install.runtime_mode || runtimeBinding?.runtime_mode || '').trim().toLowerCase();
  if (token === 'local_secure' || token === 'privileged_device') return token;
  return 'hosted_secure';
}

export function runtimeModeLabel(mode: AgentRuntimeMode): string {
  if (mode === 'local_secure') return 'Local Secure';
  if (mode === 'privileged_device') return 'Privileged Device';
  return 'Hosted Secure';
}

export const SAGE_GLOBAL_MANIFEST: AgentManifest = {
  version: 'empyralis.agent-manifest.v1',
  manifest_id: 'sage-global-manifest',
  engine: 'universal_operator',
  scope: 'global_master',
  identity: {
    name: 'Sage',
    role: 'Master Operating System',
    archetype: 'master_os',
    summary: 'Global orchestrator with cross-workspace context, operator supervision, and broad skill access.',
    owner_mode_enabled: false,
    customer_mode_enabled: false,
  },
  role: {
    job_to_be_done: 'Act as the master operator across planning, delegation, approvals, and system-wide supervision.',
    success_definition: 'Keep the workspace legible, route work well, and surface approvals at the right moment.',
    escalation_owner: 'Workspace owner',
  },
  voice: {
    tone: 'Calm, supervisory, and precise.',
    response_style: 'Lead with the answer, then show the next action or escalation path.',
    service_boundaries: 'Never hide policy tradeoffs or approval boundaries from the operator.',
  },
  bible: {
    mission: 'Operate as the master relationship for planning, delegation, approvals, execution, and system-wide awareness.',
    hard_context: 'Sage has cross-system context and is the only visible omniscient operator surface.',
    operational_policy: 'Route work to the correct specialist when needed, surface approvals clearly, and keep the operator in control.',
    core_responsibilities: 'Coordinate agents, supervise runs, summarize the system, and keep work legible.',
    guardrails: 'Do not bypass approvals for sensitive actions. Do not expose specialist internals unless needed.',
    escalation_triggers: 'policy conflicts\nuncertain destructive actions\ncross-tenant boundary concerns',
  },
  skills: AGENT_SKILL_LIBRARY.map((skill) => ({ id: skill.id, enabled: true })),
  connectors: {
    requested: ['email', 'web', 'calendar', 'inventory', 'crm', 'automation'],
    bound: [],
  },
  channels: { ...DEFAULT_CHANNELS },
  runtime: {
    mode: 'hosted_secure',
  },
  policy: {
    reflection_enabled: true,
    approval_mode: 'system',
  },
  blueprint: {
    source: 'system',
    title: 'Sage Master OS',
  },
};

function coerceRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function metadataRecord(install: WorkspaceAgentInstallRecord): Record<string, unknown> {
  return coerceRecord(install.metadata);
}

function normalizeLabel(install: WorkspaceAgentInstallRecord): string {
  return String(install.label || install.agent_definition?.name || 'Agent').trim() || 'Agent';
}

function safeManifestId(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
}

function canonicalSkillIds(input: unknown): AgentBoundSkillId[] {
  const items = Array.isArray(input) ? input : [];
  const seen = new Set<AgentBoundSkillId>();
  const out: AgentBoundSkillId[] = [];
  for (const item of items) {
    const normalized = String(item || '').trim() as AgentBoundSkillId;
    if (!normalized || seen.has(normalized) || !AGENT_SKILL_LIBRARY.some((skill) => skill.id === normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function parseManifestChannels(value: unknown): AgentManifestChannelBindings {
  const source = coerceRecord(value);
  return {
    web_chat: source.web_chat !== false,
    email: Boolean(source.email),
    phone: Boolean(source.phone),
    whatsapp: Boolean(source.whatsapp),
    telegram: Boolean(source.telegram),
  };
}

function parseChannelRegistryBinding(
  channelKey: AgentChannelBindingKey,
  value: unknown,
  fallbackEnabled: boolean,
): AgentChannelBindingRecord {
  if (typeof value === 'boolean') {
    return {
      enabled: value,
      is_inbound_owner: false,
      endpoint_key: '',
    };
  }
  const source = coerceRecord(value);
  return {
    enabled: source.enabled == null ? fallbackEnabled : Boolean(source.enabled),
    is_inbound_owner: Boolean(source.is_inbound_owner),
    endpoint_key: String(source.endpoint_key || '').trim(),
  };
}

function defaultBibleSections(
  name: string,
  prompt: string,
  archetype: AgentManifestArchetype,
  input?: {
    behaviorPrompt?: string;
    knowledgePrompt?: string;
  },
): AgentBibleSections {
  const runtimeLabel = archetype === 'support_specialist'
    ? 'Support inbox + phone lane'
    : archetype === 'task_automator'
      ? 'Workflow lane + runtime tools'
      : archetype === 'intelligence_researcher'
        ? 'Web research + report lane'
        : 'Global operator shell';

  return {
    mission: `${name} exists to ${prompt.trim() || `help with ${name}`}.`,
    'hard context': [
      `- Archetype: ${String(archetype).replace(/_/g, ' ')}`,
      `- Primary lane: ${runtimeLabel}`,
      '- This agent works inside a supervised customer-facing channel.',
      '- It must keep business facts, availability, and commitments anchored to approved sources and bound skills.',
      input?.knowledgePrompt?.trim()
        ? `- Owner context: ${input.knowledgePrompt.trim()}`
        : '- Owner context will be refined in the Bible and knowledge layer.',
    ].filter(Boolean).join('\n'),
    'operational policy': [
      '- Be concise and specific.',
      '- Use bound skills when the request requires live business facts.',
      '- Never invent inventory, appointments, pricing, or commitments.',
      '- Ask for clarification before irreversible actions.',
      '- Escalate uncertain money, privacy, or reputation issues to the owner lane.',
      input?.behaviorPrompt?.trim()
        ? `- Response behavior: ${input.behaviorPrompt.trim()}`
        : '',
    ].filter(Boolean).join('\n'),
    'core responsibilities': [
      '- Handle the first response fast and clearly.',
      '- Gather only the context needed to complete the job.',
      '- Convert messy requests into explicit next actions.',
      '- Hand sensitive decisions back to the owner with a short explanation.',
    ].join('\n'),
    guardrails: [
      '- Never claim a part fits unless the fitment source is checked.',
      '- Never claim stock without using the bound source of truth.',
      '- Keep a clean audit trail of what was asked, what was answered, and what needs approval.',
    ].join('\n'),
    'escalation triggers': [
      '- payment changes',
      '- refunds or discounts',
      '- legal or compliance edge cases',
      '- low-confidence answers',
    ].join('\n'),
  };
}

function buildManifestFromSections(input: {
  manifestId: string;
  name: string;
  summary: string;
  role: string;
  archetype: AgentManifestArchetype;
  scope: AgentManifest['scope'];
  skills: AgentBoundSkillId[];
  channels?: Partial<AgentManifestChannelBindings>;
  sections: AgentBibleSections;
  blueprintSource?: AgentManifest['blueprint']['source'];
  blueprintId?: string;
  blueprintTitle?: string;
  roleProfile?: AgentManifestRoleProfile;
  voiceProfile?: AgentManifestVoiceProfile;
  connectors?: AgentManifestConnectors;
  runtime?: AgentManifestRuntime;
}): AgentManifest {
  const enabledSkillIds = canonicalSkillIds(input.skills);
  return {
    version: 'empyralis.agent-manifest.v1',
    manifest_id: input.manifestId,
    engine: 'universal_operator',
    scope: input.scope,
    identity: {
      name: input.name,
      role: input.role,
      archetype: input.archetype,
      summary: input.summary,
      owner_mode_enabled: input.scope !== 'global_master',
      customer_mode_enabled: input.scope !== 'global_master',
    },
    role: input.roleProfile || defaultRoleProfile({
      name: input.name,
      prompt: input.summary,
      archetype: input.archetype,
    }),
    voice: input.voiceProfile || defaultVoiceProfile({ archetype: input.archetype }),
    bible: {
      mission: input.sections.mission,
      hard_context: input.sections['hard context'],
      operational_policy: input.sections['operational policy'],
      core_responsibilities: input.sections['core responsibilities'],
      guardrails: input.sections.guardrails,
      escalation_triggers: input.sections['escalation triggers'],
    },
    skills: enabledSkillIds.map((skillId) => ({ id: skillId, enabled: true })),
    connectors: input.connectors || {
      requested: connectorSuggestionsForSkills(enabledSkillIds),
      bound: [],
    },
    channels: {
      ...DEFAULT_CHANNELS,
      ...(input.channels || {}),
    },
    runtime: input.runtime || {
      mode: 'hosted_secure',
    },
    policy: {
      reflection_enabled: true,
      approval_mode: input.scope === 'global_master' ? 'system' : 'guarded',
    },
    blueprint: {
      source: input.blueprintSource || 'forge',
      id: input.blueprintId,
      title: input.blueprintTitle,
    },
  };
}

export function parseBibleSections(bible: string): AgentBibleSections {
  const lines = String(bible || '').replace(/\r\n/g, '\n').split('\n');
  const sections = {
    mission: '',
    'hard context': '',
    'operational policy': '',
    'core responsibilities': '',
    guardrails: '',
    'escalation triggers': '',
  } as AgentBibleSections;
  let current: keyof AgentBibleSections | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (BIBLE_HEADINGS.some((heading) => heading.toLowerCase() === line.toLowerCase())) {
      current = line.toLowerCase() as keyof AgentBibleSections;
      continue;
    }
    if (!current) continue;
    sections[current] = `${sections[current]}${sections[current] ? '\n' : ''}${rawLine}`.trimEnd();
  }

  return sections;
}

export function renderManifestBible(manifest: AgentManifest): string {
  return [
    'Mission',
    manifest.bible.mission,
    '',
    'Hard Context',
    manifest.bible.hard_context,
    '',
    'Operational Policy',
    manifest.bible.operational_policy,
    '',
    'Core Responsibilities',
    manifest.bible.core_responsibilities,
    '',
    'Guardrails',
    manifest.bible.guardrails,
    '',
    'Escalation Triggers',
    manifest.bible.escalation_triggers,
  ].join('\n');
}

export function defaultSkillBindingsForArchetype(archetype: AgentForgeArchetype): AgentBoundSkillId[] {
  return [...DEFAULT_SKILLS_BY_ARCHETYPE[archetype]];
}

export function createDraftManifest(input: {
  name: string;
  prompt: string;
  archetype: AgentForgeArchetype;
  behaviorPrompt?: string;
  knowledgePrompt?: string;
  blueprintId?: string;
  blueprintTitle?: string;
}): AgentManifest {
  const name = input.name.trim() || 'Untitled Agent';
  const prompt = input.prompt.trim() || `help with ${name}`;
  const sections = defaultBibleSections(name, prompt, input.archetype, {
    behaviorPrompt: input.behaviorPrompt,
    knowledgePrompt: input.knowledgePrompt,
  });
  const enabledSkills = defaultSkillBindingsForArchetype(input.archetype);
  return buildManifestFromSections({
    manifestId: `manifest-${safeManifestId(name)}`,
    name,
    summary: prompt,
    role: name,
    archetype: input.archetype,
    scope: 'specialist',
    skills: enabledSkills,
    sections,
    roleProfile: defaultRoleProfile({
      name,
      prompt,
      archetype: input.archetype,
    }),
    voiceProfile: defaultVoiceProfile({
      archetype: input.archetype,
      behaviorPrompt: input.behaviorPrompt,
    }),
    connectors: {
      requested: connectorSuggestionsForSkills(enabledSkills),
      bound: [],
    },
    runtime: {
      mode: 'hosted_secure',
    },
    blueprintSource: input.blueprintId ? 'imported_blueprint' : 'forge',
    blueprintId: input.blueprintId,
    blueprintTitle: input.blueprintTitle,
  });
}

export function createDraftManifestFromBlueprint(rawBlueprint: string, fallbackName?: string): AgentManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBlueprint);
  } catch {
    throw new Error('Blueprint JSON is invalid.');
  }
  const source = coerceRecord(parsed);
  const identity = coerceRecord(source.identity);
  const roleProfile = coerceRecord(source.role);
  const voice = coerceRecord(source.voice);
  const bible = coerceRecord(source.bible);
  const connectors = coerceRecord(source.connectors);
  const runtime = coerceRecord(source.runtime);
  const channels = parseManifestChannels(source.channels);
  const skillIds = canonicalSkillIds(
    Array.isArray(source.skills)
      ? source.skills.map((item) => (typeof item === 'string' ? item : coerceRecord(item).id))
      : [],
  );
  const archetypeValue = String(identity.archetype || '').trim();
  const archetype: AgentForgeArchetype =
    archetypeValue === 'task_automator' || archetypeValue === 'intelligence_researcher'
      ? archetypeValue
      : 'support_specialist';
  const name = String(identity.name || fallbackName || 'Imported Agent').trim() || 'Imported Agent';
  const summary = String(identity.summary || '').trim() || `Imported from blueprint: ${name}`;
  const manifestId = String(source.manifest_id || '').trim() || `manifest-${safeManifestId(name)}`;
  const sections = {
    mission: String(bible.mission || '').trim() || `${name} exists to ${summary}.`,
    'hard context': String(bible.hard_context || '').trim() || '- Imported blueprint requires owner review before live deployment.',
    'operational policy': String(bible.operational_policy || '').trim() || '- Review imported policies before using live tools.',
    'core responsibilities': String(bible.core_responsibilities || '').trim() || '- Review imported responsibilities.',
    guardrails: String(bible.guardrails || '').trim() || '- Keep imported blueprints in Owner Mode until verified.',
    'escalation triggers': String(bible.escalation_triggers || '').trim() || '- owner review required after import',
  } as AgentBibleSections;

  return buildManifestFromSections({
    manifestId,
    name,
    summary,
    role: String(identity.role || name).trim() || name,
    archetype,
    scope: 'specialist',
    skills: skillIds.length > 0 ? skillIds : defaultSkillBindingsForArchetype(archetype),
    channels,
    sections,
    roleProfile: {
      job_to_be_done: String(roleProfile.job_to_be_done || summary).trim() || summary,
      success_definition: String(roleProfile.success_definition || 'Imported blueprint requires owner verification before live deployment.').trim(),
      escalation_owner: String(roleProfile.escalation_owner || 'Workspace owner').trim() || 'Workspace owner',
    },
    voiceProfile: {
      tone: String(voice.tone || defaultToneForArchetype(archetype)).trim() || defaultToneForArchetype(archetype),
      response_style: String(voice.response_style || defaultResponseStyleForArchetype(archetype)).trim() || defaultResponseStyleForArchetype(archetype),
      service_boundaries: String(voice.service_boundaries || 'Keep imported specialists in Owner Mode until the owner approves the live behavior.').trim(),
    },
    connectors: {
      requested: uniqueStrings(Array.isArray(connectors.requested) ? connectors.requested : []),
      bound: uniqueStrings(Array.isArray(connectors.bound) ? connectors.bound : []),
    },
    runtime: {
      mode: runtime.mode === 'local_secure' || runtime.mode === 'privileged_device' ? runtime.mode : 'hosted_secure',
      profile_id: String(runtime.profile_id || '').trim() || undefined,
    },
    blueprintSource: 'imported_blueprint',
    blueprintId: String(source.manifest_id || '').trim() || undefined,
    blueprintTitle: String(source.blueprint_title || name).trim() || name,
  });
}

export function metadataFromManifest(
  manifest: AgentManifest,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extras,
    agent_manifest: manifest,
    draft_bible: renderManifestBible(manifest),
    bound_skills: manifest.skills.filter((skill) => skill.enabled).map((skill) => skill.id),
    draft_archetype: manifest.identity.archetype === 'master_os' ? undefined : manifest.identity.archetype,
    manifest_id: manifest.manifest_id,
    manifest_engine: manifest.engine,
  };
}

function buildManifestFromLegacyInstall(install: WorkspaceAgentInstallRecord): AgentManifest {
  const metadata = metadataRecord(install);
  const name = normalizeLabel(install);
  const prompt = String(metadata.draft_prompt || install.agent_definition?.description || `help with ${name}`).trim();
  const rawArchetype = String(metadata.draft_archetype || '').trim();
  const archetype: AgentForgeArchetype =
    rawArchetype === 'task_automator' || rawArchetype === 'intelligence_researcher'
      ? rawArchetype
      : 'support_specialist';
  const bibleText = String(metadata.draft_bible || generateDraftBible({ name, prompt, archetype })).trim();
  const sections = parseBibleSections(bibleText);
  const channels = parseManifestChannels(metadata.channel_bindings);
  const skills = canonicalSkillIds(metadata.bound_skills);
  const enabledSkills = skills.length > 0 ? skills : defaultSkillBindingsForArchetype(archetype);
  const runtimeBinding = metadata.runtime_binding as { runtime_profile_id?: string } | undefined;
  const connectorsMetadata = metadata.connectors as { bound?: unknown[] } | undefined;
  const runtimeProfileId = String(install.runtime_profile_id || runtimeBinding?.runtime_profile_id || '').trim() || undefined;

  return buildManifestFromSections({
    manifestId: String(metadata.manifest_id || `manifest-${safeManifestId(name)}`).trim(),
    name,
    summary: prompt,
    role: String(install.agent_definition?.name || name).trim() || name,
    archetype,
    scope: name.toLowerCase() === 'sage' ? 'global_master' : 'specialist',
    skills: enabledSkills,
    channels,
    sections: {
      mission: sections.mission || `${name} exists to ${prompt}.`,
      'hard context': sections['hard context'] || '- This agent follows the owner-authored hard context.',
      'operational policy': sections['operational policy'] || '- Follow owner guardrails and ask clarifying questions when needed.',
      'core responsibilities': sections['core responsibilities'] || '- Handle customer requests in a safe supervised lane.',
      guardrails: sections.guardrails || '- Never invent live business facts.',
      'escalation triggers': sections['escalation triggers'] || '- low confidence',
    },
    connectors: {
      requested: connectorSuggestionsForSkills(enabledSkills),
      bound: uniqueStrings(Array.isArray(connectorsMetadata?.bound) ? connectorsMetadata.bound : []),
    },
    runtime: {
      mode: getRuntimeMode(install),
      profile_id: runtimeProfileId,
    },
    blueprintSource: 'forge',
  });
}

function normalizeManifest(raw: unknown, fallbackInstall?: WorkspaceAgentInstallRecord): AgentManifest | null {
  const source = coerceRecord(raw);
  const identity = coerceRecord(source.identity);
  const roleProfile = coerceRecord(source.role);
  const voice = coerceRecord(source.voice);
  const bible = coerceRecord(source.bible);
  const connectors = coerceRecord(source.connectors);
  const runtime = coerceRecord(source.runtime);
  const policy = coerceRecord(source.policy);
  const blueprint = coerceRecord(source.blueprint);
  const skillIds = canonicalSkillIds(
    Array.isArray(source.skills)
      ? source.skills.map((item) => (typeof item === 'string' ? item : coerceRecord(item).id))
      : [],
  );
  const name = String(identity.name || fallbackInstall?.label || fallbackInstall?.agent_definition?.name || '').trim();
  if (!name) return null;

  const fallback = fallbackInstall ? buildManifestFromLegacyInstall(fallbackInstall) : createDraftManifest({
    name,
    prompt: String(identity.summary || '').trim() || `help with ${name}`,
    archetype: 'support_specialist',
  });

  return {
    version: 'empyralis.agent-manifest.v1',
    manifest_id: String(source.manifest_id || fallback.manifest_id).trim() || fallback.manifest_id,
    engine: 'universal_operator',
    scope: source.scope === 'global_master' ? 'global_master' : fallback.scope,
    identity: {
      name,
      role: String(identity.role || fallback.identity.role).trim() || fallback.identity.role,
      archetype: identity.archetype === 'task_automator'
        || identity.archetype === 'intelligence_researcher'
        || identity.archetype === 'support_specialist'
        || identity.archetype === 'master_os'
          ? identity.archetype
          : fallback.identity.archetype,
      summary: String(identity.summary || fallback.identity.summary).trim() || fallback.identity.summary,
      owner_mode_enabled: identity.owner_mode_enabled !== false,
      customer_mode_enabled: identity.customer_mode_enabled !== false,
    },
    role: {
      job_to_be_done: String(roleProfile.job_to_be_done || fallback.role.job_to_be_done).trim() || fallback.role.job_to_be_done,
      success_definition: String(roleProfile.success_definition || fallback.role.success_definition).trim() || fallback.role.success_definition,
      escalation_owner: String(roleProfile.escalation_owner || fallback.role.escalation_owner).trim() || fallback.role.escalation_owner,
    },
    voice: {
      tone: String(voice.tone || fallback.voice.tone).trim() || fallback.voice.tone,
      response_style: String(voice.response_style || fallback.voice.response_style).trim() || fallback.voice.response_style,
      service_boundaries: String(voice.service_boundaries || fallback.voice.service_boundaries).trim() || fallback.voice.service_boundaries,
    },
    bible: {
      mission: String(bible.mission || fallback.bible.mission).trim(),
      hard_context: String(bible.hard_context || fallback.bible.hard_context).trim(),
      operational_policy: String(bible.operational_policy || fallback.bible.operational_policy).trim(),
      core_responsibilities: String(bible.core_responsibilities || fallback.bible.core_responsibilities).trim(),
      guardrails: String(bible.guardrails || fallback.bible.guardrails).trim(),
      escalation_triggers: String(bible.escalation_triggers || fallback.bible.escalation_triggers).trim(),
    },
    skills: (skillIds.length > 0 ? skillIds : fallback.skills.filter((skill) => skill.enabled).map((skill) => skill.id))
      .map((skillId) => ({ id: skillId, enabled: true })),
    connectors: {
      requested: uniqueStrings(
        Array.isArray(connectors.requested)
          ? connectors.requested
          : fallback.connectors.requested,
      ),
      bound: uniqueStrings(
        Array.isArray(connectors.bound)
          ? connectors.bound
          : fallback.connectors.bound,
      ),
    },
    channels: parseManifestChannels(source.channels || fallback.channels),
    runtime: {
      mode: runtime.mode === 'local_secure' || runtime.mode === 'privileged_device'
        ? runtime.mode
        : fallback.runtime.mode,
      profile_id: String(runtime.profile_id || fallback.runtime.profile_id || '').trim() || undefined,
    },
    policy: {
      reflection_enabled: policy.reflection_enabled !== false,
      approval_mode: policy.approval_mode === 'strict' || policy.approval_mode === 'system'
        ? policy.approval_mode
        : fallback.policy.approval_mode,
    },
    blueprint: {
      source: blueprint.source === 'system' || blueprint.source === 'imported_blueprint' ? blueprint.source : fallback.blueprint.source,
      id: String(blueprint.id || fallback.blueprint.id || '').trim() || undefined,
      title: String(blueprint.title || fallback.blueprint.title || '').trim() || undefined,
    },
  };
}

export function getAgentManifest(install: WorkspaceAgentInstallRecord): AgentManifest {
  const normalized = normalizeManifest(metadataRecord(install).agent_manifest, install);
  return normalized || buildManifestFromLegacyInstall(install);
}

export function getChannelRegistryBindings(
  install: WorkspaceAgentInstallRecord,
): Record<AgentChannelBindingKey, AgentChannelBindingRecord> {
  const metadata = metadataRecord(install);
  const manifest = getAgentManifest(install);
  const rawBindings = coerceRecord(metadata.channel_registry_bindings);
  return {
    web_chat: parseChannelRegistryBinding('web_chat', rawBindings.web_chat, manifest.channels.web_chat),
    email: parseChannelRegistryBinding('email', rawBindings.email, manifest.channels.email),
    phone: parseChannelRegistryBinding('phone', rawBindings.phone, manifest.channels.phone),
    whatsapp: parseChannelRegistryBinding('whatsapp', rawBindings.whatsapp, manifest.channels.whatsapp),
    telegram: parseChannelRegistryBinding('telegram', rawBindings.telegram, manifest.channels.telegram),
  };
}

export function getEnabledSkillBindings(manifest: AgentManifest): AgentBoundSkillId[] {
  return manifest.skills.filter((skill) => skill.enabled).map((skill) => skill.id);
}

export function updateManifestBible(manifest: AgentManifest, bibleText: string): AgentManifest {
  const sections = parseBibleSections(bibleText);
  return {
    ...manifest,
    bible: {
      mission: sections.mission || manifest.bible.mission,
      hard_context: sections['hard context'] || manifest.bible.hard_context,
      operational_policy: sections['operational policy'] || manifest.bible.operational_policy,
      core_responsibilities: sections['core responsibilities'] || manifest.bible.core_responsibilities,
      guardrails: sections.guardrails || manifest.bible.guardrails,
      escalation_triggers: sections['escalation triggers'] || manifest.bible.escalation_triggers,
    },
  };
}

export function updateManifestSkills(manifest: AgentManifest, skillIds: AgentBoundSkillId[]): AgentManifest {
  return {
    ...manifest,
    skills: canonicalSkillIds(skillIds).map((skillId) => ({ id: skillId, enabled: true })),
  };
}

export function updateManifestIdentity(manifest: AgentManifest, patch: Partial<AgentManifest['identity']>): AgentManifest {
  return {
    ...manifest,
    identity: {
      ...manifest.identity,
      ...patch,
    },
  };
}

export function getBoundSkills(install: WorkspaceAgentInstallRecord): AgentBoundSkillId[] {
  return getEnabledSkillBindings(getAgentManifest(install));
}

export function getDraftBible(install: WorkspaceAgentInstallRecord): string {
  return renderManifestBible(getAgentManifest(install));
}

export function getDraftPrompt(install: WorkspaceAgentInstallRecord): string {
  const manifest = getAgentManifest(install);
  return manifest.identity.summary;
}

export function getDraftArchetype(install: WorkspaceAgentInstallRecord): AgentForgeArchetype | null {
  const archetype = getAgentManifest(install).identity.archetype;
  return archetype === 'support_specialist' || archetype === 'task_automator' || archetype === 'intelligence_researcher'
    ? archetype
    : null;
}

export function buildCustomerModeSystemPrompt(install: WorkspaceAgentInstallRecord): string {
  const manifest = getAgentManifest(install);
  const boundSkills = getEnabledSkillBindings(manifest)
    .map((skillId) => AGENT_SKILL_LIBRARY.find((skill) => skill.id === skillId)?.label || skillId);

  return [
    `You are ${manifest.identity.name}.`,
    '',
    'Job To Be Done',
    manifest.role.job_to_be_done,
    '',
    'Voice',
    `${manifest.voice.tone} ${manifest.voice.response_style}`.trim(),
    '',
    'Mission',
    manifest.bible.mission,
    '',
    'Hard Context',
    manifest.bible.hard_context,
    '',
    'Operational Policy',
    manifest.bible.operational_policy,
    '',
    'Bound Skills',
    ...(boundSkills.length > 0 ? boundSkills.map((skill) => `- ${skill}`) : ['- No skills are currently bound.']),
  ].join('\n');
}

export function generateDraftBible(input: {
  name: string;
  prompt: string;
  archetype: AgentForgeArchetype;
}): string {
  return renderManifestBible(createDraftManifest(input));
}

export function inferSkillNeed(goal: string): AgentBoundSkillId | null {
  const normalized = String(goal || '').trim().toLowerCase();
  if (!normalized) return null;

  for (const skill of AGENT_SKILL_LIBRARY) {
    if (skill.triggerTerms.some((term) => normalized.includes(term.toLowerCase()))) {
      return skill.id;
    }
  }
  return null;
}

export function buildSkillSimulationArtifact(input: {
  install: WorkspaceAgentInstallRecord;
  goal: string;
  skillId: AgentBoundSkillId;
}): Record<string, unknown> {
  const skill = AGENT_SKILL_LIBRARY.find((entry) => entry.id === input.skillId);
  const manifest = getAgentManifest(input.install);
  const summary = input.skillId === 'inventory-tool'
    ? 'Would check fitment, stock position, and delivery estimate before replying.'
    : 'Would run a live public web retrieval before replying.';

  const preview = [
    `# ${skill?.label || 'Skill'} simulation`,
    '',
    `- Agent: ${manifest.identity.name}`,
    `- Customer request: ${input.goal.trim()}`,
    `- Hard Context: ${manifest.bible.hard_context.split('\n')[0] || 'No hard context saved yet.'}`,
    `- Operational Policy: ${manifest.bible.operational_policy.split('\n')[0] || 'No operational policy saved yet.'}`,
    '',
    `## Planned execution`,
    summary,
  ].join('\n');

  return {
    label: `${skill?.label || 'Skill'} preview`,
    kind: 'skill-simulation',
    summary,
    media_type: 'text/markdown',
    preview_content: preview,
  };
}
