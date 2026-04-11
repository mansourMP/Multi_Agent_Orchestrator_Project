'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FolderOpen, Monitor, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import {
  completeDesktopSetup,
  fetchDesktopSetupStatus,
  type DesktopSetupCheck,
  type DesktopSetupStatus,
} from '@/lib/desktopFirstRun';
import { getDesktopBridge } from '@/lib/desktopBridge';
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

function statusTone(value?: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'granted') return 'success';
  if (normalized === 'denied') return 'danger';
  if (normalized === 'unsupported') return 'neutral';
  return 'warning';
}

function statusLabel(value?: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'granted') return 'Ready';
  if (normalized === 'denied') return 'Needs access';
  if (normalized === 'unsupported') return 'Unavailable';
  return 'Checking';
}

function checkAccentStyle(value?: string): CSSProperties {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'granted') {
    return {
      background: DESIGN_TOKENS.color.successSoft,
      borderColor: DESIGN_TOKENS.color.successSoft,
    };
  }
  if (normalized === 'denied') {
    return {
      background: DESIGN_TOKENS.color.dangerSoft,
      borderColor: DESIGN_TOKENS.color.dangerSoft,
    };
  }
  return {
    background: DESIGN_TOKENS.color.surfaceMuted,
    borderColor: DESIGN_TOKENS.color.borderSubtle,
  };
}

function iconForCheck(id: string) {
  if (id === 'screen_recording') return <Monitor size={16} />;
  if (id === 'filesystem') return <FolderOpen size={16} />;
  return <ShieldCheck size={16} />;
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

function CheckRow({
  item,
  busy,
  onOpenSettings,
}: {
  item: DesktopSetupCheck;
  busy: boolean;
  onOpenSettings: (target: string) => void;
}) {
  const canOpenSettings = Boolean(item.settings_target);

  return (
    <article
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
        ...checkAccentStyle(item.status),
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: DESIGN_TOKENS.space[4],
        alignItems: 'center',
      })}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: DESIGN_TOKENS.radius.md,
          border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
          background: DESIGN_TOKENS.color.surface,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: DESIGN_TOKENS.color.textPrimary,
        }}
      >
        {iconForCheck(item.id)}
      </div>

      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[3],
            flexWrap: 'wrap',
          }}
        >
          <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>
            {item.label}
          </div>
          <span style={badgeStyle(statusTone(item.status))}>{statusLabel(item.status)}</span>
        </div>
        <p style={bodyTextStyle()}>
          {item.detail || 'Empyralis verifies this capability before it enables local desktop execution.'}
        </p>
      </div>

      {canOpenSettings ? (
        <button
          type="button"
          onClick={() => onOpenSettings(String(item.settings_target || ''))}
          disabled={busy}
          style={mergeStyles(buttonStyle({ tone: 'secondary', size: 'sm', disabled: busy }), actionButtonBaseStyle(busy))}
        >
          {busy ? 'Opening…' : 'Open settings'}
        </button>
      ) : (
        <span style={mergeStyles(metaTextStyle(), { whiteSpace: 'nowrap' })}>Checked locally</span>
      )}
    </article>
  );
}

export function DesktopSetupWizard() {
  const router = useRouter();
  const [status, setStatus] = useState<DesktopSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingTarget, setOpeningTarget] = useState('');
  const [continuing, setContinuing] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await fetchDesktopSetupStatus();
      setStatus(next);
    } catch (loadError) {
      setStatus(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to check desktop setup status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const handleFocus = () => {
      void loadStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadStatus]);

  useEffect(() => {
    if (!loading && status?.desktop_setup_completed) {
      router.replace('/demo?setup=complete');
    }
  }, [loading, router, status]);

  const missingCount = useMemo(() => status?.missing_ids.length || 0, [status]);
  const totalChecks = useMemo(() => status?.checks.length || 0, [status]);
  const readyCount = useMemo(() => totalChecks - missingCount, [missingCount, totalChecks]);
  const canContinue = Boolean(status?.can_continue);
  const machineLabel = useMemo(() => {
    const display = String(status?.machine?.display_name || '').trim();
    const machineId = String(status?.machine?.machine_id || '').trim();
    return display || machineId || 'Local machine';
  }, [status]);

  const openSettings = useCallback(async (target: string) => {
    const bridge = getDesktopBridge();
    if (!bridge?.desktop || typeof bridge.openPermissionSettings !== 'function') {
      setError('Permission shortcuts are only available in the Empyralis desktop app.');
      return;
    }
    setOpeningTarget(target);
    setError('');
    try {
      await bridge.openPermissionSettings(target);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Could not open system settings.');
    } finally {
      setOpeningTarget('');
    }
  }, []);

  const continueToDemo = useCallback(async () => {
    if (!canContinue) return;
    setContinuing(true);
    setError('');
    try {
      await completeDesktopSetup();
      router.replace('/demo?setup=complete');
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Could not complete desktop setup.');
      setContinuing(false);
    }
  }, [canContinue, router]);

  const readinessFacts = [
    {
      title: 'Permission-aware by design',
      copy: 'Screen capture, accessibility, and local storage are verified explicitly before any demo or agent action begins.',
    },
    {
      title: 'No hidden browser tabs',
      copy: 'The desktop handoff stays inside Empyralis. Results, screenshots, and the first-run proof all come back into the app.',
    },
    {
      title: 'Local proof first',
      copy: 'The first demo is a fast offline screenshot test so users see capability immediately without needing cloud setup first.',
    },
  ];

  const shell = (
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
            <p style={eyebrowStyle()}>Desktop readiness</p>
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
              Verify local trust once, then prove the desktop can see the machine without leaving the app.
            </h1>
            <p style={mergeStyles(bodyTextStyle('primary'), { fontSize: DESIGN_TOKENS.type.size.bodyLg, maxWidth: 660 })}>
              Empyralis uses this pass to confirm the local shell has the permissions it needs for screenshot capture,
              careful control, and artifact logging. Nothing proceeds until the required checks are actually ready.
            </p>
          </div>

          <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
            <span style={badgeStyle('accent')}>Desktop shell</span>
            <span style={badgeStyle(canContinue ? 'success' : 'warning')}>
              {canContinue ? 'Ready for demo' : 'Awaiting permissions'}
            </span>
            <span style={badgeStyle('neutral')}>Offline first-run proof</span>
          </div>
        </div>

        {loading ? (
          <PageStatePanel
            variant="loading"
            title="Checking local machine readiness"
            copy="Empyralis is verifying the permissions required for trusted desktop execution."
          />
        ) : error ? (
          <PageStatePanel
            variant="error"
            title="Desktop setup needs attention"
            copy={error}
            actions={(
              <button
                type="button"
                onClick={() => void loadStatus()}
                style={mergeStyles(buttonStyle({ tone: 'primary', size: 'md' }), actionButtonBaseStyle())}
              >
                <RefreshCw size={14} />
                Retry check
              </button>
            )}
          />
        ) : !status ? (
          <PageStatePanel
            variant="loading"
            title="Checking local machine readiness"
            copy="Empyralis is verifying the permissions required for trusted desktop execution."
          />
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
                <p style={eyebrowStyle()}>What this unlocks</p>
                <h2 style={sectionTitleStyle()}>A trustworthy first-run path</h2>
                <p style={bodyTextStyle()}>
                  This setup is not generic onboarding. It is the explicit local boundary that lets Empyralis inspect the
                  screen, save artifacts, and hand results back into the workspace without hidden state or side exits.
                </p>
              </div>

              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                {readinessFacts.map((fact) => (
                  <div
                    key={fact.title}
                    style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
                      display: 'grid',
                      gap: 8,
                      background: DESIGN_TOKENS.color.surface,
                    })}
                  >
                    <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>
                      {fact.title}
                    </div>
                    <p style={bodyTextStyle()}>{fact.copy}</p>
                  </div>
                ))}
              </div>

              <div
                style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
                  display: 'grid',
                  gap: 10,
                  background: DESIGN_TOKENS.color.surface,
                })}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={16} color={DESIGN_TOKENS.color.textPrimary} />
                  <span
                    style={{
                      color: DESIGN_TOKENS.color.textPrimary,
                      fontSize: DESIGN_TOKENS.type.size.label,
                      fontWeight: DESIGN_TOKENS.type.weight.semibold,
                    }}
                  >
                    Trust model
                  </span>
                </div>
                <p style={bodyTextStyle()}>
                  Permissions are checked locally, the demo stays inside the app, and the first screenshot is stored as an
                  artifact so the user sees proof instead of a promise.
                </p>
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
                    <p style={eyebrowStyle()}>Machine execution boundary</p>
                    <h2 style={sectionTitleStyle()}>Confirm required permissions</h2>
                  </div>
                  <span style={badgeStyle(canContinue ? 'success' : 'warning')}>
                    {canContinue ? 'All required checks passed' : `${missingCount} check${missingCount === 1 ? '' : 's'} missing`}
                  </span>
                </div>
                <p style={bodyTextStyle()}>
                  Review each capability below. Open the relevant system settings when access is missing, then re-run the
                  check from here.
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
                  <p style={metaTextStyle()}>Machine</p>
                  <div style={sectionTitleStyle()}>{machineLabel}</div>
                  <p style={bodyTextStyle('tertiary')}>{String(status.platform || 'desktop').toUpperCase()}</p>
                </div>
                <div style={statCardStyle()}>
                  <p style={metaTextStyle()}>Checks ready</p>
                  <div style={sectionTitleStyle()}>{readyCount}/{totalChecks || 0}</div>
                  <p style={bodyTextStyle('tertiary')}>Required capabilities verified</p>
                </div>
                <div style={statCardStyle()}>
                  <p style={metaTextStyle()}>Next proof</p>
                  <div style={sectionTitleStyle()}>Offline demo</div>
                  <p style={bodyTextStyle('tertiary')}>Screenshot + saved artifact</p>
                </div>
              </div>

              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                {status.checks.map((item) => (
                  <CheckRow
                    key={item.id}
                    item={item}
                    busy={openingTarget === item.settings_target}
                    onOpenSettings={openSettings}
                  />
                ))}
              </div>

              <div
                style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
                  display: 'grid',
                  gap: 8,
                  background: DESIGN_TOKENS.color.surfaceMuted,
                })}
              >
                <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.body })}>
                  Continue unlocks the local proof run
                </div>
                <p style={bodyTextStyle()}>
                  Once every required permission is ready, Empyralis runs a fast screenshot demo, stores the capture as an
                  artifact, and returns the result inside the workspace.
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
                <button
                  type="button"
                  onClick={() => void loadStatus()}
                  style={mergeStyles(buttonStyle({ tone: 'secondary', size: 'md' }), actionButtonBaseStyle())}
                >
                  <RefreshCw size={14} />
                  Recheck permissions
                </button>
                <button
                  type="button"
                  onClick={() => void continueToDemo()}
                  disabled={!canContinue || continuing}
                  style={mergeStyles(
                    buttonStyle({ tone: 'primary', size: 'md', disabled: !canContinue || continuing }),
                    actionButtonBaseStyle(!canContinue || continuing),
                  )}
                >
                  {continuing ? <RefreshCw size={14} /> : <ArrowRight size={14} />}
                  {continuing ? 'Finishing setup…' : 'Continue to demo'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );

  return shell;
}
