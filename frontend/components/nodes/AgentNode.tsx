'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BrainCircuit } from 'lucide-react';

type AgentNodeData = {
    color?: string;
    provider?: string;
    duty?: string;
    prompt?: string;
    status?: string;
    label?: string;
    modelId?: string;
    role?: string;
    description?: string;
    tools?: string[];
};

const AgentNode = ({ data, selected }: { data: AgentNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#7c3aed';
    const status = (data.status as string) || 'idle';
    const description = (data.description as string) || (data.duty as string) || 'Autonomous reasoning';

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                background: 'var(--bg-surface)',
                borderRadius: '12px',
                border: '1px solid rgba(15, 23, 42, 0.08)',
                borderLeft: `4px solid ${accentColor}`,
                boxShadow: selected
                    ? `0 0 0 2px ${accentColor}55, 0 16px 30px rgba(15, 23, 42, 0.14)`
                    : isHovered
                        ? '0 10px 22px rgba(15, 23, 42, 0.12)'
                        : '0 6px 16px rgba(15, 23, 42, 0.08)',
                width: '220px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : isHovered ? 'translateY(-1px)' : 'none',
                animation: 'workflowNodeEnter 200ms ease-out both',
            }}
        >
            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                }}
            />

            <div style={{
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                        }}>
                            Agent
                        </div>
                        <div style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            marginTop: 2,
                        }}>
                            {data.label || 'AI Agent'}
                        </div>
                    </div>
                    <div style={{
                        fontSize: '10px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        border: `1px solid ${accentColor}30`,
                        color: accentColor,
                        background: `${accentColor}12`,
                    }}>
                        {status.toUpperCase()}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        background: `${accentColor}12`,
                        border: `1px solid ${accentColor}24`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <BrainCircuit size={22} color={accentColor} strokeWidth={1.8} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {data.modelId || 'gpt-4'}
                        </div>
                        <div
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-tertiary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                            title={description}
                        >
                            {description}
                        </div>
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
                }}
            />

            <style jsx>{`
                @keyframes workflowNodeEnter {
                    from {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </div>
    );
};

export default memo(AgentNode);
