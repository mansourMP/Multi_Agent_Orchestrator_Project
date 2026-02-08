'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getWorkflow } from '@/lib/api';

interface WorkflowEditorInnerLiteProps {
    workflowId?: string;
}

interface WorkflowRecord {
    id: string;
    name: string;
    description?: string;
    status?: string;
    updatedAt?: string;
}

export default function WorkflowEditorInnerLite({ workflowId }: WorkflowEditorInnerLiteProps) {
    const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!workflowId) return;
        setLoading(true);
        setError(null);
        getWorkflow(workflowId)
            .then((data) => setWorkflow(data))
            .catch((err) => setError(err?.message || 'Failed to load workflow'))
            .finally(() => setLoading(false));
    }, [workflowId]);

    return (
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link href="/workflows" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ← Back to Workflows
                </Link>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>
                    Lite viewer (canvas temporarily disabled)
                </span>
            </div>

            {loading && (
                <div style={{ padding: '24px', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
                    Loading workflow...
                </div>
            )}

            {error && (
                <div style={{
                    padding: '16px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    background: 'rgba(239, 68, 68, 0.05)',
                    borderRadius: '12px',
                    color: '#ef4444',
                    fontSize: '13px'
                }}>
                    {error}
                </div>
            )}

            {workflow && (
                <div style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '16px',
                    padding: '20px',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    maxWidth: '640px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>{workflow.name}</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{workflow.id}</div>
                        </div>
                        <span style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-default)',
                            fontSize: '11px',
                            color: 'var(--text-secondary)'
                        }}>
                            {workflow.status || 'draft'}
                        </span>
                    </div>
                    {workflow.description && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {workflow.description}
                        </div>
                    )}
                    {workflow.updatedAt && (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                            Updated {new Date(workflow.updatedAt).toLocaleString()}
                        </div>
                    )}
                </div>
            )}

            {!loading && !workflow && !error && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Workflow not found.
                </div>
            )}
        </div>
    );
}
