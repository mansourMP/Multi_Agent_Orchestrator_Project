'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

interface WorkflowEditorClientProps {
    workflowId?: string;
}

export default function WorkflowEditorClient({ workflowId }: WorkflowEditorClientProps) {
    const [Editor, setEditor] = useState<ComponentType<{ workflowId?: string }> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [usingFallback, setUsingFallback] = useState(false);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const mod = await import('./WorkflowEditorInnerPro');
                if (mounted) setEditor(() => mod.default);
            } catch (err: any) {
                console.error('Failed to load full editor, falling back to lite view', err);
                if (!mounted) return;
                setUsingFallback(true);
                try {
                    const lite = await import('./WorkflowEditorInnerLite');
                    if (mounted) setEditor(() => lite.default);
                } catch (liteErr: any) {
                    if (mounted) {
                        setError(liteErr?.message || 'Failed to load editor');
                    }
                }
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    if (error) {
        return (
            <div style={{ padding: '40px', color: '#ef4444' }}>
                {error}
            </div>
        );
    }

    if (!Editor) {
        return (
            <div style={{ padding: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                Loading workflow...
            </div>
        );
    }

    return (
        <>
            {usingFallback && (
                <div style={{
                    padding: '10px 14px',
                    background: 'rgba(255, 183, 77, 0.12)',
                    border: '1px solid rgba(255, 183, 77, 0.3)',
                    color: '#f59e0b',
                    fontSize: '12px',
                    borderRadius: '10px',
                    margin: '16px',
                }}>
                    Full editor failed to load; showing lite view instead.
                </div>
            )}
            <Editor workflowId={workflowId} />
        </>
    );
}
