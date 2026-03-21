'use client';

import { memo } from 'react';
import { Shuffle } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type TransformNodeData = {
    label?: string;
    mapping?: string;
};

const TransformNode = ({ data, selected }: { data: TransformNodeData; selected?: boolean }) => {
    const mapping = String(data.mapping || '').trim() || 'Map fields and reshape data';

    return (
        <StandardCanvasNode
            kindLabel="Transform"
            title={data.label || 'Transform'}
            subtitle={mapping}
            accentColor="#3b82f6"
            icon={<Shuffle size={20} strokeWidth={1.8} />}
            selected={selected}
        />
    );
};

export default memo(TransformNode);
