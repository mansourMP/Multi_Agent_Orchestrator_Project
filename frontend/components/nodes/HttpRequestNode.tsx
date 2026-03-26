'use client';

import { memo } from 'react';
import { Globe } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type HttpRequestNodeData = {
    label?: string;
    method?: string;
    url?: string;
    status?: string;
    executionSummary?: string;
};

const HttpRequestNode = ({ data, selected }: { data: HttpRequestNodeData; selected?: boolean }) => {
    const method = String(data.method || 'GET').trim().toUpperCase() || 'GET';
    const url = String(data.url || '').trim();
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();
    const subtitle = executionSummary || (url ? `${method} ${url}` : `${method} https://api.example.com`);

    return (
        <StandardCanvasNode
            kindLabel="HTTP Request"
            title={data.label || 'HTTP Request'}
            subtitle={subtitle}
            accentColor="#6b7280"
            icon={<Globe size={20} strokeWidth={1.8} />}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : null}
            status={status}
        />
    );
};

export default memo(HttpRequestNode);
