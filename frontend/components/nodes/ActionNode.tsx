'use client';

import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { BellRing, FileText, Send } from 'lucide-react';

type ActionNodeData = {
    label?: string;
    actionType?: string;
};

function actionIcon(actionType: string) {
    if (actionType === 'send_wechat') return <BellRing size={20} color="#10b981" strokeWidth={1.75} />;
    if (actionType === 'send_telegram') return <Send size={20} color="#10b981" strokeWidth={1.75} />;
    return <FileText size={20} color="#10b981" strokeWidth={1.75} />;
}

const ACTION_LABELS: Record<string, string> = {
    send_wechat: 'Send WeChat',
    send_telegram: 'Send Telegram',
    write_file: 'Write File',
};

const ActionNode = ({ data, selected }: { data: ActionNodeData; selected?: boolean }) => {
    const [isHovered, setIsHovered] = useState(false);
    const actionType = String(data?.actionType || 'write_file').trim().toLowerCase();
    const accentColor = '#10b981';

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
                minWidth: '220px',
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

            <div style={{ padding: '16px', display: 'grid', gap: '10px' }}>
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
                        }}
                    >
                        {actionIcon(actionType)}
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {data.label || ACTION_LABELS[actionType] || 'Action'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {ACTION_LABELS[actionType] || 'Action step'}
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

export default memo(ActionNode);
