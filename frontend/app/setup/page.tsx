'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bot, CheckCircle2, KeyRound, PlugZap, RefreshCw } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import {
  buildSetupCompleteHomeHref,
  buildSetupConnectAiHref,
  buildSetupConnectorsHref,
  fetchSetupReadiness,
  type SetupReadiness,
} from '@/lib/setupReadiness';

function normalizeReturnTo(value: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return '/home';
  return trimmed;
}

type WizardStepCardProps = {
  stepNumber: number;
  title: string;
  description: string;
  complete: boolean;
  active?: boolean;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
  disabled?: boolean;
};

function WizardStepCard({
  stepNumber,
  title,
  description,
  complete,
  active = false,
  detail = '',
  actionLabel = '',
  actionHref = '',
  disabled = false,
}: WizardStepCardProps) {
  return (
    <article
      style={{
        display: 'grid',
        gap: 12,
        border: `1px solid ${active ? 'var(--primary-base)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="orion-chip">Step {stepNumber}</span>
            <span
              className="orion-chip"
              data-status-tone={complete ? 'green' : active ? 'yellow' : 'grey'}
            >
              {complete ? 'Done' : active ? 'Next' : 'Pending'}
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{description}</div>
        </div>
        {complete ? <CheckCircle2 size={18} color="var(--success-fg)" /> : null}
      </div>

      {detail ? (
        <div
          style={{
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-element)',
            padding: '10px 12px',
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--text-primary)',
          }}
        >
          {detail}
        </div>
      ) : null}

      {actionLabel && actionHref ? (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          {disabled ? (
            <button
              type="button"
              className="orion-btn orion-btn-secondary"
              style={{ minHeight: 36, paddingInline: 14 }}
              disabled
            >
              {actionLabel}
            </button>
          ) : (
            <Link href={actionHref} className="orion-btn orion-btn-primary" style={{ minHeight: 36, paddingInline: 14 }}>
              {actionLabel}
            </Link>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => normalizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const step = useMemo(() => String(searchParams.get('step') || '').trim(), [searchParams]);
  const [readiness, setReadiness] = useState<SetupReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReadiness = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchSetupReadiness();
      setReadiness(next);
    } catch (loadError) {
      setReadiness(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to check setup status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  useEffect(() => {
    const handleFocus = () => {
      void loadReadiness();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadReadiness]);

  useEffect(() => {
    if (loading || !readiness?.complete) return;
    if (step === 'finish') {
      router.replace(buildSetupCompleteHomeHref());
      return;
    }
    router.replace(returnTo === '/setup' ? '/home' : returnTo);
  }, [loading, readiness, returnTo, router, step]);

  const connectAiHref = useMemo(() => buildSetupConnectAiHref(returnTo), [returnTo]);
  const connectIntegrationHref = useMemo(() => buildSetupConnectorsHref(returnTo), [returnTo]);
  const aiReady = Boolean(readiness?.hasAiModel);
  const integrationReady = Boolean(readiness?.hasIntegration);
  const activeStep = !aiReady ? 1 : !integrationReady ? 2 : 0;

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<Bot size={18} />}
        title="Finish setup"
        subtitle="Connect your AI model first, then connect one integration before you start running work."
        actions={
          <Link href={returnTo === '/setup' ? '/home' : returnTo} className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <ArrowLeft size={13} />
            Back
          </Link>
        }
      />

      {loading ? (
        <PageStatePanel variant="loading" title="Checking setup…" />
      ) : error ? (
        <section className="orion-panel" style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="orion-panel-title">Setup needs attention</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{error}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="orion-btn orion-btn-primary" style={{ minHeight: 36, paddingInline: 14 }} onClick={() => void loadReadiness()}>
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        </section>
      ) : readiness?.complete ? (
        <PageStatePanel variant="loading" title="Finishing setup…" copy="You&apos;re ready. Sending you back into Empyralis now." />
      ) : !readiness ? (
        <PageStatePanel variant="loading" title="Checking setup…" />
      ) : (
        <section className="orion-panel" style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="orion-panel-title">Two steps to get live</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Complete both steps once. Empyralis will bring you back to Home when the workspace is ready.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <WizardStepCard
              stepNumber={1}
              title="Connect your AI model"
              description="Choose the model account Empyralis should use for planning, replies, and live runs."
              complete={aiReady}
              active={activeStep === 1}
              detail={aiReady ? `Connected: ${readiness.activeProfileLabel || 'Runtime model ready'}` : 'No AI model is connected yet.'}
              actionLabel={aiReady ? 'Review AI model' : 'Connect AI model'}
              actionHref={connectAiHref}
            />

            <WizardStepCard
              stepNumber={2}
              title="Connect one integration"
              description="Add one connector so your first task can actually reach the tools you use."
              complete={integrationReady}
              active={activeStep === 2}
              detail={
                integrationReady
                  ? `${readiness.connectorCount} integration${readiness.connectorCount === 1 ? '' : 's'} connected.`
                  : aiReady
                    ? 'No integrations connected yet.'
                    : 'Connect your AI model first, then come back for integrations.'
              }
              actionLabel={integrationReady ? 'Manage connectors' : aiReady ? 'Connect an integration' : 'Connect AI model first'}
              actionHref={aiReady ? connectIntegrationHref : connectAiHref}
              disabled={!aiReady}
            />
          </div>

          <div
            style={{
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-element)',
              padding: '12px 14px',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', fontWeight: 700 }}>
              <KeyRound size={14} />
              Step 1 unlocks the assistant
            </div>
            <div>Step 2 makes the assistant useful in the real world. When both are done, Empyralis sends you to Home with a ready-to-start state.</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <Link href={connectAiHref} className="orion-btn orion-btn-secondary" style={{ minHeight: 36, paddingInline: 14 }}>
              <KeyRound size={14} />
              AI model
            </Link>
            {aiReady ? (
              <Link href={connectIntegrationHref} className="orion-btn orion-btn-primary" style={{ minHeight: 36, paddingInline: 14 }}>
                <PlugZap size={14} />
                Connectors
              </Link>
            ) : (
              <button type="button" className="orion-btn orion-btn-secondary" style={{ minHeight: 36, paddingInline: 14 }} disabled>
                <PlugZap size={14} />
                Connectors
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
