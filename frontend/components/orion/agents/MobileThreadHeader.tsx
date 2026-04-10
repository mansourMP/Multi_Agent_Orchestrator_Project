'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, EllipsisVertical, Paperclip, ShieldCheck } from 'lucide-react';
import type { WorkspaceAgentInstallRecord } from '@/lib/api';
import { AgentModeToggle, type AgentMode } from './AgentModeToggle';
import { getRuntimeMode, runtimeModeLabel } from './agentRuntime';

function labelOf(install: WorkspaceAgentInstallRecord): string {
  return String(install.label || install.agent_definition?.name || 'Agent').trim() || 'Agent';
}

export function MobileThreadHeader({
  install,
  mode,
  onModeChange,
  onUpload,
}: {
  install: WorkspaceAgentInstallRecord;
  mode: AgentMode;
  onModeChange: (next: AgentMode) => void;
  onUpload: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const runtimeLabel = String(install.runtime_profile?.label || '').trim() || runtimeModeLabel(getRuntimeMode(install));

  return (
    <header className="rounded-[32px] border border-white/5 bg-zinc-900/40 px-4 py-4 text-zinc-50 shadow-[0_28px_72px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/agents" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-100">
            <ChevronLeft size={14} />
            Channels
          </Link>
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Specialist thread
            </div>
            <h1 className="mt-2 truncate text-3xl font-semibold tracking-[-0.04em] text-white">
              {labelOf(install)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-white/5 bg-white/[0.05] px-2.5 py-1 backdrop-blur-xl">
                {String(install.agent_definition?.category || 'Operations')}
              </span>
              <span className="rounded-full border border-white/5 bg-white/[0.05] px-2.5 py-1 backdrop-blur-xl">
                {runtimeLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 backdrop-blur-xl">
                <ShieldCheck size={12} />
                {mode === 'customer' ? 'Customer View' : 'Owner'}
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onUpload}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.06] text-zinc-100 backdrop-blur-xl"
            aria-label="Upload or add"
          >
            <Paperclip size={16} />
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.06] text-zinc-100 backdrop-blur-xl"
            aria-label="Options"
          >
            <EllipsisVertical size={16} />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-12 z-20 min-w-[180px] rounded-[20px] border border-white/8 bg-zinc-900/85 p-2 shadow-[0_20px_50px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
              <button
                type="button"
                onClick={() => {
                  onModeChange('owner');
                  setMenuOpen(false);
                }}
                className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-zinc-100 transition hover:bg-white/[0.08]"
              >
                Open Owner
              </button>
              <button
                type="button"
                onClick={() => {
                  onModeChange('customer');
                  setMenuOpen(false);
                }}
                className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-zinc-100 transition hover:bg-white/[0.08]"
              >
                Open Customer View
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <AgentModeToggle value={mode} onChange={onModeChange} />
      </div>
    </header>
  );
}
