'use client';

import { AgentsWorkspaceProvider } from '@/components/orion/agents/AgentsWorkspaceContext';
import { ChannelRail } from '@/components/orion/agents/ChannelRail';

export function AgentsLayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <AgentsWorkspaceProvider>
      <div className="min-h-full bg-zinc-950 px-4 py-4 text-zinc-50 md:px-6">
        <div className="grid min-h-[calc(100vh-112px)] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-4 xl:self-start">
            <ChannelRail />
          </div>
          <div className="min-w-0">
            {children}
          </div>
        </div>
      </div>
    </AgentsWorkspaceProvider>
  );
}

