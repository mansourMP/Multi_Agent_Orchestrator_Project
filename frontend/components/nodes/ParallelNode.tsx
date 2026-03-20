'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitMerge, Zap } from 'lucide-react';

type ParallelNodeData = {
    label?: string;
};

const ParallelNode = ({ data, selected }: { data: ParallelNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#06b6d4'; // Cyan for parallel

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
            }}
        >
            <div style={{
                height: '4px',
                background: `linear-gradient(90deg, ${accentColor}, #22d3ee)`,
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
                    <GitMerge size={24} color={accentColor} strokeWidth={1.5} />
                    {/* Speed indicator */}
                    <div style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        background: accentColor,
                        borderRadius: '50%',
                        width: 16,
                        height: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--bg-surface)',
                    }}>
                        <Zap size={8} color="#fff" fill="#fff" />
                    </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                    }}>
                        {data.label || 'Parallel'}
                    </div>
                    <div style={{
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        marginTop: '3px',
                    }}>
                        Concurrent
                    </div>
                </div>

                {/* Branch labels */}
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '4px',
                }}>
                    <div style={{
                        padding: '2px 6px',
                        background: `${accentColor}12`,
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: 600,
                        color: accentColor,
                        border: `1px solid ${accentColor}20`,
                    }}>
                        A
                    </div>
                    <div style={{
                        padding: '2px 6px',
                        background: `${accentColor}12`,
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: 600,
                        color: accentColor,
                        border: `1px solid ${accentColor}20`,
                    }}>
                        B
                    </div>
                </div>
            </div>

            {/* Two output handles */}
            <Handle
                type="source"
                position={Position.Right}
                id="branch-1"
                style={{
                    background: 'var(--bg-surface)',
                    width: 10,
                    height: 10,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    top: '40%',
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="branch-2"
                style={{
                    background: 'var(--bg-surface)',
                    width: 10,
                    height: 10,
                    border: `3px solid ${accentColor}`,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    top: '60%',
                }}
            />
        </div>
    );
};

export default memo(ParallelNode);
