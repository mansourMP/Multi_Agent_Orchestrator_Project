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
    const accentColor = '#8fa6ff';
    const status = String(data.status || 'ready').trim().toUpperCase();
    const model = String(data.modelId || '').trim();
    const description = String(data.description || data.duty || 'Autonomous reasoning').trim();
    const summary = [model, description].filter(Boolean).join(' · ') || 'Agent';

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
