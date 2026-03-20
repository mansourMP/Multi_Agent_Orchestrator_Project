'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe } from 'lucide-react';

type ResearchNodeData = {
    label?: string;
};

const ResearchNode = ({ data, selected }: { data: ResearchNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#3b82f6'; // Blue for research

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
                minWidth: '150px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : 'none',
                animation: selected ? 'breathe 3s ease-in-out infinite' : 'none',
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
                    position: 'relative',
                }}>
                    <Globe size={24} color={accentColor} strokeWidth={1.5} />
                    <div style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--success-fg)',
                        border: '2px solid var(--bg-surface)',
                    }} />
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}>
                        {data.label || 'Research'}
                    </div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        marginTop: '3px',
                    }}>
                        Web Search
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

            <style jsx>{`
                @keyframes breathe {
                    0%, 100% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 60px ${accentColor}20; }
                    50% { box-shadow: 0 0 0 2px ${accentColor}, 0 20px 40px rgba(0,0,0,0.25), 0 0 80px ${accentColor}30; }
                }
            `}</style>
        </div>
    );
};

export default memo(ResearchNode);
