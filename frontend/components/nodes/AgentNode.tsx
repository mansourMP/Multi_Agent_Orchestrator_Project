'use client';

import { memo } from 'react';
import { BrainCircuit } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type AgentNodeData = {
    duty?: string;
    status?: string;
    label?: string;
    modelId?: string;
    description?: string;
};

const AgentNode = ({ data, selected }: { data: AgentNodeData; selected?: boolean }) => {
    const accentColor = '#7c3aed';
    const status = String(data.status || 'ready').trim().toUpperCase();
    const summary = [String(data.modelId || 'gpt-4.1').trim(), String(data.description || data.duty || 'Autonomous reasoning').trim()]
        .filter(Boolean)
        .join(' · ');

    return (
        <StandardCanvasNode
            kindLabel="Agent"
            title={data.label || 'AI Agent'}
            subtitle={summary}
            accentColor={accentColor}
            icon={<BrainCircuit size={21} strokeWidth={1.85} />}
            selected={selected}
            badge={status}
            status={String(data.status || '').trim().toLowerCase()}
        />
    );
};

export default memo(AgentNode);
