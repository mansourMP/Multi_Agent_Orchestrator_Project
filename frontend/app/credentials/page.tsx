'use client';

import React, { useState } from 'react';
import { Key, Plus, Trash2, CheckCircle, Shield, ShieldCheck } from 'lucide-react';

export default function CredentialsPage() {
    // Start with empty list as requested
    const [credentials, setCredentials] = useState<any[]>([]);

    const handleDelete = (id: string) => {
        setCredentials(prev => prev.filter(c => c.id !== id));
    };

    return (
        <div style={{ padding: '40px 48px', maxWidth: '1400px', margin: '0 auto', color: 'var(--text-primary)' }}>
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{ padding: '8px', background: 'var(--primary-base)', borderRadius: '8px', color: 'var(--primary-text)' }}>
                            <Key size={20} />
                        </div>
                        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Credentials</h1>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Manage secure access tokens and API keys.</p>
                </div>
                <button className="btn btn-primary" style={{ padding: '10px 24px', borderRadius: '8px' }}>
                    <Plus size={16} />
                    <span>Add Credential</span>
                </button>
            </div>

            <div className="card" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', borderRadius: '12px', boxShadow: '0 10px 25px -15px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--bg-element)' }}>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Label</th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Type</th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Created</th>
                            <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Status</th>
                            <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {credentials.map(cred => (
                            <tr key={cred.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.2s' }} className="hover:bg-[var(--bg-hover)]">
                                <td style={{ padding: '16px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-element)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                                            <Key size={16} />
                                        </div>
                                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{cred.name}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontWeight: 500 }}>{cred.type}</td>
                                <td style={{ padding: '16px 24px', color: 'var(--text-tertiary)', fontSize: '13px' }}>{cred.created}</td>
                                <td style={{ padding: '16px 24px' }}>
                                    <span className="badge badge-success">Active</span>
                                </td>
                                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleDelete(cred.id)}
                                        className="btn-ghost"
                                        style={{ padding: '8px', color: '#ef4444', borderRadius: '8px' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {credentials.length === 0 && (
                    <div style={{ padding: '100px 0', textAlign: 'center' }}>
                        <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--text-tertiary)' }}>
                            <Shield size={28} />
                        </div>
                        <h3 style={{ fontSize: '18px' }}>No credentials found</h3>
                        <p style={{ color: 'var(--text-tertiary)', marginBottom: '32px' }}>Securely store your API keys and authentication tokens.</p>
                        <button className="btn btn-primary">Add Credential</button>
                    </div>
                )}
            </div>

            <div style={{ marginTop: '32px', padding: '24px', background: 'var(--bg-element)', border: '1px solid var(--border-default)', borderRadius: '12px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-default)', color: 'var(--success-base)', boxShadow: '0 6px 12px -10px rgba(0,0,0,0.5)' }}>
                    <ShieldCheck size={24} />
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Secure Vault Architecture</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0, fontWeight: 500 }}>
                        All sensitive data is encrypted using AES-256 GCM at the database level. Conductor never exposes raw keys in the application interface.
                    </p>
                </div>
            </div>
        </div>
    );
}
