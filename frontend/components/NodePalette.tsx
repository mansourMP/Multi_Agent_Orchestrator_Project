'use client';

import React, { useState, useMemo } from 'react';
import {
    Cpu, Wrench, Zap, GitBranch, UserCheck,
    GitMerge, Eye, Code2, Search, Box, Users, Megaphone, PenTool, ShieldCheck
} from 'lucide-react';

// Define all nodes with their metadata for search
const ALL_NODES = [
    { section: 'Triggers', type: 'trigger', icon: Zap, label: 'Webhook / Start', color: '#f59e0b', data: {} },
    { section: 'Integrations', type: 'tool', icon: Wrench, label: 'Telegram', color: '#0088cc', data: { action: 'telegram', label: 'Telegram Bot' } },
    { section: 'Integrations', type: 'tool', icon: Search, label: 'Web Search', color: '#4285f4', data: { action: 'search', label: 'Google Search' } },
    { section: 'Integrations', type: 'tool', icon: Box, label: 'Database', color: '#10b981', data: { action: 'database', label: 'Database' } },
    { section: 'Integrations', type: 'tool', icon: Wrench, label: 'HTTP Request', color: '#6b7280', data: { action: 'webhook', label: 'HTTP Request' } },
    { section: 'Agents', type: 'agent', icon: Cpu, label: 'Reasoning Agent', color: '#ff6d5a', data: {} },
    { section: 'Agents', type: 'coding', icon: Code2, label: 'Coding Agent', color: '#ff6d5a', data: {} },
    { section: 'Agents', type: 'research', icon: Search, label: 'Research Agent', color: '#ff6d5a', data: {} },
    { section: 'Agents', type: 'vision', icon: Eye, label: 'Vision Agent', color: '#ff6d5a', data: {} },
    { section: 'Departments', type: 'squad', icon: Users, label: 'Executive Board', color: '#8b5cf6', data: { label: 'Executive Board', color: '#8b5cf6', members: [{ role: 'CEO', model: 'gpt-4-turbo', systemPrompt: 'You are the CEO. Coordinate the team and make final decisions.' }] } },
    { section: 'Departments', type: 'squad', icon: Megaphone, label: 'Content Studio', color: '#ec4899', data: { label: 'Content Studio', color: '#ec4899', members: [{ role: 'Lead Editor', model: 'gpt-4', systemPrompt: 'Plan content calendar and review drafts.' }] } },
    { section: 'Departments', type: 'squad', icon: Code2, label: 'Engineering Team', color: '#3b82f6', data: { label: 'Engineering Team', color: '#3b82f6', members: [{ role: 'Tech Lead', model: 'claude-3-opus', systemPrompt: 'Design architecture and review code.' }] } },
    { section: 'Departments', type: 'squad', icon: PenTool, label: 'Designers', color: '#f472b6', data: { label: 'Design Team', color: '#f472b6', members: [{ role: 'Creative Director', model: 'gpt-4', systemPrompt: 'Maintain high aesthetic standards and innovative direction.' }] } },
    { section: 'Departments', type: 'squad', icon: ShieldCheck, label: 'Quality Check', color: '#10b981', data: { label: 'Quality Check', color: '#10b981', members: [{ role: 'Chief Reviewer', model: 'gpt-4', systemPrompt: 'Critically review output for errors and logical fallacies.' }] } },
    { section: 'Departments', type: 'squad', icon: Users, label: 'Custom Squad', color: '#6b7280', data: { label: 'New Squad', color: '#6b7280', members: [{ role: 'Team Lead', model: 'gpt-4', systemPrompt: '' }] } },
    { section: 'Logic', type: 'logic', icon: GitBranch, label: 'If / Else', color: '#3b82f6', data: {} },
    { section: 'Logic', type: 'parallel', icon: GitMerge, label: 'Parallel', color: '#3b82f6', data: {} },
    { section: 'Logic', type: 'approval', icon: UserCheck, label: 'Human Approval', color: '#3b82f6', data: {} },
];

export default function NodePalette() {
    const [searchQuery, setSearchQuery] = useState('');

    const onDragStart = (event: React.DragEvent, nodeType: string, initialData: any = {}) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.setData('application/json', JSON.stringify(initialData));
        event.dataTransfer.effectAllowed = 'move';
    };

    // Filter nodes based on search query
    const filteredNodes = useMemo(() => {
        if (!searchQuery.trim()) return ALL_NODES;
        const query = searchQuery.toLowerCase();
        return ALL_NODES.filter(node =>
            node.label.toLowerCase().includes(query) ||
            node.section.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    // Group filtered nodes by section
    const groupedNodes = useMemo(() => {
        const groups: Record<string, typeof ALL_NODES> = {};
        filteredNodes.forEach(node => {
            if (!groups[node.section]) groups[node.section] = [];
            groups[node.section].push(node);
        });
        return groups;
    }, [filteredNodes]);

    return (
        <div style={{
            width: '240px',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-sidebar)',
        }}>
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                    Nodes
                </div>
                {/* Search Input */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--bg-element)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                }}>
                    <Search size={14} color="var(--text-tertiary)" />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '12px',
                            width: '100%',
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-tertiary)',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '14px',
                                lineHeight: 1,
                            }}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* No Results State */}
                {filteredNodes.length === 0 && (
                    <div style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: 'var(--text-tertiary)',
                        fontSize: '12px'
                    }}>
                        <Search size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                        <div>No nodes match "{searchQuery}"</div>
                    </div>
                )}

                {/* Dynamic Sections based on filtered results */}
                {Object.entries(groupedNodes).map(([section, nodes]) => (
                    <PaletteSection key={section} title={section}>
                        {nodes.map((node, idx) => (
                            <PaletteItem
                                key={`${node.type}-${idx}`}
                                icon={node.icon}
                                label={node.label}
                                color={node.color}
                                onDragStart={(e: React.DragEvent) => onDragStart(e, node.type, node.data)}
                            />
                        ))}
                    </PaletteSection>
                ))}

                {/* Node count indicator */}
                {filteredNodes.length > 0 && searchQuery && (
                    <div style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        textAlign: 'center',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--border-subtle)'
                    }}>
                        Showing {filteredNodes.length} of {ALL_NODES.length} nodes
                    </div>
                )}

            </div>
        </div>
    );
}

function PaletteSection({ title, children }: any) {
    return (
        <div>
            <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                marginBottom: '8px',
                paddingLeft: '4px'
            }}>
                {title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {children}
            </div>
        </div>
    );
}

function PaletteItem({ icon: Icon, label, color, onDragStart }: any) {
    return (
        <div
            draggable
            onDragStart={onDragStart}
            // Use standard CSS class for hover to match Sidebar
            className="hover:bg-[rgba(255,255,255,0.04)] group"
            style={{
                padding: '10px 12px',
                borderRadius: '12px', // iOS Squircles match Sidebar
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-secondary)', // Match Sidebar inactive color
                transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                border: 'none' // Remove transparent border if not needed
            }}
        >
            <Icon size={18} color={color} style={{ opacity: 0.9, flexShrink: 0 }} />
            <span className="group-hover:text-[var(--text-primary)] transition-colors">{label}</span>
        </div>
    );
}
