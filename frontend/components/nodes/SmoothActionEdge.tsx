'use client';

import { memo, useMemo } from 'react';
import { BaseEdge, Position, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';

export type SmoothActionEdgeData = {
    onAdd?: (edgeId: string, point: { x: number; y: number }) => void;
    onDelete?: (edgeId: string) => void;
};

function SmoothActionEdgeComponent({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Right,
    targetPosition = Position.Left,
}: EdgeProps<Edge<SmoothActionEdgeData>>) {
    const [path] = useMemo(
        () =>
            getBezierPath({
                sourceX,
                sourceY,
                targetX,
                targetY,
                sourcePosition: sourcePosition ?? Position.Right,
                targetPosition: targetPosition ?? Position.Left,
            }),
        [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition],
    );

    return (
        <>
            <BaseEdge
                path={path}
                interactionWidth={28}
                style={{
                    stroke: 'rgba(138, 138, 132, 0.32)',
                    strokeWidth: 1.75,
                    strokeLinecap: 'round',
                }}
            />

            <style jsx>{`
                :global(.react-flow__edge-path) {
                    filter: none;
                }
            `}</style>
        </>
    );
}

const SmoothActionEdge = memo(SmoothActionEdgeComponent);

export default SmoothActionEdge;
