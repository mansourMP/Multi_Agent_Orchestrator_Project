'use client';

import { memo } from 'react';
import { BellRing, FileText, Mail, MessageCircle, Send } from 'lucide-react';
import StandardCanvasNode from '@/components/nodes/StandardCanvasNode';

type ActionNodeData = {
    label?: string;
    actionType?: string;
    status?: string;
    executionSummary?: string;
};

function actionIcon(actionType: string) {
    if (actionType === 'send_whatsapp') return <MessageCircle size={20} strokeWidth={1.8} />;
    if (actionType === 'send_email') return <Mail size={20} strokeWidth={1.8} />;
    if (actionType === 'send_wechat') return <BellRing size={20} strokeWidth={1.8} />;
    if (actionType === 'send_telegram') return <Send size={20} strokeWidth={1.8} />;
    return <FileText size={20} strokeWidth={1.8} />;
}

const ACTION_LABELS: Record<string, string> = {
    send_whatsapp: 'Send WhatsApp',
    send_email: 'Send Email',
    send_wechat: 'Send WeChat',
    send_telegram: 'Send Telegram',
    write_file: 'Write File',
    connector_action: 'Tool Action',
    browser: 'Browser Action',
    file: 'File Action',
    shell: 'Shell Action',
    document: 'Document Action',
    spreadsheet: 'Spreadsheet Action',
    approval: 'Human Approval',
    review: 'Human Review',
    wait_for_reply: 'Wait for Reply',
    call_workflow: 'Call Workflow',
};

const ActionNode = ({ data, selected }: { data: ActionNodeData; selected?: boolean }) => {
    const actionType = String(data?.actionType || 'write_file').trim().toLowerCase();
    const accentColor = '#10b981';
    const label = data.label || ACTION_LABELS[actionType] || 'Action';
    const status = String(data.status || '').trim().toLowerCase();
    const executionSummary = String(data.executionSummary || '').trim();
    const subtitle = executionSummary || ACTION_LABELS[actionType] || 'Send the result to a destination';

    return (
        <StandardCanvasNode
            kindLabel="Action"
            title={label}
            subtitle={subtitle}
            accentColor={accentColor}
            icon={actionIcon(actionType)}
            selected={selected}
            badge={status ? status.replace(/_/g, ' ').toUpperCase() : 'OUTPUT'}
            status={status}
        />
    );
};

export default memo(ActionNode);
