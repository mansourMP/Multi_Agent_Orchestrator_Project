import { AgentsLayoutShell } from '@/components/orion/agents/AgentsLayoutShell';
import type { ReactNode } from 'react';

type AgentsLayoutProps = {
  children: ReactNode;
};

export default function AgentsLayout({
  children,
}: AgentsLayoutProps) {
  return <AgentsLayoutShell>{children}</AgentsLayoutShell>;
}
