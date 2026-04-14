'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { login } from '@/lib/auth/auth-client';
import { AppButton, AppInput } from '@/lib/ui/primitives';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/');
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-auth-page">
      <form onSubmit={handleSubmit} className="app-auth-card app-auth-form">
        <div className="app-auth-header">
          <span className="app-auth-kicker">Empyralis</span>
          <h1 className="app-auth-title">Log in</h1>
          <p className="app-auth-subtitle">Use your Empyralis account to continue.</p>
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
        {error ? <p role="alert" className="app-auth-error">{error}</p> : null}
        <AppButton type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </AppButton>
        <p className="app-auth-footer">
          Need an account? <Link href="/signup">Sign up</Link>
        </p>
      </form>
    </main>
  );
}
