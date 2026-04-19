'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { signup } from '@/lib/auth/auth-client';
import { AppButton, AppInput } from '@/lib/ui/primitives';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelAttribution, setChannelAttribution] = useState('');
  const loginHref = channelAttribution
    ? `/login?channel_attribution=${encodeURIComponent(channelAttribution)}`
    : '/login';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setChannelAttribution(String(params.get('channel_attribution') || '').trim());
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signup(email, password, name || undefined);
      router.replace('/onboarding');
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Signup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <form onSubmit={handleSubmit} className="app-auth-card app-auth-form">
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
        {error ? <p role="alert" className="app-auth-error">{error}</p> : null}
        <AppButton type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </AppButton>
        <p className="app-auth-footer">
          Already have an account? <Link href={loginHref}>Log in</Link>
        </p>
      </form>
    </main>
  );
}
