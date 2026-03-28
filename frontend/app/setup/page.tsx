'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Loader2 } from 'lucide-react';
import { type ProviderId, normalizeProviderId } from '@/app/page.catalog';
import { useToast } from '@/components/Toast';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';

const WORKSPACE_ID = 'default';
const CONNECT_AI_HREF = `/connect-ai?returnTo=${encodeURIComponent('/setup')}`;

type SetupProviderId = 'openai' | 'anthropic' | 'gemini';

type RuntimeProfile = {
  id: string;
  provider: SetupProviderId;
  label: string;
  model: string;
  enabled: boolean;
  priority: number;
  credentialId: string;
};

type RunPrecheckPayload = {
  doctor_preflight?: {
    blocking?: boolean | null;
    detail?: string | null;
  } | null;
};

function normalizeSetupProvider(value: unknown): SetupProviderId {
  const provider = normalizeProviderId(value as ProviderId);
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'gemini') return 'gemini';
  return 'openai';
}

function providerLabel(provider: SetupProviderId): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'gemini') return 'Google';
  return 'OpenAI';
}

function parseProfiles(payload: unknown): RuntimeProfile[] {
  const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((payload as { items: unknown[] }).items)
    : [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const provider = normalizeSetupProvider(record.provider);
      if (!id) return null;
      return {
        id,
        provider,
        label: String(record.label || providerLabel(provider)).trim() || providerLabel(provider),
        model: String(record.model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        enabled: record.enabled !== false,
        priority: typeof record.priority === 'number' ? record.priority : 100,
        credentialId: String(record.credential_id || '').trim(),
      } satisfies RuntimeProfile;
    })
    .filter((item): item is RuntimeProfile => item !== null)
    .sort((left, right) => {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.label.localeCompare(right.label);
    });
}

export default function SetupPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState('');

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const response = await controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`);
      const payload = response.ok ? await response.json().catch(() => ({ items: [] })) : { items: [] };
      setProfiles(parseProfiles(payload));
    } catch {
      setProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  }, [controlPlaneFetch]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    const handleFocus = () => {
      void loadProfiles();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadProfiles]);

  const activeProfile = useMemo(
    () => profiles.find((item) => item.enabled) || null,
    [profiles],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setRunError('Describe the task first.');
      return;
    }
    if (!activeProfile) {
      router.push(CONNECT_AI_HREF);
      return;
    }

    const payload = {
      engine: 'orion',
      workspace_id: WORKSPACE_ID,
      user_goal: trimmed,
      business_plan: `Goal: ${trimmed}`,
      agent_role: 'assistant',
      provider: activeProfile.provider,
      model: activeProfile.model,
      credential_id: activeProfile.credentialId || undefined,
      metadata: {
        workspace_id: WORKSPACE_ID,
        origin: 'setup_single_input',
        profile_id: activeProfile.id,
        runtime_profile_id: activeProfile.id,
        provider: activeProfile.provider,
        model: activeProfile.model,
        execution_target: 'auto',
      },
      agents: [
        {
          role: 'Operator',
          modelId: activeProfile.model,
          provider: activeProfile.provider,
          duty: trimmed,
        },
      ],
    };

    setRunBusy(true);
    setRunError('');
    try {
      const precheckResponse = await controlPlaneFetch('/api/runs/precheck', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const precheckBody = (await precheckResponse.json().catch(() => null)) as RunPrecheckPayload | null;
      if (precheckBody?.doctor_preflight?.blocking) {
        throw new Error(String(precheckBody.doctor_preflight.detail || 'This task cannot run yet.'));
      }

      const response = await controlPlaneFetch('/api/runs/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const responseBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(String(responseBody?.detail || responseBody?.error || 'Failed to start the task.'));
      }

      const runId = String(responseBody?.run_id || '').trim();
      if (!runId) {
        throw new Error('The task started but no run ID was returned.');
      }

      upsertSeededRuntimeRun({
        run_id: runId,
        status: 'running',
        workflow_name: 'New task',
        user_goal: trimmed,
        created_at: new Date().toISOString(),
        agent_role: 'assistant',
        triggered_by: 'Setup',
        active_profile_id: activeProfile.id,
        active_profile_label: activeProfile.label,
        active_profile_provider: activeProfile.provider,
        active_profile_model: activeProfile.model,
        execution_target_selected: 'auto',
      });
      router.push(`/runs/${runId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start the task.';
      setRunError(message);
      addToast({
        type: 'error',
        title: 'Could not start the task',
        message,
      });
    } finally {
      setRunBusy(false);
    }
  }, [activeProfile, addToast, controlPlaneFetch, prompt, router]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<Bot size={18} />}
        title="What do you want your agent to do?"
        subtitle="Describe the task once, then run it. No setup steps."
        actions={
          <Link href="/" className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <ArrowLeft size={13} />
            Back to chat
          </Link>
        }
      />

      <section className="orion-panel" style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="orion-panel-title">Task</div>
          <textarea
            className="orion-input"
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What do you want your agent to do?"
            style={{ resize: 'vertical', minHeight: 144, paddingTop: 14 }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            borderRadius: 14,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-subtle)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>AI account</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {profilesLoading
                ? 'Checking accounts…'
                : activeProfile
                  ? `${activeProfile.label} · ${activeProfile.model}`
                  : 'No AI account connected'}
            </div>
          </div>
          <Link href={CONNECT_AI_HREF} className="orion-btn orion-btn-secondary" style={{ minHeight: 36, paddingInline: 14 }}>
            {activeProfile ? 'Change AI account' : 'Connect AI account'}
          </Link>
        </div>

        {runError ? (
          <div
            style={{
              borderRadius: 14,
              border: '1px solid var(--warning-border)',
              background: 'var(--warning-bg)',
              color: 'var(--warning-fg)',
              padding: '10px 12px',
              fontSize: 12.5,
              lineHeight: 1.5,
            }}
          >
            {runError}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="orion-btn orion-btn-primary"
            style={{ minHeight: 40, paddingInline: 18 }}
            disabled={runBusy || profilesLoading}
            onClick={() => void handleSubmit()}
          >
            {runBusy ? (
              <>
                <Loader2 size={14} className="hekor-spin" />
                Starting…
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
