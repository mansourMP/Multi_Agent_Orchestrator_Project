'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Clock, Workflow as WorkflowIcon, Search, Trash, Copy } from 'lucide-react';
import { createPortal } from 'react-dom';
import { fetchWorkflows, createWorkflow, deleteWorkflow, getWorkflow, updateWorkflow } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { API_BASE } from '@/lib/config';

type WorkflowRecord = {
    id: string;
    name: string;
    description?: string;
    status?: string;
    nodeCount?: number;
    lastRun?: string;
    updatedAt: string;
};

function formatApiError(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : '';
    if (!message) return fallback;
    if (message.includes('Failed to fetch')) {
        return `${fallback}. Backend API may be offline on ${API_BASE}.`;
    }
    return `${fallback}: ${message}`;
}

export default function WorkflowsPage() {
    const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();
    const modalPortalTarget = typeof document !== 'undefined' ? document.body : null;

    useEffect(() => {
        loadWorkflows();
    }, []);

    async function loadWorkflows() {
        try {
            setLoading(true);
            setLoadError('');
            const data = await fetchWorkflows();
            const next = Array.isArray(data)
                ? data
                : Array.isArray((data as { items?: unknown[] } | null | undefined)?.items)
                    ? ((data as { items: WorkflowRecord[] }).items)
                    : [];
            setWorkflows(next);
        } catch (err) {
            console.error(err);
            setWorkflows([]);
            setLoadError(formatApiError(err, 'Failed to load workflows'));
        } finally {
            setLoading(false);
        }
    }

    const handleDuplicate = async (event: React.MouseEvent, id: string) => {
        event.stopPropagation();
        try {
            const original = await getWorkflow(id);
            const copyName = `${original.name || 'Workflow'} Copy`;
            const copyDesc = original.description || '';
            const created = await createWorkflow(copyName, copyDesc);
            if (original.definition) {
                await updateWorkflow(created.id, original.definition);
            }
            await loadWorkflows();
        } catch (error) {
            alert(formatApiError(error, 'Failed to duplicate workflow'));
        }
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return workflows;
        return workflows.filter((w) =>
            (w.name || '').toLowerCase().includes(q) ||
            (w.description || '').toLowerCase().includes(q)
        );
    }, [workflows, query]);

    const statusSummary = useMemo(() => {
        return workflows.reduce(
            (acc, workflow) => {
                const status = String(workflow.status || 'draft').toLowerCase();
                acc.total += 1;
                if (status === 'published') acc.active += 1;
                else if (status === 'paused') acc.scheduled += 1;
                else if (status === 'error') acc.needsAttention += 1;
                else acc.draft += 1;
                return acc;
            },
            { total: 0, active: 0, draft: 0, scheduled: 0, needsAttention: 0 },
        );
    }, [workflows]);

    const getStatusDisplay = (status?: string) => {
        switch (status) {
            case 'published':
                return { color: 'var(--success-fg)', ring: 'var(--success-border)', label: 'Active' };
            case 'paused':
                return { color: 'var(--warning-fg)', ring: 'var(--warning-border)', label: 'Paused' };
            case 'error':
                return { color: 'var(--error-fg)', ring: 'var(--error-border)', label: 'Error' };
            default:
                return { color: 'var(--text-tertiary)', ring: 'var(--border-default)', label: 'Draft' };
        }
    };

    const formatDate = (value?: string) => {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString();
    };

    const handleDelete = (event: React.MouseEvent, wf: WorkflowRecord) => {
        event.stopPropagation();
        setDeleteTarget(wf);
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            setIsDeleting(true);
            await deleteWorkflow(deleteTarget.id);
            setWorkflows(prev => prev.filter(wf => wf.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (error) {
            alert(formatApiError(error, 'Failed to delete workflow'));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="orion-page-shell orion-animate-in">
            <OsPageHeader
                icon={<WorkflowIcon size={16} />}
                title="Automations"
                subtitle="Open, test, and manage the systems your assistant can run."
                meta={
                    workflows.length > 0 ? (
                        <>
                            <span>{workflows.length} total</span>
                            <span>{statusSummary.active} active</span>
                        </>
                    ) : (
                        <>
                            <span>Use Assistant for one-off tasks</span>
                        </>
                    )
                }
                actions={
                    <>
                        <Link href="/workspace" className="btn-secondary">
                            Open Assistant
                        </Link>
                        <Link href="/builder" className="btn-primary">
                            <Plus size={14} />
                            New Automation
                        </Link>
                    </>
                }
            />

            <MetricStrip
                items={[
                    { label: 'Automations', value: String(statusSummary.total) },
                    { label: 'Active', value: String(statusSummary.active) },
                    { label: 'Draft', value: String(statusSummary.draft) },
                    { label: 'Needs attention', value: String(statusSummary.needsAttention) },
                ]}
            />

            {loading ? (
                <section className="orion-panel muted" style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
                    <div style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Loading automations...</div>
                </section>
            ) : (
                <>
                    {loadError ? (
                        <section className="orion-empty" style={{ marginBottom: 12 }}>
                            <div className="orion-empty-title">Could not load automations</div>
                            <div className="orion-empty-copy">{loadError}</div>
                        </section>
                    ) : null}
                    {workflows.length > 0 ? (
                        <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
                            <div className="orion-panel-header" style={{ marginBottom: 0 }}>
                                <div>
                                    <div className="orion-panel-title">Find an automation</div>
                                    <div className="orion-panel-copy">Search the library and jump back into editing.</div>
                                </div>
                            </div>
                            <div className="orion-toolbar">
                                <div className="orion-toolbar-input-wrap">
                                    <Search size={14} className="icon" />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search automations..."
                                        className="input"
                                        style={{ paddingLeft: 36, height: 42, borderRadius: 11 }}
                                    />
                                </div>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600 }}>
                                    {filtered.length} of {workflows.length} automations
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {filtered.length === 0 ? (
                        <section className="orion-empty">
                            <div className="orion-empty-title">{workflows.length === 0 ? 'No automations yet' : 'No automations match'}</div>
                            <div className="orion-empty-copy" style={{ marginBottom: 14 }}>
                                {workflows.length === 0
                                    ? 'Create one reusable workflow, or use Assistant when the task only needs to happen once.'
                                    : 'Try another search or clear the current query.'}
                            </div>
                            <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
                                {workflows.length === 0 ? (
                                    <Link href="/workspace" className="btn-primary">
                                        Open Assistant
                                    </Link>
                                ) : null}
                                {workflows.length === 0 ? (
                                    <Link href="/builder" className="btn-secondary">Create Automation</Link>
                                ) : null}
                            </div>
                        </section>
                    ) : (
                        <section className="orion-panel" style={{ padding: 0, overflow: 'hidden' }}>
                            <div
                                className="orion-panel-header"
                                style={{
                                    marginBottom: 0,
                                    padding: '16px 18px 12px',
                                    borderBottom: '1px solid var(--border-subtle)',
                                }}
                            >
                                <div>
                                    <div className="orion-panel-title">Automation library</div>
                                    <div className="orion-panel-copy">Reusable systems you can open, test, and activate.</div>
                                </div>
                            </div>
                            <section className="orion-list" style={{ padding: '0 12px 10px' }}>
                            {filtered.map((wf) => {
                        const status = getStatusDisplay(wf.status);
                        return (
                            <article
                                key={wf.id}
                                className="orion-list-row"
                                onClick={() => router.push(`/workflows/${wf.id}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        router.push(`/workflows/${wf.id}`);
                                    }
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 999,
                                            background: 'var(--primary-soft)',
                                            display: 'grid',
                                            placeItems: 'center',
                                            color: 'var(--primary-base)',
                                            fontWeight: 700,
                                            fontSize: 11,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {wf.name?.slice(0, 2).toUpperCase() || 'WF'}
                                    </div>
                                    <div className="orion-list-row-main" style={{ gap: 6 }}>
                                        <div className="orion-list-row-title">{wf.name || 'Untitled Automation'}</div>
                                        <div className="orion-list-row-subtitle">{wf.description || 'No description provided'}</div>
                                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <Clock size={11} />
                                                Updated {formatDate(wf.updatedAt)}
                                            </span>
                                            <span>Last run {formatDate(wf.lastRun)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="orion-toolbar-group" onClick={(event) => event.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="orion-icon-btn"
                                        onClick={(event) => handleDelete(event, wf)}
                                        aria-label="Delete workflow"
                                    >
                                        <Trash size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className="orion-icon-btn"
                                        onClick={(event) => handleDuplicate(event, wf.id)}
                                        aria-label="Duplicate workflow"
                                    >
                                        <Copy size={14} />
                                    </button>
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontSize: 12,
                                            color: 'var(--text-secondary)',
                                            minWidth: 62,
                                            justifyContent: 'flex-end',
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: 7,
                                                height: 7,
                                                borderRadius: 999,
                                                background: status.color,
                                                boxShadow: `0 0 0 3px ${status.ring}`,
                                            }}
                                        />
                                        {status.label}
                                    </span>
                                </div>
                            </article>
                        );
                            })}
                            </section>
                        </section>
                    )}
                </>
            )}

            {deleteTarget && modalPortalTarget
                ? createPortal(
                    <div className="orion-modal-overlay" onClick={() => setDeleteTarget(null)}>
                        <div className="orion-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '100%' }}>
                        <header className="orion-panel-header" style={{ marginBottom: 0 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Delete Automation</h2>
                            <button
                                type="button"
                                className="orion-icon-btn"
                                onClick={() => setDeleteTarget(null)}
                                aria-label="Close modal"
                            >
                                ×
                            </button>
                        </header>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                            This will delete <strong>{deleteTarget.name}</strong>.
                        </div>
                        <footer style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                            <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="orion-btn orion-btn-danger"
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </footer>
                        </div>
                    </div>,
                    modalPortalTarget,
                )
                : null}
        </div>
    );
}
