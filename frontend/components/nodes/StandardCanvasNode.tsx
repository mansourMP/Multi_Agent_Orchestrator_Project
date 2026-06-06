'use client';

import { memo, useMemo, useState, type ReactNode } from 'react';
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
    const isActive = isHovered || Boolean(selected);

    const handleStyle = useMemo(
        () => ({
            background: 'var(--bg-surface)',
            width: 16,
            height: 16,
            border: `4px solid ${accentColor}`,
            borderRadius: 999,
            boxShadow: isActive ? `0 0 0 5px ${accentColor}26, 0 10px 18px ${accentColor}20` : `0 0 0 2px ${accentColor}12`,
            transition: 'box-shadow 160ms ease, transform 160ms ease',
        }),
        [accentColor, isActive],
    );

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: 'relative',
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, white 8%) 0%, var(--bg-surface) 100%)',
                borderRadius: 16,
                border: `1px solid ${isActive ? `${accentColor}44` : 'rgba(15, 23, 42, 0.08)'}`,
                boxShadow: selected
                    ? `0 0 0 1px ${accentColor}3d, 0 18px 34px rgba(15, 23, 42, 0.16), 0 6px 18px rgba(15, 23, 42, 0.08)`
                    : isHovered
                        ? '0 16px 30px rgba(15, 23, 42, 0.13), 0 6px 16px rgba(15, 23, 42, 0.08)'
                        : '0 8px 18px rgba(15, 23, 42, 0.08)',
                width: 244,
                overflow: 'visible',
                transition: 'box-shadow 180ms ease, transform 180ms ease, border-color 180ms ease',
                transform: selected ? 'translateY(-2px)' : isHovered ? 'translateY(-1px)' : 'none',
                animation: 'workflowNodeEnter 220ms ease-out both',
            }}
        >
            {showTargetHandle ? (
                <Handle
                    type="target"
                    id="top"
                    position={Position.Top}
                    style={{ ...handleStyle, top: -10 }}
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
                                boxShadow: isActive ? `0 8px 18px ${accentColor}18` : 'none',
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
                    style={{ ...handleStyle, bottom: -10 }}
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
