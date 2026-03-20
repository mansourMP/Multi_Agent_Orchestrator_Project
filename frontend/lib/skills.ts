export const SKILLS_STORAGE_KEY = 'empyralis_custom_skills_v1';
export const LEGACY_SKILLS_STORAGE_KEY = 'orion_custom_skills_v1';
export const SKILL_BINDINGS_STORAGE_KEY = 'empyralis_skill_bindings_v1';
export const LEGACY_SKILL_BINDINGS_STORAGE_KEY = 'orion_skill_bindings_v1';
export const PINNED_APPS_STORAGE_KEY = 'empyralis_pinned_apps_v1';
export const LEGACY_PINNED_APPS_STORAGE_KEY = 'orion_pinned_apps_v1';

export const SKILLS_UPDATED_EVENT = 'empyralis:skills-updated';
export const LEGACY_SKILLS_UPDATED_EVENT = 'orion:skills-updated';
export const SKILLS_UPDATED_EVENTS = [SKILLS_UPDATED_EVENT, LEGACY_SKILLS_UPDATED_EVENT] as const;

export const APPS_PINNED_UPDATED_EVENT = 'empyralis:apps-pinned-updated';
export const LEGACY_APPS_PINNED_UPDATED_EVENT = 'orion:apps-pinned-updated';
export const APPS_PINNED_UPDATED_EVENTS = [APPS_PINNED_UPDATED_EVENT, LEGACY_APPS_PINNED_UPDATED_EVENT] as const;

export type SkillPolicyMode = 'off' | 'warn' | 'enforce';

export type SkillCard = {
  id: string;
  title: string;
  intent: string;
  tools: string[];
  guardrail: string;
  runtimeTools?: string[];
  preferredTarget?: 'auto' | 'cloud' | 'local_companion';
  preferredTrustMode?: 'auto' | 'guarded' | 'strict' | 'cost_guard' | 'sensitive_guard';
  policyMode?: SkillPolicyMode;
  version?: string;
  author?: string;
  category?: string;
};

export type SkillBindings = {
  assistantDefaults: string[];
  automationDefaults: string[];
};

export type SkillScope = 'assistantDefaults' | 'automationDefaults';

export const BUILTIN_SKILLS: SkillCard[] = [
  {
    id: 'ops-commander',
    title: 'Ops Commander',
    intent: 'Diagnose incidents, propose fixes, and keep execution logs concise.',
    tools: ['read_logs', 'query_metrics', 'send_message'],
    guardrail: 'Requires approval for outbound actions in guarded mode.',
    runtimeTools: ['send_message', 'draft_email', 'create_calendar_event'],
    preferredTarget: 'cloud',
    preferredTrustMode: 'guarded',
    policyMode: 'warn',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Operations',
  },
  {
    id: 'founder-assistant',
    title: 'Founder Assistant',
    intent: 'Turn rough ideas into concrete tasks, priorities, and weekly plans.',
    tools: ['summarize', 'create_task', 'draft_email'],
    guardrail: 'Never auto-send externally without explicit approval.',
    runtimeTools: ['draft_email'],
    preferredTarget: 'cloud',
    preferredTrustMode: 'guarded',
    policyMode: 'warn',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Execution',
  },
  {
    id: 'exam-coach',
    title: 'Exam Coach',
    intent: 'Build study plans, drills, and daily check-ins with accountability.',
    tools: ['plan', 'memory.search', 'send_message'],
    guardrail: 'No destructive actions. Keep focus on learning workflow.',
    runtimeTools: ['send_message'],
    preferredTarget: 'cloud',
    preferredTrustMode: 'guarded',
    policyMode: 'warn',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Learning',
  },
];

export function listAvailableSkills(): SkillCard[] {
  return [...BUILTIN_SKILLS, ...loadCustomSkills()];
}

export function loadCustomSkills(): SkillCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SKILLS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_SKILLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SkillCard[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === 'string' && typeof s.title === 'string');
  } catch {
    return [];
  }
}

export function saveCustomSkills(items: SkillCard[]): void {
  try {
    const payload = JSON.stringify(items);
    window.localStorage.setItem(SKILLS_STORAGE_KEY, payload);
    window.localStorage.setItem(LEGACY_SKILLS_STORAGE_KEY, payload);
    for (const eventName of SKILLS_UPDATED_EVENTS) {
      window.dispatchEvent(new Event(eventName));
    }
  } catch {
    // no-op
  }
}

export function loadBindings(): SkillBindings {
  if (typeof window === 'undefined') return { assistantDefaults: [], automationDefaults: [] };
  try {
    const raw = window.localStorage.getItem(SKILL_BINDINGS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_SKILL_BINDINGS_STORAGE_KEY);
    if (!raw) return { assistantDefaults: [], automationDefaults: [] };
    const parsed = JSON.parse(raw) as SkillBindings;
    return {
      assistantDefaults: Array.isArray(parsed.assistantDefaults) ? parsed.assistantDefaults : [],
      automationDefaults: Array.isArray(parsed.automationDefaults) ? parsed.automationDefaults : [],
    };
  } catch {
    return { assistantDefaults: [], automationDefaults: [] };
  }
}

export function saveBindings(bindings: SkillBindings): void {
  try {
    const payload = JSON.stringify(bindings);
    window.localStorage.setItem(SKILL_BINDINGS_STORAGE_KEY, payload);
    window.localStorage.setItem(LEGACY_SKILL_BINDINGS_STORAGE_KEY, payload);
    for (const eventName of SKILLS_UPDATED_EVENTS) {
      window.dispatchEvent(new Event(eventName));
    }
  } catch {
    // no-op
  }
}

export function loadPinnedApps(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PINNED_APPS_STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_PINNED_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function savePinnedApps(ids: string[]): void {
  try {
    const normalized = ids
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const payload = JSON.stringify(normalized);
    window.localStorage.setItem(PINNED_APPS_STORAGE_KEY, payload);
    window.localStorage.setItem(LEGACY_PINNED_APPS_STORAGE_KEY, payload);
    for (const eventName of APPS_PINNED_UPDATED_EVENTS) {
      window.dispatchEvent(new Event(eventName));
    }
  } catch {
    // no-op
  }
}

function mapSkillById(skills: SkillCard[]): Record<string, SkillCard> {
  const out: Record<string, SkillCard> = {};
  for (const skill of skills) {
    if (!skill.id) continue;
    out[skill.id] = skill;
  }
  return out;
}

function buildSkillPromptAppend(activeSkills: SkillCard[]): string {
  if (activeSkills.length === 0) return '';
  const lines = [
    'Active skill directives (follow unless user overrides explicitly):',
    ...activeSkills.map((skill) => {
      const tools = skill.tools.length > 0 ? skill.tools.join(', ') : 'none';
      const runtimeTools = Array.isArray(skill.runtimeTools) && skill.runtimeTools.length > 0 ? skill.runtimeTools.join(', ') : 'none';
      const target = skill.preferredTarget ? ` Preferred target: ${skill.preferredTarget}.` : '';
      const trust = skill.preferredTrustMode ? ` Preferred trust mode: ${skill.preferredTrustMode}.` : '';
      const policy = skill.policyMode ? ` Policy mode: ${skill.policyMode}.` : '';
      return `- ${skill.title}: ${skill.intent} Guardrail: ${skill.guardrail} Tools: ${tools}. Runtime tools: ${runtimeTools}.${target}${trust}${policy}`;
    }),
  ];
  return lines.join('\n');
}

export function resolveSkillsByIds(ids: string[]): {
  ids: string[];
  skills: SkillCard[];
  promptAppend: string;
} {
  const normalizedIds = Array.isArray(ids)
    ? ids
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    : [];
  if (normalizedIds.length === 0) {
    return { ids: [], skills: [], promptAppend: '' };
  }
  const byId = mapSkillById(listAvailableSkills());
  const activeSkills = normalizedIds
    .map((id) => byId[id])
    .filter((item): item is SkillCard => Boolean(item));
  return {
    ids: activeSkills.map((item) => item.id),
    skills: activeSkills,
    promptAppend: buildSkillPromptAppend(activeSkills),
  };
}

export function resolveActiveSkills(scope: SkillScope): {
  ids: string[];
  skills: SkillCard[];
  promptAppend: string;
} {
  const bindings = loadBindings();
  const ids = scope === 'assistantDefaults' ? bindings.assistantDefaults : bindings.automationDefaults;
  return resolveSkillsByIds(ids);
}
