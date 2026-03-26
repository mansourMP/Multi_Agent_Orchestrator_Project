'use client';

import { memo } from 'react';
import { GitBranch } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type ConditionNodeData = {
    label?: string;
    condition?: string;
    status?: string;
    executionSummary?: string;
};

const ConditionNode = ({ data, selected }: { data: ConditionNodeData; selected?: boolean }) => {
    const condition = String(data.condition || '').trim() || 'If condition matches';
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();

    return (
        <StandardCanvasNode
            kindLabel="If / Condition"
            title={data.label || 'Condition'}
            subtitle={executionSummary || condition}
            accentColor="#f59e0b"
            icon={<GitBranch size={20} strokeWidth={1.8} />}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : null}
            status={status}
        />
    );
};

export default memo(ConditionNode);
