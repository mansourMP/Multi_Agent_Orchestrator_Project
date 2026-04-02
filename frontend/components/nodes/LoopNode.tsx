'use client';

import { memo } from 'react';
import { Repeat } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type LoopNodeData = {
    label?: string;
    loopType?: string;
    summary?: string;
    status?: string;
    executionSummary?: string;
};

const LOOP_LABELS: Record<string, string> = {
    for_each: 'For Each',
    while: 'While',
    repeat: 'Repeat',
};

const LoopNode = ({ data, selected }: { data: LoopNodeData; selected?: boolean }) => {
    const loopType = String(data.loopType || 'for_each').trim().toLowerCase();
    const status = String(data.status || '').trim().toLowerCase();
    const summary = String(data.summary || '').trim();
    const executionSummary = String(data.executionSummary || '').trim();
    const title = data.label || LOOP_LABELS[loopType] || 'Loop';
    const subtitle = executionSummary || summary || 'Repeat a sub-workflow';

    return (
        <StandardCanvasNode
            kindLabel="Loop"
            title={title}
            subtitle={subtitle}
            accentColor="#8b5cf6"
            icon={<Repeat size={20} strokeWidth={1.9} />}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : 'LOOP'}
            status={status}
        />
    );
};

export default memo(LoopNode);
