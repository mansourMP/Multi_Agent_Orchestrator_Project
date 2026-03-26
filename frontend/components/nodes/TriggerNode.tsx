'use client';

import { memo } from 'react';
import { Zap } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type TriggerNodeData = {
    label?: string;
    triggerType?: string;
    status?: string;
    executionSummary?: string;
};

const TriggerNode = ({ data, selected }: { data: TriggerNodeData; selected?: boolean }) => {
    const triggerType = String(data.triggerType || 'manual').trim();
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();
    const subtitle = executionSummary || `Starts from ${triggerType}`;
    const badge = status ? status.replace(/_/g, ' ').toUpperCase() : triggerType.toUpperCase();

    return (
        <StandardCanvasNode
            kindLabel="Trigger"
            title={data.label || 'Manual trigger'}
            subtitle={subtitle}
            accentColor="#53bca7"
            icon={<Zap size={20} strokeWidth={1.9} />}
            selected={selected}
            badge={badge}
            status={status}
            showTargetHandle={false}
            variant="trigger"
        />
    );
};

export default memo(TriggerNode);
