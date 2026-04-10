import { AgentDetailView } from '@/components/orion/agents/AgentDetailView';

type AgentDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AgentDetailPage({
  params,
}: AgentDetailPageProps) {
  const { id } = await params;
  return <AgentDetailView installId={id} />;
}
