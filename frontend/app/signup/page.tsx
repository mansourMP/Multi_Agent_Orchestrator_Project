'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

import { awaitBrowserAuthReady, signup } from '@/lib/auth/auth-client';
import { AppButton, AppInput } from '@/lib/ui/primitives';

function authErrorCopy(error: string): string {
  const normalized = error.toLowerCase();
  if (normalized.includes('already') || normalized.includes('exists')) {
    return 'That email is already registered. Log in or use another email.';
  }
  if (normalized.includes('password')) {
    return 'Use a stronger password and try again.';
  }
  return 'Authentication could not finish. Try again when ready.';
}

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [channelAttribution, setChannelAttribution] = useState('');
  const [agent, setAgent] = useState('');
  const loginSearchParams = new URLSearchParams();
  if (channelAttribution) {
    loginSearchParams.set('channel_attribution', channelAttribution);
  }
  if (agent) {
    loginSearchParams.set('agent', agent);
  }
  const loginHref = loginSearchParams.size > 0
    ? `/login?${loginSearchParams.toString()}`
    : '/login';

  useEffect(() => {
    setIsHydrated(true);
    const params = new URLSearchParams(window.location.search);
    setChannelAttribution(String(params.get('channel_attribution') || '').trim());
    setAgent(String(params.get('agent') || '').trim());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup(email, password, name || undefined);
      await awaitBrowserAuthReady();
      window.location.replace('/onboarding');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <form method="post" onSubmit={handleSubmit} className="app-auth-card app-auth-form">
        <div className="app-auth-header">
          <span className="app-auth-kicker">Empyralis</span>
          <h1 className="app-auth-title">Sign up</h1>
          <p className="app-auth-subtitle">
            {channelAttribution
              ? 'Create an Empyralis account to continue from Telegram.'
              : 'Create an Empyralis account.'}
          </p>
        </div>
        <label className="app-auth-field">
          <span className="app-auth-field__label">Name</span>
          <AppInput
            autoComplete="name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
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
            autoComplete="new-password"
            name="password"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p role="alert" className="app-auth-error">{authErrorCopy(error)}</p> : null}
        <AppButton type="submit" disabled={submitting || !isHydrated}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </AppButton>
        <p className="app-auth-footer">
          Already have an account? <Link href={loginHref}>Log in</Link>
        </p>
      </form>
    </main>
  );
}
