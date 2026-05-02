'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';

import { awaitBrowserAuthReady, googleLogin, login } from '@/lib/auth/auth-client';
import { AppButton, AppInput } from '@/lib/ui/primitives';

function authErrorCopy(error: string): string {
  const normalized = error.toLowerCase();
  if (normalized.includes('google_not_configured')) {
    return 'Google sign-in is not configured for this environment yet.';
  }
  if (normalized.includes('google_origin_not_allowed')) {
    return 'Google sign-in is restricted to approved Empyralis domains.';
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
      setError(providerError);
    }
  }, [providerError]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      await awaitBrowserAuthReady();
      window.location.replace('/');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <form method="post" onSubmit={handleSubmit} className="app-auth-card app-auth-form">
        <div className="app-auth-header">
          <span className="app-auth-kicker">Empyralis</span>
          <h1 className="app-auth-title">Log in</h1>
          <p className="app-auth-subtitle">Use your Empyralis account to continue.</p>
        </div>
        <div className="app-auth-provider-stack">
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => googleLogin()}
            disabled={submitting || !isHydrated}
          >
            Continue with Google
          </AppButton>
          <div className="app-auth-divider">
            <span aria-hidden="true" />
            <span>or</span>
            <span aria-hidden="true" />
          </div>
        </div>
        <label className="app-auth-field">
          <span className="app-auth-field__label">Email</span>
          <AppInput
            autoComplete="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="app-auth-field">
          <span className="app-auth-field__label">Password</span>
          <AppInput
            autoComplete="current-password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p role="alert" className="app-auth-error">{authErrorCopy(error)}</p> : null}
        <AppButton type="submit" disabled={submitting || !isHydrated}>
          {submitting ? 'Signing in…' : 'Log in'}
        </AppButton>
        <p className="app-auth-footer">
          Need an account? <Link href={signupHref}>Sign up</Link>
        </p>
      </form>
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
