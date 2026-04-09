'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentsWorkspace } from './AgentsWorkspaceContext';
import { SagePinnedCard } from './SagePinnedCard';
import { ChannelListItem } from './ChannelListItem';

function ChannelRailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 rounded-[28px] bg-white/6" />
      <Skeleton className="h-24 rounded-[24px] bg-white/6" />
      <Skeleton className="h-24 rounded-[24px] bg-white/6" />
      <Skeleton className="h-24 rounded-[24px] bg-white/6" />
    </div>
  );
}

export function ChannelRail() {
  const router = useRouter();
  const pathname = usePathname();
  const { channels, items, loading, error, forgeName, setForgeName } = useAgentsWorkspace();
  const [composerOpen, setComposerOpen] = useState(false);
  const showCreationRail = !loading && items.length === 0;

  const activeId = useMemo(() => {
    const match = pathname.match(/^\/agents\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  return (
    <aside className="relative overflow-hidden rounded-[32px] border border-white/5 border-r-white/5 bg-zinc-900/40 text-zinc-50 shadow-[0_32px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.06),transparent_26%)]" />
      <div className="relative border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Channel Rail
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-white">
              Agents
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.04] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            <MessageSquare size={16} />
          </div>
        </div>
      </div>

      <div className="relative max-h-[calc(100vh-180px)] overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          <SagePinnedCard />
          {loading ? <ChannelRailSkeleton /> : null}
          {!loading && error ? (
            <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100 backdrop-blur-xl">
              {error}
            </div>
          ) : null}
          {showCreationRail ? (
            <div className="space-y-3 rounded-[28px] border border-white/5 bg-white/[0.03] p-3 backdrop-blur-2xl">
              <div className="px-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                  Creation rail
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Name the next agent here, then finish it in the Forge. Blueprint import also stays inside that same birth path.
                </p>
              </div>
              {!composerOpen ? (
                <Button
                  variant="secondary"
                  onClick={() => setComposerOpen(true)}
                  className="w-full rounded-[22px] border border-white/8 bg-white/[0.06] py-6 text-sm font-semibold text-zinc-100 hover:bg-white/[0.1]"
                >
                  <Plus size={15} />
                  Create New Agent
                </Button>
              ) : (
                <div className="rounded-[24px] border border-white/5 bg-zinc-900/48 p-4 backdrop-blur-2xl">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Name your Agent
                  </label>
                  <input
                    value={forgeName}
                    onChange={(event) => setForgeName(event.target.value)}
                    placeholder="Inventory Copilot"
                    className="mt-3 h-12 w-full rounded-2xl border border-white/8 bg-white/[0.05] px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/14 focus:bg-white/[0.08]"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!forgeName.trim()}
                      onClick={() => {
                        router.push('/agents');
                        setComposerOpen(false);
                      }}
                      className="rounded-full border border-white/8 bg-white/[0.08] text-zinc-100 hover:bg-white/[0.12]"
                    >
                      Continue in Forge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setComposerOpen(false)}
                      className="rounded-full"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
              {channels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  active={activeId === channel.id}
                />
              ))}
            </div>
          ) : null}
          {!loading && !error && !showCreationRail ? channels.map((channel) => (
            <ChannelListItem
              key={channel.id}
              channel={channel}
              active={activeId === channel.id}
            />
          )) : null}
        </div>
      </div>
    </aside>
  );
}
