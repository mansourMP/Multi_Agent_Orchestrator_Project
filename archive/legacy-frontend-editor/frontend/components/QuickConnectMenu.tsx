'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Zap, Cpu, Code2, Eye, Wrench, GitBranch, GitMerge, UserCheck, Send, Database, Globe } from 'lucide-react';

interface QuickConnectMenuProps {
    x: number;
    y: number;
    onSelect: (type: string, data?: any) => void;
    onClose: () => void;
}

const ITEMS = [
    { label: 'Agent', type: 'agent', icon: Cpu, color: '#ff6d5a', desc: 'Reasoning Agent (LLM)' },
    { label: 'Coding', type: 'coding', icon: Code2, color: '#ff6d5a', desc: 'Write & Execute Code' },
    { label: 'Telegram', type: 'tool', data: { action: 'telegram', label: 'Telegram Bot' }, icon: Send, color: '#0088cc', desc: 'Send Message / Wait' },
    { label: 'Web Search', type: 'tool', data: { action: 'search', label: 'Web Search' }, icon: Search, color: '#4285f4', desc: 'Google Search' },
    { label: 'Database', type: 'tool', data: { action: 'database', label: 'Database' }, icon: Database, color: '#10b981', desc: 'Query SQL/Vector' },
    { label: 'HTTP', type: 'tool', data: { action: 'webhook', label: 'HTTP Request' }, icon: Globe, color: '#6b7280', desc: 'API Call' },
    { label: 'If / Else', type: 'logic', icon: GitBranch, color: '#3b82f6', desc: 'Conditional Logic' },
    { label: 'Approval', type: 'approval', icon: UserCheck, color: '#3b82f6', desc: 'Wait for Human' },
];

export default function QuickConnectMenu({ x, y, onSelect, onClose }: QuickConnectMenuProps) {
    const [search, setSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const filtered = ITEMS.filter(i =>
        i.label.toLowerCase().includes(search.toLowerCase()) ||
        i.desc.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{
            position: 'absolute',
            left: x,
            top: y,
            width: '280px',
            background: '#131519',
            border: '1px solid #3a3d45',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #2b2d35' }}>
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Search nodes..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '13px',
                        width: '100%',
                        outline: 'none'
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && filtered.length > 0) {
                            const item = filtered[0];
                            onSelect(item.type, item.data);
                        }
                        if (e.key === 'Escape') onClose();
                    }}
                />
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {filtered.map((item, i) => (
                    <div
                        key={i}
                        className="hover:bg-[#2b2d35]"
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'background 0.1s'
                        }}
                        onClick={() => onSelect(item.type, item.data)}
                        onMouseEnter={e => e.currentTarget.style.background = '#2b2d35'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <div style={{
                            width: '24px', height: '24px', borderRadius: '4px',
                            background: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <item.icon size={14} color={item.color} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', color: '#e5e7eb', fontWeight: 500 }}>{item.label}</span>
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>{item.desc}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
