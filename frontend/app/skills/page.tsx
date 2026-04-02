'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Brain,
  CheckCircle2,
  Cpu,
  Download,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  TriangleAlert,
  Upload,
  Wrench,
} from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { BRAND } from '@/lib/brand';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import {
  BUILTIN_SKILLS,
  loadRuntimeSkills,
  type SkillBindings,
  type SkillCard,
  type SkillPolicyMode,
} from '@/lib/skills';

type TrustMode = 'auto' | 'guarded' | 'strict';
type ExecTarget = 'auto' | 'cloud' | 'local_companion';

type ToolContract = {
  tool_id: string;
  description?: string;
  optional?: boolean;
};

type PolicyDecision = {
  tool_id: string;
  decision: 'allow' | 'approval_required' | 'blocked' | string;
  reason?: string;
};

type ToolPolicyResult = {
  ok: boolean;
  trust_mode: TrustMode;
  target: ExecTarget;
  items: PolicyDecision[];
  tool_policy?: {
    blocked_actions?: string[];
    approval_actions?: string[];
    sensitive_tools?: string[];
    critical_tools?: string[];
  };
};

type RuntimeCognitivePolicy = {
  enabled?: boolean;
  trust_mode_default?: TrustMode | string;
  approval_levels_by_trust_mode?: Record<string, string[]>;
  strict_approval_all?: boolean;
  allow_prefixes?: string[];
  root?: string;
  timeout_seconds?: number;
  max_output_chars?: number;
  allow_shell_fallback?: boolean;
};

type ExtensionManifest = {
  id: string;
  title: string;
  intent: string;
  tools: string[];
  guardrail: string;
  runtime_tools?: string[];
  preferred_target?: 'auto' | 'cloud' | 'local_companion';
  preferred_trust_mode?: 'auto' | 'guarded' | 'strict' | 'cost_guard' | 'sensitive_guard';
  policy_mode?: SkillPolicyMode;
  version?: string;
  author?: string;
  category?: string;
  auto_bind?: 'assistant' | 'automation' | 'none';
};

type RuntimeSkillsRegistry = {
  builtin_count?: number;
  custom_count?: number;
  installed_count?: number;
  assistant_bundle_count?: number;
  automation_bundle_count?: number;
};

type RuntimeSkillsSnapshot = {
  updated_at?: string | null;
  registry?: RuntimeSkillsRegistry;
};

const CURATED_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'ext-business-ops',
    title: 'Business Ops',
    intent: 'Handle outreach, follow-ups, and operations planning with approval-aware actions.',
    tools: ['send_message', 'draft_email', 'create_task'],
    guardrail: 'Never send externally without approval in guarded/strict mode.',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Operations',
    auto_bind: 'assistant',
  },
  {
    id: 'ext-growth-research',
    title: 'Growth Research',
    intent: 'Run competitor scans, summarize findings, and convert insights into next actions.',
    tools: ['search_web', 'summarize', 'create_task'],
    guardrail: 'Cite evidence before recommendations.',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Research',
    auto_bind: 'assistant',
  },
  {
    id: 'ext-founder-sprint',
    title: 'Founder Sprint',
    intent: 'Turn messy goals into weekly execution plans with clear ownership and deadlines.',
    tools: ['plan', 'create_task', 'send_message'],
    guardrail: 'No destructive actions; decisions must remain reversible by default.',
    version: '1.0.0',
    author: 'Empyralis',
    category: 'Execution',
    auto_bind: 'automation',
  },
];

function normalizeExtensionId(value: string): string {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-');
  if (!base) return `ext-${Date.now()}`;
  return base.startsWith('ext-') || base.startsWith('custom-') ? base : `ext-${base}`;
}

function manifestToSkillCard(manifest: ExtensionManifest): SkillCard {
  return {
    id: normalizeExtensionId(manifest.id),
    title: manifest.title.trim(),
    intent: manifest.intent.trim(),
    tools: manifest.tools.map((t) => t.trim()).filter(Boolean),
    guardrail: manifest.guardrail.trim() || 'No special guardrail declared.',
    runtimeTools: Array.isArray(manifest.runtime_tools) ? manifest.runtime_tools.map((t) => t.trim()).filter(Boolean) : [],
    preferredTarget: manifest.preferred_target,
    preferredTrustMode: manifest.preferred_trust_mode,
    policyMode: manifest.policy_mode,
    version: manifest.version,
    author: manifest.author,
    category: manifest.category,
  };
}

function parseManifestInput(input: string): ExtensionManifest {
  const parsed = JSON.parse(input) as Record<string, unknown>;
  const id = String(parsed.id || '').trim();
  const title = String(parsed.title || '').trim();
  const intent = String(parsed.intent || parsed.description || '').trim();
  const guardrail = String(parsed.guardrail || '').trim();
  const toolsRaw = Array.isArray(parsed.tools) ? parsed.tools : [];
  const tools = toolsRaw.map((item) => String(item).trim()).filter(Boolean);
  const runtimeToolsRaw = Array.isArray(parsed.runtime_tools) ? parsed.runtime_tools : [];
  const runtimeTools = runtimeToolsRaw.map((item) => String(item).trim()).filter(Boolean);
  const preferredTarget = ['auto', 'cloud', 'local_companion'].includes(String(parsed.preferred_target || '').trim())
    ? (String(parsed.preferred_target).trim() as ExtensionManifest['preferred_target'])
    : undefined;
  const preferredTrustMode = ['auto', 'guarded', 'strict', 'cost_guard', 'sensitive_guard'].includes(String(parsed.preferred_trust_mode || '').trim())
    ? (String(parsed.preferred_trust_mode).trim() as ExtensionManifest['preferred_trust_mode'])
    : undefined;
  const policyMode = ['off', 'warn', 'enforce'].includes(String(parsed.policy_mode || parsed.skill_policy_mode || '').trim())
    ? (String(parsed.policy_mode || parsed.skill_policy_mode).trim() as SkillPolicyMode)
    : undefined;
  if (!title || !intent) {
    throw new Error('Manifest must include non-empty title and intent.');
  }
  return {
    id: id || title,
    title,
    intent,
    tools,
    guardrail: guardrail || 'No special guardrail declared.',
    runtime_tools: runtimeTools,
    preferred_target: preferredTarget,
    preferred_trust_mode: preferredTrustMode,
    policy_mode: policyMode,
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
    author: typeof parsed.author === 'string' ? parsed.author : undefined,
    category: typeof parsed.category === 'string' ? parsed.category : undefined,
    auto_bind:
      parsed.auto_bind === 'assistant' || parsed.auto_bind === 'automation' || parsed.auto_bind === 'none'
        ? parsed.auto_bind
        : undefined,
  };
}

function parseManifestBundleInput(input: string): ExtensionManifest[] {
  const parsed = JSON.parse(input) as unknown;

  const normalizeMany = (items: unknown[]): ExtensionManifest[] =>
    items
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const data = item as Record<string, unknown>;
        return parseManifestInput(JSON.stringify(data));
      });

  if (Array.isArray(parsed)) {
    return normalizeMany(parsed);
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.extensions)) return normalizeMany(obj.extensions);
    if (Array.isArray(obj.custom_skills)) return normalizeMany(obj.custom_skills);
    return [parseManifestInput(JSON.stringify(obj))];
  }

  throw new Error('Manifest must be a JSON object or array.');
}

function toRawManifestUrl(url: string): string {
  const input = url.trim();
  if (!input) return '';
  const blobMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}/${blobMatch[4]}`;
  }
  return input;
}


function chipColor(decision: string): { color: string; border: string; bg: string } {
  if (decision === 'allow') {
    return {
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
      bg: 'var(--success-bg)',
    };
  }
  if (decision === 'approval_required') {
    return {
      color: 'var(--warning-fg)',
      border: '1px solid var(--warning-border)',
      bg: 'var(--warning-bg)',
    };
  }
  return {
    color: 'var(--error-fg)',
    border: '1px solid var(--error-border)',
    bg: 'var(--error-bg)',
  };
}

export default function SkillsPage() {
  const [focusExtensionId, setFocusExtensionId] = useState('');
  const [contracts, setContracts] = useState<ToolContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([
    'send_message',
    'execute_shell_command',
    'draft_email',
  ]);
  const [trustMode, setTrustMode] = useState<TrustMode>('guarded');
  const [target, setTarget] = useState<ExecTarget>('cloud');
  const [policyResult, setPolicyResult] = useState<ToolPolicyResult | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [runtimePolicy, setRuntimePolicy] = useState<RuntimeCognitivePolicy | null>(null);
  const [runtimePolicyError, setRuntimePolicyError] = useState<string | null>(null);
  const [customSkills, setCustomSkills] = useState<SkillCard[]>([]);
  const [bindings, setBindings] = useState<SkillBindings>({ assistantDefaults: [], automationDefaults: [] });
  const [runtimeSkillsState, setRuntimeSkillsState] = useState<RuntimeSkillsSnapshot | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newIntent, setNewIntent] = useState('');
  const [newTools, setNewTools] = useState('');
  const [newGuardrail, setNewGuardrail] = useState('');
  const [newPolicyMode, setNewPolicyMode] = useState<SkillPolicyMode>('warn');
  const [manifestInput, setManifestInput] = useState('');
  const [manifestUrlInput, setManifestUrlInput] = useState('');
  const [manifestUrlBusy, setManifestUrlBusy] = useState(false);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next = String(new URLSearchParams(window.location.search).get('focus') || '').trim();
    setFocusExtensionId(next);
  }, []);

  const allSkills = useMemo(() => [...BUILTIN_SKILLS, ...customSkills], [customSkills]);
  const installedSkillIds = useMemo(() => new Set(allSkills.map((item) => item.id)), [allSkills]);

  const syncRuntimeSkills = useCallback(async (skillsArg: SkillCard[], bindingsArg: SkillBindings) => {
    const payload = {
      custom_skills: skillsArg.map((skill) => ({
        id: skill.id,
        title: skill.title,
        intent: skill.intent,
        tools: skill.tools,
        guardrail: skill.guardrail,
        runtime_tools: skill.runtimeTools,
        preferred_target: skill.preferredTarget,
        preferred_trust_mode: skill.preferredTrustMode,
        policy_mode: skill.policyMode,
        version: skill.version,
        author: skill.author,
        category: skill.category,
      })),
      bindings: {
        assistant_defaults: bindingsArg.assistantDefaults,
        automation_defaults: bindingsArg.automationDefaults,
      },
    };
    const res = await controlPlaneFetch('/api/skills/state', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `skills/state failed (HTTP ${res.status})`);
    }
    const json = await res.json().catch(() => null);
    setCustomSkills(skillsArg);
    setBindings(bindingsArg);
    if (json?.state && typeof json.state === 'object') {
      setRuntimeSkillsState(json.state as RuntimeSkillsSnapshot);
    }
  }, [controlPlaneFetch]);

  const refreshRuntimeSkills = useCallback(async () => {
    try {
      const res = await controlPlaneFetch('/api/skills/state');
      if (!res.ok) throw new Error(`skills/state failed (HTTP ${res.status})`);
      const payload = await res.json();
      if (payload?.state && typeof payload.state === 'object') {
        setRuntimeSkillsState(payload.state as RuntimeSkillsSnapshot);
      }
    } catch {
      setRuntimeSkillsState(null);
    }
  }, [controlPlaneFetch]);

  const refreshContracts = useCallback(async () => {
    setContractsLoading(true);
    try {
      const res = await controlPlaneFetch('/api/tools/contracts');
      if (!res.ok) throw new Error(`tools/contracts failed (HTTP ${res.status})`);
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? (payload.items as ToolContract[]) : [];
      setContracts(items);
      if (items.length > 0 && selectedTools.length === 0) {
        setSelectedTools(items.slice(0, 3).map((it) => String(it.tool_id)));
      }
    } catch {
      setContracts([]);
    } finally {
      setContractsLoading(false);
    }
  }, [controlPlaneFetch, selectedTools.length]);

  const refreshRuntimePolicy = useCallback(async () => {
    setRuntimePolicyError(null);
    try {
      const res = await controlPlaneFetch('/api/control-plane/contract');
      if (!res.ok) throw new Error(`contract failed (HTTP ${res.status})`);
      const payload = await res.json();
      const policy = payload?.contract?.cognitive_operator_policy as RuntimeCognitivePolicy | undefined;
      if (!policy || typeof policy !== 'object') {
        throw new Error('No cognitive operator policy in runtime health payload.');
      }
      setRuntimePolicy(policy);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load runtime policy.';
      setRuntimePolicy(null);
      setRuntimePolicyError(message);
    }
  }, [controlPlaneFetch]);

  const evaluatePolicy = useCallback(async () => {
    if (selectedTools.length === 0) return;
    setPolicyBusy(true);
    try {
      const res = await controlPlaneFetch('/api/tools/policy/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          tool_ids: selectedTools,
          trust_mode: trustMode,
          target,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `policy evaluate failed (HTTP ${res.status})`);
      }
      const payload = (await res.json()) as ToolPolicyResult;
      setPolicyResult(payload);
    } catch {
      setPolicyResult(null);
    } finally {
      setPolicyBusy(false);
    }
  }, [controlPlaneFetch, selectedTools, target, trustMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialState() {
      try {
        const snapshot = await loadRuntimeSkills(controlPlaneFetch);
        if (cancelled) return;
        setCustomSkills(snapshot.customSkills);
        setBindings(snapshot.bindings);
      } catch {
        if (cancelled) return;
        setCustomSkills([]);
        setBindings({ assistantDefaults: [], automationDefaults: [] });
      }
    }
    void loadInitialState();
    void refreshContracts();
    void refreshRuntimePolicy();
    void refreshRuntimeSkills();
    return () => {
      cancelled = true;
    };
  }, [controlPlaneFetch, refreshContracts, refreshRuntimePolicy, refreshRuntimeSkills]);

  useEffect(() => {
    if (!focusExtensionId) return;
    const target = document.getElementById(`extension-${focusExtensionId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusExtensionId, allSkills.length]);

  const toggleTool = (toolId: string) => {
    setSelectedTools((prev) => {
      if (prev.includes(toolId)) return prev.filter((item) => item !== toolId);
      return [...prev, toolId];
    });
  };

  const toggleBinding = (scope: 'assistantDefaults' | 'automationDefaults', skillId: string) => {
    const current = bindings[scope];
    const next = current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : [...current, skillId];
    const nextBindings = { ...bindings, [scope]: next };
    void syncRuntimeSkills(customSkills, nextBindings).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to update capability bindings.';
      setExtensionNotice(message);
    });
  };

  const addCustomSkill = () => {
    const title = newTitle.trim();
    const intent = newIntent.trim();
    if (!title || !intent) return;
    const tools = newTools
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const skill: SkillCard = {
      id: `custom-${Date.now()}`,
      title,
      intent,
      tools,
      guardrail: newGuardrail.trim() || 'No special guardrail declared.',
      policyMode: newPolicyMode,
    };
    const nextSkills = [skill, ...customSkills];
    void syncRuntimeSkills(nextSkills, bindings)
      .then(() => {
        setNewTitle('');
        setNewIntent('');
        setNewTools('');
        setNewGuardrail('');
        setNewPolicyMode('warn');
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to save capability.';
        setExtensionNotice(message);
      });
  };

  const removeCustomSkill = (skillId: string) => {
    const next = customSkills.filter((skill) => skill.id !== skillId);
    const nextBindings = {
      assistantDefaults: bindings.assistantDefaults.filter((id) => id !== skillId),
      automationDefaults: bindings.automationDefaults.filter((id) => id !== skillId),
    };
    void syncRuntimeSkills(next, nextBindings).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to remove capability.';
      setExtensionNotice(message);
    });
  };

  const installManifestBatch = (manifests: ExtensionManifest[]) => {
    if (manifests.length === 0) return;
    let nextSkills = [...customSkills];
    const nextBindings: SkillBindings = { ...bindings };
    let installedCount = 0;

    for (const manifest of manifests) {
      const skill = manifestToSkillCard(manifest);
      if (!skill.title || !skill.intent) continue;

      const existingBuiltin = BUILTIN_SKILLS.some((item) => item.id === skill.id);
      const existingIndex = nextSkills.findIndex((item) => item.id === skill.id);

      if (!existingBuiltin) {
        nextSkills = existingIndex >= 0
          ? nextSkills.map((item, idx) => (idx === existingIndex ? skill : item))
          : [skill, ...nextSkills];
      }

      if (manifest.auto_bind === 'assistant' && !nextBindings.assistantDefaults.includes(skill.id)) {
        nextBindings.assistantDefaults = [skill.id, ...nextBindings.assistantDefaults];
      }
      if (manifest.auto_bind === 'automation' && !nextBindings.automationDefaults.includes(skill.id)) {
        nextBindings.automationDefaults = [skill.id, ...nextBindings.automationDefaults];
      }
      installedCount += 1;
    }

    void syncRuntimeSkills(nextSkills, nextBindings)
      .then(() => {
        setExtensionNotice(
          installedCount === 1 ? `${manifests[0].title} installed.` : `${installedCount} capabilities installed.`,
        );
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to install capability.';
        setExtensionNotice(message);
      });
  };

  const installExtension = (manifest: ExtensionManifest) => {
    installManifestBatch([manifest]);
  };

  const installFromManifestInput = () => {
    const raw = manifestInput.trim();
    if (!raw) return;
    try {
      const manifests = parseManifestBundleInput(raw);
      installManifestBatch(manifests);
      setManifestInput('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid manifest JSON.';
      setExtensionNotice(message);
    }
  };

  const installFromManifestUrl = async () => {
    const rawUrl = manifestUrlInput.trim();
    if (!rawUrl) return;
    setManifestUrlBusy(true);
    try {
      const url = toRawManifestUrl(rawUrl);
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Failed to fetch manifest (HTTP ${res.status})`);
      }
      const text = await res.text();
      const manifests = parseManifestBundleInput(text);
      installManifestBatch(manifests);
      setManifestUrlInput('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install from URL.';
      setExtensionNotice(message);
    } finally {
      setManifestUrlBusy(false);
    }
  };

  const exportExtensions = () => {
    const payload = {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      extensions: customSkills,
      bindings: {
        assistant_defaults: bindings.assistantDefaults,
        automation_defaults: bindings.automationDefaults,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `empyralis-capabilities-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExtensionNotice('Capabilities exported.');
  };

  const capabilitySummary = useMemo(
    () => ({
      installed: runtimeSkillsState?.registry?.installed_count ?? allSkills.length,
      custom: runtimeSkillsState?.registry?.custom_count ?? customSkills.length,
      assistantDefaults: runtimeSkillsState?.registry?.assistant_bundle_count ?? bindings.assistantDefaults.length,
      automationDefaults: runtimeSkillsState?.registry?.automation_bundle_count ?? bindings.automationDefaults.length,
    }),
    [allSkills.length, bindings.assistantDefaults.length, bindings.automationDefaults.length, customSkills.length, runtimeSkillsState],
  );
  const assistantBundle = useMemo(() => {
    const byId = new Map(allSkills.map((skill) => [skill.id, skill] as const));
    return bindings.assistantDefaults
      .map((id) => byId.get(id))
      .filter((skill): skill is SkillCard => Boolean(skill));
  }, [allSkills, bindings.assistantDefaults]);
  const automationBundle = useMemo(() => {
    const byId = new Map(allSkills.map((skill) => [skill.id, skill] as const));
    return bindings.automationDefaults
      .map((id) => byId.get(id))
      .filter((skill): skill is SkillCard => Boolean(skill));
  }, [allSkills, bindings.automationDefaults]);
  const curatedSkills = useMemo(() => CURATED_EXTENSIONS.map(manifestToSkillCard), []);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Brain size={18} />}
        title="Capabilities"
        subtitle="Keep one assistant, then narrow it with the few skills and access layers you actually need."
        meta={
          <>
            <span>One assistant</span>
            <span>{capabilitySummary.installed} installed</span>
            <span>{capabilitySummary.custom} custom</span>
          </>
        }
        actions={
          <>
          <Link href="/control-center" className="orion-btn orion-btn-ghost">
            <Shield size={14} />
            Overview
          </Link>
          <button className="orion-btn orion-btn-ghost" onClick={exportExtensions}>
            <Download size={14} />
            Export
          </button>
          <button className="orion-btn orion-btn-ghost" onClick={() => { void refreshContracts(); void refreshRuntimePolicy(); }}>
            <RefreshCw size={14} />
            Refresh
          </button>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Installed', value: String(capabilitySummary.installed) },
          { label: 'Custom', value: String(capabilitySummary.custom) },
          { label: 'Assistant set', value: String(capabilitySummary.assistantDefaults) },
          { label: 'Automation set', value: String(capabilitySummary.automationDefaults) },
        ]}
        minWidth={180}
      />

      {extensionNotice ? (
        <section
          className="orion-panel muted"
          style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{extensionNotice}</div>
          <button className="orion-btn orion-btn-ghost" style={{ minHeight: 28, fontSize: 11 }} onClick={() => setExtensionNotice(null)}>
            Dismiss
          </button>
        </section>
      ) : null}

      <section className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Launch-week model</div>
            <div className="orion-panel-copy">
              Do not create fake specialist agents. Keep one assistant and narrow it with skills, integrations, and approvals.
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <article className="orion-panel muted" style={{ display: 'grid', gap: 8 }}>
            <div className="orion-panel-title" style={{ marginBottom: 0 }}>Assistant defaults</div>
            <div className="orion-panel-copy">
              These capabilities shape the main chat assistant.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {assistantBundle.length > 0 ? (
                assistantBundle.map((skill) => <span key={skill.id} className="orion-chip">{skill.title}</span>)
              ) : (
                <span className="orion-chip">No defaults yet</span>
              )}
            </div>
          </article>
          <article className="orion-panel muted" style={{ display: 'grid', gap: 8 }}>
            <div className="orion-panel-title" style={{ marginBottom: 0 }}>Workflow defaults</div>
            <div className="orion-panel-copy">
              Use these only for recurring or background workflows.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {automationBundle.length > 0 ? (
                automationBundle.map((skill) => <span key={skill.id} className="orion-chip">{skill.title}</span>)
              ) : (
                <span className="orion-chip">No workflow defaults yet</span>
              )}
            </div>
          </article>
          <article className="orion-panel muted" style={{ display: 'grid', gap: 8 }}>
            <div className="orion-panel-title" style={{ marginBottom: 0 }}>Safety posture</div>
            <div className="orion-panel-copy">
              Keep approvals on. Add skills first, add integrations second, loosen runtime policy last.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="orion-chip">Trust: {String(runtimePolicy?.trust_mode_default || 'guarded')}</span>
              <span className="orion-chip">Approvals: guarded</span>
            </div>
          </article>
        </div>
      </section>

      <section className="orion-grid-2">
        <article className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Recommended capability packs</div>
              <div className="orion-panel-copy">
                Start with a few packs that narrow the assistant. Do not try to turn this into a giant marketplace before launch.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="orion-chip"><Brain size={12} /> Installed {capabilitySummary.installed}</span>
            <span className="orion-chip"><Wrench size={12} /> Custom {capabilitySummary.custom}</span>
            <span className="orion-chip"><CheckCircle2 size={12} /> Assistant set {capabilitySummary.assistantDefaults}</span>
            <span className="orion-chip"><Cpu size={12} /> Automation set {capabilitySummary.automationDefaults}</span>
          </div>

          <div className="orion-list">
            {curatedSkills.map((skill) => {
              const installed = installedSkillIds.has(skill.id);
              const assistantEnabled = bindings.assistantDefaults.includes(skill.id);
              return (
                <article key={skill.id} className="orion-list-row">
                  <div className="orion-list-row-main">
                    <div className="orion-list-row-title">{skill.title}</div>
                    <div className="orion-list-row-subtitle">{skill.intent}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      {skill.category || 'General'} • v{skill.version || '1.0.0'} • Tools: {skill.tools.join(', ')}
                    </div>
                  </div>
                  <button
                    className="orion-btn orion-btn-ghost"
                    style={{ minHeight: 30, paddingInline: 10, fontSize: 11 }}
                    onClick={() => {
                      if (!installed) {
                        installExtension({
                          id: skill.id,
                          title: skill.title,
                          intent: skill.intent,
                          tools: skill.tools,
                          guardrail: skill.guardrail,
                          runtime_tools: skill.runtimeTools,
                          preferred_target: skill.preferredTarget,
                          preferred_trust_mode: skill.preferredTrustMode,
                          policy_mode: skill.policyMode,
                          version: skill.version,
                          author: skill.author,
                          category: skill.category,
                          auto_bind: 'assistant',
                        });
                        return;
                      }
                      toggleBinding('assistantDefaults', skill.id);
                    }}
                  >
                    {assistantEnabled ? <CheckCircle2 size={12} /> : installed ? <Plus size={12} /> : <Upload size={12} />}
                    {assistantEnabled ? 'Enabled for assistant' : installed ? 'Add to assistant' : 'Install'}
                  </button>
                </article>
              );
            })}
          </div>

          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Installed capabilities</div>
              <div className="orion-panel-copy">
                Turn a capability on for the assistant only if you want it shaping the main chat by default.
              </div>
            </div>
          </div>

          <div className="orion-list">
            {allSkills.map((skill) => {
              const isCustom = skill.id.startsWith('custom-');
              const isFocused = focusExtensionId === skill.id;
              return (
                <article
                  key={skill.id}
                  id={`extension-${skill.id}`}
                  className="orion-list-row"
                  style={
                    isFocused
                      ? {
                          borderColor: `${BRAND.accentColor}66`,
                          boxShadow: `inset 0 0 0 1px ${BRAND.accentColor}33`,
                        }
                      : undefined
                  }
                >
                  <div className="orion-list-row-main">
                    <div className="orion-list-row-title">{skill.title}</div>
                    <div className="orion-list-row-subtitle">{skill.intent}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                      Tools: {skill.tools.join(', ') || 'none'} • Guardrail: {skill.guardrail}
                      {Array.isArray(skill.runtimeTools) && skill.runtimeTools.length > 0
                        ? ` • Runtime: ${skill.runtimeTools.join(', ')}`
                        : ''}
                      {skill.preferredTarget ? ` • Target: ${skill.preferredTarget}` : ''}
                      {skill.preferredTrustMode ? ` • Trust: ${skill.preferredTrustMode}` : ''}
                      {skill.policyMode ? ` • Policy: ${skill.policyMode}` : ''}
                      {skill.category ? ` • Category: ${skill.category}` : ''}
                      {skill.version ? ` • v${skill.version}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 30, paddingInline: 8, fontSize: 11 }}
                      onClick={() => toggleBinding('assistantDefaults', skill.id)}
                    >
                      {bindings.assistantDefaults.includes(skill.id) ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                      Assistant
                    </button>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 30, paddingInline: 8, fontSize: 11 }}
                      onClick={() => toggleBinding('automationDefaults', skill.id)}
                    >
                      {bindings.automationDefaults.includes(skill.id) ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                      Automation
                    </button>
                    {isCustom && (
                      <button
                        className="orion-btn orion-btn-danger"
                        style={{ minHeight: 30, paddingInline: 8 }}
                        onClick={() => removeCustomSkill(skill.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <article className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 12 }}>
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Access and policy</div>
              <div className="orion-panel-copy">
                Keep this understandable for launch: what is enabled, where it runs, and how risky actions are gated.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="orion-chip"><Shield size={12} /> Runtime: {runtimePolicy?.enabled ? 'enabled' : 'unknown'}</span>
            <span className="orion-chip"><Lock size={12} /> Default trust: {String(runtimePolicy?.trust_mode_default || 'auto')}</span>
            <span className="orion-chip"><Cpu size={12} /> Root: {String(runtimePolicy?.root || '-')}</span>
          </div>

          {runtimePolicyError && (
            <div style={{ fontSize: 12, color: 'var(--error-fg)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <TriangleAlert size={14} />
              {runtimePolicyError}
            </div>
          )}

          <div className="orion-panel muted">
            <div className="orion-panel-title" style={{ marginBottom: 8 }}>Policy simulator</div>
            <div className="orion-grid-2" style={{ gap: 10 }}>
              <div className="orion-field">
                <label className="orion-field-label">Trust mode</label>
                <select className="input" value={trustMode} onChange={(e) => setTrustMode(e.target.value as TrustMode)}>
                  <option value="auto">auto</option>
                  <option value="guarded">guarded</option>
                  <option value="strict">strict</option>
                </select>
              </div>
              <div className="orion-field">
                <label className="orion-field-label">Execution target</label>
                <select className="input" value={target} onChange={(e) => setTarget(e.target.value as ExecTarget)}>
                  <option value="auto">auto</option>
                  <option value="cloud">cloud</option>
                  <option value="local_companion">local_companion</option>
                </select>
              </div>
            </div>

            <div className="orion-field">
              <label className="orion-field-label">Tools to evaluate</label>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 8 }}>
                {contractsLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading tools...</div>
                ) : contracts.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No tools loaded from runtime.</div>
                ) : (
                  contracts.map((tool) => (
                    <label key={tool.tool_id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 4px' }}>
                      <input
                        type="checkbox"
                        checked={selectedTools.includes(tool.tool_id)}
                        onChange={() => toggleTool(tool.tool_id)}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{tool.tool_id}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{tool.description || 'No description'}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <button className="orion-btn orion-btn-primary" onClick={() => { void evaluatePolicy(); }} disabled={policyBusy || selectedTools.length === 0}>
              <Wrench size={14} />
              {policyBusy ? 'Evaluating...' : 'Evaluate Policy'}
            </button>
          </div>

          {policyResult && (
            <div className="orion-list">
              {policyResult.items.map((item) => {
                const color = chipColor(String(item.decision));
                return (
                  <article key={item.tool_id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{item.tool_id}</div>
                      <div className="orion-list-row-subtitle">{item.reason || '—'}</div>
                    </div>
                    <span
                      className="orion-chip"
                      style={{
                        color: color.color,
                        border: color.border,
                        background: color.bg,
                      }}
                    >
                      {item.decision}
                    </span>
                  </article>
                );
              })}
            </div>
          )}

          <button
            className="orion-btn orion-btn-ghost"
            onClick={() => setShowAdvanced((value) => !value)}
            style={{ justifySelf: 'flex-start' }}
          >
            {showAdvanced ? 'Hide advanced controls' : 'Show advanced controls'}
          </button>

          {showAdvanced ? (
            <>
              <div className="orion-panel muted">
                <div className="orion-panel-title" style={{ marginBottom: 8 }}>Install from manifest JSON</div>
                <textarea
                  value={manifestInput}
                  onChange={(e) => setManifestInput(e.target.value)}
                  placeholder={`{\n  "id": "ext-my-pack",\n  "title": "My Pack",\n  "intent": "What this capability should do",\n  "tools": ["send_message"],\n  "guardrail": "Approval required for outbound sends",\n  "policy_mode": "warn",\n  "auto_bind": "assistant"\n}`}
                  rows={8}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)', padding: 10, fontSize: 12, lineHeight: 1.45 }}
                />
                <button className="orion-btn orion-btn-primary" onClick={installFromManifestInput}>
                  <Upload size={14} />
                  Install Manifest
                </button>
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title" style={{ marginBottom: 8 }}>Install from GitHub URL</div>
                <div className="orion-field">
                  <label className="orion-field-label">Manifest URL</label>
                  <input
                    className="input"
                    value={manifestUrlInput}
                    onChange={(e) => setManifestUrlInput(e.target.value)}
                    placeholder="https://github.com/org/repo/blob/main/capability.json"
                  />
                </div>
                <button
                  className="orion-btn orion-btn-primary"
                  onClick={() => {
                    void installFromManifestUrl();
                  }}
                  disabled={manifestUrlBusy || !manifestUrlInput.trim()}
                >
                  <Download size={14} />
                  {manifestUrlBusy ? 'Fetching...' : 'Install from URL'}
                </button>
              </div>

              <div className="orion-panel muted">
                <div className="orion-panel-title" style={{ marginBottom: 8 }}>Build custom capability</div>
                <div className="orion-field">
                  <label className="orion-field-label">Title</label>
                  <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Finance Co-Pilot" />
                </div>
                <div className="orion-field">
                  <label className="orion-field-label">Intent</label>
                  <input className="input" value={newIntent} onChange={(e) => setNewIntent(e.target.value)} placeholder="What this capability should do" />
                </div>
                <div className="orion-field">
                  <label className="orion-field-label">Tools (comma-separated)</label>
                  <input className="input" value={newTools} onChange={(e) => setNewTools(e.target.value)} placeholder="send_message, draft_email" />
                </div>
                <div className="orion-field">
                  <label className="orion-field-label">Guardrail</label>
                  <input className="input" value={newGuardrail} onChange={(e) => setNewGuardrail(e.target.value)} placeholder="Approval required for outbound sends" />
                </div>
                <div className="orion-field">
                  <label className="orion-field-label">Policy mode</label>
                  <select className="orion-input" value={newPolicyMode} onChange={(e) => setNewPolicyMode(e.target.value as SkillPolicyMode)}>
                    <option value="warn">Warn</option>
                    <option value="enforce">Enforce</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <button className="orion-btn orion-btn-primary" onClick={addCustomSkill}>
                  <Plus size={14} />
                  Save capability
                </button>
              </div>
            </>
          ) : null}
        </article>
      </section>

      <section className="orion-panel orion-surface-lift" style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <TriangleAlert size={16} style={{ marginTop: 2, color: BRAND.warningColor }} />
        <div>
          Browser actions never control your whole computer directly. They route through the Empyralis runtime and local companion with policy checks.
          Keep high-risk actions in guarded/strict mode with approvals.
        </div>
      </section>
    </div>
  );
}
