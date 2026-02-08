import WorkflowEditorToggle from './workflow-editor-toggle';

export default async function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div style={{ minHeight: '100vh' }}>
            <WorkflowEditorToggle workflowId={id} />
        </div>
    );
}
