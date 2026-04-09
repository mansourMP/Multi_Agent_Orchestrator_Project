import { AgentsLayoutShell } from '@/components/orion/agents/AgentsLayoutShell';

export default function AgentsLayout({
  children,
}: LayoutProps<'/agents'>) {
  return <AgentsLayoutShell>{children}</AgentsLayoutShell>;
}
