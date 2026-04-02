'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
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
        gap: 14,
        border: `1px solid ${active ? 'var(--primary-base)' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        borderRadius: 8,
        padding: 18,
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
            borderRadius: 6,
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
              style={{ minHeight: 44, paddingInline: 14 }}
              disabled
            >
              {actionLabel}
            </button>
          ) : (
            <Link href={actionHref} className="orion-btn orion-btn-primary" style={{ minHeight: 44, paddingInline: 14 }}>
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
    <div
      className="orion-page-shell narrow is-setup-flow orion-animate-in"
      style={{ width: 'min(560px, 100%)', margin: '0 auto', gap: 18 }}
    >
      <div className="orion-auth-header" style={{ gap: 12 }}>
        <div className="orion-auth-wordmark">Empyralis</div>
        <h1 className="orion-auth-card__title">You&apos;re almost in.</h1>
        <p className="orion-auth-card__copy">Two quick steps and your workspace is ready.</p>
      </div>

      {loading ? (
        <PageStatePanel variant="loading" title="Checking setup…" copy="Setting up your workspace…" />
      ) : error ? (
        <PageStatePanel
          variant="error"
          title="Something went wrong"
          copy={error}
          actions={(
            <button type="button" className="orion-btn orion-btn-primary" style={{ minHeight: 44, paddingInline: 14 }} onClick={() => void loadReadiness()}>
              <RefreshCw size={14} />
              Try again
            </button>
          )}
        />
      ) : readiness?.complete ? (
        <PageStatePanel variant="loading" title="Finishing setup…" copy="You&apos;re in. Taking you home." />
      ) : !readiness ? (
        <PageStatePanel variant="loading" title="Checking setup…" copy="Setting up your workspace…" />
      ) : (
        <section className="orion-panel" style={{ display: 'grid', gap: 14, padding: 22 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <WizardStepCard
              stepNumber={1}
              title="Connect your AI"
              description="This is the brain behind everything. Pick the model Empyralis will use."
              complete={aiReady}
              active={activeStep === 1}
              detail={aiReady ? `Connected: ${readiness.activeProfileLabel || 'Active model ready'}` : ''}
              actionLabel={aiReady ? 'Change AI' : 'Connect AI'}
              actionHref={connectAiHref}
            />

            <WizardStepCard
              stepNumber={2}
              title="Connect a tool"
              description="Give Empyralis access to one app you use — Gmail, Slack, Notion, anything."
              complete={integrationReady}
              active={activeStep === 2}
              detail={integrationReady ? `${readiness.connectorCount} tool${readiness.connectorCount === 1 ? '' : 's'} connected` : ''}
              actionLabel={integrationReady ? 'Add more tools' : aiReady ? 'Connect a tool' : 'Do step 1 first'}
              actionHref={aiReady ? connectIntegrationHref : connectAiHref}
              disabled={!aiReady}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Link
              href="/home"
              style={{
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              Skip for now
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
