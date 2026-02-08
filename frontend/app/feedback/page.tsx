'use client';

import React, { useState } from 'react';
import { Send, AlertTriangle, Lightbulb, MessageSquare } from 'lucide-react';

export default function FeedbackPage() {
    const [type, setType] = useState('FEATURE_REQ');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus('idle');
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/aesk/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    source: 'user_app_feedback',
                    metadata: { type }
                })
            });
            if (!response.ok) throw new Error('Submission failed');
            setStatus('success');
            setContent('');
        } catch (error) {
            setStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '40px 48px', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ marginBottom: '40px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ padding: '8px', background: '#000', borderRadius: '8px', color: '#fff' }}>
                    <MessageSquare size={20} />
                </div>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Feedback & Support</h1>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Help us evolve the platform with your insights.</p>
                </div>
            </header>

            <div className="card" style={{ padding: '40px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        <TypeButton 
                            active={type === 'BUG'} 
                            onClick={() => setType('BUG')} 
                            icon={AlertTriangle} 
                            label="Report Bug" 
                            color="#ef4444" 
                        />
                        <TypeButton 
                            active={type === 'FEATURE_REQ'} 
                            onClick={() => setType('FEATURE_REQ')} 
                            icon={Lightbulb} 
                            label="Feature Idea" 
                            color="#ff6d5a" 
                        />
                        <TypeButton 
                            active={type === 'OTHER'} 
                            onClick={() => setType('OTHER')} 
                            icon={MessageSquare} 
                            label="General" 
                            color="#3b82f6" 
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
                            Transmission Details
                        </label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            required
                            rows={6}
                            className="input"
                            style={{ padding: '20px', borderRadius: '12px', fontSize: '15px', resize: 'none', minHeight: '180px' }}
                            placeholder="Tell us what's on your mind..."
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '32px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>
                            {status === 'success' && <span style={{ color: '#10b981' }}>✅ Transmitted successfully. Thank you.</span>}
                            {status === 'error' && <span style={{ color: '#ef4444' }}>❌ Error transmitting feedback.</span>}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !content}
                            className="btn btn-primary"
                            style={{ padding: '12px 32px', borderRadius: '8px', fontSize: '14px' }}
                        >
                            <span>{isSubmitting ? 'Transmitting...' : 'Send Feedback'}</span>
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function TypeButton({ active, onClick, icon: Icon, label, color }: any) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', borderRadius: '12px', border: '1px solid', transition: 'all 0.2s', cursor: 'pointer',
                background: active ? `${color}08` : '#fff',
                borderColor: active ? color : '#e2e8f0',
                color: active ? color : '#64748b',
                boxShadow: active ? `0 0 0 1px ${color}20` : 'none'
            }}
        >
            <Icon size={28} style={{ marginBottom: '12px' }} />
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{label}</span>
        </button>
    );
}