'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { BRAND } from '@/lib/brand';

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
            } catch (err: unknown) {
                if (!mounted) return;
                const message = err instanceof Error ? err.message : 'Failed to load editor';
                setUsingFallback(false);
                setError(message);
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    if (error) {
        return (
            <div style={{ padding: '24px', color: '#ef4444', fontSize: 13 }}>
                {error}
            </div>
        );
    }

    if (!Editor) {
        return (
            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, color: 'var(--text-secondary)' }}>
                Loading workflow...
            </div>
        );
    }

    return (
        <>
            {usingFallback && (
                <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#f59e0b',
                    fontSize: '12px',
                    background: 'rgba(245, 158, 11, 0.08)',
                }}>
                    {BRAND.company} is running in simple mode.
                </div>
            )}
            <Editor workflowId={workflowId} />
        </>
    );
}
