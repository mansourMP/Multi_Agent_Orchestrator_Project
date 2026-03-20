'use client';

import { useState, type ComponentType, type FormEvent } from 'react';
import { AlertTriangle, Lightbulb, MessageSquare, Send } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

type FeedbackType = 'BUG' | 'FEATURE_REQ' | 'OTHER';

const FEEDBACK_TYPES: Array<{
  id: FeedbackType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  color: string;
}> = [
  { id: 'BUG', label: 'Report Bug', icon: AlertTriangle, color: '#f97316' },
  { id: 'FEATURE_REQ', label: 'Feature Idea', icon: Lightbulb, color: '#fb923c' },
  { id: 'OTHER', label: 'General', icon: MessageSquare, color: '#60a5fa' },
];

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>('FEATURE_REQ');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!content.trim()) return;

    setIsSubmitting(true);
    setStatus('idle');

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/aesk/feedback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            source: 'user_app_feedback',
            metadata: { type },
          }),
        },
      );

      if (!response.ok) throw new Error('Submission failed');

      setContent('');
      setStatus('success');
    } catch {
      setStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<MessageSquare size={18} />}
        title="Feedback"
        subtitle="Bugs, ideas, and product notes."
      />

      <MetricStrip
        items={[
          { label: 'Channel', value: 'In-app' },
          { label: 'Focus', value: type === 'BUG' ? 'Bug' : type === 'FEATURE_REQ' ? 'Feature' : 'General' },
          { label: 'Status', value: status === 'success' ? 'Sent' : status === 'error' ? 'Retry needed' : 'Draft' },
        ]}
        minWidth={160}
      />

      <form className="orion-panel orion-surface-lift" style={{ display: 'grid', gap: 14 }} onSubmit={handleSubmit}>
        <section className="orion-grid-3">
          {FEEDBACK_TYPES.map((item) => {
            const isActive = item.id === type;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setType(item.id)}
                style={{
                  borderRadius: 12,
                  border: isActive ? `1px solid ${item.color}` : '1px solid var(--border-default)',
                  background: isActive ? `${item.color}18` : 'var(--bg-element)',
                  color: isActive ? item.color : 'var(--text-secondary)',
                  minHeight: 84,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <Icon size={18} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</span>
              </button>
            );
          })}
        </section>

        <div className="orion-field">
          <label className="orion-field-label" htmlFor="feedback-input">
            Message
          </label>
          <textarea
            id="feedback-input"
            className="input"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={8}
            required
            placeholder="Describe the issue or request."
            style={{ borderRadius: 12, resize: 'vertical', minHeight: 180, padding: 14 }}
          />
        </div>

        <footer
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--border-default)',
            paddingTop: 12,
          }}
        >
          <div style={{ minHeight: 22, fontSize: 12 }}>
            {status === 'success' && <span style={{ color: 'var(--success-fg)' }}>Feedback sent successfully.</span>}
            {status === 'error' && (
              <span style={{ color: 'var(--error-fg)' }}>Failed to send feedback. Verify backend API status.</span>
            )}
          </div>

          <button
            type="submit"
            className="orion-btn orion-btn-primary"
            disabled={isSubmitting || content.trim().length === 0}
          >
            <Send size={14} />
            {isSubmitting ? 'Sending…' : 'Send Feedback'}
          </button>
        </footer>
      </form>
    </div>
  );
}
