'use client';
import { Bot, Plus, Search, MoreHorizontal, ShieldCheck, Zap } from 'lucide-react';

export default function AgentsPage() {
    // Mock data for now, would normally fetch
    const agents: Array<{ id: string; name: string; role: string; model: string; status: string }> = [
        { id: '1', name: 'Strategic Lead', role: 'CEO', model: 'gpt-4o', status: 'active' },
        { id: '2', name: 'Content Architect', role: 'Marketing', model: 'claude-3-5-sonnet', status: 'active' },
        { id: '3', name: 'Logic Engine', role: 'Coder', model: 'gpt-4-turbo', status: 'active' },
    ];

    return (
        <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                            <Bot size={20} />
                        </div>
                        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Agents</h1>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Manage your specialized AI agent workforce.</p>
                </div>
                <div>
                    <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
                        <Plus size={16} />
                        <span>Hire New Agent</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div style={{ position: 'relative', width: '320px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-tertiary)' }} />
                    <input
                        type="text"
                        placeholder="Search workforce..."
                        className="input"
                        style={{ paddingLeft: '36px', height: '36px', borderRadius: '8px' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px', background: '#f1f5f9', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                        <ShieldCheck size={14} color="#10b981" />
                        <span>All systems operational</span>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="card" style={{ border: '1px solid var(--border-default)', background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <table className="table">
                    <thead style={{ background: '#f8fafc' }}>
                        <tr>
                            <th style={{ paddingLeft: '24px', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Agent Identity</th>
                            <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Specialization</th>
                            <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Neural Architecture</th>
                            <th style={{ color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase' }}>Status</th>
                            <th style={{ width: '60px', paddingRight: '24px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '100px 0' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ width: '56px', height: '56px', background: 'var(--bg-app)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                                            <Bot size={28} />
                                        </div>
                                        <h3 style={{ fontSize: '18px' }}>No agents hired yet</h3>
                                        <p style={{ color: 'var(--text-tertiary)', maxWidth: '320px', margin: '0 auto 24px' }}>Deploy specialized agents to handle complex reasoning, coding, or research tasks.</p>
                                        <button className="btn btn-primary">Hire first agent</button>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            agents.map((agent) => (
                                <tr key={agent.id} style={{ transition: 'all 0.2s' }} className="hover:bg-[#f8fafc]">
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ 
                                                width: '32px', 
                                                height: '32px', 
                                                borderRadius: '8px', 
                                                background: '#000', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                color: '#fff', 
                                                fontSize: '11px',
                                                fontWeight: 800
                                            }}>AI</div>
                                            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>{agent.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{agent.role}</td>
                                    <td>
                                        <div className="badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                                            {agent.model}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="badge badge-success" style={{ gap: '6px' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                                            ACTIVE
                                        </div>
                                    </td>
                                    <td style={{ paddingRight: '24px', textAlign: 'right' }}>
                                        <button className="btn-ghost" style={{ padding: '8px', borderRadius: '8px' }}>
                                            <MoreHorizontal size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}