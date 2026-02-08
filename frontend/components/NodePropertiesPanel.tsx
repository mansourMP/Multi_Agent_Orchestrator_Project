// @ts-nocheck
'use client';
import React, { useState, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { X, Trash2, Cpu, Wrench, Zap, GitBranch, UserCheck, GitMerge, Eye, Code2, Search, AlertCircle, Users } from 'lucide-react';

interface NodePropertiesPanelProps {
    node: Node | null;
    onUpdate: (nodeId: string, data: any) => void;
    onDelete: (nodeId: string) => void;
    onClose: () => void;
    lastResult?: any;
}

// Provider definitions - same as settings page
const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet'] },
    { id: 'google', name: 'Google AI', models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro'] },
    { id: 'groq', name: 'Groq', models: ['llama-3-70b', 'llama-3-8b', 'mixtral-8x7b'] },
    { id: 'together', name: 'Together AI', models: ['llama-3-70b', 'mixtral-8x22b', 'qwen-72b'] },
    { id: 'openrouter', name: 'OpenRouter', models: ['auto', 'openai/gpt-4', 'anthropic/claude-3'] },
];

interface Credential {
    id: string;
    provider: string;
    name: string;
    isDefault: boolean;
}

export default function NodePropertiesPanel({ node, onUpdate, onDelete, onClose, lastResult }: NodePropertiesPanelProps) {
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [availableModels, setAvailableModels] = useState<{ provider: string, model: string, label: string }[]>([]);

    // Load credentials from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('ai_credentials');
        if (saved) {
            const creds = JSON.parse(saved) as Credential[];
            setCredentials(creds);

            // Build available models based on configured providers
            const models: { provider: string, model: string, label: string }[] = [];
            const configuredProviders = [...new Set(creds.map((c: Credential) => c.provider))];

            configuredProviders.forEach(providerId => {
                const provider = PROVIDERS.find(p => p.id === providerId);
                if (provider) {
                    provider.models.forEach(model => {
                        models.push({
                            provider: providerId,
                            model: `${providerId}/${model}`,
                            label: `${provider.name} - ${model}`
                        });
                    });
                }
            });

            setAvailableModels(models);
        }
    }, []);

    if (!node) return null;

    const handleChange = (key: string, value: any) => {
        onUpdate(node.id, { ...node.data, [key]: value });
    };

    const Icon = node.type === 'agent' ? Cpu : node.type === 'trigger' ? Zap : node.type === 'logic' ? GitBranch : node.type === 'approval' ? UserCheck : node.type === 'parallel' ? GitMerge : node.type === 'vision' ? Eye : node.type === 'coding' ? Code2 : node.type === 'research' ? Search : node.type === 'squad' ? Users : Wrench;

    const hasCredentials = credentials.length > 0;

    return (
        <div style={{
            width: '300px',
            borderLeft: '1px solid #3a3d45',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 30,
            background: '#131519',
            height: '100%',
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #3a3d45',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#1f2127'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon size={16} color="#9ca3af" />
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>Node Properties</span>
                </div>
                <button onClick={onClose} className="btn-ghost" style={{ padding: '4px', height: 'auto' }}>
                    <X size={16} />
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Warning if no credentials */}
                {!hasCredentials && (node.type === 'agent' || node.type === 'coding' || node.type === 'research' || node.type === 'vision') && (
                    <div style={{
                        padding: '12px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px'
                    }}>
                        <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '12px', color: '#f59e0b', lineHeight: 1.4 }}>
                            No API keys configured. <a href="/settings" style={{ textDecoration: 'underline' }}>Add credentials</a> to use AI models.
                        </div>
                    </div>
                )}

                {/* Basic Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                        Label
                    </label>
                    <input
                        type="text"
                        className="input"
                        value={node.data.label || ''}
                        onChange={(e) => handleChange('label', e.target.value)}
                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                    />
                </div>

                {/* Agent Node - IdentityDNA & Cortex Config */}
                {node.type === 'agent' && (
                    <>
                        {/* 1. IdentityDNA Section */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fca5a5', marginBottom: '8px', borderBottom: '1px solid #3a3d45', paddingBottom: '4px' }}>
                                IDENTITY DNA (SOUL)
                            </div>

                            {/* Core Motivation */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Core Motivation
                                </label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={node.data.core_motivation || ''}
                                    onChange={(e) => handleChange('core_motivation', e.target.value)}
                                    placeholder="e.g. Maximize profit margins safely..."
                                    style={{ background: '#1f2127', border: '1px solid #7f1d1d', color: '#fecaca', fontSize: '12px' }}
                                />
                            </div>

                            {/* Forbidden Behaviors */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Forbidden Behaviors (Governed)
                                </label>
                                <textarea
                                    className="input"
                                    rows={3}
                                    value={Array.isArray(node.data.forbidden_behaviors) ? node.data.forbidden_behaviors.join('\n') : node.data.forbidden_behaviors || ''}
                                    onChange={(e) => handleChange('forbidden_behaviors', e.target.value.split('\n'))}
                                    placeholder="One per line:&#10;Never delete data&#10;Never lie to user"
                                    style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontSize: '12px', whiteSpace: 'pre' }}
                                />
                            </div>

                            {/* Intrinsic Values */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Intrinsic Values
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={Array.isArray(node.data.intrinsic_values) ? node.data.intrinsic_values.join(', ') : node.data.intrinsic_values || ''}
                                    onChange={(e) => handleChange('intrinsic_values', e.target.value.split(',').map(s => s.trim()))}
                                    placeholder="Speed, Frugality, Truth..."
                                    style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontSize: '12px' }}
                                />
                            </div>

                            {/* Knowledge Domain */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Cognitive Profile (Archetype)
                                </label>
                                <select
                                    className="input"
                                    value={node.data.knowledge_domain || 'general_reasoning'}
                                    onChange={(e) => handleChange('knowledge_domain', e.target.value)}
                                    style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                                >
                                    <option value="general_reasoning">Strategic Reasoning (Planner)</option>
                                    <option value="execution_expert">Autonomous Execution (Doer)</option>
                                    <option value="creative_fluid">Fluid Intelligence (Creator)</option>
                                    <option value="critical_analysis">Critical Analysis (Reviewer)</option>
                                    <option value="adaptive_learning">Adaptive Learning (Researcher)</option>
                                </select>
                            </div>
                        </div>

                        {/* 3. Capabilities (The Muscle) */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#a7f3d0', marginBottom: '8px', borderBottom: '1px solid #3a3d45', paddingBottom: '4px' }}>
                                AGENT CAPABILITIES
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Web Browsing */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cap_web"
                                        checked={node.data.capabilities?.web_search || false}
                                        onChange={(e) => handleChange('capabilities', { ...node.data.capabilities, web_search: e.target.checked })}
                                        style={{ cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <label htmlFor="cap_web" style={{ fontSize: '12px', color: '#e5e7eb', cursor: 'pointer' }}>
                                        Global Web Access (Search & Read)
                                    </label>
                                </div>

                                {/* Code Execution */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cap_code"
                                        checked={node.data.capabilities?.code_execution || false}
                                        onChange={(e) => handleChange('capabilities', { ...node.data.capabilities, code_execution: e.target.checked })}
                                        style={{ cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <label htmlFor="cap_code" style={{ fontSize: '12px', color: '#e5e7eb', cursor: 'pointer' }}>
                                        Python Code Execution
                                    </label>
                                </div>

                                {/* File System */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cap_fs"
                                        checked={node.data.capabilities?.file_system || false}
                                        onChange={(e) => handleChange('capabilities', { ...node.data.capabilities, file_system: e.target.checked })}
                                        style={{ cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <label htmlFor="cap_fs" style={{ fontSize: '12px', color: '#e5e7eb', cursor: 'pointer' }}>
                                        File System (Read/Write)
                                    </label>
                                </div>

                                {/* Vision */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cap_vision"
                                        checked={node.data.capabilities?.vision || false}
                                        onChange={(e) => handleChange('capabilities', { ...node.data.capabilities, vision: e.target.checked })}
                                        style={{ cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <label htmlFor="cap_vision" style={{ fontSize: '12px', color: '#e5e7eb', cursor: 'pointer' }}>
                                        Computer Vision (Image Input)
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* 4. Cortex Specs (The Brain) */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#93c5fd', marginBottom: '8px', borderBottom: '1px solid #3a3d45', paddingBottom: '4px' }}>
                                CORTEX SPECS (BRAIN)
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Model
                                </label>
                                <select
                                    className="input"
                                    value={node.data.model || ''}
                                    onChange={(e) => handleChange('model', e.target.value)}
                                    style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                                >
                                    <option value="">Select a model...</option>
                                    {availableModels.length > 0 ? (
                                        availableModels.map(m => (
                                            <option key={m.model} value={m.model}>{m.label}</option>
                                        ))
                                    ) : (
                                        <option disabled>No providers configured</option>
                                    )}
                                </select>
                                {!hasCredentials && (
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                        → Go to <a href="/settings" style={{ color: '#ff6d5a' }}>Settings</a> to add API keys
                                    </p>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                    Base System Prompt
                                </label>
                                <textarea
                                    className="input"
                                    rows={4}
                                    value={node.data.systemPrompt || ''}
                                    onChange={(e) => handleChange('systemPrompt', e.target.value)}
                                    placeholder="You are a helpful assistant..."
                                    style={{
                                        background: '#1f2127',
                                        border: '1px solid #3a3d45',
                                        color: '#e5e7eb',
                                        resize: 'vertical',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '12px'
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* Coding Node Configuration */}
                {node.type === 'coding' && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                Execution Environment
                            </label>
                            <select
                                className="input"
                                value={node.data.executionMode || 'cloud'}
                                onChange={(e) => handleChange('executionMode', e.target.value)}
                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                            >
                                <option value="cloud">☁️ Cloud Sandbox (Safe)</option>
                                <option value="local">💻 Local Terminal (Bridge)</option>
                            </select>
                            <p style={{ fontSize: '10px', color: '#6b7280' }}>
                                {node.data.executionMode === 'local'
                                    ? "Agent commands are sent to your local terminal via CLI."
                                    : "Code runs in an isolated ephemeral container."}
                            </p>
                        </div>

                        {node.data.executionMode === 'local' && (
                            <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                <p style={{ fontSize: '11px', color: '#60a5fa', margin: 0, lineHeight: 1.4 }}>
                                    <strong>Bridge Required:</strong><br />
                                    Run <code>npx conductor-bridge start</code> in your terminal.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* Squad Configuration */}
                {node.type === 'squad' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                Squad Members ({(node.data.members || []).length}/5)
                            </label>
                            <button
                                onClick={() => {
                                    if ((node.data.members || []).length < 5) {
                                        const newMembers = [...(node.data.members || []), { role: 'New Role', model: 'gpt-4', systemPrompt: '' }];
                                        handleChange('members', newMembers);
                                    }
                                }}
                                disabled={(node.data.members || []).length >= 5}
                                style={{
                                    background: (node.data.members || []).length >= 5 ? 'transparent' : 'rgba(16, 185, 129, 0.1)',
                                    border: (node.data.members || []).length >= 5 ? 'none' : '1px solid rgba(16, 185, 129, 0.2)',
                                    color: (node.data.members || []).length >= 5 ? '#4b5563' : '#10b981',
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    cursor: (node.data.members || []).length >= 5 ? 'default' : 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                {(node.data.members || []).length >= 5 ? 'Max Reached' : '+ Add Agent'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(node.data.members || []).map((member: any, index: number) => (
                                <div key={index} style={{ background: '#131519', border: '1px solid #2b2d35', borderRadius: '6px', padding: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <input
                                            value={member.role}
                                            onChange={(e) => {
                                                const newMembers = [...node.data.members];
                                                newMembers[index].role = e.target.value;
                                                handleChange('members', newMembers);
                                            }}
                                            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, width: '100%' }}
                                            placeholder="Role Name"
                                        />
                                        <button
                                            onClick={() => {
                                                const newMembers = [...node.data.members];
                                                newMembers.splice(index, 1);
                                                handleChange('members', newMembers);
                                            }}
                                            style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '6px' }}>
                                            <select
                                                className="input"
                                                value={availableModels.find(m => m.model === member.model)?.provider || (member.model.includes('claude') ? 'anthropic' : 'openai')}
                                                onChange={(e) => {
                                                    const newProvider = e.target.value;
                                                    const firstModel = availableModels.find(m => m.provider === newProvider)?.model;
                                                    if (firstModel) {
                                                        const newMembers = [...node.data.members];
                                                        newMembers[index].model = firstModel;
                                                        handleChange('members', newMembers);
                                                    }
                                                }}
                                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#9ca3af', fontSize: '10px', padding: '4px' }}
                                            >
                                                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>

                                            <select
                                                className="input"
                                                value={member.model}
                                                onChange={(e) => {
                                                    const newMembers = [...node.data.members];
                                                    newMembers[index].model = e.target.value;
                                                    handleChange('members', newMembers);
                                                }}
                                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontSize: '11px', padding: '4px' }}
                                            >
                                                {availableModels.length > 0 ? (
                                                    availableModels
                                                        .filter(m => m.provider === (availableModels.find(am => am.model === member.model)?.provider || (member.model.includes('claude') ? 'anthropic' : 'openai')))
                                                        .map(m => <option key={m.model} value={m.model}>{m.label}</option>)
                                                ) : (
                                                    <>
                                                        <option value="gpt-4">GPT-4</option>
                                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                                        <option value="claude-3-opus">Claude 3 Opus</option>
                                                    </>
                                                )}
                                            </select>
                                        </div>

                                        <textarea
                                            className="input"
                                            rows={2}
                                            value={member.systemPrompt || ''}
                                            onChange={(e) => {
                                                const newMembers = [...node.data.members];
                                                newMembers[index].systemPrompt = e.target.value;
                                                handleChange('members', newMembers);
                                            }}
                                            placeholder="Role Instructions..."
                                            style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tool Node */}
                {node.type === 'tool' && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                Action Type
                            </label>
                            <select
                                className="input"
                                value={node.data.action || 'webhook'}
                                onChange={(e) => handleChange('action', e.target.value)}
                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                            >
                                <option value="webhook">HTTP/Webhook</option>
                                <option value="telegram">Telegram</option>
                                <option value="search">Web Search</option>
                                <option value="database">Database Query</option>
                                <option value="email">Send Email</option>
                                <option value="execute_command">Execute Local Command</option>
                            </select>
                        </div>

                        {/* Execute Command Configuration */}
                        {node.data.action === 'execute_command' && (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        Command
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={node.data.command || ''}
                                        onChange={(e) => handleChange('command', e.target.value)}
                                        placeholder="ls -la"
                                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        Working Directory
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={node.data.cwd || ''}
                                        onChange={(e) => handleChange('cwd', e.target.value)}
                                        placeholder="(Optional) /path/to/cwd"
                                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                                    />
                                </div>
                                <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                    <p style={{ fontSize: '11px', color: '#60a5fa', margin: 0, lineHeight: 1.4 }}>
                                        ⚠️ Requires <strong>Conductor Bridge</strong> running locally.<br />
                                        <code>npm start</code> in bridge folder.
                                    </p>
                                </div>
                            </>
                        )}

                        {/* HTTP / Webhook Configuration */}
                        {(node.data.action === 'webhook' || node.data.action === 'http') && (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        URL
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={node.data.url || ''}
                                        onChange={(e) => handleChange('url', e.target.value)}
                                        placeholder="https://api.example.com/endpoint"
                                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        Method
                                    </label>
                                    <select
                                        className="input"
                                        value={node.data.method || 'POST'}
                                        onChange={(e) => handleChange('method', e.target.value)}
                                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                                    >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="PUT">PUT</option>
                                        <option value="DELETE">DELETE</option>
                                    </select>
                                </div>
                            </>
                        )}

                        {/* Telegram Configuration */}
                        {node.data.action === 'telegram' && (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        Chat ID
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={node.data.chatId || ''}
                                        onChange={(e) => handleChange('chatId', e.target.value)}
                                        placeholder="e.g. 123456789"
                                        style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)' }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                        User or Group ID to send message to.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                        Message
                                    </label>
                                    <textarea
                                        className="input"
                                        rows={4}
                                        value={node.data.message || ''}
                                        onChange={(e) => handleChange('message', e.target.value)}
                                        placeholder="Message content..."
                                        style={{
                                            background: '#1f2127',
                                            border: '1px solid #3a3d45',
                                            color: '#e5e7eb',
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <p style={{ fontSize: '11px', color: '#6b7280' }}>
                                        Leave empty to send the current execution context result.
                                    </p>
                                </div>

                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input
                                            type="checkbox"
                                            id="waitForReply"
                                            checked={node.data.waitForReply || false}
                                            onChange={(e) => handleChange('waitForReply', e.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <label htmlFor="waitForReply" style={{ fontSize: '12px', color: '#e5e7eb', cursor: 'pointer', fontWeight: 500 }}>
                                            Wait for Reply
                                        </label>
                                    </div>
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', marginLeft: '20px' }}>
                                        Pause workflow until user replies via Telegram.
                                    </p>
                                </div>
                                {!credentials.some(c => c.provider === 'telegram') && (
                                    <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <p style={{ fontSize: '11px', color: '#f59e0b' }}>
                                            ⚠️ Telegram Bot not configured. Go to <a href="/settings" style={{ textDecoration: 'underline' }}>Settings</a>.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Logic Node */}
                {node.type === 'logic' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                            Condition Expression
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={node.data.condition || ''}
                            onChange={(e) => handleChange('condition', e.target.value)}
                            placeholder="e.g. context.includes('success')"
                            style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb', fontFamily: 'var(--font-mono)' }}
                        />
                        <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                            JavaScript expression returning true/false
                        </p>
                    </div>
                )}

                {/* Coding Node */}
                {node.type === 'coding' && (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                Runtime
                            </label>
                            <select
                                className="input"
                                value={node.data.language || 'python'}
                                onChange={(e) => handleChange('language', e.target.value)}
                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                            >
                                <option value="python">Python 3.11</option>
                                <option value="javascript">Node.js 20</option>
                                <option value="bash">Bash Shell</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                                Instruction
                            </label>
                            <textarea
                                className="input"
                                value={node.data.description || ''}
                                onChange={(e) => handleChange('description', e.target.value)}
                                placeholder="Describe what the code should do..."
                                rows={6}
                                style={{ background: '#1f2127', border: '1px solid #3a3d45', color: '#e5e7eb' }}
                            />
                        </div>
                    </>
                )}
                {lastResult && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid #3a3d45', paddingTop: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Zap size={12} /> LAST RUN OUTPUT
                        </div>
                        <div style={{
                            background: '#0f1115',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #2b2d35',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: '#d1d5db',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: '300px',
                            overflowY: 'auto'
                        }}>
                            {(() => {
                                const display = lastResult.output ?? lastResult;
                                return typeof display === 'string' ? display : JSON.stringify(display, null, 2);
                            })()}
                        </div>
                    </div>
                )}
            </div>

            <div style={{ padding: '16px', borderTop: '1px solid #3a3d45', display: 'flex', gap: '12px', background: '#1f2127' }}>
                <button
                    onClick={() => onDelete(node.id)}
                    className="btn btn-secondary"
                    style={{ flex: 1, color: '#ef4444', borderColor: '#ef4444', justifyContent: 'center', background: 'transparent' }}
                >
                    <Trash2 size={14} />
                    Delete Node
                </button>
            </div>
        </div>
    );
}
