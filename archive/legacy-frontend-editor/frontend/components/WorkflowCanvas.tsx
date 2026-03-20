'use client';

import React, { useCallback } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    BackgroundVariant,
    Connection,
    Edge,
    Node,
    MiniMap,
    Panel,
    useViewport
} from '@xyflow/react';

import AgentNode from './nodes/AgentNode';
import TriggerNode from './nodes/TriggerNode';
import ToolNode from './nodes/ToolNode';
import LogicNode from './nodes/LogicNode';
import ApprovalNode from './nodes/ApprovalNode';
import ParallelNode from './nodes/ParallelNode';
import VisionNode from './nodes/VisionNode';
import CodingNode from './nodes/CodingNode';
import ResearchNode from './nodes/ResearchNode';
import SquadNode from './nodes/SquadNode';

const nodeTypes = {
    trigger: TriggerNode,
    agent: AgentNode,
    tool: ToolNode,
    logic: LogicNode,
    approval: ApprovalNode,
    parallel: ParallelNode,
    vision: VisionNode,
    coding: CodingNode,
    research: ResearchNode,
    squad: SquadNode
};

interface WorkflowCanvasProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onConnect: (connection: Connection) => void;
    onSave?: (nodes: Node[], edges: Edge[]) => void;
    onNodeSelect?: (node: Node | null) => void;
    onDrop?: (event: React.DragEvent) => void;
    onInit?: (instance: any) => void;
    onConnectStart?: (event: any, params: any) => void;
    onConnectEnd?: (event: any) => void;
}

// Zoom indicator component
function ZoomIndicator() {
    const { zoom } = useViewport();
    const zoomPercent = Math.round(zoom * 100);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            background: '#12151c',
            border: '1px solid #1f2430',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#aeb7c8',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 8px 16px -10px rgba(0,0,0,0.6)'
        }}>
            <span style={{ color: '#7b8497' }}>Zoom:</span>
            <span style={{ fontWeight: 700, color: '#e8ecf4', minWidth: '36px' }}>
                {zoomPercent}%
            </span>
        </div>
    );
}

export default function WorkflowCanvas({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeSelect,
    onDrop,
    onInit,
    onConnectStart,
    onConnectEnd
}: WorkflowCanvasProps) {

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        onNodeSelect?.(node);
    }, [onNodeSelect]);

    const onPaneClick = useCallback(() => {
        onNodeSelect?.(null);
    }, [onNodeSelect]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    return (
        <div style={{ height: '100%', width: '100%', minHeight: '720px', background: '#0c0e14' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onInit={onInit}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[20, 20]}
                defaultEdgeOptions={{
                    animated: false,
                    type: 'smoothstep',
                    style: { stroke: '#2c3342', strokeWidth: 2 }
                }}
                minZoom={0.2}
                maxZoom={2}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="#1f2430"
                    style={{ backgroundColor: '#0c0e14' }}
                />

                {/* Zoom Indicator */}
                <Panel position="top-right">
                    <ZoomIndicator />
                </Panel>

                <Controls
                    showInteractive={false}
                    position="bottom-right"
                    style={{
                        backgroundColor: '#12151c',
                        border: '1px solid #1f2430',
                        borderRadius: '8px',
                        color: '#aeb7c8',
                        boxShadow: '0 8px 16px -10px rgba(0, 0, 0, 0.6)',
                        padding: 4
                    }}
                />

                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case 'trigger': return '#f59e0b';
                            case 'agent': return '#3b82f6';
                            case 'tool': return '#10b981';
                            case 'logic': return '#8b5cf6';
                            case 'approval': return '#22c55e';
                            default: return '#64748b';
                        }
                    }}
                    position="bottom-left"
                    style={{
                        background: '#12151c',
                        border: '1px solid #1f2430',
                        borderRadius: '8px',
                        boxShadow: '0 8px 16px -10px rgba(0,0,0,0.6)'
                    }}
                    maskColor="rgba(12, 14, 20, 0.7)"
                />
            </ReactFlow>
        </div>
    );
}
