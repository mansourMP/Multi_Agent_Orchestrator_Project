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
    badge?: string | null;
    showTargetHandle?: boolean;
    showSourceHandle?: boolean;
};

function StandardCanvasNodeComponent({
    kindLabel,
    title,
    subtitle,
    accentColor,
    icon,
    selected,
    badge = null,
    showTargetHandle = true,
    showSourceHandle = true,
}: StandardCanvasNodeProps) {
    const [isHovered, setIsHovered] = useState(false);
    const isActive = Boolean(selected);

    return (
        <div
            className="canvas-node"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: 'relative',
                background: 'white',
                borderRadius: 12,
                border: isActive ? '1.5px solid #7c3aed' : '1.5px solid var(--canvas-node-border-color)',
                boxShadow: isActive
                    ? '0 0 0 6px var(--canvas-selected-glow), 0 4px 12px rgba(0,0,0,0.12)'
                    : isHovered
                        ? '0 4px 12px rgba(0,0,0,0.12)'
                        : '0 1px 3px rgba(0,0,0,0.08)',
                width: 244,
                overflow: 'visible',
                transition: 'box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease',
                transform: isHovered ? 'translateY(-1px)' : 'none',
                animation: 'workflowNodeEnter 220ms ease-out both',
            }}
        >
            {showTargetHandle ? (
                <Handle
                    type="target"
                    id="top"
                    position={Position.Top}
                    style={{ top: -6 }}
                />
            ) : null}

            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 16,
                    borderLeft: `4px solid ${accentColor}`,
                    pointerEvents: 'none',
                }}
            />

            <div style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: 14,
                                background: `${accentColor}16`,
                                border: `1px solid ${accentColor}28`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: accentColor,
                                boxShadow: isActive || isHovered ? `0 8px 18px ${accentColor}18` : 'none',
                                flexShrink: 0,
                            }}
                        >
                            {icon}
                        </div>
                        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    color: 'var(--text-tertiary)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                }}
                            >
                                {kindLabel}
                            </div>
                            <div
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 750,
                                    letterSpacing: '-0.02em',
                                    color: 'var(--text-primary)',
                                    lineHeight: 1.2,
                                }}
                            >
                                {title}
                            </div>
                        </div>
                    </div>
                    {badge ? (
                        <div
                            style={{
                                minHeight: 22,
                                padding: '0 8px',
                                borderRadius: 999,
                                border: `1px solid ${accentColor}2e`,
                                background: `${accentColor}12`,
                                color: accentColor,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '10px',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}
                        >
                            {badge}
                        </div>
                    ) : null}
                </div>

                <div
                    style={{
                        minHeight: 34,
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: 'color-mix(in srgb, var(--bg-app) 55%, var(--bg-surface) 45%)',
                        border: '1px solid rgba(15, 23, 42, 0.05)',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                        display: 'flex',
                        alignItems: 'center',
                    }}
                    title={subtitle}
                >
                    <span
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {subtitle}
                    </span>
                </div>
            </div>

            {showSourceHandle ? (
                <Handle
                    type="source"
                    id="bottom"
                    position={Position.Bottom}
                    style={{ bottom: -6 }}
                />
            ) : null}

            <style jsx>{`
                @keyframes workflowNodeEnter {
                    from {
                        opacity: 0;
                        transform: translateY(12px) scale(0.97);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
            `}</style>
        </div>
    );
}

const StandardCanvasNode = memo(StandardCanvasNodeComponent);

export default StandardCanvasNode;
