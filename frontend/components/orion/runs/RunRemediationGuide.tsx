'use client';

import type { ReactNode } from 'react';
import { DESIGN_TOKENS, bodyTextStyle, eyebrowStyle, mergeStyles } from '@/design-constraints';

type RunDiagnostics = {
  category?: string | null;
  summary?: string | null;
  next_step?: string | null;
  local_target?: boolean;
  local_status?: string | null;
  resumed_after_restart?: boolean;
} | null;

type RemediationStep = {
  title: string;
  body: string;
};

type RunRemediationGuideProps = {
  diagnostics: RunDiagnostics;
  status?: string | null;
  hasPendingApproval?: boolean;
  canResumeRun?: boolean;
  retryableFailedChildren?: number;
  needsLocalMachineAttention?: boolean;
  actions?: ReactNode;
  feedback?: ReactNode;
};

const FAILURE_STATUSES = new Set(['failed', 'error', 'stopped', 'timeout', 'cancelled']);

function normalize(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function isFailureLike(status?: string | null, diagnostics?: RunDiagnostics): boolean {
  return FAILURE_STATUSES.has(normalize(status)) || normalize(diagnostics?.category) === 'failure';
}

export function shouldShowRunRemediationGuide({
  diagnostics,
  status,
  hasPendingApproval,
  canResumeRun,
  retryableFailedChildren,
  needsLocalMachineAttention,
}: Omit<RunRemediationGuideProps, 'actions' | 'feedback'>): boolean {
  const category = normalize(diagnostics?.category);
  return Boolean(
    hasPendingApproval
    || canResumeRun
    || (retryableFailedChildren || 0) > 0
    || needsLocalMachineAttention
    || diagnostics?.resumed_after_restart
    || [
      'approval_wait',
      'resume_pending',
      'local_runtime_wait',
      'local_capacity_wait',
      'local_queue',
      'local_running',
    ].includes(category)
    || isFailureLike(status, diagnostics),
  );
}

function buildGuide({
  diagnostics,
  status,
  hasPendingApproval,
  canResumeRun,
  retryableFailedChildren,
  needsLocalMachineAttention,
}: Omit<RunRemediationGuideProps, 'actions' | 'feedback'>): {
  title: string;
  intro: string;
  steps: RemediationStep[];
} {
  const category = normalize(diagnostics?.category);
  const nextStep = String(diagnostics?.next_step || '').trim();
  const summary = String(diagnostics?.summary || '').trim();
  const localStatus = normalize(diagnostics?.local_status);

  if (hasPendingApproval || category === 'approval_wait') {
    return {
      title: 'Resolve the confirmation request first',
      intro:
        nextStep
        || 'This run is paused for a human decision. Nothing else will advance until that confirmation is resolved.',
      steps: [
        {
          title: 'Review what the run is asking to do',
          body: 'Read the confirmation prompt and any consequence or scope details so you know exactly what will happen next.',
        },
        {
          title: 'Confirm once or decline',
          body: 'Use the approval action that matches your intent. Confirming lets the workflow continue; declining keeps it safely blocked.',
        },
        {
          title: 'Watch the run re-enter execution',
          body: 'After a decision is recorded, refresh the run timeline or inspect view if progress does not resume within a few seconds.',
        },
      ],
    };
  }

  if (canResumeRun || category === 'resume_pending' || diagnostics?.resumed_after_restart) {
    return {
      title: 'Resume the run from its saved checkpoint',
      intro:
        nextStep
        || 'This run can continue from a saved checkpoint instead of restarting from scratch.',
      steps: [
        {
          title: 'Resume the run now',
          body: 'Use the resume action first. That is the fastest way to restore execution after a browser checkpoint or restart interruption.',
        },
        {
          title: 'Keep the required runtime available',
          body: diagnostics?.local_target || localStatus.includes('local')
            ? 'Keep the local companion online while the run reacquires its checkpoint and execution context.'
            : 'Keep an eye on runtime availability while the run reacquires its execution context.',
        },
        {
          title: 'Confirm progress resumes',
          body: 'If the run stays stuck after resume, open Inspect and check the latest workflow step or event log for the next blocker.',
        },
      ],
    };
  }

  if (needsLocalMachineAttention || ['local_runtime_wait', 'local_capacity_wait', 'local_queue', 'local_running'].includes(category) || diagnostics?.local_target) {
    const secondStep =
      category === 'local_capacity_wait'
        ? 'Free capacity on a capable machine'
        : category === 'local_running'
        ? 'Keep the active machine online and healthy'
        : category === 'local_queue'
        ? 'Watch the local queue clear'
        : 'Bring a capable machine online';
    const secondStepBody =
      category === 'local_capacity_wait'
        ? 'A compatible machine exists, but it is busy. Wait for a capable machine to free up or stop competing local runs.'
        : category === 'local_running'
        ? 'The run is already on a local companion. If it looks stalled, compare the last heartbeat and machine health before intervening.'
        : category === 'local_queue'
        ? 'This run is already queued for a local companion. Use the queue and heartbeat details below to decide whether to wait or investigate health.'
        : 'Use the local companion diagnosis below to compare required capabilities, missing capabilities, and capable machines that are online right now.';
    return {
      title: 'Work through the local companion blocker',
      intro:
        nextStep
        || summary
        || 'This run depends on local companion availability, capability matching, or queue capacity before it can continue.',
      steps: [
        {
          title: 'Read the local companion diagnosis below',
          body: 'Start with the machine counts, queue outlook, heartbeat, and capability chips so you know whether the blocker is capability, capacity, or queue position.',
        },
        {
          title: secondStep,
          body: secondStepBody,
        },
        {
          title: 'Refresh status, then escalate only if it stays stuck',
          body: 'Refresh machine status from this run first. If the blocker does not clear, open Machines or Health for deeper machine-level investigation.',
        },
      ],
    };
  }

  if ((retryableFailedChildren || 0) > 0) {
    return {
      title: 'Recover the failed child runs before restarting the parent',
      intro:
        nextStep
        || 'This parent workflow can often recover by retrying only the failed delegated children.',
      steps: [
        {
          title: 'Retry the failed child runs',
          body: `Use the retry action to re-run the ${retryableFailedChildren} failed child${retryableFailedChildren === 1 ? '' : 'ren'} without rebuilding the entire workflow.`,
        },
        {
          title: 'Inspect the failing branch if the retry fails again',
          body: 'Open Inspect and review the child lineage, workflow state, and latest failure details to identify the real cause.',
        },
        {
          title: 'Rerun from the source only after the root issue is clear',
          body: 'If retries keep failing, fix the underlying issue first, then rerun from the original entry point instead of stacking blind retries.',
        },
      ],
    };
  }

  if (isFailureLike(status, diagnostics)) {
    return {
      title: 'Understand the failure before you rerun',
      intro:
        nextStep
        || summary
        || 'This run has already stopped. The fastest recovery path is to identify the failing step, correct the blocker, then retry from the right place.',
      steps: [
        {
          title: 'Read the diagnosis and latest failing step',
          body: 'Start with the failure summary, workflow state, and the most recent event or node error so you know what actually broke.',
        },
        {
          title: 'Clear the specific blocker',
          body: 'If the failure came from approvals, local companion availability, or a child run branch, use the relevant action or panel on this run before rerunning.',
        },
        {
          title: 'Retry or rerun intentionally',
          body: 'Once the cause is understood, use the retry or rerun path that matches the failing scope instead of restarting blindly.',
        },
      ],
    };
  }

  return {
    title: 'Follow the next best recovery path',
    intro:
      nextStep
      || summary
      || 'This run needs a manual recovery step before it can continue cleanly.',
    steps: [
      {
        title: 'Read the current diagnosis',
        body: 'Start with the current blocker summary so you know whether this is an approval, runtime, child-run, or execution issue.',
      },
      {
        title: 'Use the matching action on this run',
        body: 'Choose the action that addresses the blocker directly instead of navigating away first.',
      },
      {
        title: 'Open Inspect if the run does not move',
        body: 'Inspect is the fastest place to confirm workflow state, event history, and whether the blocker has actually cleared.',
      },
    ],
  };
}

export function RunRemediationGuide({
  diagnostics,
  status,
  hasPendingApproval = false,
  canResumeRun = false,
  retryableFailedChildren = 0,
  needsLocalMachineAttention = false,
  actions,
  feedback,
}: RunRemediationGuideProps) {
  const guide = buildGuide({
    diagnostics,
    status,
    hasPendingApproval,
    canResumeRun,
    retryableFailedChildren,
    needsLocalMachineAttention,
  });

  return (
    <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>
      <div style={eyebrowStyle()}>Guided next steps</div>
      <div style={bodyTextStyle()}>{guide.intro}</div>
      <div
        style={{
          color: DESIGN_TOKENS.color.textPrimary,
          fontSize: DESIGN_TOKENS.type.size.titleSm,
          fontWeight: DESIGN_TOKENS.type.weight.semibold,
          lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
        }}
      >
        {guide.title}
      </div>
      <ol style={{ display: 'grid', gap: DESIGN_TOKENS.space[3], padding: 0, margin: 0, listStyle: 'none' }}>
        {guide.steps.map((step, index) => (
          <li
            key={`${step.title}:${index + 1}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              gap: DESIGN_TOKENS.space[3],
              alignItems: 'start',
              padding: `${DESIGN_TOKENS.space[4]}px ${DESIGN_TOKENS.space[4]}px`,
              borderRadius: DESIGN_TOKENS.radius.lg,
              border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}`,
              background: DESIGN_TOKENS.color.surface,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                fontSize: DESIGN_TOKENS.type.size.caption,
                fontWeight: DESIGN_TOKENS.type.weight.semibold,
                color: DESIGN_TOKENS.color.accentText,
                background: DESIGN_TOKENS.color.accentSoft,
              }}
            >
              {index + 1}
            </div>
            <div>
              <div
                style={{
                  fontSize: DESIGN_TOKENS.type.size.label,
                  fontWeight: DESIGN_TOKENS.type.weight.semibold,
                  color: DESIGN_TOKENS.color.textPrimary,
                }}
              >
                {step.title}
              </div>
              <div style={mergeStyles(bodyTextStyle(), { marginTop: DESIGN_TOKENS.space[1], fontSize: DESIGN_TOKENS.type.size.label })}>
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {actions ? (
        <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
          <div style={eyebrowStyle()}>Do this now</div>
          <div style={{ display: 'flex', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
            {actions}
          </div>
        </div>
      ) : null}
      {feedback ? <div>{feedback}</div> : null}
    </div>
  );
}
