'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BookText,
  Bot,
  Cable,
  CalendarDays,
  ChevronDown,
  Cloud,
  Database,
  LaptopMinimal,
  Mail,
  MessageSquareText,
  PhoneCall,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TestTube2,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import {
  fetchRuntimeProfiles,
  type RuntimeProfileRecord,
  type WorkspaceAgentInstallRecord,
} from '@/lib/api';
import { useAgentsWorkspace } from '@/components/orion/agents/AgentsWorkspaceContext';
import {
  AGENT_SKILL_LIBRARY,
  getAgentManifest,
  getBoundSkills,
  getChannelRegistryBindings,
  getDraftArchetype,
  getRuntimeMode,
  runtimeModeLabel,
  type AgentBoundSkillId,
  type AgentChannelBindingKey,
  type AgentChannelBindingRecord,
  type AgentManifest,
  type AgentRuntimeMode,
} from '@/components/orion/agents/agentRuntime';

function SectionCard({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/5 bg-zinc-900/65 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_55%)]" />
      <div className="relative space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {icon}
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
            <p className="text-sm leading-6 text-zinc-400">{body}</p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function PanelCard({
  icon,
  title,
  body,
  meta,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  meta: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/5 bg-zinc-900/65 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_55%)]" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          {icon}
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          <p className="text-sm leading-6 text-zinc-400">{body}</p>
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{meta}</div>
        </div>
      </div>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{children}</div>;
}

function inputClassName(multiline = false) {
  return `${multiline ? 'min-h-[120px] resize-none py-3' : 'h-11'} w-full rounded-[18px] border border-white/8 bg-black/20 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/14`;
}

function commaSeparatedList(value: string): string[] {
  return Array.from(new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function connectorBindingsFromList(names: string[], current: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const name of names) {
    next[name] = {
      ...(typeof current[name] === 'object' && current[name] !== null ? current[name] as Record<string, unknown> : {}),
      enabled: true,
    };
  }
  return next;
}

const SKILL_ICONS = {
  'email-access': <Mail size={18} />,
  'web-search': <Search size={18} />,
  'calendar-access': <CalendarDays size={18} />,
  'task-runner': <Wrench size={18} />,
  'inventory-tool': <Database size={18} />,
  'crm-notes': <MessageSquareText size={18} />,
} as const;

const CHANNEL_BINDING_CARDS: Array<{
  key: AgentChannelBindingKey;
  label: string;
  description: string;
  placeholder: string;
  icon: ReactNode;
}> = [
  {
    key: 'web_chat',
    label: 'Web Chat',
    description: 'Own the public website widget or embedded storefront chat.',
    placeholder: 'workspace-default',
    icon: <MessageSquareText size={18} />,
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Bind a specific inbox for customer-facing replies.',
    placeholder: 'support@company.com',
    icon: <Mail size={18} />,
  },
  {
    key: 'phone',
    label: 'Phone',
    description: 'Claim a phone lane for calls or SMS routing.',
    placeholder: '+1 555 123 4567',
    icon: <PhoneCall size={18} />,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    description: 'Assign one WhatsApp identity to one active responder.',
    placeholder: '+1 555 123 4567',
    icon: <PhoneCall size={18} />,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    description: 'Assign a dedicated Telegram bot or handle.',
    placeholder: '@partspro_bot',
    icon: <Cable size={18} />,
  },
];

const RUNTIME_MODE_CARDS: Array<{
  mode: AgentRuntimeMode;
  title: string;
  body: string;
  icon: ReactNode;
}> = [
  {
    mode: 'hosted_secure',
    title: 'Hosted Secure',
    body: 'Default cloud-isolated runtime. Safe for normal specialist execution and customer-facing work.',
    icon: <Cloud size={18} />,
  },
  {
    mode: 'local_secure',
    title: 'Local Secure',
    body: 'Desktop companion with scoped local access.',
    icon: <LaptopMinimal size={18} />,
  },
  {
    mode: 'privileged_device',
    title: 'Privileged Device',
    body: 'Advanced desktop runtime with direct device reach and approval gating.',
    icon: <TriangleAlert size={18} />,
  },
];

function runtimeProfileIdFromInstall(install: WorkspaceAgentInstallRecord): string {
  const runtimeBinding = install.metadata?.['runtime_binding'] as { runtime_profile_id?: string } | undefined;
  return String(install.runtime_profile_id || runtimeBinding?.runtime_profile_id || '').trim();
}

export function OwnerPanel({
  install,
  isMobile = false,
}: {
  install: WorkspaceAgentInstallRecord;
  isMobile?: boolean;
}) {
  const router = useRouter();
  const { activeWorkspaceId } = usePlatformShell();
  const {
    saveDraftChannels,
    saveDraftManifest,
    saveDraftRuntime,
    saveDraftSkills,
  } = useAgentsWorkspace();

  const manifest = getAgentManifest(install);
  const persistedChannelBindings = useMemo(() => getChannelRegistryBindings(install), [install]);
  const persistedRuntimeMode = getRuntimeMode(install);
  const persistedRuntimeProfileId = runtimeProfileIdFromInstall(install);
  const persistedConnectorBindings = useMemo(
    () => (typeof install.connector_bindings === 'object' && install.connector_bindings !== null
      ? install.connector_bindings as Record<string, unknown>
      : {}),
    [install.connector_bindings],
  );
  const archetype = getDraftArchetype(install) || String(install.metadata?.draft_archetype || '').trim().toLowerCase();

  const [roleDraft, setRoleDraft] = useState({
    role: manifest.identity.role,
    jobToBeDone: manifest.role.job_to_be_done,
    tone: manifest.voice.tone,
    responseStyle: manifest.voice.response_style,
  });
  const [knowledgeDraft, setKnowledgeDraft] = useState({
    hardContext: manifest.bible.hard_context,
    responsibilities: manifest.bible.core_responsibilities,
    guardrails: manifest.bible.guardrails,
  });
  const [installedSkills, setInstalledSkills] = useState<string[]>(() => getBoundSkills(install));
  const [channelBindings, setChannelBindings] = useState<Record<AgentChannelBindingKey, AgentChannelBindingRecord>>(persistedChannelBindings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfileRecord[]>([]);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeMode, setRuntimeMode] = useState<AgentRuntimeMode>(persistedRuntimeMode);
  const [runtimeProfileId, setRuntimeProfileId] = useState(persistedRuntimeProfileId);
  const [privilegedAcknowledged, setPrivilegedAcknowledged] = useState(false);
  const [policyDraft, setPolicyDraft] = useState({
    approvalMode: manifest.policy.approval_mode,
    reflectionEnabled: manifest.policy.reflection_enabled,
    serviceBoundaries: manifest.voice.service_boundaries,
  });
  const [connectorDraft, setConnectorDraft] = useState({
    requested: manifest.connectors.requested.join(', '),
    bound: manifest.connectors.bound.join(', '),
  });

  const [roleSavedAt, setRoleSavedAt] = useState<string | null>(null);
  const [knowledgeSavedAt, setKnowledgeSavedAt] = useState<string | null>(null);
  const [channelSavedAt, setChannelSavedAt] = useState<string | null>(null);
  const [runtimeSavedAt, setRuntimeSavedAt] = useState<string | null>(null);
  const [advancedSavedAt, setAdvancedSavedAt] = useState<string | null>(null);
  const [channelSaveError, setChannelSaveError] = useState<string | null>(null);
  const [runtimeSaveError, setRuntimeSaveError] = useState<string | null>(null);
  const [advancedSaveError, setAdvancedSaveError] = useState<string | null>(null);

  useEffect(() => {
    setRoleDraft({
      role: manifest.identity.role,
      jobToBeDone: manifest.role.job_to_be_done,
      tone: manifest.voice.tone,
      responseStyle: manifest.voice.response_style,
    });
    setKnowledgeDraft({
      hardContext: manifest.bible.hard_context,
      responsibilities: manifest.bible.core_responsibilities,
      guardrails: manifest.bible.guardrails,
    });
    setInstalledSkills(getBoundSkills(install));
    setChannelBindings(persistedChannelBindings);
    setRuntimeMode(persistedRuntimeMode);
    setRuntimeProfileId(persistedRuntimeProfileId);
    setPolicyDraft({
      approvalMode: manifest.policy.approval_mode,
      reflectionEnabled: manifest.policy.reflection_enabled,
      serviceBoundaries: manifest.voice.service_boundaries,
    });
    setConnectorDraft({
      requested: manifest.connectors.requested.join(', '),
      bound: manifest.connectors.bound.join(', '),
    });
    setPrivilegedAcknowledged(false);
    setChannelSaveError(null);
    setRuntimeSaveError(null);
    setAdvancedSaveError(null);
  }, [install, manifest, persistedChannelBindings, persistedRuntimeMode, persistedRuntimeProfileId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setRuntimeProfiles([]);
      return;
    }
    let cancelled = false;
    setRuntimeLoading(true);
    fetchRuntimeProfiles(activeWorkspaceId)
      .then((profiles) => {
        if (!cancelled) setRuntimeProfiles(profiles);
      })
      .catch(() => {
        if (!cancelled) setRuntimeProfiles([]);
      })
      .finally(() => {
        if (!cancelled) setRuntimeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]);

  const installedSkillSet = useMemo(() => new Set(installedSkills), [installedSkills]);
  const availableRuntimeProfiles = useMemo(
    () => runtimeProfiles.filter((profile) => {
      const runtimeClass = String(profile.runtime_class || '').trim();
      return runtimeMode === 'hosted_secure'
        ? runtimeClass === 'cloud_worker'
        : runtimeClass === 'desktop_companion';
    }),
    [runtimeMode, runtimeProfiles],
  );
  const runtimeProfilesMissing = availableRuntimeProfiles.length === 0;
  const roleDirty = roleDraft.role !== manifest.identity.role
    || roleDraft.jobToBeDone !== manifest.role.job_to_be_done
    || roleDraft.tone !== manifest.voice.tone
    || roleDraft.responseStyle !== manifest.voice.response_style;
  const knowledgeDirty = knowledgeDraft.hardContext !== manifest.bible.hard_context
    || knowledgeDraft.responsibilities !== manifest.bible.core_responsibilities
    || knowledgeDraft.guardrails !== manifest.bible.guardrails;
  const channelBindingsDirty = JSON.stringify(channelBindings) !== JSON.stringify(persistedChannelBindings);
  const runtimeDirty = runtimeMode !== persistedRuntimeMode || runtimeProfileId !== persistedRuntimeProfileId;
  const connectorRequestedPersisted = manifest.connectors.requested.join(', ');
  const connectorBoundPersisted = manifest.connectors.bound.join(', ');
  const advancedDirty = connectorDraft.requested !== connectorRequestedPersisted
    || connectorDraft.bound !== connectorBoundPersisted
    || policyDraft.approvalMode !== manifest.policy.approval_mode
    || policyDraft.reflectionEnabled !== manifest.policy.reflection_enabled
    || policyDraft.serviceBoundaries !== manifest.voice.service_boundaries;

  useEffect(() => {
    if (availableRuntimeProfiles.length === 0) return;
    const alreadyAvailable = availableRuntimeProfiles.some((profile) => profile.id === runtimeProfileId);
    if (!alreadyAvailable) {
      setRuntimeProfileId(availableRuntimeProfiles[0]?.id || '');
    }
  }, [availableRuntimeProfiles, runtimeProfileId]);

  const persistManifest = async (
    mutate: (current: AgentManifest) => AgentManifest,
    options?: {
      connectorBindings?: Record<string, unknown>;
    },
  ) => {
    const nextManifest = mutate(getAgentManifest(install));
    return saveDraftManifest(install.id, {
      manifest: nextManifest,
      runtime_profile_id: persistedRuntimeProfileId || undefined,
      runtime_mode: persistedRuntimeMode,
      connector_bindings: options?.connectorBindings,
    });
  };

  const saveRole = async () => {
    const saved = await persistManifest((current) => ({
      ...current,
      identity: {
        ...current.identity,
        role: roleDraft.role.trim() || current.identity.name,
      },
      role: {
        ...current.role,
        job_to_be_done: roleDraft.jobToBeDone.trim(),
      },
      voice: {
        ...current.voice,
        tone: roleDraft.tone.trim(),
        response_style: roleDraft.responseStyle.trim(),
      },
    }));
    if (saved) setRoleSavedAt(new Date().toISOString());
  };

  const saveKnowledge = async () => {
    const saved = await persistManifest((current) => ({
      ...current,
      bible: {
        ...current.bible,
        hard_context: knowledgeDraft.hardContext.trim(),
        core_responsibilities: knowledgeDraft.responsibilities.trim(),
        guardrails: knowledgeDraft.guardrails.trim(),
      },
    }));
    if (saved) setKnowledgeSavedAt(new Date().toISOString());
  };

  const toggleSkill = (skillId: string) => {
    setInstalledSkills((current) => {
      const next = current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId];
      void saveDraftSkills(install.id, next as AgentBoundSkillId[]);
      return next;
    });
  };

  const updateChannelBinding = (
    channelKey: AgentChannelBindingKey,
    patch: Partial<AgentChannelBindingRecord>,
  ) => {
    setChannelBindings((current) => ({
      ...current,
      [channelKey]: {
        ...current[channelKey],
        ...patch,
      },
    }));
    setChannelSaveError(null);
  };

  const saveChannels = async () => {
    setChannelSaveError(null);
    try {
      const saved = await saveDraftChannels(install.id, channelBindings);
      if (saved) setChannelSavedAt(new Date().toISOString());
    } catch (error) {
      setChannelSaveError(error instanceof Error ? error.message : 'Unable to save channel bindings.');
    }
  };

  const saveRuntime = async () => {
    setRuntimeSaveError(null);
    try {
      const saved = await saveDraftRuntime(install.id, {
        runtime_mode: runtimeMode,
        runtime_profile_id: runtimeProfileId || undefined,
      });
      if (saved) {
        setRuntimeSavedAt(new Date().toISOString());
        setPrivilegedAcknowledged(false);
      }
    } catch (error) {
      setRuntimeSaveError(error instanceof Error ? error.message : 'Unable to save runtime profile.');
    }
  };

  const saveAdvanced = async () => {
    setAdvancedSaveError(null);
    try {
      const requested = commaSeparatedList(connectorDraft.requested);
      const bound = commaSeparatedList(connectorDraft.bound);
      const saved = await saveDraftManifest(install.id, {
        manifest: {
          ...getAgentManifest(install),
          connectors: {
            requested,
            bound,
          },
          policy: {
            ...manifest.policy,
            approval_mode: policyDraft.approvalMode,
            reflection_enabled: policyDraft.reflectionEnabled,
          },
          voice: {
            ...manifest.voice,
            service_boundaries: policyDraft.serviceBoundaries.trim(),
          },
        },
        runtime_profile_id: persistedRuntimeProfileId || undefined,
        runtime_mode: persistedRuntimeMode,
        connector_bindings: connectorBindingsFromList(bound, persistedConnectorBindings),
      });
      if (saved) setAdvancedSavedAt(new Date().toISOString());
    } catch (error) {
      setAdvancedSaveError(error instanceof Error ? error.message : 'Unable to save advanced settings.');
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/5 bg-zinc-900/65 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.06),transparent_24%)]" />
      <div className="relative space-y-4">
        <div className="rounded-[28px] border border-white/5 bg-zinc-900/62 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Owner mode
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Operate this specialist without the internal noise
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Keep the main lane focused on what ordinary owners need: role, knowledge, skills, channels, and testing. The technical surfaces stay tucked behind Advanced.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/6 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 backdrop-blur-xl">
              <ShieldCheck size={13} />
              {String(install.label || install.agent_definition?.name || 'Agent')}
            </div>
          </div>
        </div>

        <div className={`grid gap-4 ${isMobile ? '' : 'xl:grid-cols-[1.1fr_0.9fr]'}`}>
          <div className="space-y-4">
            <SectionCard
              icon={<Target size={18} />}
              title="Role"
              body="Define the job, the public-facing title, and how this specialist should sound."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Public role</Label>
                  <input
                    value={roleDraft.role}
                    onChange={(event) => setRoleDraft((current) => ({ ...current, role: event.target.value }))}
                    className={inputClassName()}
                    placeholder="Parts Specialist"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <input
                    value={roleDraft.tone}
                    onChange={(event) => setRoleDraft((current) => ({ ...current, tone: event.target.value }))}
                    className={inputClassName()}
                    placeholder="Calm, concise, and professional."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Job to be done</Label>
                <textarea
                  value={roleDraft.jobToBeDone}
                  onChange={(event) => setRoleDraft((current) => ({ ...current, jobToBeDone: event.target.value }))}
                  className={inputClassName(true)}
                  placeholder="Explain the exact work this specialist owns."
                />
              </div>
              <div className="space-y-2">
                <Label>Response style</Label>
                <textarea
                  value={roleDraft.responseStyle}
                  onChange={(event) => setRoleDraft((current) => ({ ...current, responseStyle: event.target.value }))}
                  className={inputClassName(true)}
                  placeholder="Lead with the answer, then the next step."
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {roleSavedAt ? 'Saved to specialist record' : 'This controls what the customer experiences first'}
                </div>
                <button
                  type="button"
                  onClick={() => { void saveRole(); }}
                  disabled={!roleDirty}
                  className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save Role
                </button>
              </div>
            </SectionCard>

            <SectionCard
              icon={<BookText size={18} />}
              title="Knowledge"
              body="Control the hard context, responsibilities, and guardrails this specialist must honor."
            >
              <div className="space-y-2">
                <Label>Hard context</Label>
                <textarea
                  value={knowledgeDraft.hardContext}
                  onChange={(event) => setKnowledgeDraft((current) => ({ ...current, hardContext: event.target.value }))}
                  className={inputClassName(true)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Core responsibilities</Label>
                  <textarea
                    value={knowledgeDraft.responsibilities}
                    onChange={(event) => setKnowledgeDraft((current) => ({ ...current, responsibilities: event.target.value }))}
                    className={inputClassName(true)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Guardrails</Label>
                  <textarea
                    value={knowledgeDraft.guardrails}
                    onChange={(event) => setKnowledgeDraft((current) => ({ ...current, guardrails: event.target.value }))}
                    className={inputClassName(true)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {knowledgeSavedAt ? 'Saved to specialist record' : 'Customer View reads the latest saved server manifest'}
                </div>
                <button
                  type="button"
                  onClick={() => { void saveKnowledge(); }}
                  disabled={!knowledgeDirty}
                  className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save Knowledge
                </button>
              </div>
            </SectionCard>

            <SectionCard
              icon={<Bot size={18} />}
              title="Skills"
              body="Bind only the capabilities this specialist is allowed to use at runtime."
            >
              <div className="grid gap-3 lg:grid-cols-2">
                {AGENT_SKILL_LIBRARY.map((skill) => {
                  const active = installedSkillSet.has(skill.id);
                  const recommended = skill.recommendedFor.includes(archetype as never);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className={`rounded-[24px] border p-4 text-left transition ${active ? 'border-emerald-300/20 bg-emerald-300/10' : 'border-white/6 bg-white/[0.04] hover:bg-white/[0.06]'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                          {SKILL_ICONS[skill.id]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold tracking-tight text-white">{skill.label}</div>
                            {recommended ? (
                              <span className="rounded-full border border-white/8 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
                                Recommended
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-zinc-400">{skill.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard
              icon={<Cable size={18} />}
              title="Channels"
              body="Choose where this specialist can answer, and keep inbound ownership collisions impossible."
            >
              {channelSaveError ? (
                <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {channelSaveError}
                </div>
              ) : null}
              <div className="space-y-3">
                {CHANNEL_BINDING_CARDS.map((channel) => {
                  const binding = channelBindings[channel.key];
                  return (
                    <div
                      key={channel.key}
                      className="rounded-[24px] border border-white/8 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                          {channel.icon}
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <div>
                            <div className="text-sm font-semibold tracking-tight text-white">{channel.label}</div>
                            <p className="mt-1 text-sm leading-6 text-zinc-400">{channel.description}</p>
                          </div>
                          <div className="grid gap-3">
                            <label className="flex items-center justify-between rounded-[18px] border border-white/6 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200">
                              <span>Enabled</span>
                              <input
                                type="checkbox"
                                checked={binding.enabled}
                                onChange={(event) => updateChannelBinding(channel.key, { enabled: event.target.checked })}
                                className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-300 focus:ring-emerald-300/30"
                              />
                            </label>
                            <label className="flex items-center justify-between rounded-[18px] border border-white/6 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200">
                              <span>Inbound owner</span>
                              <input
                                type="checkbox"
                                checked={binding.is_inbound_owner}
                                onChange={(event) => updateChannelBinding(channel.key, { is_inbound_owner: event.target.checked })}
                                className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-300 focus:ring-emerald-300/30"
                              />
                            </label>
                            <input
                              type="text"
                              value={binding.endpoint_key}
                              onChange={(event) => updateChannelBinding(channel.key, { endpoint_key: event.target.value })}
                              placeholder={channel.placeholder}
                              className={inputClassName()}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {channelSavedAt ? 'Saved to specialist record' : 'One active inbound owner per endpoint, no silent overrides'}
                </div>
                <button
                  type="button"
                  onClick={() => { void saveChannels(); }}
                  disabled={!channelBindingsDirty}
                  className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save Channels
                </button>
              </div>
            </SectionCard>

            <SectionCard
              icon={<TestTube2 size={18} />}
              title="Test"
              body="Jump directly into Customer View and verify how the latest saved manifest behaves."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  'Do you have 2022 Tesla Model 3 wipers?',
                  'Can you help me book an appointment next Tuesday?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => router.push(`/agents/${encodeURIComponent(install.id)}?mode=customer&q=${encodeURIComponent(prompt)}`)}
                    className="rounded-[24px] border border-white/6 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.06]"
                  >
                    <div className="text-sm font-semibold tracking-tight text-white">{prompt}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      Open in Customer View
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Customer View re-fetches the latest server install when you switch modes
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/agents/${encodeURIComponent(install.id)}?mode=customer`)}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/16"
                >
                  <Sparkles size={14} />
                  Open Customer View
                </button>
              </div>
            </SectionCard>
          </div>

          {!isMobile ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-[28px] border border-white/5 bg-zinc-900/65 px-5 py-4 text-left shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl"
            >
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Advanced
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Connectors, runtime, policies, logs, and metrics
                </div>
              </div>
              <ChevronDown
                size={18}
                className={`transition ${advancedOpen ? 'rotate-180 text-zinc-100' : 'text-zinc-500'}`}
              />
            </button>

            {advancedOpen ? (
              <div className="space-y-4">
                <SectionCard
                  icon={<Cable size={18} />}
                  title="Connectors"
                  body="Keep the connector layer out of the main owner path, but still editable when needed."
                >
                  {advancedSaveError ? (
                    <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {advancedSaveError}
                    </div>
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Requested connectors</Label>
                      <textarea
                        value={connectorDraft.requested}
                        onChange={(event) => setConnectorDraft((current) => ({ ...current, requested: event.target.value }))}
                        className={inputClassName(true)}
                        placeholder="inventory, email, crm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bound connectors</Label>
                      <textarea
                        value={connectorDraft.bound}
                        onChange={(event) => setConnectorDraft((current) => ({ ...current, bound: event.target.value }))}
                        className={inputClassName(true)}
                        placeholder="inventory, email"
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<ShieldCheck size={18} />}
                  title="Runtime"
                  body="Execution security stays explicit here and never becomes an accidental side effect."
                >
                  {runtimeSaveError ? (
                    <div className="rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {runtimeSaveError}
                    </div>
                  ) : null}
                  <div className="grid gap-3">
                    {RUNTIME_MODE_CARDS.map((option) => {
                      const active = runtimeMode === option.mode;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          onClick={() => {
                            setRuntimeMode(option.mode);
                            setRuntimeSaveError(null);
                          }}
                          className={`rounded-[24px] border p-4 text-left transition ${active ? 'border-sky-300/24 bg-sky-300/10' : 'border-white/8 bg-black/20 hover:bg-white/[0.06]'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                              {option.icon}
                            </div>
                            <div>
                              <div className="text-sm font-semibold tracking-tight text-white">{option.title}</div>
                              <p className="mt-1 text-sm leading-6 text-zinc-400">{option.body}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-2">
                    <Label>Runtime target</Label>
                    <select
                      value={runtimeProfileId}
                      onChange={(event) => setRuntimeProfileId(event.target.value)}
                      disabled={runtimeProfilesMissing}
                      className="w-full rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runtimeProfilesMissing ? (
                        <option value="">
                          {runtimeLoading
                            ? 'Loading runtime profiles...'
                            : runtimeMode === 'hosted_secure'
                              ? 'No hosted cloud runtime profiles available'
                              : 'No desktop runtime profiles available'}
                        </option>
                      ) : null}
                      {availableRuntimeProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {String(profile.label || profile.slug || profile.id)} · {String(profile.runtime_class || 'runtime')}
                        </option>
                      ))}
                    </select>
                  </div>
                  {runtimeMode === 'privileged_device' ? (
                    <div className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                      <div className="flex items-start gap-3">
                        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                        <div className="space-y-2">
                          <div className="font-semibold tracking-tight">Privileged device warning</div>
                          <p className="leading-6 text-amber-100/90">
                            Customer View remains approval-gated before any privileged device execution can run.
                          </p>
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
                            <input
                              type="checkbox"
                              checked={privilegedAcknowledged}
                              onChange={(event) => setPrivilegedAcknowledged(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 bg-transparent text-amber-300 focus:ring-amber-300/30"
                            />
                            I understand this runtime is privileged
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      {runtimeSavedAt ? 'Saved runtime policy to specialist record' : `Current mode: ${runtimeModeLabel(runtimeMode)}`}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void saveRuntime(); }}
                      disabled={!runtimeDirty || runtimeProfilesMissing || !runtimeProfileId || (runtimeMode === 'privileged_device' && !privilegedAcknowledged)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Save Runtime
                    </button>
                  </div>
                </SectionCard>

                <SectionCard
                  icon={<ShieldCheck size={18} />}
                  title="Policies"
                  body="Reflection and approval posture live here, away from the day-to-day owner path."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Approval mode</Label>
                      <select
                        value={policyDraft.approvalMode}
                        onChange={(event) => setPolicyDraft((current) => ({
                          ...current,
                          approvalMode: event.target.value as AgentManifest['policy']['approval_mode'],
                        }))}
                        className="w-full rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none"
                      >
                        <option value="guarded">Guarded</option>
                        <option value="strict">Strict</option>
                        <option value="system">System</option>
                      </select>
                    </div>
                    <label className="flex items-center justify-between rounded-[18px] border border-white/6 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200">
                      <span>Reflection enabled</span>
                      <input
                        type="checkbox"
                        checked={policyDraft.reflectionEnabled}
                        onChange={(event) => setPolicyDraft((current) => ({ ...current, reflectionEnabled: event.target.checked }))}
                        className="h-4 w-4 rounded border-white/20 bg-transparent text-emerald-300 focus:ring-emerald-300/30"
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>Service boundaries</Label>
                    <textarea
                      value={policyDraft.serviceBoundaries}
                      onChange={(event) => setPolicyDraft((current) => ({ ...current, serviceBoundaries: event.target.value }))}
                      className={inputClassName(true)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                      {advancedSavedAt ? 'Saved advanced settings to specialist record' : 'Advanced settings remain server-backed'}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void saveAdvanced(); }}
                      disabled={!advancedDirty}
                      className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Save Advanced
                    </button>
                  </div>
                </SectionCard>

                <PanelCard
                  icon={<Activity size={18} />}
                  title="Metrics"
                  body="Owner-visible metrics stay secondary until the telemetry cards are fully wired."
                  meta="Advanced analytics lane"
                />
                <PanelCard
                  icon={<BookText size={18} />}
                  title="Logs"
                  body="Execution logs and traces remain tucked away here so the day-to-day control surface stays understandable."
                  meta="Advanced observability lane"
                />
              </div>
            ) : null}
          </div>
          ) : (
            <div className="space-y-4">
              <PanelCard
                icon={<ShieldCheck size={18} />}
                title="Advanced settings live off the mobile lane"
                body="Connectors, runtime, policies, logs, and metrics stay secondary on mobile so the control surface stays understandable."
                meta="Desktop cockpit for advanced administration"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
