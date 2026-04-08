'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  Chrome,
  Fingerprint,
  KeyRound,
  LifeBuoy,
  Link2,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { getDesktopBridge } from '@/lib/desktopBridge';
import { waitForDesktopControlPlaneSignIn } from '@/lib/controlPlaneSession';
import { buildBrowserVisibleControlPlaneAuthStartPath } from '@/lib/server/controlPlaneAuthRouting';
import { buildPostSignInSetupHref } from '@/lib/setupReadiness';
import { humanizeUiError } from '@/lib/uiError';
import {
  DESIGN_TOKENS,
  badgeStyle,
  bodyTextStyle,
  buttonStyle,
  dividerStyle,
  eyebrowStyle,
  inputStyle,
  mergeStyles,
  metaTextStyle,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';

type AuthProviders = {
  email: { enabled: boolean };
  google: { enabled: boolean };
  apple: { enabled: boolean };
};

const DEFAULT_PROVIDERS: AuthProviders = {
  email: { enabled: true },
  google: { enabled: false },
  apple: { enabled: false },
};

function authErrorMessage(code: string): string {
  switch (code) {
    case 'oauth_state':
      return 'The sign-in session expired. Try again.';
    case 'oauth_missing_token':
      return 'Google sign-in did not return a valid session.';
    case 'oauth_missing_code':
      return 'The provider did not return a sign-in code.';
    case 'oauth_exchange_failed':
      return 'The provider sign-in could not be completed.';
    case 'oauth_invalid_token':
      return 'The provider sign-in response was not valid.';
    default:
      return '';
  }
}

type BrowserSignInPageProps = {
  returnTo: string;
  errorCode?: string;
  desktopMode?: boolean;
};

function inlineLinkStyle(): React.CSSProperties {
  return {
    color: DESIGN_TOKENS.color.textPrimary,
    textDecoration: 'none',
  };
}

function calloutStyle(tone: 'neutral' | 'warning' | 'danger' = 'neutral'): React.CSSProperties {
  const colorMap = {
    neutral: {
      border: DESIGN_TOKENS.color.borderSubtle,
      background: DESIGN_TOKENS.color.surfaceMuted,
      text: DESIGN_TOKENS.color.textSecondary,
    },
    warning: {
      border: DESIGN_TOKENS.color.warningSoft,
      background: DESIGN_TOKENS.color.warningSoft,
      text: DESIGN_TOKENS.color.warning,
    },
    danger: {
      border: DESIGN_TOKENS.color.dangerSoft,
      background: DESIGN_TOKENS.color.dangerSoft,
      text: DESIGN_TOKENS.color.danger,
    },
  } as const;
  const toneColors = colorMap[tone];
  return {
    border: `1px solid ${toneColors.border}`,
    background: toneColors.background,
    borderRadius: DESIGN_TOKENS.radius.lg,
    padding: DESIGN_TOKENS.space[4],
    color: toneColors.text,
  };
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={mergeStyles(
        buttonStyle({ tone: active ? 'secondary' : 'ghost', size: 'sm' }),
        {
          flex: 1,
          justifyContent: 'center',
          background: active ? DESIGN_TOKENS.color.surface : 'transparent',
          borderColor: active ? DESIGN_TOKENS.color.borderStrong : 'transparent',
          color: active ? DESIGN_TOKENS.color.textPrimary : DESIGN_TOKENS.color.textSecondary,
        },
      )}
    >
      {children}
    </button>
  );
}

function ProviderButton({
  icon,
  title,
  description,
  actionLabel,
  statusLabel,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  statusLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={mergeStyles(buttonStyle({ tone: 'secondary', size: 'lg', disabled }), {
        width: '100%',
        height: 'auto',
        minHeight: 72,
        padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[4]}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: DESIGN_TOKENS.space[4],
        textAlign: 'left',
      })}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[4], minWidth: 0 }}>
        <span
          style={{
            width: 40,
            height: 40,
            minWidth: 40,
            borderRadius: DESIGN_TOKENS.radius.md,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
            background: DESIGN_TOKENS.color.surfaceSubtle,
            color: DESIGN_TOKENS.color.textPrimary,
          }}
        >
          {icon}
        </span>
        <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <span
            style={{
              color: DESIGN_TOKENS.color.textPrimary,
              fontSize: DESIGN_TOKENS.type.size.body,
              fontWeight: DESIGN_TOKENS.type.weight.semibold,
              lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
              letterSpacing: DESIGN_TOKENS.type.tracking.normal,
            }}
          >
            {title}
          </span>
          <span style={mergeStyles(bodyTextStyle(), { fontSize: DESIGN_TOKENS.type.size.label })}>{description}</span>
        </span>
      </span>
      <span style={{ display: 'grid', justifyItems: 'end', gap: 4, minWidth: 88 }}>
        <span style={mergeStyles(metaTextStyle(), { textTransform: 'uppercase', letterSpacing: DESIGN_TOKENS.type.tracking.wide })}>
          {statusLabel}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: DESIGN_TOKENS.color.textPrimary,
            fontSize: DESIGN_TOKENS.type.size.label,
            fontWeight: DESIGN_TOKENS.type.weight.medium,
          }}
        >
          {actionLabel}
          <ChevronRight size={14} />
        </span>
      </span>
    </button>
  );
}

export default function BrowserSignInPage({
  returnTo,
  errorCode = '',
  desktopMode = false,
}: BrowserSignInPageProps) {
  const postSignInTarget = buildPostSignInSetupHref(returnTo);
  const [providers, setProviders] = useState<AuthProviders>(DEFAULT_PROVIDERS);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState<'google' | 'apple' | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [error, setError] = useState(authErrorMessage(errorCode));
  const [inDesktopWindow, setInDesktopWindow] = useState(false);

  const socialProvidersEnabled = providers.google.enabled || providers.apple.enabled;
  const googleStartPath = buildBrowserVisibleControlPlaneAuthStartPath('google', returnTo, desktopMode);
  const appleStartPath = buildBrowserVisibleControlPlaneAuthStartPath('apple', returnTo, desktopMode);

  useEffect(() => {
    setInDesktopWindow(Boolean(desktopMode && getDesktopBridge()?.desktop));
  }, [desktopMode]);

  useEffect(() => {
    let active = true;

    const loadProviders = async () => {
      try {
        const response = await fetch('/api/control-plane/auth/providers', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const payload = (await response.json().catch(() => null)) as AuthProviders | null;
        if (!active) return;
        if (response.ok && payload) {
          setProviders(payload);
        }
      } catch {
        if (!active) return;
        setError('Could not load sign-in options. Please refresh.');
      } finally {
        if (active) {
          setLoadingProviders(false);
        }
      }
    };

    void loadProviders();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (inDesktopWindow) return;
    if (loadingProviders || error) return;
    if (providers.email.enabled) return;
    const socialProviders = [
      providers.google.enabled ? 'google' : null,
      providers.apple.enabled ? 'apple' : null,
    ].filter(Boolean) as Array<'google' | 'apple'>;
    if (socialProviders.length !== 1) return;
    const provider = socialProviders[0];
    const target = provider === 'google' ? googleStartPath : appleStartPath;
    window.location.replace(target);
  }, [
    appleStartPath,
    error,
    googleStartPath,
    inDesktopWindow,
    loadingProviders,
    providers.apple.enabled,
    providers.email.enabled,
    providers.google.enabled,
  ]);

  useEffect(() => {
    if (loadingProviders) return;
    if (!providers.google.enabled && !providers.apple.enabled) {
      setAuthMode((current) => (current === 'signin' ? 'signup' : current));
    }
  }, [loadingProviders, providers.apple.enabled, providers.google.enabled]);

  const heroTitle = authMode === 'signup'
    ? 'Create the account boundary first. Provider access attaches later.'
    : 'Sign in through an account boundary that stays stable even when providers change.';

  const heroCopy = inDesktopWindow
    ? 'Desktop sign-in opens trusted identity providers in the system browser, returns the session to this app window, and keeps OpenAI or Codex as a separate capability-link step.'
    : 'Your Empyralis account owns workspaces, artifacts, runs, notifications, and recovery. AI providers connect later as capability, not as the owner of the account.';

  const accessTitle = authMode === 'signup' ? 'Create account access' : 'Empyralis account access';
  const accessCopy = inDesktopWindow
    ? 'Use your account credentials or approved identity provider. Browser handoff returns directly to this desktop session.'
    : 'Use your account credentials or a configured identity provider. You will connect OpenAI or any other AI provider separately after sign-in.';

  const providerBoundaryNote = inDesktopWindow
    ? 'OpenAI remains a connected provider. It does not replace Empyralis account ownership or recovery.'
    : 'OpenAI is a connected provider, not the sole owner of this account.';

  const shellNote = inDesktopWindow
    ? 'System browser handoff returns directly to this desktop session.'
    : 'Providers handle access. Empyralis still owns the account boundary.';

  const railFacts = useMemo(
    () => [
      {
        icon: <ShieldCheck size={16} />,
        title: 'Account owns the data',
        copy: 'Runs, artifacts, workspaces, and notifications stay with the Empyralis account even if a provider connection disappears.',
      },
      {
        icon: <Link2 size={16} />,
        title: 'Providers link later',
        copy: 'Google and Apple handle account access. OpenAI and Codex connect later as capabilities inside Settings or Credentials.',
      },
      {
        icon: <LifeBuoy size={16} />,
        title: 'Recovery stays available',
        copy: 'Add a backup sign-in method after onboarding so no provider change can strand the account.',
      },
    ],
    [],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const endpoint = authMode === 'signup'
        ? '/api/control-plane/auth/signup'
        : '/api/control-plane/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          desktop_handoff: desktopMode && !inDesktopWindow,
          return_to: returnTo,
        }),
      });

      const payload = await response.json().catch(() => null) as { detail?: string; redirect_to?: string } | null;
      if (!response.ok) {
        const detail =
          payload && typeof payload.detail === 'string'
            ? payload.detail
            : 'Unable to sign in right now.';
        throw new Error(detail);
      }

      if (desktopMode && !inDesktopWindow && payload?.redirect_to) {
        window.location.assign(payload.redirect_to);
        return;
      }

      window.location.assign(postSignInTarget);
    } catch (submitError) {
      setSubmitting(false);
      setError(
        humanizeUiError(
          submitError instanceof Error ? submitError.message : '',
          authMode === 'signup' ? 'Unable to create your account right now.' : 'Unable to sign in right now.',
        ),
      );
    }
  };

  const continueWithGoogle = () => {
    const target = googleStartPath;
    if (!inDesktopWindow) {
      window.location.assign(target);
      return;
    }
    setOauthSubmitting('google');
    setError('');
    void (async () => {
      try {
        const absoluteTarget = new URL(target, window.location.origin).toString();
        const opened = await getDesktopBridge()?.openExternal?.(absoluteTarget);
        if (!opened) {
          throw new Error('Unable to open Google sign-in in the system browser.');
        }
        await waitForDesktopControlPlaneSignIn();
        window.location.assign(postSignInTarget);
      } catch (oauthError) {
        setOauthSubmitting(null);
        setError(
          humanizeUiError(
            oauthError instanceof Error ? oauthError.message : '',
            'Google sign-in could not be completed right now.',
          ),
        );
      }
    })();
  };

  const continueWithApple = () => {
    const target = appleStartPath;
    if (!inDesktopWindow) {
      window.location.assign(target);
      return;
    }
    setOauthSubmitting('apple');
    setError('');
    void (async () => {
      try {
        const absoluteTarget = new URL(target, window.location.origin).toString();
        const opened = await getDesktopBridge()?.openExternal?.(absoluteTarget);
        if (!opened) {
          throw new Error('Unable to open Apple sign-in in the system browser.');
        }
        await waitForDesktopControlPlaneSignIn();
        window.location.assign(postSignInTarget);
      } catch (oauthError) {
        setOauthSubmitting(null);
        setError(
          humanizeUiError(
            oauthError instanceof Error ? oauthError.message : '',
            'Apple sign-in could not be completed right now.',
          ),
        );
      }
    })();
  };

  return (
    <div
      style={mergeStyles(pageShellStyle(), {
        minHeight: '100vh',
        paddingTop: DESIGN_TOKENS.space[7],
        paddingBottom: DESIGN_TOKENS.space[8],
        alignContent: 'start',
      })}
    >
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[5] }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: DESIGN_TOKENS.space[4],
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={eyebrowStyle()}>Sign in</p>
            <div
              style={{
                color: DESIGN_TOKENS.color.textPrimary,
                fontSize: DESIGN_TOKENS.type.size.titleSm,
                fontWeight: DESIGN_TOKENS.type.weight.semibold,
                lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
                letterSpacing: DESIGN_TOKENS.type.tracking.tight,
              }}
            >
              Empyralis account access
            </div>
          </div>

          <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
            <span style={badgeStyle(inDesktopWindow ? 'accent' : 'neutral')}>
              {inDesktopWindow ? 'Desktop handoff' : 'Browser session'}
            </span>
            <span style={badgeStyle('neutral')}>Recovery-safe identity</span>
            <span style={badgeStyle('neutral')}>Providers attach later</span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: DESIGN_TOKENS.space[6],
            alignItems: 'stretch',
          }}
        >
          <section
          style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[6] }), {
            display: 'grid',
            gap: DESIGN_TOKENS.space[6],
            alignContent: 'space-between',
            minHeight: 620,
            background: DESIGN_TOKENS.color.surfaceSubtle,
          })}
        >
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[5] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[4], flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <p style={eyebrowStyle()}>Empyralis Account Access</p>
                <div
                  style={{
                    color: DESIGN_TOKENS.color.textPrimary,
                    fontSize: DESIGN_TOKENS.type.size.hero,
                    fontWeight: DESIGN_TOKENS.type.weight.semibold,
                    lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
                    letterSpacing: DESIGN_TOKENS.type.tracking.tight,
                    maxWidth: 560,
                  }}
                >
                  {heroTitle}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <span style={badgeStyle(inDesktopWindow ? 'accent' : 'neutral')}>
                  {inDesktopWindow ? 'Desktop handoff' : 'Browser access'}
                </span>
                <span style={badgeStyle(socialProvidersEnabled ? 'success' : 'neutral')}>
                  {socialProvidersEnabled ? 'Provider sign-in ready' : 'Account credentials only'}
                </span>
              </div>
            </div>

            <p style={mergeStyles(bodyTextStyle('primary'), { maxWidth: 620, fontSize: DESIGN_TOKENS.type.size.bodyLg })}>
              {heroCopy}
            </p>
          </div>

          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
            {railFacts.map((item) => (
              <div
                key={item.title}
                style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
                  display: 'grid',
                  gap: 10,
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
                      background: DESIGN_TOKENS.color.surfaceSubtle,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: DESIGN_TOKENS.color.textPrimary,
                    }}
                  >
                    {item.icon}
                  </div>
                  <h2 style={mergeStyles(sectionTitleStyle(), { fontSize: 15 })}>{item.title}</h2>
                </div>
                <p style={bodyTextStyle()}>{item.copy}</p>
              </div>
            ))}
          </div>

          <div style={calloutStyle()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <KeyRound size={15} color={DESIGN_TOKENS.color.textPrimary} />
              <span
                style={{
                  color: DESIGN_TOKENS.color.textPrimary,
                  fontSize: DESIGN_TOKENS.type.size.label,
                  fontWeight: DESIGN_TOKENS.type.weight.semibold,
                }}
              >
                Recovery-safe account boundary
              </span>
            </div>
            <p style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
              {providerBoundaryNote}
            </p>
          </div>
        </section>

          <section
          style={mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[6] }), {
            display: 'grid',
            gap: DESIGN_TOKENS.space[5],
            alignContent: 'start',
            minHeight: 620,
          })}
        >
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: DESIGN_TOKENS.space[4], flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    color: DESIGN_TOKENS.color.textPrimary,
                    fontSize: DESIGN_TOKENS.type.size.title,
                    fontWeight: DESIGN_TOKENS.type.weight.semibold,
                    lineHeight: DESIGN_TOKENS.type.lineHeight.tight,
                    letterSpacing: DESIGN_TOKENS.type.tracking.tight,
                  }}
                >
                  {accessTitle}
                </div>
                <p style={mergeStyles(bodyTextStyle(), { maxWidth: 520 })}>{accessCopy}</p>
              </div>

              <div
                style={{
                  display: 'inline-grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 4,
                  padding: 4,
                  borderRadius: DESIGN_TOKENS.radius.lg,
                  border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
                  background: DESIGN_TOKENS.color.surfaceSubtle,
                  minWidth: 220,
                }}
              >
                <ModeButton
                  active={authMode === 'signin'}
                  onClick={() => {
                    setAuthMode('signin');
                    setError('');
                  }}
                >
                  Sign in
                </ModeButton>
                <ModeButton
                  active={authMode === 'signup'}
                  onClick={() => {
                    setAuthMode('signup');
                    setError('');
                  }}
                >
                  Create account
                </ModeButton>
              </div>
            </div>

            <div style={calloutStyle()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <LockKeyhole size={15} color={DESIGN_TOKENS.color.textPrimary} />
                <span
                  style={{
                    color: DESIGN_TOKENS.color.textPrimary,
                    fontSize: DESIGN_TOKENS.type.size.label,
                    fontWeight: DESIGN_TOKENS.type.weight.semibold,
                  }}
                >
                  Identity first, providers second
                </span>
              </div>
              <p style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.textSecondary })}>
                Sign in to Empyralis first. Connect OpenAI, Codex, or other AI providers separately after access is established.
              </p>
            </div>
          </div>

          {!loadingProviders && socialProvidersEnabled ? (
            <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
              {providers.google.enabled ? (
                <ProviderButton
                  icon={<Chrome size={16} />}
                  title={oauthSubmitting === 'google' ? 'Waiting for Google' : 'Google account access'}
                  description="Use Google as a sign-in method for Empyralis. Provider linking remains separate."
                  actionLabel={oauthSubmitting === 'google' ? 'Waiting' : 'Open browser'}
                  statusLabel={inDesktopWindow ? 'Desktop' : 'Web'}
                  disabled={oauthSubmitting !== null}
                  onClick={continueWithGoogle}
                />
              ) : null}

              {providers.apple.enabled ? (
                <ProviderButton
                  icon={<Fingerprint size={16} />}
                  title={oauthSubmitting === 'apple' ? 'Waiting for Apple' : 'Apple account access'}
                  description="Use Apple as a sign-in method for Empyralis. Recovery remains attached to the account."
                  actionLabel={oauthSubmitting === 'apple' ? 'Waiting' : 'Open browser'}
                  statusLabel={inDesktopWindow ? 'Desktop' : 'Web'}
                  disabled={oauthSubmitting !== null}
                  onClick={continueWithApple}
                />
              ) : null}
            </div>
          ) : null}

          {!loadingProviders && !providers.google.enabled && !providers.apple.enabled ? (
            <div style={calloutStyle()}>
              <p style={bodyTextStyle()}>
                {inDesktopWindow
                  ? 'This desktop build does not have Google or Apple account sign-in configured yet. Use your Empyralis credentials here, then connect AI providers from Settings.'
                  : 'This build does not have Google or Apple account sign-in configured yet. Use your Empyralis credentials here, then connect AI providers from Settings.'}
              </p>
            </div>
          ) : null}

          {oauthSubmitting && inDesktopWindow ? (
            <div style={calloutStyle('warning')}>
              <p style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.warning })}>
                Finish the provider sign-in in your browser. The desktop app will pick the session up automatically when the callback completes.
              </p>
            </div>
          ) : null}

          {providers.email.enabled ? (
            <>
              {socialProvidersEnabled ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    gap: DESIGN_TOKENS.space[3],
                  }}
                >
                  <div style={dividerStyle()} />
                  <span style={metaTextStyle()}>Account credentials</span>
                  <div style={dividerStyle()} />
                </div>
              ) : null}

              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>
                {authMode === 'signup' ? (
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={metaTextStyle()}>Full name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      required
                      style={inputStyle()}
                    />
                  </label>
                ) : null}

                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={metaTextStyle()}>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="username"
                    required
                    style={inputStyle()}
                  />
                </label>

                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={metaTextStyle()}>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    style={inputStyle()}
                  />
                </label>

                {error ? (
                  <div style={calloutStyle('danger')}>
                    <p style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.danger })}>{error}</p>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  style={mergeStyles(buttonStyle({ tone: 'primary', size: 'lg', disabled: submitting }), {
                    width: '100%',
                    justifyContent: 'center',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                  })}
                >
                  <LockKeyhole size={14} />
                  {submitting
                    ? (authMode === 'signup' ? 'Creating account…' : 'Signing in…')
                    : (authMode === 'signup' ? 'Create Empyralis account' : 'Continue')}
                </button>
              </form>
            </>
          ) : null}

          <div
            style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[4] }), {
              display: 'grid',
              gap: 10,
            })}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldCheck size={15} color={DESIGN_TOKENS.color.textPrimary} />
              <span
                style={{
                  color: DESIGN_TOKENS.color.textPrimary,
                  fontSize: DESIGN_TOKENS.type.size.label,
                  fontWeight: DESIGN_TOKENS.type.weight.semibold,
                }}
              >
                After sign-in
              </span>
            </div>
            <p style={bodyTextStyle()}>
              Add a backup sign-in method in Settings, then connect OpenAI or Codex from Credentials. That preserves account recovery while still giving the app provider access.
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
            <Link
              href={returnTo}
              style={mergeStyles(inlineLinkStyle(), buttonStyle({ tone: 'ghost', size: 'sm' }), {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              })}
            >
              <ArrowLeft size={14} />
              Back
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={badgeStyle('neutral')}>
                {inDesktopWindow ? 'Trusted desktop handoff' : 'Browser session'}
              </span>
              <span style={metaTextStyle()}>
                {shellNote}
              </span>
            </div>
          </div>
          </section>
        </div>
      </div>
    </div>
  );
}
