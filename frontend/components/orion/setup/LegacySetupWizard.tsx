'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import {
  buildSetupCompleteHomeHref,
  buildSetupConnectAiHref,
  buildSetupConnectorsHref,
  fetchSetupReadiness,
  type SetupReadiness,
} from '@/lib/setupReadiness';
import {
  DESIGN_TOKENS,
  badgeStyle,
  bodyTextStyle,
  buttonStyle,
  eyebrowStyle,
  mergeStyles,
  metaTextStyle,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
  statCardStyle,
} from '@/design-constraints';

function normalizeReturnTo(value: string | null): string {
  const trimmed = String(value || '').trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) return '/home';
  return trimmed;
}

function actionButtonBaseStyle(disabled = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    textDecoration: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
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
  const tone = complete ? 'success' : active ? 'accent' : 'neutral';

  return (
    <article
      style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[5] }), {
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
        borderColor: complete
          ? DESIGN_TOKENS.color.successSoft
          : active
            ? DESIGN_TOKENS.color.accentSoft
            : DESIGN_TOKENS.color.borderSubtle,
        background: complete
          ? DESIGN_TOKENS.color.successSoft
          : active
            ? DESIGN_TOKENS.color.surface
            : DESIGN_TOKENS.color.surfaceMuted,
      })}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: DESIGN_TOKENS.space[4],
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={badgeStyle('neutral')}>Step {stepNumber}</span>
            <span style={badgeStyle(tone)}>
              {complete ? 'Complete' : active ? 'Next required action' : 'Pending'}
            </span>
          </div>
          <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.titleSm })}>{title}</div>
          <p style={bodyTextStyle()}>{description}</p>
        </div>

        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: DESIGN_TOKENS.radius.md,
            border: `1px solid ${complete ? DESIGN_TOKENS.color.successSoft : DESIGN_TOKENS.color.borderSubtle}`,
            background: DESIGN_TOKENS.color.surface,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: complete ? DESIGN_TOKENS.color.success : DESIGN_TOKENS.color.textTertiary,
          }}
        >
          <CheckCircle2 size={16} />
        </div>
      </div>

      {detail ? (
        <div
          style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
            display: 'grid',
            gap: 6,
            background: DESIGN_TOKENS.color.surface,
          })}
        >
          <p style={metaTextStyle()}>Current state</p>
          <p style={bodyTextStyle('primary')}>{detail}</p>
        </div>
      ) : null}

      {actionLabel && actionHref ? (
        disabled ? (
          <button
            type="button"
            disabled
            style={mergeStyles(buttonStyle({ tone: 'secondary', size: 'md', disabled: true }), actionButtonBaseStyle(true))}
          >
            {actionLabel}
          </button>
        ) : (
          <Link
            href={actionHref}
            style={mergeStyles(buttonStyle({ tone: active ? 'primary' : 'secondary', size: 'md' }), actionButtonBaseStyle())}
          >
            {actionLabel}
            <ArrowRight size={14} />
          </Link>
        )
      ) : null}
    </article>
  );
}

export function LegacySetupWizard() {
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
      style={mergeStyles(pageShellStyle(), {
        minHeight: '100vh',
        paddingTop: DESIGN_TOKENS.space[7],
        paddingBottom: DESIGN_TOKENS.space[8],
      })}
    >
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[6] }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[4],
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3], maxWidth: 720 }}>
            <p style={eyebrowStyle()}>Workspace readiness</p>
            <h1
              style={{
                margin: 0,
                color: DESIGN_TOKENS.color.textPrimary,
                fontSize: DESIGN_TOKENS.type.size.hero,
                fontWeight: DESIGN_TOKENS.type.weight.semibold,
                lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
                letterSpacing: DESIGN_TOKENS.type.tracking.tight,
              }}
            >
              Finish capability setup before entering the workspace.
            </h1>
            <p style={mergeStyles(bodyTextStyle('primary'), { fontSize: DESIGN_TOKENS.type.size.bodyLg, maxWidth: 660 })}>
              Identity is already established. These last steps only decide which model Empyralis can use and which
              external system it can act inside once the workspace opens.
            </p>
          </div>

          <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
            <span style={badgeStyle(aiReady ? 'success' : 'warning')}>
              {aiReady ? 'AI ready' : 'AI required'}
            </span>
            <span style={badgeStyle(integrationReady ? 'success' : 'warning')}>
              {integrationReady ? 'Tool linked' : 'Tool required'}
            </span>
            <span style={badgeStyle('neutral')}>Account stays separate from providers</span>
          </div>
        </div>

        {loading ? (
          <PageStatePanel variant="loading" title="Checking workspace readiness" copy="Empyralis is verifying which capabilities are already connected." />
        ) : error ? (
          <PageStatePanel
            variant="error"
            title="Workspace setup needs attention"
            copy={error}
            actions={(
              <button
                type="button"
                onClick={() => void loadReadiness()}
                style={mergeStyles(buttonStyle({ tone: 'primary', size: 'md' }), actionButtonBaseStyle())}
              >
                <RefreshCw size={14} />
                Try again
              </button>
            )}
          />
        ) : readiness?.complete ? (
          <PageStatePanel variant="loading" title="Finishing setup" copy="Everything required is connected. Taking you into the workspace." />
        ) : !readiness ? (
          <PageStatePanel variant="loading" title="Checking workspace readiness" copy="Empyralis is verifying which capabilities are already connected." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: DESIGN_TOKENS.space[6],
              alignItems: 'start',
            }}
          >
            <section
              style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[6] }), {
                display: 'grid',
                gap: DESIGN_TOKENS.space[5],
                background: DESIGN_TOKENS.color.surfaceSubtle,
              })}
            >
              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                <p style={eyebrowStyle()}>What this stage is for</p>
                <h2 style={sectionTitleStyle()}>Capability, not identity</h2>
                <p style={bodyTextStyle()}>
                  The account is already yours. Setup now is about attaching the capabilities Empyralis needs to think and
                  act: one model, one tool, then the workspace opens.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: DESIGN_TOKENS.space[3],
                }}
              >
                <div style={statCardStyle()}>
                  <p style={metaTextStyle()}>Account</p>
                  <div style={sectionTitleStyle()}>Established</div>
                  <p style={bodyTextStyle('tertiary')}>Identity and recovery stay on the Empyralis side.</p>
                </div>
                <div style={statCardStyle()}>
                  <p style={metaTextStyle()}>AI profile</p>
                  <div style={sectionTitleStyle()}>{aiReady ? 'Connected' : 'Required'}</div>
                  <p style={bodyTextStyle('tertiary')}>
                    {aiReady ? readiness.activeProfileLabel || 'Active model ready' : 'Choose one model before continuing.'}
                  </p>
                </div>
                <div style={statCardStyle()}>
                  <p style={metaTextStyle()}>Tools</p>
                  <div style={sectionTitleStyle()}>{readiness.connectorCount}</div>
                  <p style={bodyTextStyle('tertiary')}>
                    {integrationReady ? 'At least one connected tool is ready.' : 'Connect one tool to make the workspace useful.'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                {[
                  {
                    icon: <ShieldCheck size={16} />,
                    title: 'Recovery-safe structure',
                    copy: 'Account ownership, sign-in methods, and AI providers remain distinct so a provider change never strands the user.',
                  },
                  {
                    icon: <ArrowRight size={16} />,
                    title: 'Model comes next',
                    copy: 'First connect the model Empyralis should use. This defines capability, not ownership.',
                  },
                  {
                    icon: <Link2 size={16} />,
                    title: 'One tool proves utility',
                    copy: 'Connect at least one external system so the first workspace session immediately has something real to operate on.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
                      display: 'grid',
                      gap: 8,
                      background: DESIGN_TOKENS.color.surface,
                    })}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: DESIGN_TOKENS.radius.md,
                          border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                          background: DESIGN_TOKENS.color.surfaceMuted,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: DESIGN_TOKENS.color.textPrimary,
                        }}
                      >
                        {item.icon}
                      </div>
                      <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>
                        {item.title}
                      </div>
                    </div>
                    <p style={bodyTextStyle()}>{item.copy}</p>
                  </div>
                ))}
              </div>
            </section>

            <section
              style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[6] }), {
                display: 'grid',
                gap: DESIGN_TOKENS.space[5],
              })}
            >
              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: DESIGN_TOKENS.space[4],
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'grid', gap: 6 }}>
                    <p style={eyebrowStyle()}>Required actions</p>
                    <h2 style={sectionTitleStyle()}>Connect the missing capabilities</h2>
                  </div>
                  <span style={badgeStyle(activeStep === 0 ? 'success' : 'warning')}>
                    {activeStep === 0 ? 'Ready to enter' : `Step ${activeStep} is next`}
                  </span>
                </div>
                <p style={bodyTextStyle()}>
                  Complete the two required attachments below. When both are ready, Empyralis can open into a workspace
                  with a live model and at least one real system connection.
                </p>
              </div>

              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>
                <WizardStepCard
                  stepNumber={1}
                  title="Connect an AI model"
                  description="Choose the model Empyralis will use for reasoning. This is the capability layer that powers the workspace."
                  complete={aiReady}
                  active={activeStep === 1}
                  detail={aiReady ? `Connected: ${readiness.activeProfileLabel || 'Active model ready'}` : 'No active model is attached to the workspace yet.'}
                  actionLabel={aiReady ? 'Review model' : 'Connect AI'}
                  actionHref={connectAiHref}
                />

                <WizardStepCard
                  stepNumber={2}
                  title="Connect one tool"
                  description="Attach at least one external tool so the first workspace session can operate on something concrete."
                  complete={integrationReady}
                  active={activeStep === 2}
                  detail={
                    integrationReady
                      ? `${readiness.connectorCount} tool${readiness.connectorCount === 1 ? '' : 's'} connected`
                      : 'No external tools are attached yet.'
                  }
                  actionLabel={integrationReady ? 'Manage tools' : aiReady ? 'Connect a tool' : 'Finish step 1 first'}
                  actionHref={aiReady ? connectIntegrationHref : connectAiHref}
                  disabled={!aiReady}
                />
              </div>

              <div
                style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
                  display: 'grid',
                  gap: 8,
                  background: DESIGN_TOKENS.color.surfaceMuted,
                })}
              >
                <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.body })}>
                  Optional for now, not forever
                </div>
                <p style={bodyTextStyle()}>
                  You can skip this and enter the product, but the strongest first-use experience comes from connecting one
                  model and one live tool before you land in the workspace.
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: DESIGN_TOKENS.space[3],
                  flexWrap: 'wrap',
                }}
              >
                <Link href="/home" style={mergeStyles(buttonStyle({ tone: 'ghost', size: 'sm' }), actionButtonBaseStyle())}>
                  Skip for now
                </Link>
                <span style={metaTextStyle()}>
                  Account access and recovery remain intact even if providers are changed later.
                </span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
