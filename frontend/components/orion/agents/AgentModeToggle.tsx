'use client';

import { cn } from '@/lib/utils';

export type AgentMode = 'customer' | 'owner';

const MODE_LABELS: Record<AgentMode, string> = {
  customer: 'Customer Mode',
  owner: 'Owner Mode',
};

export function AgentModeToggle({
  value,
  onChange,
}: {
  value: AgentMode;
  onChange: (next: AgentMode) => void;
}) {
  const customerActive = value === 'customer';
  return (
    <div className="relative grid grid-cols-2 rounded-full border border-white/6 bg-zinc-900/55 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-10px_24px_rgba(255,255,255,0.02),0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_12px_30px_rgba(0,0,0,0.22)] backdrop-blur-2xl transition-transform duration-300 ease-out',
          customerActive ? 'translate-x-0' : 'translate-x-[calc(100%+7px)]',
        )}
      />
      {(Object.keys(MODE_LABELS) as AgentMode[]).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={cn(
              'relative z-10 rounded-full px-4 py-2.5 text-sm font-semibold tracking-tight transition duration-200',
              active
                ? 'text-white'
                : 'text-zinc-400 hover:text-zinc-100',
            )}
          >
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
