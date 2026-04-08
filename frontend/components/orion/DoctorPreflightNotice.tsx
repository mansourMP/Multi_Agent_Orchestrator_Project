'use client';

import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  buttonStyle,
  mergeStyles,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';
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
  const toneStyles =
    tone === 'ok'
      ? {
          borderColor: DESIGN_TOKENS.color.successSoft,
          background: DESIGN_TOKENS.color.successSoft,
          iconColor: DESIGN_TOKENS.color.success,
          badgeVariant: 'default' as const,
        }
      : tone === 'fail'
        ? {
            borderColor: DESIGN_TOKENS.color.dangerSoft,
            background: DESIGN_TOKENS.color.dangerSoft,
            iconColor: DESIGN_TOKENS.color.danger,
            badgeVariant: 'destructive' as const,
          }
        : {
            borderColor: DESIGN_TOKENS.color.warningSoft,
            background: DESIGN_TOKENS.color.warningSoft,
            iconColor: DESIGN_TOKENS.color.warning,
            badgeVariant: 'secondary' as const,
          };

  return (
    <section
      style={mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
        marginTop: DESIGN_TOKENS.space[3],
        display: 'grid',
        gap: DESIGN_TOKENS.space[4],
        borderColor: toneStyles.borderColor,
        background: toneStyles.background,
      })}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          gap: DESIGN_TOKENS.space[4],
          alignItems: 'start',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            display: 'grid',
            placeItems: 'center',
            borderRadius: DESIGN_TOKENS.radius.lg,
            border: `1px solid ${toneStyles.borderColor}`,
            background: DESIGN_TOKENS.color.surface,
            color: toneStyles.iconColor,
          }}
        >
          <Icon size={18} />
        </div>
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
            <Badge variant={toneStyles.badgeVariant}>{badgeLabel}</Badge>
            <div style={sectionTitleStyle()}>{decision.title}</div>
          </div>
          <div style={bodyTextStyle()}>{decision.detail}</div>
          {decision.recommendation && decision.recommendation !== decision.detail ? (
            <div style={bodyTextStyle()}>{decision.recommendation}</div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-start', gap: DESIGN_TOKENS.space[3] }}>
        <Link
          href={actionHref}
          style={mergeStyles(buttonStyle({ tone: 'secondary' }), {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            fontFamily: DESIGN_TOKENS.type.family,
          })}
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}
