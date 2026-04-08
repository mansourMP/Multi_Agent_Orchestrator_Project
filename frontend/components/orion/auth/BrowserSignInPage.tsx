'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Chrome, LockKeyhole, Smartphone } from 'lucide-react';
import { getDesktopBridge } from '@/lib/desktopBridge';
import { waitForDesktopControlPlaneSignIn } from '@/lib/controlPlaneSession';
import { buildPostSignInSetupHref } from '@/lib/setupReadiness';
import { humanizeUiError } from '@/lib/uiError';

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

export default function BrowserSignInPage({ returnTo, errorCode = '', desktopMode = false }: BrowserSignInPageProps) {
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
  const headline = authMode === 'signup' ? 'Create your account' : 'Welcome back';
  const subheadline = inDesktopWindow
    ? 'Sign in to your Empyralis account here. Google and Apple open in your browser and return automatically.'
    : authMode === 'signup'
      ? 'Create your Empyralis account. AI providers connect separately after sign-in.'
      : 'Sign in to your Empyralis account to continue.';
  const accountBoundaryNote = authMode === 'signup'
    ? 'Your Empyralis account owns your runs, artifacts, workspaces, and recovery path.'
    : 'Your Empyralis account remains separate from any AI provider you connect later.';

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
    const params = new URLSearchParams({ returnTo });
    if (desktopMode) {
      params.set('desktop', '1');
    }
    const target = provider === 'google'
      ? `/api/control-plane/auth/google/start?${params.toString()}`
      : `/api/control-plane/auth/apple/start?${params.toString()}`;
    window.location.replace(target);
  }, [desktopMode, error, inDesktopWindow, loadingProviders, providers.apple.enabled, providers.email.enabled, providers.google.enabled, returnTo]);

  useEffect(() => {
    if (loadingProviders) return;
    if (!providers.google.enabled && !providers.apple.enabled) {
      setAuthMode((current) => (current === 'signin' ? 'signup' : current));
    }
  }, [loadingProviders, providers.apple.enabled, providers.google.enabled]);

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
    const params = new URLSearchParams({ returnTo });
    if (desktopMode) {
      params.set('desktop', '1');
    }
    const target = `/api/control-plane/auth/google/start?${params.toString()}`;
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
    const params = new URLSearchParams({ returnTo });
    if (desktopMode) {
      params.set('desktop', '1');
    }
    const target = `/api/control-plane/auth/apple/start?${params.toString()}`;
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
    <div className="orion-auth-page">
      <div className="orion-auth-card">
        <div className="orion-auth-header">
          <div className="orion-auth-wordmark">Empyralis</div>
          <h1 className="orion-auth-card__title">{headline}</h1>
          <p className="orion-auth-card__copy">{subheadline}</p>
          <p className="orion-auth-card__copy">{accountBoundaryNote}</p>
        </div>

        {!loadingProviders && socialProvidersEnabled ? (
          <div className="orion-auth-social">
            {providers.google.enabled ? (
              <button type="button" className="orion-auth-provider" onClick={continueWithGoogle} disabled={oauthSubmitting !== null}>
                <span className="orion-auth-provider__icon">
                  <Chrome size={16} />
                </span>
                {oauthSubmitting === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
              </button>
            ) : null}

            {providers.apple.enabled ? (
              <button type="button" className="orion-auth-provider" onClick={continueWithApple} disabled={oauthSubmitting !== null}>
                <span className="orion-auth-provider__icon">
                  <Smartphone size={16} />
                </span>
                {oauthSubmitting === 'apple' ? 'Waiting for Apple…' : 'Continue with Apple'}
              </button>
            ) : null}
          </div>
        ) : null}

        {!loadingProviders && !providers.google.enabled && !providers.apple.enabled ? (
          <div className="orion-auth-note">
            {inDesktopWindow
              ? 'Google or Apple sign-in is not configured in this build yet. Use your Empyralis account here, then connect providers separately later.'
              : 'This local build is not configured for Google or Apple sign-in yet. Use your Empyralis account here, then connect providers separately later.'}
          </div>
        ) : null}

        {oauthSubmitting && inDesktopWindow ? (
          <div className="orion-auth-note">
            Finish sign-in in your browser. Empyralis will return you to the app automatically when authentication completes.
          </div>
        ) : null}

        {providers.email.enabled ? (
          <>
            {socialProvidersEnabled ? (
              <div className="orion-auth-divider">
                <span>or continue with email</span>
              </div>
            ) : null}

            <form className="orion-auth-form" onSubmit={handleSubmit}>
              {authMode === 'signup' ? (
                <label className="orion-auth-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                </label>
              ) : null}
              <label className="orion-auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="orion-auth-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {error ? <div className="orion-auth-error">{error}</div> : null}

              <button type="submit" className="btn-primary orion-auth-submit" disabled={submitting}>
                <LockKeyhole size={14} />
                {submitting
                  ? (authMode === 'signup' ? 'Creating account…' : 'Signing in…')
                  : (authMode === 'signup' ? 'Create account' : 'Continue')}
              </button>

              <div className="orion-auth-mode-switch">
                {authMode === 'signup' ? (
                  <>
                    <span>Already have an Empyralis account?</span>
                    <button
                      type="button"
                      className="orion-auth-mode-link"
                      onClick={() => {
                        setAuthMode('signin');
                        setError('');
                      }}
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    <span>Don&apos;t have an Empyralis account?</span>
                    <button
                      type="button"
                      className="orion-auth-mode-link"
                      onClick={() => {
                        setAuthMode('signup');
                        setError('');
                      }}
                    >
                      Create one
                    </button>
                  </>
                )}
              </div>
            </form>
          </>
        ) : null}

        <div className="orion-auth-card__footer">
          <Link href={returnTo} className="btn-ghost orion-auth-back">
            <ArrowLeft size={14} />
            Back
          </Link>
        </div>
      </div>
    </div>
  );
}
