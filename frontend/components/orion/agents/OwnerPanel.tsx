'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  BookText,
  Cable,
  CalendarDays,
  Database,
  Mail,
  MessageSquareText,
  PhoneCall,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { WorkspaceAgentInstallRecord } from '@/lib/api';
import { useAgentsWorkspace } from '@/components/orion/agents/AgentsWorkspaceContext';
import {
  AGENT_SKILL_LIBRARY,
  getAgentManifest,
  getBoundSkills,
  getDraftArchetype,
  getDraftBible,
} from '@/components/orion/agents/agentRuntime';

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
      <div className="flex items-start gap-3">
        <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
          {icon}
        </div>
        <div className="relative z-10 space-y-2">
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          <p className="text-sm leading-6 text-zinc-400">{body}</p>
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">{meta}</div>
        </div>
      </div>
    </section>
  );
}

const SKILL_ICONS = {
  'email-access': <Mail size={18} />,
  'web-search': <Search size={18} />,
  'calendar-access': <CalendarDays size={18} />,
  'task-runner': <Wrench size={18} />,
  'inventory-tool': <Database size={18} />,
  'crm-notes': <MessageSquareText size={18} />,
} as const;

export function OwnerPanel({ install }: { install: WorkspaceAgentInstallRecord }) {
  const { updateDraftAgent } = useAgentsWorkspace();
  const manifest = getAgentManifest(install);
  const ownerCopy = String(install.agent_definition?.description || '').trim()
    || 'Tune the specialist, compress its operating Bible, and connect the business systems it is allowed to touch.';
  const draftedBible = getDraftBible(install);
  const draftedPrompt = String(install.metadata?.draft_prompt || '').trim();
  const archetype = getDraftArchetype(install) || String(install.metadata?.draft_archetype || '').trim().toLowerCase();
  const isDraftInstall = String(install.metadata?.source || '').trim().toLowerCase() === 'draft';
  const [bibleDraft, setBibleDraft] = useState(draftedBible || ownerCopy);
  const [bibleSavedAt, setBibleSavedAt] = useState<string | null>(null);
  const [installedSkills, setInstalledSkills] = useState<string[]>(() => getBoundSkills(install));

  useEffect(() => {
    setBibleDraft(draftedBible || ownerCopy);
  }, [draftedBible, ownerCopy, install.id]);

  useEffect(() => {
    setInstalledSkills(getBoundSkills(install));
  }, [install]);

  const installedSkillSet = useMemo(() => new Set(installedSkills), [installedSkills]);

  const saveBible = () => {
    if (!isDraftInstall) return;
    updateDraftAgent(install.id, {
      metadata: {
        draft_bible: bibleDraft.trim(),
      },
    });
    setBibleSavedAt(new Date().toISOString());
  };

  const toggleSkill = (skillId: string) => {
    setInstalledSkills((current) => {
      const next = current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId];
      if (isDraftInstall) {
        updateDraftAgent(install.id, {
          metadata: {
            bound_skills: next,
          },
        });
      }
      return next;
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/5 bg-zinc-900/65 p-4 shadow-[0_30px_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.06),transparent_24%)]" />
      <div className="relative space-y-4">
        <section className="relative overflow-hidden rounded-[28px] border border-white/5 bg-zinc-900/62 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_42%),linear-gradient(180deg,rgba(16,185,129,0.06),transparent_80%)]" />
          <div className="relative">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Skill bindings
                </div>
                <div className="mt-2 text-xl font-semibold tracking-tight text-white">
                  Bind modular skills into this agent
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  Anthropic is treating skills as modular capability packs inside the managed-agent runtime. Empyralis should expose the same modularity, but with owner-visible binding, policy clarity, and commercial packaging that a business operator can actually understand.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/6 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 backdrop-blur-xl">
                <ShieldCheck size={13} />
                {installedSkills.length} bound
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {AGENT_SKILL_LIBRARY.map((skill) => {
                const active = installedSkillSet.has(skill.id);
                const recommended = skill.recommendedFor.includes(archetype as never);
                return (
                  <div
                    key={skill.id}
                    className={`relative overflow-hidden rounded-[24px] border p-4 backdrop-blur-xl transition duration-200 ${active ? 'border-emerald-300/18 bg-emerald-300/8' : 'border-white/6 bg-white/[0.04] hover:bg-white/[0.06]'}`}
                  >
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_42%)] opacity-80" />
                    <div className="relative flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/6 bg-white/[0.05] text-zinc-100 backdrop-blur-xl">
                        {SKILL_ICONS[skill.id]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold tracking-tight text-white">{skill.label}</div>
                          {recommended ? (
                            <span className="rounded-full border border-white/8 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
                              Recommended
                            </span>
                          ) : null}
                          {'permissionLabel' in skill ? (
                            <span className="rounded-full border border-white/8 bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              {skill.permissionLabel}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">{skill.description}</p>
                        <button
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${active ? 'border-emerald-300/20 bg-emerald-300/12 text-emerald-100' : 'border-white/8 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]'}`}
                        >
                          {active ? 'Installed' : 'Install'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1">One click install</span>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1">Owner visible</span>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1">Approval aware</span>
              <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1">Bible + tool policy</span>
            </div>
          </div>
        </section>

        <div className="relative grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <section className="relative overflow-hidden rounded-[28px] border border-white/5 bg-zinc-900/65 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_55%)]" />
            <div className="relative space-y-4">
              <div className="flex items-start gap-3">
                <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                  <BookText size={18} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold tracking-tight text-white">Agent Bible</h2>
                  <p className="text-sm leading-6 text-zinc-400">
                    Edit the hard context and operational policy Sage drafted for this agent. Customer Mode reads this draft directly when simulating behavior.
                  </p>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    {draftedPrompt ? 'Drafted by Sage from your creation brief' : 'Owner-authored instructions'}
                  </div>
                </div>
              </div>

              <textarea
                value={bibleDraft}
                onChange={(event) => setBibleDraft(event.target.value)}
                spellCheck={false}
                className="min-h-[280px] w-full rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-500"
                placeholder="Mission&#10;Hard Context&#10;Operational Policy&#10;..."
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  {isDraftInstall
                    ? bibleSavedAt
                      ? 'Saved to local draft'
                      : 'Draft agent changes save locally'
                    : 'Installed agent persistence arrives in a later phase'}
                </div>
                <button
                  type="button"
                  onClick={saveBible}
                  disabled={!isDraftInstall || bibleDraft.trim() === draftedBible}
                  className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Save Bible
                </button>
              </div>
            </div>
          </section>
          <section className="relative overflow-hidden rounded-[28px] border border-white/5 bg-zinc-900/65 p-5 shadow-[0_22px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_40%),linear-gradient(180deg,rgba(96,165,250,0.05),transparent_55%)]" />
            <div className="relative space-y-4">
              <div className="flex items-start gap-3">
                <div className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                  <ShieldCheck size={18} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-base font-semibold tracking-tight text-white">Manifest contract</h2>
                  <p className="text-sm leading-6 text-zinc-400">
                    The Universal Harness reads this manifest, not a custom codepath. Bible, channels, skill bindings, and reflection policy all live here.
                  </p>
                </div>
              </div>

              <pre className="overflow-x-auto rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-xs leading-6 text-zinc-300">
                {JSON.stringify(manifest, null, 2)}
              </pre>
            </div>
          </section>
          <PanelCard
            icon={<Cable size={18} />}
            title="Tools and routing"
            body="Connectors, inboxes, and file scopes remain secondary to the manifest. Skills are the only capabilities the harness can load at runtime."
            meta="Manifest-gated capability lane"
          />
        </div>
        <div className="space-y-4">
          <PanelCard
            icon={<Activity size={18} />}
            title="Metrics"
            body="Resolution rate, approval frequency, conversion quality, and handoff health will surface here once the owner telemetry cards are wired."
            meta="Customer-safe analytics lane"
          />
          <PanelCard
            icon={<PhoneCall size={18} />}
            title="Endpoints"
            body="Phone number, WhatsApp, Telegram, and email bindings will be managed in this card. The owner can see exactly where this agent is reachable."
            meta="Multi-modal channel routing"
          />
        </div>
      </div>
      </div>
    </div>
  );
}
