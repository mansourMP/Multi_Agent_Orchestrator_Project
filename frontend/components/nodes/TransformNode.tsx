'use client';

import { memo } from 'react';
import { Shuffle } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type TransformNodeData = {
    label?: string;
    mapping?: string;
    status?: string;
    executionSummary?: string;
};

const TransformNode = ({ data, selected }: { data: TransformNodeData; selected?: boolean }) => {
    const mapping = String(data.mapping || '').trim() || 'Map fields and reshape data';
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();

    return (
        <StandardCanvasNode
            kindLabel="Transform"
            title={data.label || 'Transform'}
            subtitle={executionSummary || mapping}
            accentColor="#3b82f6"
            icon={<Shuffle size={20} strokeWidth={1.8} />}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : null}
            status={status}
        />
    );
};

export default memo(TransformNode);
