'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Chrome, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
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
  }, [desktopMode, error, inDesktopWindow, loadingProviders, providers.apple.enabled, providers.google.enabled, returnTo]);

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
        <div className="orion-auth-card__eyebrow">
          <ShieldCheck size={14} />
          {inDesktopWindow ? 'Secure sign-in' : 'Secure browser sign-in'}
        </div>
        <h1 className="orion-auth-card__title">Sign in to Empyralis</h1>
        <p className="orion-auth-card__copy">
          {inDesktopWindow
            ? 'Sign in here. Google and Apple continue in your system browser and return to the app automatically.'
            : 'Sign in with the fastest supported provider. Direct AI account connection comes after app sign-in.'}
        </p>

        {!loadingProviders && providers.google.enabled ? (
          <button type="button" className="orion-auth-provider" onClick={continueWithGoogle} disabled={oauthSubmitting !== null}>
            <span className="orion-auth-provider__icon">
              <Chrome size={16} />
            </span>
            {oauthSubmitting === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
          </button>
        ) : null}

        {!loadingProviders && providers.apple.enabled ? (
          <button type="button" className="orion-auth-provider" onClick={continueWithApple} disabled={oauthSubmitting !== null}>
            <span className="orion-auth-provider__icon">
              <Smartphone size={16} />
            </span>
            {oauthSubmitting === 'apple' ? 'Waiting for Apple…' : 'Continue with Apple'}
          </button>
        ) : null}

        {!loadingProviders && !providers.google.enabled && !providers.apple.enabled ? (
          <div className="orion-auth-note">
            {inDesktopWindow
              ? 'Google or Apple sign-in is not configured in this build yet. Create an account here, or sign in with your existing account.'
              : 'This local build is not configured for Google or Apple sign-in yet. Create a local account here, or sign in with an existing local account.'}
          </div>
        ) : null}

        {oauthSubmitting && inDesktopWindow ? (
          <div className="orion-auth-note">
            Finish sign-in in your browser. Empyralis will return you to the app automatically when authentication completes.
          </div>
        ) : null}

        {providers.email.enabled ? (
          <>
            <div className="orion-auth-divider">
              <span>Email sign-in</span>
            </div>

            <div className="orion-auth-switch" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={authMode === 'signup' ? 'orion-auth-switch__button active' : 'orion-auth-switch__button'}
                onClick={() => {
                  setAuthMode('signup');
                  setError('');
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className={authMode === 'signin' ? 'orion-auth-switch__button active' : 'orion-auth-switch__button'}
                onClick={() => {
                  setAuthMode('signin');
                  setError('');
                }}
              >
                Sign in
              </button>
            </div>

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
