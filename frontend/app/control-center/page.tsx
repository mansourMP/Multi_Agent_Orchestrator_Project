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
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { MetricStrip } from '@/components/ui/MetricStrip';
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
      title: 'Integrations',
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
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Admin"
        title="Advanced platform controls for setup, integrations, diagnostics, and defaults."
        copy="Assistant stays focused on getting work done. Admin is where you adjust setup, permissions, integrations, and diagnostics."
        actions={
          <Link href="/" className="orion-btn orion-btn-ghost">
            Return Home
          </Link>
        }
        aside={
          <>
            <PageHeroCard label="Access mode">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{accessMode === 'full' ? 'Full' : 'Default'}</div>
                  <div className="orion-home-side-note">Platform access</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{status.pendingApprovals > 0 ? status.pendingApprovals : 0}</div>
                  <div className="orion-home-side-note">Pending approvals</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">{approvalStatus}</div>
            </PageHeroCard>
            <PageHeroCard label="Runtime">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{runtimeStatus}</div>
                  <div className="orion-home-side-note">Runtime health</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{status.onlineWorkers}</div>
                  <div className="orion-home-side-note">Workers online</div>
                </div>
              </div>
            </PageHeroCard>
          </>
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

      <PageSection
        title="Where advanced controls live"
        description="Use Admin when you need to change how the platform behaves, not when you just want to get work done."
      >
        <div className="orion-grid-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="orion-control-card"
              >
                <div className="orion-control-card-head">
                  <div className="orion-control-card-intro">
                    <span aria-hidden className="orion-control-card-icon">
                      <Icon size={16} />
                    </span>
                    <div className="orion-control-card-copy">
                      <div className="orion-control-card-title">{card.title}</div>
                      <div className="orion-panel-copy orion-control-card-note">{card.copy}</div>
                    </div>
                  </div>
                  <ArrowRight size={15} className="orion-control-card-arrow" />
                </div>

                <div
                  className="orion-control-card-status"
                  style={{
                    ...toneStyle(card.tone),
                  }}
                >
                  {card.tone === 'ok' ? <CheckCircle2 size={13} /> : card.tone === 'warn' ? <Activity size={13} /> : <ShieldCheck size={13} />}
                  {card.status}
                </div>
              </Link>
            );
          })}
        </div>
      </PageSection>

      <div className="orion-grid-2">
        <PageSection title="What belongs here" description="Use Admin when you need to change how the platform behaves, not when you just want to get work done." muted>
          <div className="orion-list orion-control-center-list">
            <div className="orion-panel-copy">Connect or revoke tools and channels.</div>
            <div className="orion-panel-copy">Check runtime health, workers, and diagnostics.</div>
            <div className="orion-panel-copy">Choose safer default access or broader platform control.</div>
            <div className="orion-panel-copy">Change platform defaults and provider configuration.</div>
          </div>
        </PageSection>

        <PageSection title="Quick links" description="Jump into the most common advanced destinations without scanning the full grid." muted>
          <div className="orion-list orion-control-center-list">
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
        </PageSection>
      </div>
    </div>
  );
}
