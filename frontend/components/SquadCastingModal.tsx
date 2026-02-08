'use client';

import React, { useState } from 'react';
import { AgentProfile, DEFAULT_SQUAD } from '@/lib/agent.types';
import { X, Cpu, Zap, Brain, Sparkles, Check } from 'lucide-react';

interface SquadCastingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (config: AgentProfile[]) => void;
}

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'] },
    { id: 'google', name: 'Google', models: ['gemini-1.5-pro', 'gemini-1.0-pro'] },
] as const;

export function SquadCastingModal({ isOpen, onClose, onConfirm }: SquadCastingModalProps) {
    const [squad, setSquad] = useState<AgentProfile[]>(DEFAULT_SQUAD);

    if (!isOpen) return null;

    const handleUpdate = (role: string, field: keyof AgentProfile, value: any) => {
        setSquad(prev => prev.map(agent => {
            if (agent.role !== role) return agent;

            // If provider changes, reset model to first capacity
            if (field === 'provider') {
                const providerConfig = PROVIDERS.find(p => p.id === value);
                return { ...agent, provider: value, modelId: providerConfig?.models[0] || '' };
            }

            return { ...agent, [field]: value };
        }));
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                width: '800px', maxHeight: '90vh', overflowY: 'auto',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '24px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#000', letterSpacing: '-0.02em' }}>Squad Casting</h2>
                        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Assign intelligence models to agent roles.</p>
                    </div>
                    <button onClick={onClose} style={{ color: '#94a3b8', cursor: 'pointer', background: 'none', border: 'none' }}>
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    {squad.map((agent) => (
                        <div key={agent.role} style={{
                            padding: '20px',
                            background: '#f8fafc',
                            borderRadius: '16px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: getRoleColor(agent.role),
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                                }}>
                                    {getRoleIcon(agent.role)}
                                </div>
                                <span style={{ fontSize: '16px', fontWeight: 700, color: '#000' }}>{agent.role}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                                {/* Provider Select */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>PROVIDER</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {PROVIDERS.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleUpdate(agent.role, 'provider', p.id)}
                                                style={{
                                                    flex: 1, padding: '8px', fontSize: '12px', borderRadius: '6px',
                                                    fontWeight: 600,
                                                    border: agent.provider === p.id
                                                        ? '1px solid #000'
                                                        : '1px solid #e2e8f0',
                                                    background: agent.provider === p.id
                                                        ? '#000'
                                                        : '#fff',
                                                    color: agent.provider === p.id ? '#fff' : '#64748b',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Model Select */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>MODEL ID</label>
                                    <select
                                        value={agent.modelId}
                                        onChange={(e) => handleUpdate(agent.role, 'modelId', e.target.value)}
                                        style={{
                                            width: '100%', padding: '10px', borderRadius: '8px',
                                            background: '#fff', border: '1px solid #e2e8f0',
                                            color: '#000', fontSize: '13px', fontWeight: 600
                                        }}
                                    >
                                        {PROVIDERS.find(p => p.id === agent.provider)?.models.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '24px', borderTop: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'flex-end', gap: '12px'
                }}>
                    <button onClick={onClose} style={{
                        padding: '10px 24px', borderRadius: '8px',
                        background: 'transparent', color: '#64748b',
                        border: 'none', cursor: 'pointer', fontWeight: 600
                    }}>
                        Cancel
                    </button>
                    <button onClick={() => onConfirm(squad)} style={{
                        padding: '10px 32px', borderRadius: '8px',
                        background: '#000', color: '#fff',
                        border: 'none', cursor: 'pointer', fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                        <Check size={16} />
                        Confirm & Engage
                    </button>
                </div>
            </div>
        </div>
    );
}

function getRoleIcon(role: string) {
    switch (role) {
        case 'CEO': return <Sparkles size={16} />;
        case 'Marketing': return <Zap size={16} />;
        case 'Coder': return <Cpu size={16} />;
        case 'Designer': return <Brain size={16} />;
        default: return <Sparkles size={16} />;
    }
}

function getRoleColor(role: string) {
    switch (role) {
        case 'CEO': return '#d97706';
        case 'Marketing': return '#db2777';
        case 'Coder': return '#0891b2';
        case 'Designer': return '#7c3aed';
        default: return '#64748b';
    }
}