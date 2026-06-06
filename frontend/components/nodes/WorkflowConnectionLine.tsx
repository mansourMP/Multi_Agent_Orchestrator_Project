'use client';

import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react';

export default function WorkflowConnectionLine({
    fromX,
    fromY,
    toX,
    toY,
    fromPosition,
    toPosition,
}: ConnectionLineComponentProps) {
    const [path] = getBezierPath({
        sourceX: fromX,
        sourceY: fromY,
        targetX: toX,
        targetY: toY,
        sourcePosition: fromPosition,
        targetPosition: toPosition,
        curvature: 0.34,
    });

    return (
        <g className="orion-rope-connection-line">
            <path className="orion-rope-connection-line-glow" d={path} fill="none" />
            <path className="orion-rope-connection-line-main" d={path} fill="none" />
        </g>
    );
}
