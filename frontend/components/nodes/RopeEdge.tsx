'use client';

import { getBezierPath, type EdgeProps } from '@xyflow/react';

export default function RopeEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    animated,
}: EdgeProps) {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        curvature: 0.34,
    });

    return (
        <g className={`orion-rope-edge${selected ? ' is-selected' : ''}${animated ? ' is-animated' : ''}`} data-edgeid={id}>
            <path className="orion-rope-edge-hitbox" d={edgePath} fill="none" />
            <path className="orion-rope-edge-glow" d={edgePath} fill="none" />
            <path className="orion-rope-edge-main" d={edgePath} fill="none" />
            {animated ? <path className="orion-rope-edge-flow" d={edgePath} fill="none" /> : null}
        </g>
    );
}
