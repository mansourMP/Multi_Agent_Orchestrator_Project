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
  const unwrapped = error
    .trim()
    .replace(/^(login request failed|session readiness failed|authentication request failed):\s*/i, '');
  const normalized = unwrapped.toLowerCase();
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
  if (normalized.includes('status 401')) {
    return 'Email or password was not accepted.';
  }
  if (normalized.includes('status 403')) {
    return 'This session is not allowed to open the workspace yet. Sign in again or use an allowed account.';
  }
  if (normalized.includes('status 404')) {
    return 'The auth route is not available in this environment.';
  }
  if (normalized.includes('status 429')) {
    return 'Too many sign-in attempts. Wait a minute, then try again.';
  }
  if (/(?:status\s*)?5\d\d/.test(normalized)
    || /internal server|bad gateway|service unavailable|gateway timeout|temporarily unavailable|warming up/.test(normalized)) {
    return 'The auth service is warming up or unavailable. Try again in a moment.';
  }
  if (normalized.includes('password') || normalized.includes('credential') || normalized.includes('invalid')) {
    return 'Email or password was not accepted.';
  }
  return 'Authentication could not finish. Try again when ready.';
}

function AuthErrorNotice({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert" className="app-auth-error">
      <strong>{title}</strong>
      <span>{authErrorCopy(message)}</span>
    </div>
  );
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
  const pilotCode = String(searchParams.get('pilot_code') || '').trim();
  const providerError = String(searchParams.get('error') || '').trim();
  const signupSearchParams = new URLSearchParams();
  if (agentParam) {
    signupSearchParams.set('agent', agentParam);
  }
  if (channelAttribution) {
    signupSearchParams.set('channel_attribution', channelAttribution);
  }
  if (pilotCode) {
    signupSearchParams.set('pilot_code', pilotCode);
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
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Login failed.';
      setError(message);
      setSubmitting(false);
      return;
    }
    try {
      await awaitBrowserAuthReady({ attempts: 12, delayMs: 250 });
      window.location.replace('/');
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : 'Session was not ready.';
      setError(`Session readiness failed: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <div className="app-auth-shell app-auth-shell--centered">
        <form method="post" onSubmit={handleSubmit} className="app-auth-card app-auth-form">
          <div className="app-auth-header">
            <h1 className="app-auth-title">Log in to Empyralis</h1>
            <p className="app-auth-subtitle">Your personal control surface for autonomous work.</p>
          </div>
          <div className="app-auth-provider-stack">
            <div className="app-auth-social-stack">
              <AppButton
                type="button"
                tone="secondary"
                className="app-auth-social"
                onClick={() => googleLogin()}
                disabled={submitting || !isHydrated || providers.google?.enabled !== true}
              >
                <GoogleProviderIcon className="app-auth-provider-mark" />
                <span className="app-auth-social__content">
                  <span className="app-auth-social__title">Continue with Google</span>
                </span>
              </AppButton>
            </div>
            {providers.google?.enabled !== true ? (
              <p className="app-auth-provider-note">Google sign-in is unavailable right now. Use email below.</p>
            ) : null}
            <div className="app-auth-divider">
              <span>or email</span>
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
                placeholder="Enter your email"
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
                placeholder="Enter your password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </span>
          </label>
          {error ? <AuthErrorNotice title="Couldn’t sign in" message={error} /> : null}
          <AppButton type="submit" tone="primary" disabled={submitting} className="app-auth-submit">
            <span>{submitting ? 'Signing in…' : 'Continue'}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </AppButton>
          <p className="app-auth-footer">
            No account? <Link href={signupHref}>Sign up</Link>
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
