'use client';

import { memo, type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';

type StandardCanvasNodeProps = {
    kindLabel: string;
    title: string;
    subtitle: string;
    accentColor: string;
    icon: ReactNode;
    selected?: boolean;
    badge?: string | null;
    status?: string | null;
    showTargetHandle?: boolean;
    showSourceHandle?: boolean;
    variant?: 'default' | 'trigger';
};

function StandardCanvasNodeComponent({
    kindLabel,
    title,
    subtitle,
    accentColor,
    icon,
    selected,
    badge = null,
    status = null,
    showTargetHandle = true,
    showSourceHandle = true,
    variant = 'default',
}: StandardCanvasNodeProps) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const statusClass = ['running', 'waiting', 'error', 'success'].includes(normalizedStatus)
        ? normalizedStatus
        : '';

    return (
        <div
            className={`canvas-node ${variant === 'trigger' ? 'trigger' : 'configurable'} ${selected ? 'selected' : ''} ${statusClass}`.trim()}
            data-node-kind={kindLabel}
            data-node-badge={badge || undefined}
            data-node-status={normalizedStatus || undefined}
            style={{
                ['--canvas-node-accent' as string]: accentColor,
            }}
        >
            {showTargetHandle ? (
                <Handle
                    type="target"
                    id="top"
                    position={Position.Left}
                    style={{ left: -4 }}
                />
            ) : null}

            <div className="icon">{icon}</div>
            <div className="description">
                <div className="label">{title}</div>
                <div className="subtitle" title={subtitle}>
                    {subtitle}
                </div>
            </div>

            {showSourceHandle ? (
                <Handle
                    type="source"
                    id="bottom"
                    position={Position.Right}
                    style={{ right: -4 }}
                />
            ) : null}

            <style jsx>{`
                .canvas-node {
                    --canvas-node--border-width: 1.5px;
                    --trigger-node--radius: 36px;
                    position: relative;
                    height: 80px;
                    width: 220px;
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    background: var(--canvas-node--color--background, white);
                    background-clip: padding-box;
                    border: var(--canvas-node--border-width) solid
                        var(--canvas-node--border-color, var(--canvas-node-border-color));
                    border-radius: 8px;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
                    transition: box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease;
                    padding: 0 12px;
                    gap: 12px;
                    overflow: visible;
                }

                .canvas-node:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
                }

                .canvas-node.trigger {
                    border-radius: var(--trigger-node--radius) 8px 8px var(--trigger-node--radius);
                }

                .canvas-node.configurable .description {
                    position: relative;
                    margin: 0;
                    width: auto;
                    min-width: 0;
                    flex-grow: 1;
                    flex-shrink: 1;
                    overflow: hidden;
                }

                .canvas-node.selected {
                    box-shadow: 0 0 0 calc(6px * var(--canvas-zoom-compensation-factor, 1))
                            var(--canvas--color--selected-transparent),
                        0 1px 3px rgba(0, 0, 0, 0.08);
                }

                .canvas-node.success {
                    --canvas-node--border-width: 2px;
                    --canvas-node--border-color: var(--success-base);
                }

                .canvas-node.error {
                    --canvas-node--border-color: var(--error-base);
                }

                .canvas-node.running,
                .canvas-node.waiting {
                    border-color: transparent;
                }

                .canvas-node.running::after,
                .canvas-node.waiting::after {
                    content: '';
                    position: absolute;
                    inset: -3px;
                    border-radius: inherit;
                    z-index: -1;
                    background: conic-gradient(
                        from var(--node--gradient-angle),
                        rgba(255, 109, 90, 1),
                        rgba(255, 109, 90, 1) 20%,
                        rgba(255, 109, 90, 0.2) 35%,
                        rgba(255, 109, 90, 0.2) 65%,
                        rgba(255, 109, 90, 1) 90%,
                        rgba(255, 109, 90, 1)
                    );
                }

                .canvas-node.running::after {
                    animation: border-rotate 1.5s linear infinite;
                }

                .canvas-node.waiting::after {
                    animation: border-rotate 4.5s linear infinite;
                }

                .icon {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--canvas-node-accent);
                    flex-shrink: 0;
                }

                .description {
                    top: 100%;
                    width: 100%;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    pointer-events: none;
                }

                .label {
                    font-size: 16px;
                    text-align: left;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 2;
                    overflow: hidden;
                    overflow-wrap: anywhere;
                    font-weight: 500;
                    line-height: 1.2;
                    color: var(--text-primary);
                }

                .subtitle {
                    width: 100%;
                    text-align: left;
                    color: var(--text-secondary);
                    font-size: 13px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.2;
                    font-weight: 400;
                }

                @property --node--gradient-angle {
                    syntax: '<angle>';
                    initial-value: 0deg;
                    inherits: false;
                }

                @keyframes border-rotate {
                    from {
                        --node--gradient-angle: 0deg;
                    }
                    to {
                        --node--gradient-angle: 360deg;
                    }
                }
            `}</style>
        </div>
    );
}

const StandardCanvasNode = memo(StandardCanvasNodeComponent);

export default StandardCanvasNode;
