'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, ArrowRight, RotateCcw, Play } from 'lucide-react';

import { AppButton } from '@/lib/ui/primitives';
import { WorkstationSurfaceViewport } from '@/lib/workspace/workstation-shell-frame';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { buildWorkspaceRouteHref } from '../../../shared/nav-manifest';
import type { WorkspaceRouteId } from '../../../shared/nav-manifest';

export type DemoStepStatus = 'pending' | 'current' | 'completed';

export type DemoStep = {
  id: string;
  number: number;
  title: string;
  description: string;
  proofPoint: string;
  routeId: WorkspaceRouteId;
  actionLabel: string;
};

const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: 'login',
    number: 1,
    title: 'Login',
    description: 'Secure authentication with workspace-scoped access.',
    proofPoint: 'Token-based auth with tenant isolation and CSRF protection.',
    routeId: 'chat',
    actionLabel: 'Go to Sage',
  },
  {
    id: 'ask-sage',
    number: 2,
    title: 'Ask Sage',
    description: 'Converse with the AI operating system.',
    proofPoint: 'Real-time reasoning with transparency cells (thinking, searching, running).',
    routeId: 'chat',
    actionLabel: 'Open Chat',
  },
  {
    id: 'shop-assistant',
    number: 3,
    title: 'Shop Assistant',
    description: 'Deploy a business agent from a template.',
    proofPoint: 'Template-driven deployment with live configuration.',
    routeId: 'studio',
    actionLabel: 'Create Assistant',
  },
  {
    id: 'live-catalog',
    number: 4,
    title: 'Live Catalog Answer',
    description: 'Customer asks a product question; agent answers from live data.',
    proofPoint: 'Google Sheets sync with 5-min TTL cache and credential vaulting.',
    routeId: 'inbox',
    actionLabel: 'View Inbox',
  },
  {
    id: 'approval-gate',
    number: 5,
    title: 'Approval Gate',
    description: 'Risky operations require explicit owner approval.',
    proofPoint: 'Durable approval records with standalone resolution path.',
    routeId: 'approvals',
    actionLabel: 'View Approvals',
  },
  {
    id: 'activity',
    number: 6,
    title: 'Activity',
    description: 'Every action is logged for audit and transparency.',
    proofPoint: 'Activity ledger with gateway events, tool calls, and channel ops.',
    routeId: 'activity',
    actionLabel: 'View Activity',
  },
  {
    id: 'billing',
    number: 7,
    title: 'Billing',
    description: 'Real usage-based billing with cost estimation.',
    proofPoint: 'AI token and connector-read line items with pricing-registry cost estimation.',
    routeId: 'settings',
    actionLabel: 'View Billing',
  },
  {
    id: 'gateway',
    number: 8,
    title: 'Gateway Proof',
    description: 'Local computer acts as a secure extension of the cloud brain.',
    proofPoint: 'Revocable pairing, WSS transport, frame validation, and tool manifest enforcement.',
    routeId: 'gateway',
    actionLabel: 'Connect Gateway',
  },
];

const DEMO_PROGRESS_KEY = 'empyralis_investor_demo_progress';

function getDemoProgressKey(workspaceId: string): string {
  return `${DEMO_PROGRESS_KEY}_${workspaceId}`;
}

function loadProgress(workspaceId: string): Record<string, DemoStepStatus> {
  try {
    const raw = localStorage.getItem(getDemoProgressKey(workspaceId));
    if (raw) {
      return JSON.parse(raw) as Record<string, DemoStepStatus>;
    }
  } catch {
    // ignore parse errors
  }
  return {};
}

function saveProgress(workspaceId: string, progress: Record<string, DemoStepStatus>): void {
  try {
    localStorage.setItem(getDemoProgressKey(workspaceId), JSON.stringify(progress));
  } catch {
    // ignore storage errors
  }
}

function deriveStatuses(progress: Record<string, DemoStepStatus>): DemoStepStatus[] {
  const statuses: DemoStepStatus[] = [];
  let foundCurrent = false;
  for (const step of DEMO_STEPS) {
    const saved = progress[step.id];
    if (saved === 'completed') {
      statuses.push('completed');
    } else if (saved === 'current' || !foundCurrent) {
      statuses.push('current');
      foundCurrent = true;
    } else {
      statuses.push('pending');
    }
  }
  if (!foundCurrent) {
    statuses[0] = 'current';
  }
  return statuses;
}

export function WorkstationInvestorDemoPane() {
  const router = useRouter();
  const { workspaceId } = useWorkspaceBoundary();
  const [progress, setProgress] = useState<Record<string, DemoStepStatus>>(() =>
    loadProgress(workspaceId),
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const statuses = useMemo(() => deriveStatuses(progress), [progress]);

  const completedCount = useMemo(
    () => statuses.filter((s) => s === 'completed').length,
    [statuses],
  );

  const markStep = useCallback(
    (stepId: string, status: DemoStepStatus) => {
      setProgress((prev) => {
        const next = { ...prev, [stepId]: status };
        saveProgress(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const navigateToStep = useCallback(
    (step: DemoStep) => {
      markStep(step.id, 'completed');
      const href = buildWorkspaceRouteHref(workspaceId, step.routeId);
      router.push(href);
    },
    [router, workspaceId, markStep],
  );

  const resetDemo = useCallback(() => {
    setProgress(() => {
      const next: Record<string, DemoStepStatus> = {};
      saveProgress(workspaceId, next);
      return next;
    });
  }, [workspaceId]);

  const startDemo = useCallback(() => {
    setProgress(() => {
      const next: Record<string, DemoStepStatus> = { [DEMO_STEPS[0].id]: 'current' };
      saveProgress(workspaceId, next);
      return next;
    });
  }, [workspaceId]);

  const progressPercent = Math.round((completedCount / DEMO_STEPS.length) * 100);

  if (!mounted) {
    return (
      <WorkstationSurfaceViewport surface="demo">
        <div className="investor-demo-pane__loading">Loading demo…</div>
      </WorkstationSurfaceViewport>
    );
  }

  return (
    <WorkstationSurfaceViewport surface="demo">
      <div className="investor-demo-pane">
        <header className="investor-demo-pane__header">
          <h1 className="investor-demo-pane__title">Investor Demo</h1>
          <p className="investor-demo-pane__subtitle">
            Walk through the complete Empyralis story in 8 steps.
          </p>

          <div className="investor-demo-pane__progress-bar">
            <div
              className="investor-demo-pane__progress-fill"
              style={{ width: `${progressPercent}%` }}
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              role="progressbar"
            />
          </div>
          <div className="investor-demo-pane__progress-label">
            {completedCount} of {DEMO_STEPS.length} completed
          </div>

          <div className="investor-demo-pane__header-actions">
            {completedCount === 0 ? (
              <AppButton tone="primary" onClick={startDemo}>
                <Play size={16} strokeWidth={1.9} aria-hidden="true" />
                Start Demo
              </AppButton>
            ) : (
              <AppButton tone="ghost" onClick={resetDemo}>
                <RotateCcw size={16} strokeWidth={1.9} aria-hidden="true" />
                Reset Demo
              </AppButton>
            )}
          </div>
        </header>

        <ol className="investor-demo-pane__steps">
          {DEMO_STEPS.map((step, index) => {
            const status = statuses[index];
            const isCurrent = status === 'current';

            return (
              <li
                key={step.id}
                className={`investor-demo-pane__step investor-demo-pane__step--${status}`}
                data-step-id={step.id}
              >
                <div className="investor-demo-pane__step-marker">
                  {status === 'completed' ? (
                    <CheckCircle2 size={20} strokeWidth={1.9} aria-hidden="true" />
                  ) : (
                    <Circle size={20} strokeWidth={1.9} aria-hidden="true" />
                  )}
                </div>

                <div className="investor-demo-pane__step-content">
                  <div className="investor-demo-pane__step-header">
                    <span className="investor-demo-pane__step-number">
                      Step {step.number}
                    </span>
                    <h3 className="investor-demo-pane__step-title">{step.title}</h3>
                  </div>

                  <p className="investor-demo-pane__step-description">
                    {step.description}
                  </p>

                  <div className="investor-demo-pane__step-proof">
                    <strong>Proof point:</strong> {step.proofPoint}
                  </div>

                  <div className="investor-demo-pane__step-actions">
                    <AppButton
                      tone={isCurrent ? 'primary' : 'secondary'}
                      onClick={() => navigateToStep(step)}
                      disabled={status === 'pending'}
                    >
                      {step.actionLabel}
                      <ArrowRight size={14} strokeWidth={1.9} aria-hidden="true" />
                    </AppButton>

                    {status === 'current' && (
                      <AppButton
                        tone="ghost"
                        onClick={() => markStep(step.id, 'completed')}
                      >
                        Mark complete
                      </AppButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </WorkstationSurfaceViewport>
  );
}
