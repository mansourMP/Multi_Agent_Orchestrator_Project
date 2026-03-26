'use client';

import { memo } from 'react';
import { Code2 } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type CodeNodeData = {
    label?: string;
    summary?: string;
    status?: string;
    executionSummary?: string;
};

const CodeNode = ({ data, selected }: { data: CodeNodeData; selected?: boolean }) => {
    const summary = String(data.summary || '').trim() || 'Run custom logic';
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();

    return (
        <StandardCanvasNode
            kindLabel="Code"
            title={data.label || 'Code'}
            subtitle={executionSummary || summary}
            accentColor="#1f2937"
            icon={<Code2 size={20} strokeWidth={1.8} />}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : null}
            status={status}
        />
    );
};

export default memo(CodeNode);
