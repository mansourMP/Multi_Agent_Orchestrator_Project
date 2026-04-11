type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

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

type RuntimeSkillsStatePayload = {
  state?: {
    custom_skills?: unknown[];
    bindings?: {
      assistant_defaults?: unknown[];
      automation_defaults?: unknown[];
    };
    updated_at?: string | null;
  } | null;
};

type InstalledSkillsPayload = {
  items?: unknown[];
};

const EMPTY_BINDINGS: SkillBindings = {
  assistantDefaults: [],
  automationDefaults: [],
};

let customSkillsCache: SkillCard[] = [];
let installedSkillsCache: SkillCard[] = [];
let bindingsCache: SkillBindings = EMPTY_BINDINGS;
let runtimeSkillsHydrated = false;
let runtimeSkillsHydrationPromise: Promise<void> | null = null;

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

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean)
    : [];
}

function sanitizeSkillCard(value: unknown): SkillCard | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = sanitizeText(record.id) || sanitizeText(record.name);
  const title = sanitizeText(record.title) || sanitizeText(record.name);
  const intent = sanitizeText(record.intent) || sanitizeText(record.description);
  if (!id || !title || !intent) return null;
  const preferredTarget = sanitizeText(record.preferred_target || record.preferredTarget);
  const preferredTrustMode = sanitizeText(record.preferred_trust_mode || record.preferredTrustMode);
  const policyMode = sanitizeText(record.policy_mode || record.policyMode);
  return {
    id,
    title,
    intent,
    tools: sanitizeStringList(record.tools),
    guardrail: sanitizeText(record.guardrail) || 'No special guardrail declared.',
    runtimeTools: sanitizeStringList(record.runtime_tools ?? record.runtimeTools),
    preferredTarget:
      preferredTarget === 'auto' || preferredTarget === 'cloud' || preferredTarget === 'local_companion'
        ? preferredTarget
        : undefined,
    preferredTrustMode:
      preferredTrustMode === 'auto'
      || preferredTrustMode === 'guarded'
      || preferredTrustMode === 'strict'
      || preferredTrustMode === 'cost_guard'
      || preferredTrustMode === 'sensitive_guard'
        ? preferredTrustMode
        : undefined,
    policyMode:
      policyMode === 'off' || policyMode === 'warn' || policyMode === 'enforce'
        ? policyMode
        : undefined,
    version: sanitizeText(record.version) || undefined,
    author: sanitizeText(record.author) || undefined,
    category: sanitizeText(record.category) || undefined,
  };
}

function sanitizeInstalledSkillCard(value: unknown): SkillCard | null {
  const skill = sanitizeSkillCard(value);
  if (skill) return skill;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = sanitizeText(record.id) || sanitizeText(record.name);
  const title = sanitizeText(record.name) || sanitizeText(record.title);
  const intent = sanitizeText(record.description) || 'Installed marketplace skill';
  if (!id || !title) return null;
  return {
    id,
    title,
    intent,
    tools: sanitizeStringList(record.tools),
    guardrail: 'See the installed skill contract for guardrails.',
    version: sanitizeText(record.version) || undefined,
    author: sanitizeText(record.author) || undefined,
  };
}

function sanitizeBindings(value: unknown): SkillBindings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    assistantDefaults: sanitizeStringList(record.assistant_defaults ?? record.assistantDefaults),
    automationDefaults: sanitizeStringList(record.automation_defaults ?? record.automationDefaults),
  };
}

function dedupeSkills(skills: SkillCard[]): SkillCard[] {
  const seen = new Set<string>();
  const result: SkillCard[] = [];
  for (const skill of skills) {
    const id = sanitizeText(skill.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(skill);
  }
  return result;
}

function updateRuntimeSkillsCache(payload: RuntimeSkillsStatePayload | null, installedPayload?: InstalledSkillsPayload | null) {
  if (payload?.state) {
    customSkillsCache = dedupeSkills(
      (Array.isArray(payload.state.custom_skills) ? payload.state.custom_skills : [])
        .map((item) => sanitizeSkillCard(item))
        .filter((item): item is SkillCard => Boolean(item)),
    );
    bindingsCache = sanitizeBindings(payload.state.bindings);
    runtimeSkillsHydrated = true;
  }
  if (installedPayload?.items) {
    installedSkillsCache = dedupeSkills(
      installedPayload.items
        .map((item) => sanitizeInstalledSkillCard(item))
        .filter((item): item is SkillCard => Boolean(item)),
    );
  }
  return {
    customSkills: [...customSkillsCache],
    bindings: {
      assistantDefaults: [...bindingsCache.assistantDefaults],
      automationDefaults: [...bindingsCache.automationDefaults],
    },
    installedSkills: [...installedSkillsCache],
  };
}

function snapshotRuntimeSkills() {
  return {
    customSkills: [...customSkillsCache],
    bindings: {
      assistantDefaults: [...bindingsCache.assistantDefaults],
      automationDefaults: [...bindingsCache.automationDefaults],
    },
    installedSkills: [...installedSkillsCache],
  };
}

async function readRuntimeSkillsState(fetcher: Fetcher = fetch) {
  const response = await fetcher('/api/skills/state', {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to load runtime skills state (HTTP ${response.status}).`);
  }
  const payload = (await response.json().catch(() => null)) as RuntimeSkillsStatePayload | null;
  return payload;
}

async function readInstalledSkills(fetcher: Fetcher = fetch) {
  const response = await fetcher('/api/skills', {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to load installed skills (HTTP ${response.status}).`);
  }
  const payload = (await response.json().catch(() => null)) as InstalledSkillsPayload | null;
  return payload;
}

function serializeSkillCard(skill: SkillCard) {
  return {
    id: sanitizeText(skill.id),
    title: sanitizeText(skill.title),
    intent: sanitizeText(skill.intent),
    tools: sanitizeStringList(skill.tools),
    guardrail: sanitizeText(skill.guardrail),
    runtime_tools: sanitizeStringList(skill.runtimeTools),
    preferred_target: skill.preferredTarget,
    preferred_trust_mode: skill.preferredTrustMode,
    policy_mode: skill.policyMode,
    version: sanitizeText(skill.version),
    author: sanitizeText(skill.author),
    category: sanitizeText(skill.category),
  };
}

function maybeWarmRuntimeSkillsCache() {
  if (typeof window === 'undefined' || runtimeSkillsHydrationPromise || runtimeSkillsHydrated) return;
  runtimeSkillsHydrationPromise = (async () => {
    try {
      const [statePayload, installedPayload] = await Promise.all([
        readRuntimeSkillsState(fetch).catch(() => null),
        readInstalledSkills(fetch).catch(() => null),
      ]);
      updateRuntimeSkillsCache(statePayload, installedPayload);
    } finally {
      runtimeSkillsHydrationPromise = null;
    }
  })();
}

export async function loadRuntimeSkills(fetcher: Fetcher = fetch) {
  const [statePayload, installedPayload] = await Promise.all([
    readRuntimeSkillsState(fetcher),
    readInstalledSkills(fetcher).catch(() => null),
  ]);
  return updateRuntimeSkillsCache(statePayload, installedPayload);
}

export async function loadCustomSkills(fetcher: Fetcher = fetch): Promise<SkillCard[]> {
  const snapshot = await loadRuntimeSkills(fetcher);
  return snapshot.customSkills;
}

export async function loadBindings(fetcher: Fetcher = fetch): Promise<SkillBindings> {
  const snapshot = await loadRuntimeSkills(fetcher);
  return snapshot.bindings;
}

export async function saveCustomSkills(items: SkillCard[], fetcher: Fetcher = fetch): Promise<SkillCard[]> {
  const response = await fetcher('/api/skills/state', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      custom_skills: items.map(serializeSkillCard),
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to update skills state (HTTP ${response.status}).`);
  }
  const payload = (await response.json().catch(() => null)) as RuntimeSkillsStatePayload | null;
  return updateRuntimeSkillsCache(payload).customSkills;
}

export async function saveBindings(bindings: SkillBindings, fetcher: Fetcher = fetch): Promise<SkillBindings> {
  const response = await fetcher('/api/skills/state', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bindings: {
        assistant_defaults: sanitizeStringList(bindings.assistantDefaults),
        automation_defaults: sanitizeStringList(bindings.automationDefaults),
      },
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to update skill bindings (HTTP ${response.status}).`);
  }
  const payload = (await response.json().catch(() => null)) as RuntimeSkillsStatePayload | null;
  return updateRuntimeSkillsCache(payload).bindings;
}

export async function loadActiveSkills(scope: SkillScope, fetcher: Fetcher = fetch) {
  await loadRuntimeSkills(fetcher).catch(() => null);
  return resolveActiveSkills(scope);
}

export function listAvailableSkills(): SkillCard[] {
  maybeWarmRuntimeSkillsCache();
  return dedupeSkills([...BUILTIN_SKILLS, ...installedSkillsCache, ...customSkillsCache]);
}

// TODO: Add a backend endpoint for pinned apps before restoring persistence here.
export function loadPinnedApps(): string[] {
  return [];
}

// TODO: Add a backend endpoint for pinned apps before restoring persistence here.
export function savePinnedApps(_ids: string[]): void {}

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
  maybeWarmRuntimeSkillsCache();
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
  maybeWarmRuntimeSkillsCache();
  const ids = scope === 'assistantDefaults' ? bindingsCache.assistantDefaults : bindingsCache.automationDefaults;
  return resolveSkillsByIds(ids);
}
