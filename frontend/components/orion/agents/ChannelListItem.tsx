'use client';

import Link from 'next/link';
import { Bot, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentChannelRecord } from './AgentsWorkspaceContext';

function initialLabel(value: string): string {
  const token = String(value || '').trim();
  return token ? token.slice(0, 2).toUpperCase() : 'AG';
}

export function ChannelListItem({
  channel,
  active,
}: {
  channel: AgentChannelRecord;
  active: boolean;
}) {
  return (
    <Link
      href={channel.href}
      className={cn(
        'group relative block overflow-hidden rounded-[24px] border p-3.5 transition duration-200 backdrop-blur-xl',
        active
          ? 'border-emerald-300/20 bg-zinc-900/78 text-white shadow-[0_22px_50px_rgba(0,0,0,0.34)]'
          : 'border-white/5 bg-zinc-900/52 text-zinc-200 hover:border-white/10 hover:bg-zinc-900/60 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]',
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[24px] opacity-70 transition duration-200',
          active
            ? 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(16,185,129,0.08),transparent_55%)]'
            : 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_40%)] group-hover:opacity-100 group-hover:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.07),transparent_44%)]',
        )}
      />
      <div className="pointer-events-none absolute inset-[1px] rounded-[23px] border border-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] opacity-80 transition duration-200 group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <div className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold tracking-[0.12em] backdrop-blur-xl',
          active
            ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
            : 'border-white/5 bg-white/[0.04] text-zinc-200',
        )}>
          {initialLabel(channel.label)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold tracking-tight">
              {channel.label}
            </div>
            {channel.live ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/15 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100 backdrop-blur-xl">
                <Radio size={10} />
                Live
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-zinc-500">
            <span className="rounded-full border border-white/5 bg-white/[0.04] px-2 py-0.5 backdrop-blur-xl">{channel.sourceLabel}</span>
            <span className="rounded-full border border-white/5 bg-white/[0.04] px-2 py-0.5 backdrop-blur-xl">{channel.category}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
            {channel.summary}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Bot size={11} />
              {channel.runtimeLabel}
            </span>
            <span>{channel.statusLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
