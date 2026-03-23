import BuilderCanvasPage from '@/components/builder/BuilderCanvasPage';

export default async function ExistingBuilderCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuilderCanvasPage workflowId={id} />;
}
