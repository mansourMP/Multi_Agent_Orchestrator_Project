import { pageShellStyle } from '@/design-constraints';
import WorkflowEditorToggle from './workflow-editor-toggle';

export default async function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return (
        <div style={{ ...pageShellStyle(), maxWidth: '100%', padding: 0 }}>
            <WorkflowEditorToggle workflowId={id} />
        </div>
    );
}
