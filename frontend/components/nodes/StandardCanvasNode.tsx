'use client';

import { memo, useState, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

type StandardCanvasNodeProps = {
    kindLabel: string;
    title: string;
    subtitle: string;
    accentColor: string;
    icon: ReactNode;
    selected?: boolean;
};

function StandardCanvasNodeComponent({
    kindLabel,
    title,
    subtitle,
    accentColor,
    icon,
    selected,
}: StandardCanvasNodeProps) {
    const [isHovered, setIsHovered] = useState(false);

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
                id="top"
                position={Position.Top}
                style={{
                    background: 'var(--bg-surface)',
                    width: 12,
                    height: 12,
                    border: `3px solid ${accentColor}`,
                }}
            />
            <div style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 42,
                            height: 42,
                            borderRadius: 12,
                            background: `${accentColor}14`,
                            border: `1px solid ${accentColor}25`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: accentColor,
                        }}
                    >
                        {icon}
                    </div>
                    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                        <div
                            style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: 'var(--text-tertiary)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                            }}
                        >
                            {kindLabel}
                        </div>
                        <div
                            style={{
                                fontSize: '14px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                            }}
                        >
                            {title}
                        </div>
                    </div>
                </div>
                <div
                    style={{
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                    title={subtitle}
                >
                    {subtitle}
                </div>
            </div>
            <Handle
                type="source"
                id="bottom"
                position={Position.Bottom}
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
}

const StandardCanvasNode = memo(StandardCanvasNodeComponent);

export default StandardCanvasNode;
