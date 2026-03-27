'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Chrome, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react';
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
  const [providers, setProviders] = useState<AuthProviders>(DEFAULT_PROVIDERS);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [error, setError] = useState(authErrorMessage(errorCode));

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/control-plane/auth/login', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          desktop_handoff: desktopMode,
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

      if (desktopMode && payload?.redirect_to) {
        window.location.assign(payload.redirect_to);
        return;
      }

      window.location.assign(returnTo);
    } catch (submitError) {
      setSubmitting(false);
      setError(
        humanizeUiError(
          submitError instanceof Error ? submitError.message : '',
          'Unable to sign in right now.',
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
    window.location.assign(target);
  };

  const continueWithApple = () => {
    const params = new URLSearchParams({ returnTo });
    if (desktopMode) {
      params.set('desktop', '1');
    }
    const target = `/api/control-plane/auth/apple/start?${params.toString()}`;
    window.location.assign(target);
  };

  return (
    <div className="orion-auth-page">
      <div className="orion-auth-card">
        <div className="orion-auth-card__eyebrow">
          <ShieldCheck size={14} />
          Secure browser sign-in
        </div>
        <h1 className="orion-auth-card__title">Sign in to Empyralis</h1>
        <p className="orion-auth-card__copy">
          Sign in with the fastest supported provider. Direct AI account connection comes after app sign-in.
        </p>

        {!loadingProviders && providers.google.enabled ? (
          <button type="button" className="orion-auth-provider" onClick={continueWithGoogle}>
            <span className="orion-auth-provider__icon">
              <Chrome size={16} />
            </span>
            Continue with Google
          </button>
        ) : null}

        {!loadingProviders && providers.apple.enabled ? (
          <button type="button" className="orion-auth-provider" onClick={continueWithApple}>
            <span className="orion-auth-provider__icon">
              <Smartphone size={16} />
            </span>
            Continue with Apple
          </button>
        ) : null}

        {!loadingProviders && !providers.google.enabled && !providers.apple.enabled ? (
          <div className="orion-auth-note">
            Social sign-in appears automatically when your hosted control plane is configured for Google or Apple.
          </div>
        ) : null}

        {providers.email.enabled ? (
          <>
            <div className="orion-auth-divider">
              <span>{providers.google.enabled || providers.apple.enabled ? 'or use email' : 'Email sign-in'}</span>
            </div>

            <form className="orion-auth-form" onSubmit={handleSubmit}>
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
                {submitting ? 'Signing in…' : 'Continue'}
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
