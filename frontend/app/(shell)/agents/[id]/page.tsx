import { AgentDetailView } from '@/components/orion/agents/AgentDetailView';

export default async function AgentDetailPage({
  params,
}: PageProps<'/agents/[id]'>) {
  const { id } = await params;
  return <AgentDetailView installId={id} />;
}
