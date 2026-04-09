'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, PackageCheck, Radio, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentsWorkspace } from '@/components/orion/agents/AgentsWorkspaceContext';
import type { AgentForgeArchetype } from '@/components/orion/agents/agentRuntime';

const ARCHETYPES: Array<{
  value: AgentForgeArchetype;
  label: string;
  summary: string;
}> = [
  {
    value: 'support_specialist',
    label: 'Support Specialist',
    summary: 'For inboxes, appointments, customer questions, and escalation-safe replies.',
  },
  {
    value: 'task_automator',
    label: 'Task Automator',
    summary: 'For repeatable operations, system updates, and policy-aware actions.',
  },
  {
    value: 'intelligence_researcher',
    label: 'Intelligence Researcher',
    summary: 'For research, synthesis, market scanning, and decision support.',
  },
] as const;

export default function AgentsPage() {
  const router = useRouter();
  const { items, channels, loading, error, forgeName, setForgeName, createDraftAgent, createDraftAgentFromBlueprint } = useAgentsWorkspace();
  const [prompt, setPrompt] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState<AgentForgeArchetype>('support_specialist');
  const [blueprintText, setBlueprintText] = useState('');
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [blueprintError, setBlueprintError] = useState('');

  const creationReady = useMemo(
    () => forgeName.trim().length > 0 && prompt.trim().length > 0,
    [forgeName, prompt],
  );

  const handleDraftBible = () => {
    if (!creationReady) return;
    const draft = createDraftAgent({
      name: forgeName,
      prompt,
      archetype: selectedArchetype,
    });
    router.push(`/agents/${encodeURIComponent(draft.id)}?mode=owner`);
  };

  const handleImportBlueprint = () => {
    if (!blueprintText.trim()) return;
    try {
      const draft = createDraftAgentFromBlueprint({
        rawBlueprint: blueprintText,
        fallbackName: forgeName || 'Imported Agent',
      });
      setBlueprintError('');
      router.push(`/agents/${encodeURIComponent(draft.id)}?mode=owner`);
    } catch (nextError) {
      setBlueprintError(nextError instanceof Error ? nextError.message : 'Blueprint import failed.');
    }
  };

  return (
    <div className="min-h-full space-y-4 text-zinc-50">
      <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Creation workspace
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
                Forge the next specialist
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-300">
                Name the agent, describe the job in plain language, and let Sage draft the manifest-driven Bible before you refine it in Owner Mode.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {['Naming-first', 'Manifest emitted', 'Owner refinement', 'Universal Harness'].map((label) => (
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
              onClick={handleDraftBible}
              disabled={!creationReady}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-300/16 disabled:opacity-50"
            >
              <Sparkles size={15} />
              Draft Bible with Sage
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-28 rounded-[28px] bg-white/8" />
            <Skeleton className="h-28 rounded-[28px] bg-white/8" />
            <Skeleton className="h-28 rounded-[28px] bg-white/8" />
          </>
        ) : (
          <>
            <div className="rounded-[28px] border border-white/5 bg-zinc-900/40 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-200 backdrop-blur-xl">
                  <PackageCheck size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Installed</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-white">{items.length}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/5 bg-zinc-900/40 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-200 backdrop-blur-xl">
                  <Radio size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Draft channels</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-white">{channels.length}</div>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-white/5 bg-zinc-900/40 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-200 backdrop-blur-xl">
                  <Bot size={18} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Lifecycle</div>
                  <div className="mt-1 text-base font-semibold tracking-tight text-white">Owner refinement begins immediately</div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-[36px] border border-white/5 bg-zinc-900/40 px-6 py-6 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
            Creation forge
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
            What kind of agent are we building today?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300">
            Start with intent, not a storefront. Sage will turn your plain-English brief into a manifest and first operating Bible, then drop you into Owner Mode to refine it.
          </p>

          <div className="mt-8 grid w-full gap-4 text-left">
            <div className="rounded-[28px] border border-white/6 bg-white/[0.04] p-4 backdrop-blur-2xl">
              <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Agent name
              </label>
              <input
                value={forgeName}
                onChange={(event) => setForgeName(event.target.value)}
                placeholder="Inventory Copilot"
                className="mt-3 h-12 w-full rounded-2xl border border-white/8 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.08]"
              />
            </div>

            <div className="rounded-[32px] border border-white/6 bg-white/[0.04] p-5 backdrop-blur-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Initial brief
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="What kind of agent are we building today?"
                className="mt-4 min-h-[180px] w-full resize-none rounded-[24px] border border-white/8 bg-white/[0.04] px-5 py-4 text-[17px] leading-8 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.06]"
              />
            </div>
          </div>

          <div className="mt-8 grid w-full gap-3 md:grid-cols-3">
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

          {blueprintOpen ? (
            <div className="mt-8 w-full rounded-[32px] border border-white/6 bg-white/[0.04] p-5 text-left backdrop-blur-2xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Blueprint import
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                Blueprints live inside the Forge
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Paste a manifest JSON to birth a specialist from an imported blueprint. It still lands in Owner Mode for review before it ever talks to a customer.
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
                  onClick={handleImportBlueprint}
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
          ) : null}
        </div>

        {error ? (
          <div className="mt-5 rounded-[24px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
            {error}
          </div>
        ) : null}
        {!loading && channels.length > 0 ? (
          <div className="mt-8 rounded-[28px] border border-white/6 bg-white/[0.03] p-5 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Drafts in motion
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                  Continue refining what Sage already drafted
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
          </div>
        ) : null}
      </section>
    </div>
  );
}
