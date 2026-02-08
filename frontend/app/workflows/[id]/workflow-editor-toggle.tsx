'use client';

import WorkflowEditorClient from './WorkflowEditorClient';

interface WorkflowEditorToggleProps {
    workflowId: string;
}

export default function WorkflowEditorToggle({ workflowId }: WorkflowEditorToggleProps) {
    return <WorkflowEditorClient workflowId={workflowId} />;
}
