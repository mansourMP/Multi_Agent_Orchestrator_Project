'use client';

import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import type { DoctorRunGateDecision } from '@/lib/doctorPreflight';

type DoctorPreflightNoticeProps = {
  decision: DoctorRunGateDecision | null;
  showWhenPass?: boolean;
  actionHref?: string;
  actionLabel?: string;
};

export default function DoctorPreflightNotice({
  decision,
  showWhenPass = false,
  actionHref = '/health',
  actionLabel = 'Open Health',
}: DoctorPreflightNoticeProps) {
  if (!decision) return null;
  if (decision.status === 'pass' && !showWhenPass) return null;

  const tone = decision.status === 'pass' ? 'ok' : decision.blocking ? 'fail' : 'warn';
  const Icon = decision.status === 'pass' ? ShieldCheck : AlertTriangle;
  const badgeLabel = decision.status === 'pass' ? 'Healthy' : decision.blocking ? 'Action needed' : 'Attention';

  return (
    <section className={`orion-panel muted orion-doctor-preflight-notice is-${tone}`.trim()}>
      <div className="orion-doctor-preflight-head">
        <div className="orion-state-icon" aria-hidden="true">
          <Icon size={18} />
        </div>
        <div className="orion-doctor-preflight-copy">
          <div className="orion-doctor-preflight-topline">
            <span className={`orion-health-doctor-fix-badge is-${tone === 'ok' ? 'ok' : tone}`.trim()}>{badgeLabel}</span>
            <span className="orion-doctor-preflight-title">{decision.title}</span>
          </div>
          <div className="orion-doctor-preflight-detail">{decision.detail}</div>
          {decision.recommendation && decision.recommendation !== decision.detail ? (
            <div className="orion-doctor-preflight-recommendation">{decision.recommendation}</div>
          ) : null}
        </div>
      </div>

      <div className="orion-doctor-preflight-actions">
        <Link href={actionHref} className="btn-secondary">
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}
