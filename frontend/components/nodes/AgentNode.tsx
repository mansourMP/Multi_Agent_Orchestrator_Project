'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot } from 'lucide-react';

const AgentNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = (data?.color as string) || '#f97316';
    const provider = (data.provider || 'openai').toUpperCase();
    const duty = (data.duty as string) || 'Duty: Deliver team value with clarity.';
    const prompt = (data.prompt as string) || 'Prompt not initialized';
    const status = (data.status as string) || 'idle';

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: '#fff',
                borderRadius: '16px',
                boxShadow: selected
                    ? `0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20`
                    : isHovered
                        ? '0 12px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)'
                        : '0 4px 16px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)',
                minWidth: '170px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : 'none',
                animation: selected ? 'breathe 3s ease-in-out infinite' : 'none',
            }}
        >
            {/* Accent strip */}
            <div style={{
                height: '4px',
                background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80)`,
            }} />

            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: '#fff',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            <div style={{
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#1e293b',
                        }}>
                            {data.label || 'AI Agent'}
                        </div>
                        <div style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: '0.1em'
                        }}>
                            {provider}
                        </div>
                    </div>
                    <div style={{
                        fontSize: '10px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: `1px solid ${accentColor}30`,
                        color: accentColor,
                        background: 'rgba(249,115,22,0.05)'
                    }}>
                        {status.toUpperCase()}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '14px',
                        background: `linear-gradient(145deg, ${accentColor}15, #fefefe10)`,
                        border: `1px solid ${accentColor}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                    }}>
                        <Bot size={22} color={accentColor} strokeWidth={1.5} />
                        <div style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: '#22c55e',
                            border: '2px solid #fff',
                            animation: selected ? 'pulse 2s ease-in-out infinite' : 'none',
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>
                            {data.modelId || 'gpt-4'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{data.role || 'Worker'}</span>
                            <span>•</span>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{data.description || 'Autonomous reasoning'}</span>
                        </div>
                    </div>
                </div>

                <div style={{ fontSize: '10px', color: '#475569', minHeight: '40px' }}>
                    {duty}
                </div>
                <div style={{
                    fontSize: '9px',
                    color: '#0f172a',
                    background: '#f1f5f9',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontStyle: 'italic'
                }}>
                    {prompt.length > 50 ? `${prompt.substring(0, 50)}...` : prompt}
                </div>
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>
                    Tools: {(data.tools || []).slice(0, 3).join(', ') || 'Core toolkit'}
                </div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                style={{
                    background: '#fff',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
            />

            <style jsx>{`
                @keyframes breathe {
                    0%, 100% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20; }
                    50% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 80px ${accentColor}30; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
};

export default memo(AgentNode);
