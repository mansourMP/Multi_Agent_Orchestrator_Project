'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  HeartPulse,
  KeyRound,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';

type ControlCenterCard = {
  href: string;
  title: string;
  copy: string;
  status: string;
  tone: 'ok' | 'warn' | 'neutral';
  icon: ComponentType<{ size?: number }>;
};

function toneStyle(tone: ControlCenterCard['tone']) {
  if (tone === 'ok') {
    return {
      background: 'var(--success-bg)',
      color: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
    };
  }
  if (tone === 'warn') {
    return {
      background: 'var(--warning-bg)',
      color: 'var(--warning-fg)',
      border: '1px solid var(--warning-border)',
    };
  }
  return {
    background: 'var(--bg-element)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  };
}

export default function ControlCenterPage() {
  const { accessMode, status } = usePlatformShell();

  const setupStatus = status.setupReady ? 'Ready' : `Needs attention (${status.setupProgressCount}/3)`;
  const runtimeStatus =
    status.runtimeHealthy === true
      ? 'Healthy'
      : status.runtimeHealthy === false
        ? 'Needs attention'
        : 'Checking';
  const workerStatus = status.onlineWorkers > 0 ? `${status.onlineWorkers} online` : 'No workers online';
  const approvalStatus = status.pendingApprovals > 0 ? `${status.pendingApprovals} pending` : 'No approvals waiting';

  const cards: ControlCenterCard[] = [
    {
      href: '/setup',
      title: 'Setup',
      copy: 'Finish platform setup, account mode, and tool access.',
      status: setupStatus,
      tone: status.setupReady ? 'ok' : 'warn',
      icon: SlidersHorizontal,
    },
    {
      href: '/credentials',
      title: 'Connections',
      copy: 'Manage shared tools, channels, and platform access.',
      status: accessMode === 'full' ? 'Full access enabled' : 'Default access mode',
      tone: 'neutral',
      icon: KeyRound,
    },
    {
      href: '/health',
      title: 'Health',
      copy: 'Check runtime health, workers, diagnostics, and recovery tools.',
      status: `${runtimeStatus} · ${workerStatus}`,
      tone: status.runtimeHealthy === false || status.onlineWorkers <= 0 ? 'warn' : status.runtimeHealthy === true ? 'ok' : 'neutral',
      icon: HeartPulse,
    },
    {
      href: '/settings',
      title: 'Settings',
      copy: 'Change interface defaults, provider keys, and system preferences.',
      status: 'Theme, providers, and defaults',
      tone: 'neutral',
      icon: Settings,
    },
  ];

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<ShieldCheck size={18} />}
        title="Admin"
        subtitle="Advanced platform controls for setup, connections, diagnostics, and defaults."
        meta={
          <>
            <span>{accessMode === 'full' ? 'Full access mode' : 'Default access mode'}</span>
            <span>{approvalStatus}</span>
          </>
        }
        actions={
          <Link href="/" className="orion-btn orion-btn-ghost">
            Return Home
          </Link>
        }
      />

      <MetricStrip
        items={[
          { label: 'Setup', value: status.setupReady ? 'Ready' : `${status.setupProgressCount}/3`, note: status.setupReady ? 'Platform can run' : 'Finish onboarding' },
          { label: 'Runtime', value: runtimeStatus, note: workerStatus },
          { label: 'Approvals', value: status.pendingApprovals > 0 ? String(status.pendingApprovals) : '0', note: approvalStatus },
          { label: 'Access', value: accessMode === 'full' ? 'Full' : 'Default', note: accessMode === 'full' ? 'Broader platform control' : 'Safer everyday mode' },
        ]}
        minWidth={180}
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
              <div className="orion-panel-title">Where advanced controls live</div>
              <div className="orion-panel-copy">
              Assistant stays focused on getting work done. Admin is where you adjust setup, permissions, connections, and diagnostics.
              </div>
          </div>
        </div>

        <div className="orion-grid-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="orion-control-card"
                style={{
                  display: 'grid',
                  gap: 12,
                  borderRadius: 14,
                  padding: 16,
                  border: '1px solid var(--border-default)',
                  background: 'color-mix(in srgb, var(--bg-surface) 92%, var(--bg-element) 8%)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 34,
                        height: 34,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        background: 'color-mix(in srgb, var(--bg-element) 78%, var(--primary-base) 22%)',
                        border: '1px solid color-mix(in srgb, var(--border-default) 62%, var(--primary-base) 38%)',
                        color: 'var(--text-primary)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{card.title}</div>
                      <div className="orion-panel-copy" style={{ marginTop: 4 }}>{card.copy}</div>
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                </div>

                <div
                  style={{
                    ...toneStyle(card.tone),
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    width: 'fit-content',
                    borderRadius: 999,
                    minHeight: 28,
                    padding: '0 10px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                  }}
                >
                  {card.tone === 'ok' ? <CheckCircle2 size={13} /> : card.tone === 'warn' ? <Activity size={13} /> : <ShieldCheck size={13} />}
                  {card.status}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="orion-grid-2">
        <section className="orion-panel muted">
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">What belongs here</div>
              <div className="orion-panel-copy">Use Admin when you need to change how the platform behaves, not when you just want to get work done.</div>
            </div>
          </div>
          <div className="orion-list" style={{ marginTop: 12 }}>
            <div className="orion-panel-copy">Connect or revoke tools and channels.</div>
            <div className="orion-panel-copy">Check runtime health, workers, and diagnostics.</div>
            <div className="orion-panel-copy">Choose safer default access or broader platform control.</div>
            <div className="orion-panel-copy">Change platform defaults and provider configuration.</div>
          </div>
        </section>

        <section className="orion-panel muted">
          <div className="orion-panel-header" style={{ marginBottom: 0 }}>
            <div>
              <div className="orion-panel-title">Quick links</div>
              <div className="orion-panel-copy">Jump into the most common advanced destinations without scanning the full grid.</div>
            </div>
          </div>
          <div className="orion-list" style={{ marginTop: 12 }}>
            <Link href="/account" className="orion-control-link">
              <UserRound size={14} />
              Account and identity
            </Link>
            <Link href="/approvals" className="orion-control-link">
              <Activity size={14} />
              Review approvals
            </Link>
            <Link href="/" className="orion-control-link">
              <ShieldCheck size={14} />
              Return to Home
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
