'use client';

import Link from 'next/link';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { AgentModeToggle, type AgentMode } from './AgentModeToggle';
import type { WorkspaceAgentInstallRecord } from '@/lib/api';
import { getRuntimeMode, runtimeModeLabel } from './agentRuntime';

function labelOf(install: WorkspaceAgentInstallRecord): string {
  return String(install.label || install.agent_definition?.name || 'Agent').trim() || 'Agent';
}

function descriptionOf(install: WorkspaceAgentInstallRecord): string {
  return String(install.agent_definition?.description || '').trim()
    || 'Multi-channel specialist with customer-facing conversations and owner supervision.';
}

export function ChannelHeader({
  install,
  mode,
  onModeChange,
}: {
  install: WorkspaceAgentInstallRecord;
  mode: AgentMode;
  onModeChange: (next: AgentMode) => void;
}) {
  return (
    <header className="rounded-[36px] border border-white/5 bg-zinc-900/48 px-7 py-6 text-zinc-50 shadow-[0_32px_84px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <Link href="/agents" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100">
            <ChevronLeft size={14} />
            All channels
          </Link>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Agent Channel
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
              {labelOf(install)}
            </h1>
            <p className="mt-3 max-w-3xl text-[15px] leading-7 text-zinc-300">
              {descriptionOf(install)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="rounded-full border border-white/5 bg-white/[0.05] px-2.5 py-1 backdrop-blur-xl">
              {String(install.agent_definition?.category || 'Operations')}
            </span>
            <span className="rounded-full border border-white/5 bg-white/[0.05] px-2.5 py-1 backdrop-blur-xl">
              {String(install.runtime_profile?.label || '').trim() || runtimeModeLabel(getRuntimeMode(install))}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 backdrop-blur-xl">
              <ShieldCheck size={12} />
              {mode === 'customer' ? 'Simulation lane' : 'Owner control room'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center">
          <AgentModeToggle value={mode} onChange={onModeChange} />
        </div>
      </div>
    </header>
  );
}
