'use client';

import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentsWorkspace } from './AgentsWorkspaceContext';
import { SagePinnedCard } from './SagePinnedCard';
import { ChannelListItem } from './ChannelListItem';

export function MobileChannelHome() {
  const { channels, loading, error, forgeName, setForgeName } = useAgentsWorkspace();

  return (
    <div className="space-y-4">
      <section className="rounded-[32px] border border-white/5 bg-zinc-900/40 px-5 py-5 shadow-[0_28px_72px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Mobile channels
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">
              Your agent stack
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Sage stays pinned at the top. Specialists live below it as chat-first channels you can supervise or test.
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.05] text-zinc-100">
            <Sparkles size={16} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SagePinnedCard />

        <div className="rounded-[28px] border border-white/5 bg-zinc-900/40 p-4 shadow-[0_28px_72px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Specialist channels
              </div>
              <div className="mt-1 text-lg font-semibold tracking-tight text-white">
                Channel-first mobile inbox
              </div>
            </div>
            <Link href="/agents?forge=1">
              <Button
                type="button"
                variant="secondary"
                className="rounded-full border border-white/8 bg-white/[0.08] px-3 text-zinc-100 hover:bg-white/[0.12]"
                onClick={() => {
                  if (forgeName.trim()) return;
                  setForgeName('Untitled Agent');
                }}
              >
                <Plus size={14} />
                Create
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-24 rounded-[24px] bg-white/6" />
              <Skeleton className="h-24 rounded-[24px] bg-white/6" />
              <Skeleton className="h-24 rounded-[24px] bg-white/6" />
            </div>
          ) : error ? (
            <div className="mt-4 rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {error}
            </div>
          ) : channels.length === 0 ? (
            <div className="mt-4 rounded-[24px] border border-white/6 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300">
              No specialists yet. Create one from the Forge and it will appear here as a mobile channel.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {channels.map((channel) => (
                <ChannelListItem key={channel.id} channel={channel} active={false} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
