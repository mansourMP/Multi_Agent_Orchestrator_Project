'use client';
import { useEffect, useState } from 'react';
import { Zap, Clock, CheckCircle2, XCircle, AlertCircle, Activity, Filter, RefreshCw, MoreHorizontal, Download } from 'lucide-react';
import { fetchExecutions, fetchExecution } from '@/lib/api';

export default function ExecutionsPage() {
    const [executions, setExecutions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedExecution, setSelectedExecution] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        loadExecutions();
    }, []);

    async function loadExecutions() {
        try {
            setLoading(true);
            const data = await fetchExecutions();
            setExecutions(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function openExecutionDetail(executionId: string) {
        try {
            setDetailLoading(true);
            const detail = await fetchExecution(executionId);
            setSelectedExecution(detail);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    }

    const exportExecution = () => {
        if (!selectedExecution) return;
        const blob = new Blob([JSON.stringify(selectedExecution, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `execution-${selectedExecution.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const getTokenSummary = () => {
        const logs: string[] = selectedExecution?.output?.logs || selectedExecution?.logs || [];
        let total = 0;
        logs.forEach((log) => {
            const match = log.match(/TOKENS:.*total=(\\d+)/);
            if (match) total += Number(match[1]);
        });
        return total;
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'success': return { color: '#10b981', label: 'Success' };
            case 'failed': return { color: '#ef4444', label: 'Failed' };
            case 'running': return { color: '#3b82f6', label: 'Running' };
            default: return { color: 'var(--text-tertiary)', label: status };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                            <Activity size={20} />
                        </div>
                        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Executions</h1>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Trace and debug your autonomous agent operations.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" onClick={loadExecutions} style={{ borderRadius: '8px' }}>
                        <RefreshCw size={16} />
                        <span>Refresh</span>
                    </button>
                    <button className="btn btn-secondary" style={{ borderRadius: '8px' }}>
                        <Filter size={16} />
                        <span>Filter</span>
                    </button>
                </div>
            </div>

            {/* Table Card */}
            <div className="card" style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 500 }}>Loading history...</div>
                ) : executions.length === 0 ? (
                    <div style={{ padding: '100px 0', textAlign: 'center' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                            <Zap size={28} />
                        </div>
                        <h3 style={{ marginBottom: '8px', fontSize: '18px' }}>No executions found</h3>
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: '32px' }}>When your workflows run, they will appear here.</p>
                    </div>
                ) : (
                    <table className="table">
                        <thead style={{ background: '#f8fafc' }}>
                            <tr>
                                <th style={{ paddingLeft: '24px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Workflow</th>
                                <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                                <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Trigger</th>
                                <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Started At</th>
                                <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Duration</th>
                                <th style={{ width: '60px', paddingRight: '24px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {executions.map((ex) => {
                                const status = getStatusConfig(ex.status);
                                return (
                                    <tr key={ex.id} style={{ transition: 'all 0.2s' }} className="hover:bg-[#f8fafc]">
                                        <td style={{ padding: '16px 24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {ex.workflow?.name || 'Untitled Workflow'}
                                        </td>
                                        <td>
                                            <div className="badge" style={{
                                                background: `color-mix(in srgb, ${status.color} 10%, #fff)`,
                                                color: status.color,
                                                gap: '6px',
                                                border: `1px solid color-mix(in srgb, ${status.color} 20%, transparent)`
                                            }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.color }}></div>
                                                {status.label}
                                            </div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            {ex.triggeredBy || 'Manual'}
                                        </td>
                                        <td style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                                            {new Date(ex.createdAt).toLocaleString()}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                            {ex.durationMs ? `${(ex.durationMs / 1000).toFixed(2)}s` : '-'}
                                        </td>
                                        <td style={{ paddingRight: '24px', textAlign: 'right' }}>
                                            <button
                                                className="btn-ghost"
                                                style={{ padding: '8px', borderRadius: '8px' }}
                                                onClick={() => openExecutionDetail(ex.id)}
                                            >
                                                <MoreHorizontal size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {selectedExecution && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(12, 14, 20, 0.65)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 120
                    }}
                    onClick={() => setSelectedExecution(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '720px',
                            maxHeight: '80vh',
                            overflow: 'hidden',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 16,
                            boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Execution Replay</h2>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{selectedExecution.workflow?.name || 'Untitled Workflow'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary" onClick={exportExecution}>
                                    <Download size={14} />
                                    Export JSON
                                </button>
                                <button className="btn" onClick={() => setSelectedExecution(null)}>Close</button>
                            </div>
                        </div>
                        {detailLoading ? (
                            <div style={{ padding: '24px', color: 'var(--text-tertiary)' }}>Loading execution…</div>
                        ) : (
                            <div style={{ overflowY: 'auto', paddingRight: 6 }}>
                                {getTokenSummary() > 0 && (
                                    <div style={{
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: '1px solid var(--border-default)',
                                        background: 'var(--bg-app)',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        marginBottom: 12
                                    }}>
                                        Token Usage (total): {getTokenSummary()}
                                    </div>
                                )}
                                <div style={{ display: 'grid', gap: 12 }}>
                                    {(selectedExecution.steps || []).length === 0 ? (
                                        <div style={{ color: 'var(--text-tertiary)' }}>No execution steps recorded.</div>
                                    ) : (
                                        selectedExecution.steps.map((step: any, index: number) => (
                                            <div key={step.id || index} style={{
                                                borderRadius: 12,
                                                border: '1px solid var(--border-default)',
                                                padding: 12,
                                                background: 'var(--bg-app)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontWeight: 700 }}>{step.nodeType}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                        {step.status || 'unknown'}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                                                    {step.output ? (typeof step.output === 'string' ? step.output : JSON.stringify(step.output)) : 'No output.'}
                                                </div>
                                                {step.toolCalls?.length > 0 && (
                                                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                        Tools: {step.toolCalls.map((tool: any) => tool.toolName).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
