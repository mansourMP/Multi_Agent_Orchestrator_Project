'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Plus, Clock, Workflow as WorkflowIcon, Search, Trash, Copy, RefreshCw, PlayCircle } from 'lucide-react';
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
    definition?: {
        meta?: Record<string, unknown>;
    };
};

function compactWorkflowText(value?: string, fallback = 'No description yet') {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    if (normalized.length <= 110) return normalized;
    return `${normalized.slice(0, 107).trimEnd()}…`;
}

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

    const runtimeProfileLabel = (workflow: WorkflowRecord) => {
        const meta = workflow.definition?.meta;
        if (!meta || typeof meta !== 'object') return '';
        const label = String(meta.runtime_profile_label || '').trim();
        if (label) return label;
        const profileId = String(meta.runtime_profile_id || '').trim();
        return profileId ? `Profile ${profileId.slice(0, 8)}` : '';
    };

    const recentWorkflowCount = useMemo(() => {
        const now = Date.now();
        return workflows.filter((workflow) => {
            const ts = new Date(workflow.updatedAt || '').getTime();
            if (Number.isNaN(ts)) return false;
            return now - ts <= 7 * 24 * 60 * 60 * 1000;
        }).length;
    }, [workflows]);

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
                title="Workflows"
                subtitle="Save repeatable work as reusable playbooks."
                meta={
                    workflows.length > 0 ? (
                        <>
                            <span>{workflows.length} saved</span>
                            <span>{statusSummary.active} active</span>
                        </>
                    ) : (
                        <span>Reusable playbooks for repeatable work</span>
                    )
                }
                actions={
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Link href="/setup" className="btn-secondary">
                            <PlayCircle size={14} />
                            New Task
                        </Link>
                        <Link href="/builder/new" className="btn-primary">
                            <Plus size={14} />
                            New Workflow
                        </Link>
                    </div>
                }
            />

            <section className="orion-panel orion-home-overview">
                <div className="orion-home-overview-main">
                    <div className="orion-home-overview-kicker">Reusable playbooks</div>
                    <div className="orion-home-overview-title">Save the tasks that work well and run them again.</div>
                    <div className="orion-home-overview-copy">
                        Start with a task. When the steps are stable, keep it here as a reusable workflow for your team.
                    </div>
                    <div className="orion-home-overview-actions">
                        <Link href="/builder/new" className="btn-primary">
                            <Plus size={14} />
                            New Workflow
                        </Link>
                        <Link href="/setup" className="btn-secondary">
                            <PlayCircle size={14} />
                            Start from a task
                        </Link>
                    </div>
                </div>
                <aside className="orion-home-overview-side">
                    <div className="orion-home-side-card">
                        <div className="orion-home-side-label">Library snapshot</div>
                        <div className="orion-home-side-stats">
                            <div>
                                <div className="orion-home-side-value">{statusSummary.total}</div>
                                <div className="orion-home-side-note">Saved workflows</div>
                            </div>
                            <div>
                                <div className="orion-home-side-value">{recentWorkflowCount}</div>
                                <div className="orion-home-side-note">Updated this week</div>
                            </div>
                        </div>
                        <div className="orion-runs-overview-side-note">
                            {statusSummary.active > 0
                                ? `${statusSummary.active} workflow${statusSummary.active === 1 ? '' : 's'} already active.`
                                : 'No active workflows yet. Start with one repeatable task.'}
                        </div>
                    </div>
                    <div className="orion-home-side-card">
                        <div className="orion-home-side-label">When to use this</div>
                        <div className="orion-home-side-empty">
                            Use workflows for recurring business work that already has a clear process, tools, and approvals.
                        </div>
                    </div>
                </aside>
            </section>

            <MetricStrip
                items={[
                    { label: 'Saved', value: String(statusSummary.total) },
                    { label: 'Active', value: String(statusSummary.active) },
                    { label: 'Draft', value: String(statusSummary.draft) },
                    { label: 'Needs attention', value: String(statusSummary.needsAttention) },
                ]}
            />

            {loading ? (
                <section className="orion-panel muted orion-loading-panel">
                    <div className="orion-loading-copy">Loading workflows...</div>
                </section>
            ) : (
                <>
                    {loadError ? (
                        <section className="orion-panel muted orion-state-panel">
                            <div className="orion-state-icon" aria-hidden="true">
                                <AlertCircle size={18} />
                            </div>
                            <div className="orion-panel-title">Workflows are unavailable</div>
                            <div className="orion-panel-copy">The workflow library could not be loaded right now. If the backend is offline, start it first, then retry.</div>
                            <div className="orion-panel-copy" style={{ marginTop: -4 }}>{loadError}</div>
                            <div className="orion-state-actions">
                                <button type="button" className="btn-secondary" onClick={() => void loadWorkflows()}>
                                    <RefreshCw size={14} />
                                    Retry
                                </button>
                                <Link href="/builder/new" className="btn-primary">
                                    <Plus size={14} />
                                    New Workflow
                                </Link>
                            </div>
                        </section>
                    ) : null}
                    {workflows.length > 0 ? (
                        <section className="orion-panel muted" style={{ display: 'grid', gap: 12 }}>
                            <div className="orion-panel-header" style={{ marginBottom: 0 }}>
                                <div>
                                    <div className="orion-panel-title">Find a workflow</div>
                                    <div className="orion-panel-copy">Search by name or purpose.</div>
                                </div>
                            </div>
                            <div className="orion-toolbar">
                                <div className="orion-toolbar-input-wrap">
                                    <Search size={14} className="icon" />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Search workflows..."
                                        className="input"
                                        style={{ paddingLeft: 36 }}
                                    />
                                </div>
                                <div className="orion-toolbar-summary">
                                    {filtered.length} of {workflows.length} workflows
                                </div>
                            </div>
                        </section>
                    ) : null}

                    {filtered.length === 0 ? (
                        <section className="orion-empty">
                            <div className="orion-empty-title">{workflows.length === 0 ? 'No reusable workflows yet' : 'No workflows match'}</div>
                            <div className="orion-empty-copy orion-empty-copy-spaced">
                                {workflows.length === 0
                                    ? 'Start with a task. Save it as a workflow when it becomes repeatable.'
                                    : 'Try another search or clear the current query.'}
                            </div>
                            <div className="orion-inline-actions">
                                {workflows.length === 0 ? (
                                    <>
                                        <Link href="/setup" className="btn-secondary">New Task</Link>
                                        <Link href="/builder/new" className="btn-primary">New Workflow</Link>
                                    </>
                                ) : null}
                            </div>
                        </section>
                    ) : (
                        <section className="orion-panel orion-panel-shell">
                            <div className="orion-panel-header orion-panel-shell-header">
                                <div>
                                    <div className="orion-panel-title">Saved workflows</div>
                                    <div className="orion-panel-copy">Reusable playbooks you can open, refine, and run again.</div>
                                </div>
                            </div>
                            <section className="orion-list orion-panel-shell-body">
                            {filtered.map((wf) => {
                        const status = getStatusDisplay(wf.status);
                        return (
                            <article
                                key={wf.id}
                                className="orion-list-row"
                                onClick={() => router.push(`/builder/${wf.id}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        router.push(`/builder/${wf.id}`);
                                    }
                                }}
                            >
                                <div className="orion-item-leading">
                                    <div className="orion-item-avatar is-accent">
                                        {wf.name?.slice(0, 2).toUpperCase() || 'WF'}
                                    </div>
                                    <div className="orion-list-row-main">
                                        <div className="orion-list-row-title">{wf.name || 'Untitled Workflow'}</div>
                                        <div className="orion-list-row-subtitle">{compactWorkflowText(wf.description)}</div>
                                        <div className="orion-item-meta">
                                            <span className="orion-item-meta-entry">
                                                <Clock size={11} />
                                                Updated {formatDate(wf.updatedAt)}
                                            </span>
                                            <span>Last run {formatDate(wf.lastRun)}</span>
                                            {runtimeProfileLabel(wf) ? <span>AI {runtimeProfileLabel(wf)}</span> : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="orion-list-row-end" onClick={(event) => event.stopPropagation()}>
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
                                    <span className="orion-status-inline">
                                        <span
                                            className="orion-status-inline-dot"
                                            style={{
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
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Delete Workflow</h2>
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
                            This will delete <strong>{deleteTarget.name}</strong> from the reusable workflow library.
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
