'use client';

import { useEffect, useState } from 'react';
import { BaseEdge, getSmoothStepPath, type ConnectionLineComponentProps } from '@xyflow/react';

export default function SmoothConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
}: ConnectionLineComponentProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timeout = window.setTimeout(() => setVisible(true), 300);
        return () => window.clearTimeout(timeout);
    }, []);

    const [path] = getSmoothStepPath({
        sourceX: fromX,
        sourceY: fromY,
        sourcePosition: fromPosition,
        targetX: toX,
        targetY: toY,
        targetPosition: toPosition,
        borderRadius: 16,
        offset: 40,
    });

    return (
        <BaseEdge
            path={path}
            style={{
                stroke: 'var(--canvas-edge--color)',
                strokeWidth: 2,
                strokeLinecap: 'square',
                opacity: visible ? 1 : 0,
                transition: 'opacity 300ms ease',
            }}
        />
    );
}
