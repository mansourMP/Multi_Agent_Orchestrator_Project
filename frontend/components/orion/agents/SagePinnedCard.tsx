'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function SagePinnedCard() {
  return (
    <Link
      href="/"
      className="group relative block overflow-hidden rounded-[28px] border border-emerald-300/15 bg-zinc-900/65 p-4 text-zinc-50 shadow-[0_28px_72px_rgba(0,0,0,0.42),0_0_0_1px_rgba(16,185,129,0.04)] backdrop-blur-xl transition duration-200 hover:border-emerald-300/30 hover:bg-zinc-900/72"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),transparent_28%,transparent_72%,rgba(59,130,246,0.14)),radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_36%)] opacity-90" />
      <div className="pointer-events-none absolute inset-[1px] rounded-[27px] border border-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/75">
            Master Agent
          </div>
          <div className="text-xl font-semibold tracking-tight text-white">
            Sage
          </div>
          <p className="max-w-[18rem] text-sm leading-6 text-zinc-400">
            Pinned at the top of the system. Global context, approvals, and cross-agent orchestration live here.
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-300/20 bg-white/[0.08] text-emerald-100 shadow-[0_0_28px_rgba(16,185,129,0.16)] backdrop-blur-xl">
          <Sparkles size={16} />
        </div>
      </div>
    </Link>
  );
}
