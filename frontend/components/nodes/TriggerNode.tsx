'use client';

import { memo } from 'react';
import { Zap } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type TriggerNodeData = {
    label?: string;
    triggerType?: string;
};

const TriggerNode = ({ data, selected }: { data: TriggerNodeData; selected?: boolean }) => {
    const triggerType = String(data.triggerType || 'manual').trim();

    return (
        <StandardCanvasNode
            kindLabel="Trigger"
            title={data.label || 'Start'}
            subtitle={`Starts from ${triggerType}`}
            accentColor="#f59e0b"
            icon={<Zap size={20} strokeWidth={1.9} />}
            selected={selected}
            badge={triggerType.toUpperCase()}
            showTargetHandle={false}
            variant="trigger"
        />
    );
};

export default memo(TriggerNode);
