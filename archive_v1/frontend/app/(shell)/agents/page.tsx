'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BookText,
  Bot,
  Cable,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentsWorkspace } from '@/components/orion/agents/AgentsWorkspaceContext';
import { MobileChannelHome } from '@/components/orion/agents/MobileChannelHome';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  AGENT_SKILL_LIBRARY,
  createDraftManifest,
  runtimeModeLabel,
  type AgentForgeArchetype,
} from '@/components/orion/agents/agentRuntime';

const ARCHETYPES: Array<{
  value: AgentForgeArchetype;
  label: string;
  summary: string;
}> = [
  {
    value: 'support_specialist',
    label: 'Support Specialist',
    summary: 'Customer-facing service, questions, booking, and escalation-safe replies.',
  },
  {
    value: 'task_automator',
    label: 'Task Automator',
    summary: 'Operational follow-through, tools, workflow actions, and controlled execution.',
  },
  {
    value: 'intelligence_researcher',
    label: 'Intelligence Researcher',
    summary: 'Research, synthesis, reporting, and evidence-based recommendations.',
  },
];

function enabledChannelLabels(channels: Record<string, boolean>): string[] {
  return Object.entries(channels)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.replace(/_/g, ' '));
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsPageFallback />}>
      <AgentsPageContent />
    </Suspense>
  );
}

function AgentsPageFallback() {
  return (
    <div className="min-h-full space-y-4 text-zinc-50">
      <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <Skeleton className="h-6 w-28 rounded-full bg-white/8" />
        <Skeleton className="mt-4 h-12 w-full max-w-3xl rounded-[24px] bg-white/8" />
        <Skeleton className="mt-3 h-5 w-full max-w-2xl rounded-full bg-white/6" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Skeleton className="h-[720px] rounded-[36px] bg-white/6" />
        <Skeleton className="h-[720px] rounded-[36px] bg-white/6" />
      </section>
    </div>
  );
}

function AgentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const {
    channels,
    loading,
    error,
    forgeName,
    setForgeName,
    createDraftAgent,
    createDraftAgentFromBlueprint,
  } = useAgentsWorkspace();
  const [rolePrompt, setRolePrompt] = useState('');
  const [behaviorPrompt, setBehaviorPrompt] = useState('');
  const [knowledgePrompt, setKnowledgePrompt] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<AgentForgeArchetype>('support_specialist');
  const [blueprintText, setBlueprintText] = useState('');
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintError, setBlueprintError] = useState('');
  const showForgeOnMobile = String(searchParams.get('forge') || '').trim() === '1';

  const creationReady = useMemo(
    () => forgeName.trim().length > 0 && rolePrompt.trim().length > 0,
    [forgeName, rolePrompt],
  );

  const previewManifest = useMemo(
    () => createDraftManifest({
      name: forgeName || 'Untitled Agent',
      prompt: rolePrompt || `help with ${forgeName || 'this specialist'}`,
      behaviorPrompt,
      knowledgePrompt,
      archetype: selectedArchetype,
    }),
    [behaviorPrompt, forgeName, knowledgePrompt, rolePrompt, selectedArchetype],
  );

  const previewSkills = useMemo(
    () => previewManifest.skills.map((skill) => AGENT_SKILL_LIBRARY.find((entry) => entry.id === skill.id)?.label || skill.id),
    [previewManifest.skills],
  );

  const handleDraftBible = async () => {
    if (!creationReady) return;
    const draft = await createDraftAgent({
      name: forgeName,
      prompt: rolePrompt,
      behaviorPrompt,
      knowledgePrompt,
      archetype: selectedArchetype,
    });
    router.push(`/agents/${encodeURIComponent(draft.id)}?mode=owner`);
  };

  const handleImportBlueprint = async () => {
    if (!blueprintText.trim()) return;
    try {
      const draft = await createDraftAgentFromBlueprint({
        rawBlueprint: blueprintText,
        fallbackName: forgeName || 'Imported Agent',
      });
      setBlueprintError('');
      router.push(`/agents/${encodeURIComponent(draft.id)}?mode=owner`);
    } catch (nextError) {
      setBlueprintError(nextError instanceof Error ? nextError.message : 'Blueprint import failed.');
    }
  };

  if (isMobile && !showForgeOnMobile) {
    return <MobileChannelHome />;
  }

  return (
    <div className="min-h-full space-y-4 text-zinc-50">
      <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Creation forge
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Birth specialists from plain language
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-300">
                The Forge is the only birth path. Name the specialist, describe the work in clean language, and Sage drafts the first complete manifest before you refine it in Owner Mode.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {['Name', 'Role', 'Behavior', 'Context', 'Manifest', 'Owner Mode'].map((label) => (
                <span key={label} className="rounded-full border border-white/6 bg-white/[0.05] px-3 py-1.5 text-zinc-300 backdrop-blur-xl">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBlueprintOpen((current) => !current)}
              className="rounded-full border border-white/8 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
            >
              {blueprintOpen ? 'Hide Blueprint Import' : 'Import Blueprint'}
            </Button>
            <Button
              onClick={() => { void handleDraftBible(); }}
              disabled={!creationReady}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-300/16 disabled:opacity-50"
            >
              <Sparkles size={15} />
              Draft with Sage
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[36px] border border-white/5 bg-zinc-900/40 p-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Layer 1 · Identity
              </div>
              <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Agent name
              </label>
              <input
                value={forgeName}
                onChange={(event) => setForgeName(event.target.value)}
                placeholder="Parts Pro"
                className="mt-3 h-12 w-full rounded-2xl border border-white/8 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.08]"
              />
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Layer 2 · Role
              </div>
              <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                What job does this specialist own?
              </label>
              <textarea
                value={rolePrompt}
                onChange={(event) => setRolePrompt(event.target.value)}
                placeholder="Help customers find the right parts, confirm fitment, and stage the next action without inventing stock or pricing."
                className="mt-3 min-h-[140px] w-full resize-none rounded-[24px] border border-white/8 bg-white/[0.04] px-5 py-4 text-[16px] leading-7 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.06]"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Layer 3 · Voice
                </div>
                <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  How should it answer?
                </label>
                <textarea
                  value={behaviorPrompt}
                  onChange={(event) => setBehaviorPrompt(event.target.value)}
                  placeholder="Calm, concise, and professional. Lead with the answer, then ask only the minimum follow-up question."
                  className="mt-3 min-h-[150px] w-full resize-none rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.06]"
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                  Layer 4 · Context
                </div>
                <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  What context should Sage encode?
                </label>
                <textarea
                  value={knowledgePrompt}
                  onChange={(event) => setKnowledgePrompt(event.target.value)}
                  placeholder="Use the store inventory as source of truth, prefer OEM fitment rules, and escalate refunds or custom pricing."
                  className="mt-3 min-h-[150px] w-full resize-none rounded-[24px] border border-white/8 bg-white/[0.04] px-4 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.06]"
                />
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Layer 5 · Operating pattern
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {ARCHETYPES.map((archetype) => {
                  const active = selectedArchetype === archetype.value;
                  return (
                    <button
                      key={archetype.value}
                      type="button"
                      onClick={() => setSelectedArchetype(archetype.value)}
                      className={`rounded-[28px] border p-5 text-left backdrop-blur-2xl transition duration-200 ${
                        active
                          ? 'border-emerald-300/20 bg-emerald-300/10 shadow-[0_24px_60px_rgba(0,0,0,0.28)]'
                          : 'border-white/6 bg-white/[0.04] hover:border-white/12 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-base font-semibold tracking-tight text-white">{archetype.label}</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{archetype.summary}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/6 bg-white/[0.03] px-4 py-4">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Birth path
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  Sage drafts the Bible, emits the full manifest, and drops you straight into Owner Mode for refinement.
                </p>
              </div>
              <Button
                onClick={() => { void handleDraftBible(); }}
                disabled={!creationReady}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-300/16 disabled:opacity-50"
              >
                <WandSparkles size={15} />
                Draft with Sage
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-[36px] border border-white/5 bg-zinc-900/40 p-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Manifest emitted immediately
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">
                The Forge writes a complete specialist contract
              </h2>
              <p className="mt-2 text-sm leading-7 text-zinc-300">
                Nothing hardcoded, nothing half-born. This specialist is created as manifest data the Universal Harness can read instantly.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[28px] border border-white/6 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                    <Bot size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-white">Identity + Role</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {previewManifest.identity.name} · {previewManifest.role.job_to_be_done}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/6 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                    <BookText size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-white">Voice + Bible</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {previewManifest.voice.tone}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                      {previewManifest.bible.operational_policy.split('\n')[0]}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/6 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                    <Cable size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-white">Skills + Connectors</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {previewSkills.join(', ') || 'No skills selected yet'}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                      Connectors requested: {previewManifest.connectors.requested.join(', ') || 'none'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/6 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100">
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-tight text-white">Channels + Runtime + Policy</div>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {enabledChannelLabels(previewManifest.channels).join(', ')} · {runtimeModeLabel(previewManifest.runtime.mode)}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                      Reflection {previewManifest.policy.reflection_enabled ? 'enabled' : 'disabled'} · approval mode {previewManifest.policy.approval_mode}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      {blueprintOpen ? (
        <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="max-w-4xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Optional accelerator
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
              Import a blueprint inside the Forge
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Blueprints are no longer a storefront. They are a secondary accelerator inside the same birth path and still land in Owner Mode for review before live use.
            </p>
            <textarea
              value={blueprintText}
              onChange={(event) => setBlueprintText(event.target.value)}
              spellCheck={false}
              placeholder='{"identity":{"name":"Parts Pro"},"bible":{"mission":"..."}}'
              className="mt-4 min-h-[180px] w-full resize-none rounded-[24px] border border-white/8 bg-zinc-950/50 px-5 py-4 text-sm leading-7 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-zinc-950/62"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => { void handleImportBlueprint(); }}
                disabled={!blueprintText.trim()}
                className="rounded-full border border-white/8 bg-white/[0.08] text-zinc-100 hover:bg-white/[0.12] disabled:opacity-45"
              >
                Import Blueprint into Forge
              </Button>
              {blueprintError ? (
                <span className="text-sm text-amber-200">{blueprintError}</span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <section className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36 rounded-[28px] bg-white/8" />
          <Skeleton className="h-36 rounded-[28px] bg-white/8" />
        </section>
      ) : channels.length > 0 ? (
        <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Already in motion
              </div>
              <div className="mt-2 text-xl font-semibold tracking-tight text-white">
                Continue refining existing specialists
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {channels.slice(0, 4).map((channel) => (
              <Link
                key={channel.id}
                href={`${channel.href}?mode=owner`}
                className="group relative overflow-hidden rounded-[24px] border border-white/6 bg-zinc-900/42 p-4 transition duration-200 hover:border-white/12 hover:bg-zinc-900/56"
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%)] opacity-80" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold tracking-tight text-white">{channel.label}</div>
                    <span className="rounded-full border border-white/8 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
                      {channel.sourceLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{channel.summary}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm text-zinc-100">
                    Open in Owner Mode
                    <ArrowRight size={14} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
