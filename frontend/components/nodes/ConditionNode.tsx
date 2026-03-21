'use client';

import { memo } from 'react';
import { GitBranch } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type ConditionNodeData = {
    label?: string;
    condition?: string;
};

const ConditionNode = ({ data, selected }: { data: ConditionNodeData; selected?: boolean }) => {
    const condition = String(data.condition || '').trim() || 'If condition matches';

    return (
        <StandardCanvasNode
            kindLabel="If / Condition"
            title={data.label || 'Condition'}
            subtitle={condition}
            accentColor="#f59e0b"
            icon={<GitBranch size={20} strokeWidth={1.8} />}
            selected={selected}
        />
    );
};

export default memo(ConditionNode);
