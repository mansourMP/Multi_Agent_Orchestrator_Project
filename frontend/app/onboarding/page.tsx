'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { connectRuntimeWithApiKey, fetchRuntimeConnectionStatus } from '@/lib/runtimeConnection';

export default function OnboardingPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const status = await fetchRuntimeConnectionStatus();
        if (!active) return;
        if (status.configured && status.healthy) {
          router.replace('/home');
          return;
        }
      } catch {
        // keep onboarding visible
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="orion-page-shell narrow orion-animate-in" style={{ width: 'min(520px, 100%)', margin: '0 auto' }}>
      <section className="orion-panel" style={{ display: 'grid', gap: 18, padding: 24 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="orion-chip" style={{ width: 'fit-content' }}>
            Onboarding
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={18} />
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2 }}>Connect your core</h1>
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Paste your Empyralis runtime API key. We&apos;ll verify the local runtime with `/health`, save the connection,
            and open your workspace.
          </p>
        </div>

        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>API key</span>
          <input
            type="password"
            className="input"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste runtime API key"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={loading || saving}
          />
        </label>

        {error ? (
          <div
            style={{
              border: '1px solid var(--error-border)',
              background: 'var(--error-bg)',
              color: 'var(--error-fg)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="orion-btn orion-btn-primary"
          style={{ minHeight: 46, justifyContent: 'center' }}
          disabled={loading || saving || apiKey.trim().length === 0}
          onClick={() => {
            void (async () => {
              setSaving(true);
              setError('');
              try {
                await connectRuntimeWithApiKey(apiKey);
                router.replace('/home');
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : 'Unable to connect to the runtime.');
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          {loading ? 'Checking connection…' : saving ? 'Connecting…' : 'Connect and continue'}
        </button>
      </section>
    </div>
  );
}
