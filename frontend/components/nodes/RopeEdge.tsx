'use client';

import { getSmoothStepPath, type EdgeProps } from '@xyflow/react';

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
    const markerId = `rope-arrow-${id}`;
    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 18,
        offset: 18,
    });

    return (
        <g className={`orion-rope-edge${selected ? ' is-selected' : ''}${animated ? ' is-animated' : ''}`} data-edgeid={id}>
            <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="#7c3aed" />
                </marker>
            </defs>
            <path className="orion-rope-edge-hitbox" d={edgePath} fill="none" />
            <path className="orion-rope-edge-main" d={edgePath} fill="none" markerEnd={`url(#${markerId})`} />
            {animated ? <path className="orion-rope-edge-flow" d={edgePath} fill="none" markerEnd={`url(#${markerId})`} /> : null}
        </g>
    );
}
