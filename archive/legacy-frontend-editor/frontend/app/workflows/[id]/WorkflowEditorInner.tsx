'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { getWorkflow, updateWorkflow, runWorkflow, publishWorkflow } from '@/lib/api';
import dynamic from 'next/dynamic';

const WorkflowCanvas = dynamic(() => import('@/components/WorkflowCanvas'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full">Loading Canvas...</div>
});

import QuickConnectMenu from '@/components/QuickConnectMenu';
import ExecutionStatusBar from '@/components/ExecutionStatusBar';
import { ResourceCore } from '@/components/ResourceCore';
import { LiveIntelFeed, IntelLog } from '@/components/LiveIntelFeed';
import { KeyboardShortcutsModal, useKeyboardShortcuts } from '@/components/KeyboardShortcuts';
import {
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    ReactFlowProvider,
    useReactFlow,
    useViewport
} from '@xyflow/react';
import { ArrowLeft, Save, Play, Activity, X, Zap, ChevronRight, Settings2, Home } from 'lucide-react';
import Link from 'next/link';
import NodePalette from '@/components/NodePalette';
import NodePropertiesPanel from '@/components/NodePropertiesPanel';
import { useExecutionSocket } from '@/hooks/useExecutionSocket';
import { useToast } from '@/components/Toast';
import { useParams } from 'next/navigation';

interface WorkflowEditorInnerProps {
    workflowId?: string;
}

export default function WorkflowEditorWrapper({ workflowId }: WorkflowEditorInnerProps) {
    return (
        <ReactFlowProvider>
            <WorkflowEditor workflowId={workflowId} />
        </ReactFlowProvider>
    );
}

function WorkflowEditor({ workflowId }: WorkflowEditorInnerProps) {
    const params = useParams();
    const id = workflowId ?? (params?.id as string);
    const [loading, setLoading] = useState(true);
    const [workflow, setWorkflow] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    // React Flow State
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const { screenToFlowPosition } = useReactFlow();
    
    // UI State
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const [lastExecutionId, setLastExecutionId] = useState<string | null>(null);
    const [isWaiting, setIsWaiting] = useState(false);
    const [executionStartTime, setExecutionStartTime] = useState<Date | null>(null);
    const [completedNodes, setCompletedNodes] = useState(0);

    // Result Inspector State
    const [nodeResults, setNodeResults] = useState<Record<string, any>>({});

    // Toast notifications
    const { addToast } = useToast();

    // Parse logs for Intel Feed
    const intelLogs: IntelLog[] = logs.map((log, index) => {
        const isError = log.includes('Error') || log.includes('Failed');
        const isThought = log.includes('//') || log.includes('Analyzing') || log.includes('Thinking');
        const isSuccess = log.includes('Complete') || log.includes('Success');

        return {
            id: `log-${index}`,
            agentName: 'SYSTEM',
            message: log,
            timestamp: new Date(),
            type: isError ? 'error' : isThought ? 'thought' : isSuccess ? 'success' : 'info'
        };
    });

    // Calculate simulated cost
    const currentCost = running && executionStartTime
        ? (new Date().getTime() - executionStartTime.getTime()) / 1000 * 0.005
        : 0;

    // Keyboard shortcuts
    const keyboardShortcuts = useKeyboardShortcuts();

    // WebSocket for real-time logs
    const { isConnected, subscribe } = useExecutionSocket({
        executionId: lastExecutionId || undefined,
        onLog: (data) => {
            setLogs(prev => [...prev, data.log]);
        },
        onStatus: (data) => {
            if (data.status === 'waiting') {
                setIsWaiting(true);
                setRunning(false);
                addToast({ type: 'warning', title: 'Approval Required', message: 'Workflow is waiting for human approval' });
            } else if (data.status === 'node_execution_result') {
                const { nodeId, output } = data.data;
                setNodeResults(prev => ({ ...prev, [nodeId]: output }));
            }
        },
        onComplete: (data) => {
            setRunning(false);
            if (data.result.status === 'success') {
                addToast({ type: 'success', title: 'Execution Complete', message: 'Workflow finished successfully' });
            } else {
                addToast({ type: 'error', title: 'Execution Failed', message: 'Workflow encountered an error' });
            }
        },
    });

    useEffect(() => {
        if (id) {
            loadWorkflow(id);
        }
    }, [id]);

    async function loadWorkflow(wfId: string) {
        try {
            setLoading(true);
            const data = await getWorkflow(wfId);
            setWorkflow(data);

            const initialNodes = data.definition?.nodes || [];
            const initialEdges = data.definition?.edges || [];
            setNodes(initialNodes);
            setEdges(initialEdges);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    const [menu, setMenu] = useState<{ x: number, y: number, sourceNodeId: string } | null>(null);

    async function handleSave() {
        try {
            setSaving(true);
            const definition = { nodes, edges };
            await updateWorkflow(id!, definition);
            setWorkflow((prev: any) => ({ ...prev, definition }));
            addToast({ type: 'success', title: 'Saved', message: 'Workflow saved successfully' });
        } catch (err) {
            console.error(err);
            addToast({ type: 'error', title: 'Save Failed', message: 'Could not save workflow' });
        } finally {
            setSaving(false);
        }
    }

    async function handleRun() {
        try {
            setRunning(true);
            setIsWaiting(false);
            setLogs([]);
            setExecutionStartTime(new Date());
            setCompletedNodes(0);
            addToast({ type: 'info', title: 'Executing', message: 'Starting workflow execution...' });

            const currentDefinition = { nodes, edges };
            await updateWorkflow(id!, currentDefinition);

            const res = await runWorkflow(id!);
            setLastExecutionId(res.executionId);

            if (res.executionId) {
                subscribe(res.executionId);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `Error: ${err.message || 'Failed to start execution.'}`]);
            addToast({ type: 'error', title: 'Execution Failed', message: err.message || 'Could not start workflow' });
            setRunning(false);
        }
    }

    if (loading) return (
        <div style={{ padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Activity className="animate-spin" style={{ color: '#ff6d5a' }} />
        </div>
    );

    if (!workflow) return <div style={{ padding: '40px', textAlign: 'center' }}>Workflow not found.</div>;

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>

            <KeyboardShortcutsModal
                isOpen={keyboardShortcuts.isOpen}
                onClose={keyboardShortcuts.close}
            />

            <div style={{
                height: '42px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                background: 'var(--bg-app)',
                zIndex: 20
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link
                        href="/workflows"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            color: 'var(--text-secondary)',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
                            borderRadius: '4px'
                        }}
                        className='hover:bg-[var(--bg-hover)]'
                    >
                        <ArrowLeft size={16} />
                    </Link>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        color: 'var(--text-tertiary)'
                    }}>
                        <Link href="/" style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                            <Home size={12} />
                        </Link>
                        <ChevronRight size={12} />
                        <Link href="/workflows" style={{ color: 'var(--text-tertiary)' }}>
                            Workflows
                        </Link>
                        <ChevronRight size={12} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {workflow.name}
                        </span>
                        <span className={`badge ${workflow.status === 'published' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '9px', padding: '2px 6px', height: 'auto', marginLeft: '4px' }}>
                            {workflow.status === 'published' ? 'ACTIVE' : 'DRAFT'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-ghost" title="Settings">
                        <Settings2 size={16} />
                    </button>

                    <div style={{ width: '1px', background: 'var(--border-subtle)', margin: '0 4px', height: '24px' }} />

                    <button
                        className="btn btn-secondary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? <Activity size={14} className="animate-spin" /> : <Save size={14} />}
                        <span>Save</span>
                    </button>

                    <button
                        className="btn btn-primary"
                        onClick={handleRun}
                        disabled={running}
                    >
                        {running ? <Activity size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                        <span>Execute</span>
                    </button>

                    <button
                        className="btn btn-primary"
                        onClick={async () => {
                            try {
                                setSaving(true);
                                await handleSave();
                                await publishWorkflow(id!);
                                alert('Workflow Activated Successfully');
                            } catch (err) {
                                alert('Activation failed.');
                            } finally {
                                setSaving(false);
                            }
                        }}
                        disabled={saving}
                        style={{ background: '#fff', color: '#000', border: 'none' }}
                    >
                        <Zap size={14} fill="currentColor" />
                        <span>Deploy</span>
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 10 }}>
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    <NodePalette />

                    <div style={{ flex: 1, position: 'relative' }}>
                        <WorkflowCanvas
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={() => {}}
                            onSave={handleSave}
                            onNodeSelect={setSelectedNode}
                            onDrop={() => {}}
                            onConnectStart={() => {}}
                            onConnectEnd={() => {}}
                        />

                        <ResourceCore
                            currentCost={currentCost}
                            dailyLimit={10.00}
                        />

                        <LiveIntelFeed logs={intelLogs} />

                        {menu && (
                            <QuickConnectMenu
                                x={menu.x}
                                y={menu.y}
                                onSelect={() => {}}
                                onClose={() => setMenu(null)}
                            />
                        )}
                    </div>

                    {selectedNode ? (
                        <NodePropertiesPanel
                            node={selectedNode}
                            onUpdate={() => {}}
                            onDelete={() => {}}
                            onClose={() => setSelectedNode(null)}
                        />
                    ) : logs.length > 0 && (
                        <div style={{
                            width: '400px',
                            borderLeft: '1px solid var(--border-subtle)',
                            display: 'flex',
                            flexDirection: 'column',
                            background: 'var(--bg-surface)',
                            zIndex: 20,
                            boxShadow: '-4px 0 16px rgba(0,0,0,0.2)'
                        }}>
                            <div style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--border-subtle)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'var(--bg-surface)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Activity size={14} color="#ff6d5a" />
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Execution Output</span>
                                </div>
                                <button onClick={() => setLogs([])} className="btn-ghost" style={{ padding: '4px', height: 'auto' }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '0',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                background: '#131519'
                            }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{
                                        padding: '8px 16px',
                                        borderBottom: '1px solid #2b2d35',
                                        color: log.includes('Error') ? '#ef4444' : '#d1d5db',
                                        lineHeight: 1.5,
                                        wordBreak: 'break-word'
                                    }}>
                                        <span style={{ color: '#6b7280', marginRight: '8px', fontSize: '11px' }}>
                                            {new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                        </span>
                                        {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <ExecutionStatusBar
                    isRunning={running}
                    isWaiting={isWaiting}
                    isConnected={isConnected}
                    executionId={lastExecutionId}
                    startTime={executionStartTime}
                    nodeCount={nodes.length}
                    completedNodes={completedNodes}
                />
            </div>
        </div>
    );
}
