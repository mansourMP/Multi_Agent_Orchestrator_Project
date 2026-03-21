'use client';

import { memo } from 'react';
import { Code2 } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type CodeNodeData = {
    label?: string;
    summary?: string;
};

const CodeNode = ({ data, selected }: { data: CodeNodeData; selected?: boolean }) => {
    const summary = String(data.summary || '').trim() || 'Run custom logic';

    return (
        <StandardCanvasNode
            kindLabel="Code"
            title={data.label || 'Code'}
            subtitle={summary}
            accentColor="#1f2937"
            icon={<Code2 size={20} strokeWidth={1.8} />}
            selected={selected}
        />
    );
};

export default memo(CodeNode);
