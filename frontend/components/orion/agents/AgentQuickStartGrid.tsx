'use client';

import type { ReactNode } from 'react';
import { DatabaseZap, MessageSquareText, Wrench } from 'lucide-react';

type QuickStartCard = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
};

export function AgentQuickStartGrid({
  onTestCustomerData,
  onConfigureBible,
  onViewInventoryTool,
}: {
  onTestCustomerData: () => void;
  onConfigureBible: () => void;
  onViewInventoryTool: () => void;
}) {
  const cards: QuickStartCard[] = [
    {
      id: 'test-customer-data',
      title: 'Test with Customer Data',
      description: 'Drop in a real customer-style request and watch how the agent answers before anything is connected.',
      icon: <MessageSquareText size={18} />,
      onClick: onTestCustomerData,
    },
    {
      id: 'configure-bible',
      title: 'Configure Bible',
      description: 'Jump straight into Owner Mode and shape pricing rules, guardrails, and escalation policy.',
      icon: <Wrench size={18} />,
      onClick: onConfigureBible,
    },
    {
      id: 'view-live-inventory-tool',
      title: 'View Live Inventory Tool',
      description: 'Preview the question path that will call live inventory once the tool lane is connected.',
      icon: <DatabaseZap size={18} />,
      onClick: onViewInventoryTool,
    },
  ];

  return (
    <div className="mt-6 grid w-full max-w-4xl gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={card.onClick}
          className="group relative overflow-hidden rounded-[24px] border border-white/6 bg-zinc-900/55 p-4 text-left shadow-[0_18px_48px_rgba(0,0,0,0.26)] backdrop-blur-2xl transition duration-200 hover:border-white/12 hover:bg-zinc-900/68"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(59,130,246,0.08),transparent_72%)] opacity-70 transition duration-200 group-hover:opacity-100" />
          <div className="relative">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.05] text-zinc-100 backdrop-blur-xl">
              {card.icon}
            </div>
            <div className="mt-4 text-base font-semibold tracking-tight text-white">
              {card.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {card.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
