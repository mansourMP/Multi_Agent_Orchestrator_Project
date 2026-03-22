'use client';

import { memo, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, getSmoothStepPath, type Edge, type EdgeProps } from '@xyflow/react';
import { Plus, Trash2 } from 'lucide-react';

const EDGE_PADDING_BOTTOM = 130;
const EDGE_PADDING_X = 40;
const EDGE_BORDER_RADIUS = 16;
const HANDLE_SIZE = 20;

export type SmoothActionEdgeData = {
    onAdd?: (edgeId: string, point: { x: number; y: number }) => void;
    onDelete?: (edgeId: string) => void;
};

function isRightOfSourceHandle(sourceX: number, targetX: number) {
    return sourceX - HANDLE_SIZE > targetX;
}

function getEdgeRenderData(props: Pick<EdgeProps, 'sourceX' | 'sourceY' | 'sourcePosition' | 'targetX' | 'targetY' | 'targetPosition'>) {
    const { targetX, targetY, sourceX, sourceY, targetPosition } = props;
    const isConnectorStraight = sourceY === targetY;

    if (!isRightOfSourceHandle(sourceX, targetX)) {
        const segment = getBezierPath({
            ...props,
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        });
        return {
            segments: [segment],
            labelPosition: [segment[1], segment[2]] as [number, number],
            isConnectorStraight,
        };
    }

    const firstSegmentTargetX = (sourceX + targetX) / 2;
    const firstSegmentTargetY = sourceY + EDGE_PADDING_BOTTOM;
    const firstSegment = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX: firstSegmentTargetX,
        targetY: firstSegmentTargetY,
        sourcePosition: Position.Right,
        targetPosition: Position.Right,
        borderRadius: EDGE_BORDER_RADIUS,
        offset: EDGE_PADDING_X,
    });

    const secondSegment = getSmoothStepPath({
        sourceX: firstSegmentTargetX,
        sourceY: firstSegmentTargetY,
        targetX,
        targetY,
        sourcePosition: Position.Left,
        targetPosition: targetPosition ?? Position.Left,
        borderRadius: EDGE_BORDER_RADIUS,
        offset: EDGE_PADDING_X,
    });

    return {
        segments: [firstSegment, secondSegment],
        labelPosition: [firstSegmentTargetX, firstSegmentTargetY] as [number, number],
        isConnectorStraight,
    };
}

function SmoothActionEdgeComponent({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
}: EdgeProps<Edge<SmoothActionEdgeData>>) {
    const edgeData = (data || {}) as SmoothActionEdgeData;
    const [delayedHovered, setDelayedHovered] = useState(false);
    const delayedHoveredSetTimeoutRef = useRef<number | null>(null);

    const renderData = useMemo(
        () =>
            getEdgeRenderData({
                sourceX,
                sourceY,
                sourcePosition,
                targetX,
                targetY,
                targetPosition,
            }),
        [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition],
    );

    const renderToolbar = delayedHovered;

    const edgeToolbarStyle = {
        transform: `translate(-50%, -50%) translate(${renderData.labelPosition[0]}px, ${renderData.labelPosition[1]}px)`,
    };

    function onHoverStart() {
        if (delayedHoveredSetTimeoutRef.current) window.clearTimeout(delayedHoveredSetTimeoutRef.current);
        setDelayedHovered(true);
    }

    function onHoverEnd() {
        delayedHoveredSetTimeoutRef.current = window.setTimeout(() => {
            setDelayedHovered(false);
        }, 600);
    }

    return (
        <>
            <g
                style={{ ['--canvas-edge--color' as string]: 'var(--canvas-edge--color)' }}
                onMouseEnter={onHoverStart}
                onMouseLeave={onHoverEnd}
            >
                {renderData.segments.map((segment, index) => (
                    <BaseEdge
                        key={segment[0]}
                        id={`${id}-${index}`}
                        path={segment[0]}
                        markerEnd={markerEnd}
                        interactionWidth={40}
                        style={{
                            stroke: 'var(--canvas-edge--color)',
                            strokeWidth: 2,
                            strokeLinecap: 'square',
                        }}
                    />
                ))}
            </g>

            <EdgeLabelRenderer>
                <div
                    style={edgeToolbarStyle}
                    className={`react-flow__edge-label ${renderData.isConnectorStraight ? 'is-straight' : ''}`}
                    onMouseEnter={onHoverStart}
                    onMouseLeave={onHoverEnd}
                >
                    {renderToolbar ? (
                        <div className="canvas-edge-toolbar">
                            <button
                                type="button"
                                className="canvas-edge-toolbar-button"
                                aria-label="Add node"
                                onClick={() => edgeData.onAdd?.(id, { x: renderData.labelPosition[0], y: renderData.labelPosition[1] })}
                            >
                                <Plus size={14} />
                            </button>
                            <button
                                type="button"
                                className="canvas-edge-toolbar-button"
                                aria-label="Delete edge"
                                onClick={() => edgeData.onDelete?.(id)}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ) : null}
                </div>
            </EdgeLabelRenderer>

            <style jsx>{`
                .react-flow__edge-label {
                    position: absolute;
                    pointer-events: all;
                    transform: translateY(-8px);
                }

                .canvas-edge-toolbar {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 8px;
                    padding: 8px;
                    transform: scale(var(--canvas-zoom-compensation-factor, 1));
                }

                .canvas-edge-toolbar-button {
                    width: 24px;
                    height: 24px;
                    border: 0;
                    border-radius: 999px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    color: light-dark(#404040, #e5e5e5);
                    background: light-dark(#e5e5e5, #262626);
                    box-shadow: none;
                }
            `}</style>
        </>
    );
}

const SmoothActionEdge = memo(SmoothActionEdgeComponent);

export default SmoothActionEdge;
