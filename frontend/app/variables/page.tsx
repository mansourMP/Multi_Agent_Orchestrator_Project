'use client';
import { useState, useEffect } from 'react';
import { Database, Plus, Trash2, Edit2, Save, X, Type, FileJson, Hash } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface Variable {
    id: string;
    key: string;
    value: string;
    type: 'string' | 'number' | 'json';
    description?: string;
}

export default function VariablesPage() {
    const { addToast } = useToast();
    const [variables, setVariables] = useState<Variable[]>([]);
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Variable>>({});

    // Load from LocalStorage
    useEffect(() => {
        const saved = localStorage.getItem('conductor_variables');
        if (saved) {
            try {
                setVariables(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse variables");
            }
        }
    }, []);

    const saveVariables = (newVars: Variable[]) => {
        setVariables(newVars);
        localStorage.setItem('conductor_variables', JSON.stringify(newVars));
    };

    const handleAdd = () => {
        const newVar: Variable = {
            id: Math.random().toString(36).substr(2, 9),
            key: '',
            value: '',
            type: 'string',
            description: ''
        };
        saveVariables([newVar, ...variables]);
        setIsEditing(newVar.id);
        setEditForm(newVar);
    };

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this variable?')) {
            saveVariables(variables.filter(v => v.id !== id));
            addToast({ title: 'Variable deleted', type: 'info' });
        }
    };

    const handleEdit = (v: Variable) => {
        setIsEditing(v.id);
        setEditForm(v);
    };

    const handleSave = () => {
        if (!editForm.key?.trim()) {
            addToast({ title: 'Key name is required', type: 'error' });
            return;
        }

        const duplicate = variables.find(v => v.key === editForm.key && v.id !== isEditing);
        if (duplicate) {
            addToast({ title: 'Variable key must be unique', type: 'error' });
            return;
        }

        saveVariables(variables.map(v => v.id === isEditing ? { ...v, ...editForm } as Variable : v));
        setIsEditing(null);
        addToast({ title: 'Variable saved successfully', type: 'success' });
    };

    const handleCancel = () => {
        if (isEditing) {
            const v = variables.find(x => x.id === isEditing);
            if (v && !v.key) {
                saveVariables(variables.filter(x => x.id !== isEditing));
            }
        }
        setIsEditing(null);
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'json': return <FileJson size={14} color="#f59e0b" />;
            case 'number': return <Hash size={14} color="#3b82f6" />;
            default: return <Type size={14} color="#64748b" />;
        }
    };

    return (
        <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                            <Database size={20} />
                        </div>
                        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Global Variables</h1>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Global constants accessible to all agent contexts.</p>
                </div>
                <button onClick={handleAdd} className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
                    <Plus size={16} />
                    <span>New Variable</span>
                </button>
            </div>

            {/* Table Card */}
            <div className="card" style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ background: '#f8fafc' }}>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                            <th style={{ padding: '16px 24px', color: 'var(--text-tertiary)', fontWeight: 600, width: '25%', textTransform: 'uppercase', fontSize: '12px' }}>Identifier</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-tertiary)', fontWeight: 600, width: '45%', textTransform: 'uppercase', fontSize: '12px' }}>Value</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-tertiary)', fontWeight: 600, width: '15%', textTransform: 'uppercase', fontSize: '12px' }}>Type</th>
                            <th style={{ padding: '16px 24px', color: 'var(--text-tertiary)', fontWeight: 600, width: '15%', textAlign: 'right', textTransform: 'uppercase', fontSize: '12px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {variables.length === 0 && !isEditing && (
                            <tr>
                                <td colSpan={4} style={{ padding: '100px 0', textAlign: 'center' }}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                                        <Database size={28} />
                                    </div>
                                    <h3 style={{ fontSize: '18px' }}>No global variables</h3>
                                    <p style={{ color: 'var(--text-tertiary)', marginBottom: '32px' }}>Store system-wide constants here.</p>
                                </td>
                            </tr>
                        )}
                        {variables.map(v => (
                            <tr key={v.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.2s' }} className="hover:bg-[#f8fafc]">
                                {isEditing === v.id ? (
                                    <>
                                        <td style={{ padding: '16px 24px', verticalAlign: 'top' }}>
                                            <input
                                                className="input"
                                                value={editForm.key}
                                                onChange={e => setEditForm({ ...editForm, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                                                placeholder="VARIABLE_KEY"
                                                style={{ fontWeight: 700, fontFamily: 'monospace', borderRadius: '8px' }}
                                                autoFocus
                                            />
                                        </td>
                                        <td style={{ padding: '16px 24px', verticalAlign: 'top' }}>
                                            {editForm.type === 'json' ? (
                                                <textarea
                                                    className="input"
                                                    rows={4}
                                                    value={editForm.value}
                                                    onChange={e => setEditForm({ ...editForm, value: e.target.value })}
                                                    style={{ fontFamily: 'monospace', borderRadius: '8px', padding: '12px' }}
                                                />
                                            ) : (
                                                <input
                                                    className="input"
                                                    value={editForm.value}
                                                    onChange={e => setEditForm({ ...editForm, value: e.target.value })}
                                                    style={{ borderRadius: '8px' }}
                                                />
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 24px', verticalAlign: 'top' }}>
                                            <select
                                                className="input"
                                                value={editForm.type}
                                                onChange={e => setEditForm({ ...editForm, type: e.target.value as any })}
                                                style={{ borderRadius: '8px' }}
                                            >
                                                <option value="string">String</option>
                                                <option value="number">Number</option>
                                                <option value="json">JSON</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-primary" onClick={handleSave} style={{ padding: '8px', borderRadius: '8px' }}>
                                                    <Save size={18} />
                                                </button>
                                                <button className="btn btn-secondary" onClick={handleCancel} style={{ padding: '8px', borderRadius: '8px' }}>
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td style={{ padding: '16px 24px', color: '#000', fontWeight: 800, fontFamily: 'monospace', fontSize: '14px' }}>
                                            {v.key}
                                        </td>
                                        <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', wordBreak: 'break-all', fontWeight: 500 }}>
                                            {v.type === 'json' ? (
                                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#d97706', background: '#fffbeb', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fef3c7' }}>JSON_OBJECT</span>
                                            ) : (
                                                v.value.length > 60 ? v.value.substring(0, 60) + '...' : v.value
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                                {getTypeIcon(v.type)}
                                                <span style={{ textTransform: 'capitalize' }}>{v.type}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className="btn-ghost" onClick={() => handleEdit(v)} style={{ padding: '8px', borderRadius: '8px' }}>
                                                    <Edit2 size={18} />
                                                </button>
                                                <button className="btn-ghost" onClick={() => handleDelete(v.id)} style={{ padding: '8px', color: '#ef4444', borderRadius: '8px' }}>
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Quick Access Info */}
            <div style={{ marginTop: '32px', padding: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ padding: '12px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#3b82f6', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <Hash size={24} />
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Injection Reference</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0, fontWeight: 500 }}>
                        Reference variables in any agent node using: <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#000', fontWeight: 700 }}>{`{{ $vars.KEY }}`}</code>
                    </p>
                </div>
            </div>
        </div>
    );
}