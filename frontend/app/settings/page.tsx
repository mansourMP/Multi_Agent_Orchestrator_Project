'use client';
import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Eye, EyeOff, Check, AlertCircle, Cpu, Brain, Sparkles, Bot, Monitor, Sun, Moon, Settings } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface Credential {
    id: string;
    provider: string;
    name: string;
    apiKey: string;
    isDefault: boolean;
    createdAt: string;
}

const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', icon: Sparkles, models: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'], color: '#10a37f' },
    { id: 'anthropic', name: 'Anthropic', icon: Brain, models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet'], color: '#d97706' },
    { id: 'google', name: 'Google AI', icon: Bot, models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro'], color: '#4285f4' },
    { id: 'groq', name: 'Groq', icon: Cpu, models: ['llama-3-70b', 'llama-3-8b', 'mixtral-8x7b'], color: '#f97316' },
    { id: 'together', name: 'Together AI', icon: Cpu, models: ['llama-3-70b', 'mixtral-8x22b', 'qwen-72b'], color: '#8b5cf6' },
    { id: 'openrouter', name: 'OpenRouter', icon: Sparkles, models: ['auto', 'openai/gpt-4', 'anthropic/claude-3'], color: '#ec4899' },
];

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [newCred, setNewCred] = useState({ provider: 'openai', name: '', apiKey: '' });

    useEffect(() => {
        const saved = localStorage.getItem('ai_credentials');
        if (saved) {
            setCredentials(JSON.parse(saved));
        }
    }, []);

    const saveCredentials = (creds: Credential[]) => {
        localStorage.setItem('ai_credentials', JSON.stringify(creds));
        setCredentials(creds);
    };

    const handleAddCredential = () => {
        if (!newCred.apiKey.trim()) return;
        const provider = PROVIDERS.find(p => p.id === newCred.provider);
        const credential: Credential = {
            id: Math.random().toString(36).substr(2, 9),
            provider: newCred.provider,
            name: newCred.name || provider?.name || newCred.provider,
            apiKey: newCred.apiKey,
            isDefault: credentials.filter(c => c.provider === newCred.provider).length === 0,
            createdAt: new Date().toISOString(),
        };
        saveCredentials([...credentials, credential]);
        setNewCred({ provider: 'openai', name: '', apiKey: '' });
        setShowAddModal(false);
    };

    const handleDeleteCredential = (id: string) => {
        saveCredentials(credentials.filter(c => c.id !== id));
    };

    const toggleKeyVisibility = (id: string) => {
        setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const maskApiKey = (key: string) => {
        if (key.length <= 8) return '••••••••';
        return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
    };

    const getProviderInfo = (providerId: string) => {
        return PROVIDERS.find(p => p.id === providerId) || { name: providerId, color: '#666', icon: Key };
    };

    return (
        <div style={{ padding: '40px 48px', maxWidth: '1000px', margin: '0 auto', color: 'var(--text-primary)' }}>
            <header style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '8px', background: 'var(--primary-base)', borderRadius: '8px', color: 'var(--primary-text)' }}>
                    <Settings size={20} />
                </div>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Settings</h1>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Global configuration and preferences.</p>
                </div>
            </header>

            {/* Appearance */}
            <section style={{ marginBottom: '48px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Monitor size={20} />
                    <span>Interface Appearance</span>
                </h2>
                <div className="card" style={{ padding: '24px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-element)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
                        {['light', 'dark', 'system'].map((t) => (
                            <button
                                key={t}
                                onClick={() => setTheme(t as any)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    background: theme === t ? 'var(--bg-surface)' : 'transparent',
                                    border: theme === t ? `1px solid var(--border-default)` : '1px solid transparent',
                                    color: theme === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: theme === t ? '0 4px 8px -6px rgba(0,0,0,0.5)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {t === 'light' && <Sun size={14} />}
                                {t === 'dark' && <Moon size={14} />}
                                {t === 'system' && <Monitor size={14} />}
                                <span style={{ textTransform: 'capitalize' }}>{t}</span>
                            </button>
                        ))}
                    </div>
                    <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Single premium mode active. Theme toggle kept for future compatibility.
                    </p>
                </div>
            </section>

            {/* AI Providers */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Key size={20} />
                        <span>Intelligence Providers</span>
                    </h2>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={16} />
                        <span>Add Key</span>
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {credentials.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
                            <div style={{ color: '#64748b', fontWeight: 600 }}>No AI models configured yet.</div>
                        </div>
                    ) : (
                        credentials.map(cred => {
                            const provider = getProviderInfo(cred.provider);
                            const Icon = provider.icon || Key;
                            return (
                                <div key={cred.id} className="card" style={{ padding: '16px 20px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${provider.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: provider.color }}>
                                        <Icon size={24} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, color: '#000', fontSize: '15px' }}>{cred.name}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                            {showKeys[cred.id] ? cred.apiKey : maskApiKey(cred.apiKey)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => toggleKeyVisibility(cred.id)} className="btn-ghost" style={{ padding: '8px', borderRadius: '8px' }}>
                                            {showKeys[cred.id] ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                        <button onClick={() => handleDeleteCredential(cred.id)} className="btn-ghost" style={{ padding: '8px', borderRadius: '8px', color: '#ef4444' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {/* Modal */}
            {showAddModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '440px', border: '1px solid var(--border-default)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '24px', letterSpacing: '-0.02em' }}>Add Intelligence Provider</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Provider</label>
                                <select className="input" value={newCred.provider} onChange={e => setNewCred({ ...newCred, provider: e.target.value })} style={{ height: '42px', borderRadius: '8px' }}>
                                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Secret Key</label>
                                <input type="password" className="input" value={newCred.apiKey} onChange={e => setNewCred({ ...newCred, apiKey: e.target.value })} placeholder="sk-..." style={{ height: '42px', borderRadius: '8px', fontFamily: 'monospace' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} style={{ flex: 1, height: '42px', borderRadius: '8px' }}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleAddCredential} style={{ flex: 2, height: '42px', borderRadius: '8px' }}>Save Provider</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
