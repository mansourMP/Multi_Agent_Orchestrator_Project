'use client';

import { memo } from 'react';
import { Globe } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type HttpRequestNodeData = {
    label?: string;
    method?: string;
    url?: string;
};

const HttpRequestNode = ({ data, selected }: { data: HttpRequestNodeData; selected?: boolean }) => {
    const method = String(data.method || 'GET').trim().toUpperCase() || 'GET';
    const url = String(data.url || '').trim();

    return (
        <StandardCanvasNode
            kindLabel="HTTP Request"
            title={data.label || 'HTTP Request'}
            subtitle={url ? `${method} ${url}` : `${method} https://api.example.com`}
            accentColor="#6b7280"
            icon={<Globe size={20} strokeWidth={1.8} />}
            selected={selected}
        />
    );
};

export default memo(HttpRequestNode);
