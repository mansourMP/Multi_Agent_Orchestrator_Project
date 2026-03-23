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
    const statusClass = ['running', 'waiting', 'error', 'success'].includes(normalizedStatus) ? normalizedStatus : '';

    return (
        <div
            className={`canvas-node ${variant === 'trigger' ? 'trigger' : 'default'} ${selected ? 'selected' : ''} ${statusClass}`.trim()}
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
                    style={{ left: -5 }}
                />
            ) : null}

            <div className="icon-shell">
                <div className="icon">{icon}</div>
            </div>
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
                    style={{ right: -5 }}
                />
            ) : null}

            <style jsx>{`
                .canvas-node {
                    position: relative;
                    min-width: 118px;
                    max-width: 160px;
                    min-height: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    gap: 9px;
                    padding: 8px 9px;
                    border: 1px solid rgba(15, 23, 42, 0.08);
                    border-radius: 14px;
                    background: #ffffff;
                    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.03);
                    transition: box-shadow 160ms ease, border-color 160ms ease;
                    overflow: visible;
                }

                .canvas-node:hover {
                    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.045);
                }

                .canvas-node.trigger {
                    border-radius: 14px;
                }

                .canvas-node.selected {
                    border-color: rgba(15, 23, 42, 0.14);
                    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.75), 0 6px 16px rgba(15, 23, 42, 0.045);
                }

                .canvas-node.success {
                    border-color: rgba(52, 211, 153, 0.45);
                }

                .canvas-node.error {
                    border-color: rgba(248, 113, 113, 0.45);
                }

                .canvas-node.running,
                .canvas-node.waiting {
                    border-color: rgba(147, 197, 253, 0.42);
                }

                .icon-shell {
                    width: 30px;
                    height: 30px;
                    border-radius: 8px;
                    background: color-mix(in srgb, var(--canvas-node-accent) 16%, white 84%);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .icon {
                    width: 16px;
                    height: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--canvas-node-accent);
                }

                .description {
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                    flex: 1;
                }

                .label {
                    font-size: 13px;
                    text-align: left;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    overflow: hidden;
                    font-weight: 600;
                    line-height: 1.15;
                    color: #171717;
                }

                .subtitle {
                    text-align: left;
                    color: #8a8a84;
                    font-size: 11px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.15;
                    font-weight: 400;
                }

                .canvas-node :global(.react-flow__handle) {
                    width: 9px;
                    height: 9px;
                    border-radius: 999px;
                    border: 1px solid rgba(120, 120, 114, 0.32);
                    background: #ffffff;
                    opacity: 0;
                    transition: opacity 160ms ease;
                }

                .canvas-node:hover :global(.react-flow__handle),
                .canvas-node.selected :global(.react-flow__handle) {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
}

const StandardCanvasNode = memo(StandardCanvasNodeComponent);

export default StandardCanvasNode;
