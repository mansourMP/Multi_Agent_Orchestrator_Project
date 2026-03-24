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
                    min-width: 152px;
                    max-width: 228px;
                    min-height: 78px;
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    gap: 12px;
                    padding: 12px 14px;
                    border: 1px solid rgba(15, 23, 42, 0.07);
                    border-radius: 20px;
                    background: #ffffff;
                    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
                    transition: box-shadow 160ms ease, border-color 160ms ease;
                    overflow: visible;
                }

                .canvas-node:hover {
                    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.07);
                }

                .canvas-node.trigger {
                    border-radius: 20px;
                }

                .canvas-node.selected {
                    border-color: rgba(15, 23, 42, 0.14);
                    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.82), 0 12px 28px rgba(15, 23, 42, 0.08);
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
                    width: 48px;
                    height: 48px;
                    border-radius: 16px;
                    background: color-mix(in srgb, var(--canvas-node-accent) 16%, white 84%);
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .icon {
                    width: 22px;
                    height: 22px;
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
                    font-size: 17px;
                    text-align: left;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    overflow: hidden;
                    font-weight: 600;
                    line-height: 1.2;
                    color: #171717;
                }

                .subtitle {
                    text-align: left;
                    color: #8a8a84;
                    font-size: 13px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.25;
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
