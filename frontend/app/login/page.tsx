'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';

import {
  awaitBrowserAuthReady,
  clearExternalAuthPending,
  getPendingExternalAuthProvider,
  googleLogin,
  listAuthProviders,
  login,
  type AuthProviderOptions,
  watchExternalAuthCompletion,
} from '@/lib/auth/auth-client';
import { AppleProviderIcon, GoogleProviderIcon } from '@/lib/auth/auth-provider-icons';
import { AppButton, AppInput } from '@/lib/ui/primitives';

function authErrorCopy(error: string): string {
  const normalized = error.toLowerCase();
  if (normalized.includes('google_not_configured')) {
    return 'Google sign-in is not configured for this environment yet.';
  }
  if (normalized.includes('google_origin_not_allowed')) {
    return 'Google sign-in is restricted to approved Empyralis domains.';
  }
  if (normalized.includes('google_runtime_not_configured')) {
    return 'Google sign-in is not fully enabled on the runtime yet. Use email for now.';
  }
  if (normalized.includes('google_rate_limited')) {
    return 'Too many Google sign-in attempts. Wait a minute, then try again.';
  }
  if (normalized.includes('google_state_invalid') || normalized.includes('google_auth_failed')) {
    return 'Google sign-in could not finish. Try again or use email.';
  }
  if (normalized.includes('password') || normalized.includes('credential') || normalized.includes('invalid')) {
    return 'Email or password was not accepted.';
  }
  return 'Authentication could not finish. Try again when ready.';
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [providers, setProviders] = useState<AuthProviderOptions>({
    email: { enabled: true },
    google: { enabled: true },
    apple: { enabled: false },
  });
  const agentParam = String(searchParams.get('agent') || '').trim();
  const channelAttribution = String(searchParams.get('channel_attribution') || '').trim();
  const providerError = String(searchParams.get('error') || '').trim();
  const signupSearchParams = new URLSearchParams();
  if (agentParam) {
    signupSearchParams.set('agent', agentParam);
  }
  if (channelAttribution) {
    signupSearchParams.set('channel_attribution', channelAttribution);
  }
  const signupHref = signupSearchParams.size > 0
    ? `/signup?${signupSearchParams.toString()}`
    : '/signup';

  useEffect(() => {
    setIsHydrated(true);
    if (providerError) {
      clearExternalAuthPending();
      setError(providerError);
    }
    void listAuthProviders()
      .then((payload) => {
        setProviders({
          email: { enabled: payload?.email?.enabled !== false },
          google: { enabled: payload?.google?.enabled === true },
          apple: { enabled: false },
        });
      })
      .catch(() => {
        setProviders({
          email: { enabled: true },
          google: { enabled: true },
          apple: { enabled: false },
        });
      });
  }, [providerError]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }
    let cancelled = false;
    let inflight = false;

    const recoverGoogleAuth = async () => {
      if (cancelled || inflight || getPendingExternalAuthProvider() !== 'google') {
        return;
      }
      inflight = true;
      try {
        await awaitBrowserAuthReady({ attempts: 2, delayMs: 200 });
        if (cancelled) {
          return;
        }
        clearExternalAuthPending();
        window.location.replace('/');
      } catch {
        // keep waiting for the callback tab or focus handoff
      } finally {
        inflight = false;
      }
    };

    void recoverGoogleAuth();
    return watchExternalAuthCompletion(() => {
      void recoverGoogleAuth();
    });
  }, [isHydrated]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      await awaitBrowserAuthReady({ attempts: 12, delayMs: 250 });
      window.location.replace('/');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <div className="app-auth-shell">
        <section className="app-auth-hero" aria-label="Empyralis sign in overview">
          <div className="app-auth-hero__badge">Empyralis</div>
          <div className="app-auth-hero__copy">
            <h1 className="app-auth-hero__title">One account. One clean control surface.</h1>
            <p className="app-auth-hero__body">
              Use Google or email to open Sage, your connected apps, and your private assistants without setup noise.
            </p>
          </div>
          <div className="app-auth-hero__rail">
            <div className="app-auth-hero__point">
              <strong>Google</strong>
              <span>Fastest path for launch.</span>
            </div>
            <div className="app-auth-hero__point">
              <strong>Email</strong>
              <span>Fallback that always stays available.</span>
            </div>
            <div className="app-auth-hero__point">
              <strong>Apple</strong>
              <span>Reserved for the next auth pass, not faked today.</span>
            </div>
          </div>
        </section>
        <form method="post" onSubmit={handleSubmit} className="app-auth-card app-auth-card--elevated app-auth-form">
          <div className="app-auth-header">
            <span className="app-auth-kicker">Welcome back</span>
            <h2 className="app-auth-title">Log in</h2>
            <p className="app-auth-subtitle">Use Google, Apple, or your Empyralis email account.</p>
          </div>
          <div className="app-auth-provider-stack">
            <div className="app-auth-social-grid">
              <AppButton
                type="button"
                tone="secondary"
                className="app-auth-social"
                onClick={() => googleLogin()}
                disabled={submitting || !isHydrated || providers.google?.enabled !== true}
              >
                <GoogleProviderIcon className="app-auth-provider-mark" />
                <span>Continue with Google</span>
              </AppButton>
              <AppButton
                type="button"
                tone="secondary"
                className="app-auth-social"
                disabled
                aria-disabled="true"
                title="Apple sign-in is not enabled on the web app yet."
              >
                <AppleProviderIcon className="app-auth-provider-mark app-auth-provider-mark--apple" />
                <span>Apple soon</span>
              </AppButton>
            </div>
            {providers.google?.enabled !== true ? (
              <p className="app-auth-provider-note">Google sign-in is unavailable here right now. Use email below.</p>
            ) : null}
            <div className="app-auth-divider">
              <span aria-hidden="true" />
              <span>or continue with email</span>
              <span aria-hidden="true" />
            </div>
          </div>
          <label className="app-auth-field">
            <span className="app-auth-field__label">Email</span>
            <span className="app-auth-input-shell">
              <Mail className="app-auth-input-shell__icon" size={16} aria-hidden="true" />
              <AppInput
                autoComplete="email"
                name="email"
                type="email"
                required
                value={email}
                className="app-auth-input"
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          <label className="app-auth-field">
            <span className="app-auth-field__label">Password</span>
            <span className="app-auth-input-shell">
              <Lock className="app-auth-input-shell__icon" size={16} aria-hidden="true" />
              <AppInput
                autoComplete="current-password"
                name="password"
                type="password"
                required
                value={password}
                className="app-auth-input"
                onChange={(event) => setPassword(event.target.value)}
              />
            </span>
          </label>
          {error ? <p role="alert" className="app-auth-error">{authErrorCopy(error)}</p> : null}
          <AppButton type="submit" disabled={submitting || !isHydrated} className="app-auth-submit">
            <span>{submitting ? 'Signing in…' : 'Continue'}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </AppButton>
          <p className="app-auth-footer">
            Need an account? <Link href={signupHref}>Sign up</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
