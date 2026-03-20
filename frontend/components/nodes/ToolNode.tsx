'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Wrench, Send, Search, Database, Globe, type LucideIcon } from 'lucide-react';

type ToolNodeData = {
    label?: string;
    action?: string;
};

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
    telegram: Send,
    search: Search,
    database: Database,
    webhook: Globe,
    http: Globe,
};

const ToolNode = ({ data, selected }: { data: ToolNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#14b8a6'; // Teal for tools

    const Icon = TOOL_ICON_MAP[data.action || ''] || Wrench;

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: 'var(--bg-surface)',
                borderRadius: '16px',
                boxShadow: selected
                    ? `0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20`
                    : isHovered
                        ? '0 12px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)'
                        : '0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
                minWidth: '140px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : 'none',
            }}
        >
            <div style={{
                height: '4px',
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)`,
            }} />

            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            <div style={{
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
            }}>
                <div style={{
                    width: 52,
                    height: 52,
                    borderRadius: '14px',
                    background: `linear-gradient(135deg, ${accentColor}15 0%, ${accentColor}05 100%)`,
                    border: `1px solid ${accentColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Icon size={24} color={accentColor} strokeWidth={1.5} />
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}>
                        {data.label || 'Tool'}
                    </div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        marginTop: '3px',
                    }}>
                        Integration
                    </div>
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />
        </div>
    );
};

export default memo(ToolNode);
