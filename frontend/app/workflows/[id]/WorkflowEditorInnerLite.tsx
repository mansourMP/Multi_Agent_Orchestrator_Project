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
        getWorkflow(workflowId)
            .then((data) => setWorkflow(data))
            .catch((err) => setError(err?.message || 'Failed to load workflow'))
            .finally(() => setLoading(false));
    }, [workflowId]);

    return (
        <div className="orion-page-shell orion-animate-in" style={{ gap: 16, paddingBottom: 24 }}>
            <header className="orion-page-header" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="orion-page-title-wrap">
                    <div>
                        <h1 className="orion-page-title" style={{ fontSize: 22 }}>Automation</h1>
                        <p className="orion-page-subtitle">Simple view</p>
                    </div>
                </div>
                <div className="orion-page-actions">
                    <Link href="/workflows" className="orion-btn orion-btn-ghost">
                        Back
                    </Link>
                </div>
            </header>

            {loading && (
                <section className="orion-panel muted" style={{ minHeight: 180, display: 'grid', placeItems: 'center' }}>
                    <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Loading automation...</div>
                </section>
            )}

            {error && (
                <section
                    style={{
                        padding: '10px 0',
                        borderTop: '1px solid var(--error-border)',
                        borderBottom: '1px solid color-mix(in srgb, var(--error-border) 60%, transparent)',
                        color: 'var(--error-fg)',
                        fontSize: 13,
                    }}
                >
                    {error}
                </section>
            )}

            {workflow && (
                <section className="orion-panel" style={{ maxWidth: 760 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{workflow.name}</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workflow.id}</div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                            <span
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: 999,
                                    background: workflow.status === 'published' ? 'var(--success-fg)' : '#94a3b8',
                                    boxShadow:
                                        workflow.status === 'published'
                                            ? '0 0 0 3px var(--success-bg)'
                                            : '0 0 0 3px rgba(148,163,184,0.22)',
                                }}
                            />
                            {workflow.status || 'draft'}
                        </span>
                    </div>
                    {workflow.description ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>{workflow.description}</div>
                    ) : (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No description provided.</div>
                    )}
                    {workflow.updatedAt && (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                            Updated {new Date(workflow.updatedAt).toLocaleString()}
                        </div>
                    )}
                </section>
            )}

            {!loading && !workflow && !error && (
                <section className="orion-empty">
                    <div className="orion-empty-title">Automation not found</div>
                    <div className="orion-empty-copy" style={{ marginBottom: 10 }}>
                        The automation may have been removed.
                    </div>
                    <Link href="/workflows" className="orion-btn orion-btn-primary">
                        Go to Automations
                    </Link>
                </section>
            )}
        </div>
    );
}
