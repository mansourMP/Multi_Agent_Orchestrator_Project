'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, Clock, Circle, Search, Filter, Trash, Copy } from 'lucide-react';
import { fetchWorkflows, createWorkflow, deleteWorkflow, getWorkflow, updateWorkflow } from '@/lib/api';
import { useRouter } from 'next/navigation';

type WorkflowRecord = {
    id: string;
    name: string;
    description?: string;
    status?: string;
    nodeCount?: number;
    lastRun?: string;
    updatedAt: string;
};

const WORKFLOW_TEMPLATES = [
    {
        id: 'blank',
        name: 'Blank Canvas',
        description: 'Start with an empty workflow.',
        definition: { nodes: [], edges: [] }
    },
    {
        id: 'marketing-brief',
        name: 'Marketing Brief',
        description: 'CEO → Marketing → Review',
        definition: {
            nodes: [
                { id: 'agent-ceo', type: 'dashboard', position: { x: 160, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'CEO', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Approve strategy', status: 'idle' } },
                { id: 'agent-marketing', type: 'dashboard', position: { x: 480, y: 140 }, data: { role: 'Marketing', label: 'GPT-4O', subLabel: 'Marketing', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Draft positioning', status: 'idle' } },
                { id: 'agent-review', type: 'dashboard', position: { x: 800, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'Review', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Finalize output', status: 'idle' } },
            ],
            edges: [
                { id: 'e-ceo-marketing', source: 'agent-ceo', target: 'agent-marketing' },
                { id: 'e-marketing-review', source: 'agent-marketing', target: 'agent-review' }
            ]
        }
    },
    {
        id: 'research-sprint',
        name: 'Research Sprint',
        description: 'CEO → Research → Synthesis',
        definition: {
            nodes: [
                { id: 'agent-ceo', type: 'dashboard', position: { x: 160, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'CEO', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Define scope', status: 'idle' } },
                { id: 'agent-research', type: 'dashboard', position: { x: 480, y: 140 }, data: { role: 'Research', label: 'GPT-4O', subLabel: 'Research', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Gather sources', status: 'idle' } },
                { id: 'agent-synthesis', type: 'dashboard', position: { x: 800, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'Synthesis', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Summarize findings', status: 'idle' } },
            ],
            edges: [
                { id: 'e-ceo-research', source: 'agent-ceo', target: 'agent-research' },
                { id: 'e-research-synthesis', source: 'agent-research', target: 'agent-synthesis' }
            ]
        }
    },
    {
        id: 'product-build',
        name: 'Product Build',
        description: 'CEO → Coder → Designer → CEO',
        definition: {
            nodes: [
                { id: 'agent-ceo', type: 'dashboard', position: { x: 120, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'CEO', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Set scope', status: 'idle' } },
                { id: 'agent-coder', type: 'dashboard', position: { x: 420, y: 140 }, data: { role: 'Coder', label: 'GPT-4O', subLabel: 'Coder', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Implement plan', status: 'idle' } },
                { id: 'agent-designer', type: 'dashboard', position: { x: 720, y: 140 }, data: { role: 'Designer', label: 'GPT-4O', subLabel: 'Designer', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Design UI/UX', status: 'idle' } },
                { id: 'agent-ceo-review', type: 'dashboard', position: { x: 1020, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'Review', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Approve build', status: 'idle' } },
            ],
            edges: [
                { id: 'e-ceo-coder', source: 'agent-ceo', target: 'agent-coder' },
                { id: 'e-coder-designer', source: 'agent-coder', target: 'agent-designer' },
                { id: 'e-designer-review', source: 'agent-designer', target: 'agent-ceo-review' }
            ]
        }
    },
    {
        id: 'gtm-launch',
        name: 'GTM Launch',
        description: 'CEO → Marketing → Coder → CEO',
        definition: {
            nodes: [
                { id: 'agent-ceo', type: 'dashboard', position: { x: 140, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'CEO', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Define launch brief', status: 'idle' } },
                { id: 'agent-marketing', type: 'dashboard', position: { x: 460, y: 140 }, data: { role: 'Marketing', label: 'GPT-4O', subLabel: 'Marketing', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Build messaging', status: 'idle' } },
                { id: 'agent-coder', type: 'dashboard', position: { x: 780, y: 140 }, data: { role: 'Coder', label: 'GPT-4O', subLabel: 'Coder', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Implement launch assets', status: 'idle' } },
                { id: 'agent-ceo-final', type: 'dashboard', position: { x: 1100, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'Final', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Approve launch', status: 'idle' } },
            ],
            edges: [
                { id: 'e-ceo-marketing', source: 'agent-ceo', target: 'agent-marketing' },
                { id: 'e-marketing-coder', source: 'agent-marketing', target: 'agent-coder' },
                { id: 'e-coder-final', source: 'agent-coder', target: 'agent-ceo-final' }
            ]
        }
    }
];

export default function WorkflowsPage() {
    const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [newWfName, setNewWfName] = useState('');
    const [newWfDesc, setNewWfDesc] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('blank');
    const [aiTemplatePrompt, setAiTemplatePrompt] = useState('');
    const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WorkflowRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        loadWorkflows();
    }, []);

    async function loadWorkflows() {
        try {
            setLoading(true);
            const data = await fetchWorkflows();
            setWorkflows(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!newWfName) return;
        try {
            const template = WORKFLOW_TEMPLATES.find(t => t.id === selectedTemplateId) || WORKFLOW_TEMPLATES[0];
            const newWorkflow = await createWorkflow(newWfName, newWfDesc, 'default', template.definition);
            router.push(`/workflows/${newWorkflow.id}`);
        } catch (err) {
            alert('Failed to create workflow');
        }
    }

    const handleGenerateTemplate = async () => {
        if (!aiTemplatePrompt.trim()) return;
        setIsGeneratingTemplate(true);
        try {
            // Placeholder for future AI generation pipeline
            const generatedTemplate = {
                id: 'ai-generated',
                name: `AI: ${aiTemplatePrompt.slice(0, 24)}`,
                description: aiTemplatePrompt,
                definition: {
                    nodes: [
                        { id: 'agent-ceo', type: 'dashboard', position: { x: 180, y: 140 }, data: { role: 'CEO', label: 'GPT-4O', subLabel: 'CEO', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Interpret prompt', status: 'idle' } },
                        { id: 'agent-coder', type: 'dashboard', position: { x: 500, y: 140 }, data: { role: 'Coder', label: 'GPT-4O', subLabel: 'Coder', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Build workflow draft', status: 'idle' } },
                        { id: 'agent-marketing', type: 'dashboard', position: { x: 820, y: 140 }, data: { role: 'Marketing', label: 'GPT-4O', subLabel: 'Marketing', modelId: 'gpt-4o', provider: 'OpenAI', task: 'Finalize deliverables', status: 'idle' } },
                    ],
                    edges: [
                        { id: 'e-ceo-coder', source: 'agent-ceo', target: 'agent-coder' },
                        { id: 'e-coder-marketing', source: 'agent-coder', target: 'agent-marketing' }
                    ]
                }
            };
            setSelectedTemplateId(generatedTemplate.id);
            // inject into local template list for this session
            WORKFLOW_TEMPLATES.unshift(generatedTemplate as any);
        } finally {
            setIsGeneratingTemplate(false);
        }
    };

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
        } catch (err) {
            alert('Failed to duplicate workflow');
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

    const getStatusDisplay = (status?: string) => {
        switch (status) {
            case 'published':
                return { color: '#16a34a', label: 'Active' };
            case 'paused':
                return { color: '#f59e0b', label: 'Paused' };
            case 'error':
                return { color: '#ef4444', label: 'Error' };
            default:
                return { color: '#94a3b8', label: 'Draft' };
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
        } catch (err) {
            alert('Failed to archive workflow');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: 'var(--primary-base)', borderRadius: '10px', color: 'var(--primary-text)' }}>
                            <Circle size={16} />
                        </div>
                        <h1 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em' }}>Workflows</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Design, monitor, and deploy agent flows.</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary" style={{ borderRadius: '10px', height: 40 }}>
                        <Filter size={14} />
                        Filters
                    </button>
                    <button className="btn btn-primary" style={{ borderRadius: '10px', height: 40 }} onClick={() => setShowModal(true)}>
                        <Plus size={14} />
                        New Workflow
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <div style={{ position: 'relative', width: '360px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search workflows..."
                        className="input"
                        style={{ paddingLeft: '36px', height: '40px', borderRadius: '10px' }}
                    />
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                    {filtered.length} of {workflows.length} workflows
                </div>
            </div>

            {/* List */}
            <div className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '72px', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>Loading workflows…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '100px 0', textAlign: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                            <Circle size={28} />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No workflows match</h3>
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: 20 }}>Try clearing filters or create a new workflow.</p>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Workflow</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {filtered.map((wf) => {
                            const status = getStatusDisplay(wf.status);
                            return (
                                <div
                                    key={wf.id}
                                    onClick={() => router.push(`/workflows/${wf.id}`)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            router.push(`/workflows/${wf.id}`);
                                        }
                                    }}
                                    style={{
                                        padding: '22px 24px',
                                        border: 'none',
                                        background: 'transparent',
                                        borderBottom: '1px solid var(--border-default)',
                                        textAlign: 'left',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer'
                                    }}
                                    className="hover:bg-[var(--bg-hover)] outline-none"
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                                        <div style={{
                                            width: 52,
                                            height: 52,
                                            borderRadius: 14,
                                            background: 'var(--bg-element)',
                                            border: '1px solid var(--border-default)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-primary)',
                                            fontWeight: 800,
                                            fontSize: 16
                                        }}>
                                            {wf.name?.slice(0, 2).toUpperCase() || 'WF'}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{wf.name || 'Untitled Workflow'}</div>
                                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                                                {wf.description || 'No description provided'}
                                            </div>
                                            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={12} />Updated {formatDate(wf.updatedAt)}</span>
                                                <span>{wf.nodeCount || 0} nodes</span>
                                                <span>Last run {formatDate(wf.lastRun)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{
                                            padding: '7px 12px',
                                            borderRadius: 999,
                                            border: `1px solid ${status.color}`,
                                            color: status.color,
                                            fontSize: 12,
                                            fontWeight: 800,
                                            background: `${status.color}10`
                                        }}>
                                            {status.label}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(event) => handleDelete(event, wf)}
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 999,
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                background: 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Trash size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(event) => handleDuplicate(event, wf.id)}
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: 999,
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                background: 'transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Copy size={14} />
                                        </button>
                                        <MoreHorizontal size={18} color="var(--text-tertiary)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* CREATE MODAL */}
            {showModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(12, 14, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100
                }}
                    onClick={() => setShowModal(false)}>
                    <form
                        onSubmit={handleCreateSubmit}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 440,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 16,
                            boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 18
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Create Workflow</h2>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
                            >
                                ×
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Name
                                </label>
                                <input
                                    autoFocus
                                    required
                                    type="text"
                                    value={newWfName}
                                    onChange={(e) => setNewWfName(e.target.value)}
                                    placeholder="e.g. Prospecting Agent Crew"
                                    className="input"
                                    style={{ padding: '12px', borderRadius: 10 }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Description
                                </label>
                                <textarea
                                    value={newWfDesc}
                                    onChange={(e) => setNewWfDesc(e.target.value)}
                                    placeholder="What does this workflow do?"
                                    rows={3}
                                    className="input"
                                    style={{ padding: '12px', borderRadius: 10, resize: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Template
                                </label>
                                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                    <input
                                        value={aiTemplatePrompt}
                                        onChange={(e) => setAiTemplatePrompt(e.target.value)}
                                        placeholder="Describe what the workflow should do..."
                                        className="input"
                                        style={{ flex: 1, padding: '10px', borderRadius: 10 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleGenerateTemplate}
                                        className="btn btn-secondary"
                                        style={{ borderRadius: 10, padding: '10px 12px' }}
                                        disabled={isGeneratingTemplate}
                                    >
                                        {isGeneratingTemplate ? 'Generating…' : 'Generate'}
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {WORKFLOW_TEMPLATES.map(template => (
                                        <button
                                            key={template.id}
                                            type="button"
                                            onClick={() => setSelectedTemplateId(template.id)}
                                            style={{
                                                textAlign: 'left',
                                                padding: '12px',
                                                borderRadius: 12,
                                                border: selectedTemplateId === template.id ? '1px solid var(--primary-base)' : '1px solid var(--border-default)',
                                                background: selectedTemplateId === template.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                                color: 'var(--text-primary)',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{template.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{template.description}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="btn"
                                    style={{
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--border-default)',
                                        borderRadius: 10,
                                        fontWeight: 600,
                                        padding: '10px 16px'
                                    }}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{
                                        padding: '10px 18px',
                                        borderRadius: 10,
                                        fontWeight: 700
                                    }}>
                                    Create
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {deleteTarget && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(12, 14, 20, 0.65)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 120
                }}
                    onClick={() => setDeleteTarget(null)}>
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 420,
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
                            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Archive Workflow</h2>
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                            This will archive <strong>{deleteTarget.name}</strong>. You can restore it later from the database if needed.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--border-default)' }}>
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="btn"
                                style={{
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 10,
                                    fontWeight: 600,
                                    padding: '10px 16px'
                                }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="btn btn-primary"
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: 10,
                                    fontWeight: 700
                                }}
                                disabled={isDeleting}
                            >
                                {isDeleting ? 'Archiving…' : 'Archive'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
