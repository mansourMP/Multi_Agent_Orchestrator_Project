'use client';
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

type TriggerNodeData = {
    label?: string;
    triggerType?: string;
};

const TriggerNode = ({ data, selected }: { data: TriggerNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const accentColor = '#f59e0b';

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
                    ? `0 0 0 2px ${accentColor}50, 0 14px 28px rgba(15, 23, 42, 0.14)`
                    : isHovered
                        ? '0 10px 22px rgba(15, 23, 42, 0.12)'
                        : '0 6px 16px rgba(15, 23, 42, 0.08)',
                minWidth: '220px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                transform: selected ? 'translateY(-2px)' : isHovered ? 'translateY(-1px)' : 'none',
                animation: 'workflowNodeEnter 200ms ease-out both',
            }}
        >
            <div style={{
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: '42px minmax(0, 1fr)',
                alignItems: 'center',
                gap: '12px',
            }}>
                <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '12px',
                    background: `${accentColor}14`,
                    border: `1px solid ${accentColor}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <Zap size={20} color={accentColor} strokeWidth={1.8} />
                </div>

                <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                    }}>
                        {data.label || 'Start'}
                    </div>
                    <div style={{
                        fontSize: '12px',
                        color: 'var(--text-tertiary)',
                    }}>
                        {data.triggerType || 'Webhook'}
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

export default memo(TriggerNode);
