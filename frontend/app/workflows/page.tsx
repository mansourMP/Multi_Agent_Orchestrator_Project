'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Plus, PlayCircle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageDialog } from '@/components/orion/page/PageDialog';
import { PageFilterBar } from '@/components/orion/page/PageFilterBar';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { RetryActions } from '@/components/orion/state/RetryActions';
import { useWorkflowLibrary } from '@/hooks/pages/useWorkflowLibrary';
import { WorkflowListRow } from '@/components/orion/workflows/WorkflowListRow';
import { useToast } from '@/components/Toast';
import { humanizeUiError, UI_ERROR_COPY } from '@/lib/uiError';
import { runWorkflow } from '@/lib/api';
import { DESIGN_TOKENS, bodyTextStyle, buttonStyle, mergeStyles, pageShellStyle } from '@/design-constraints';

export default function WorkflowsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const modalPortalTarget = typeof document !== 'undefined' ? document.body : null;
  const {
    workflows,
    filteredWorkflows,
    loading,
    loadError,
    refresh,
    query,
    setQuery,
    clearQuery,
    hasQuery,
    statusSummary,
    recentWorkflowCount,
    duplicateWorkflow,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    isDeleting,
    formatApiError,
  } = useWorkflowLibrary();
  const workflowLoadDetail = loadError ? humanizeUiError(loadError) : '';
  const showWorkflowLoadDetail = Boolean(workflowLoadDetail && workflowLoadDetail !== UI_ERROR_COPY.backend);
  const handleRunWorkflow = useCallback(async (workflowId: string) => {
    setRunningWorkflowId(workflowId);
    try {
      const payload = await runWorkflow(workflowId);
      const runId = String(payload?.run_id || '').trim();
      addToast({
        type: 'success',
        title: 'Workflow started',
        message: runId ? `Run ${runId.slice(0, 8)} started.` : 'Workflow run started.',
      });
      if (runId) {
        router.push(`/runs/${encodeURIComponent(runId)}/inspect?focus=timeline`);
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Run failed',
        message: error instanceof Error ? error.message : 'Failed to start workflow run.',
      });
    } finally {
      setRunningWorkflowId(null);
    }
  }, [addToast, router]);

  return (
    <div style={pageShellStyle()}>
      <PageHero
        kicker="Workflows"
        title="Capture repeatable operator work and run it with confidence."
        copy="Use workflows for stable processes with clear steps, tools, and approvals. Keep the canvas disciplined, then rerun the same operating pattern without rebuilding it from scratch."
        actions={
          <>
            <Link
              href="/"
              style={mergeStyles(
                {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: DESIGN_TOKENS.space[2],
                  textDecoration: 'none',
                },
                buttonStyle({ tone: 'primary', size: 'md' }),
              )}
            >
              <Plus size={14} />
              Start in chat
            </Link>
            <Link
              href="/setup"
              style={mergeStyles(
                {
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: DESIGN_TOKENS.space[2],
                  textDecoration: 'none',
                },
                buttonStyle({ tone: 'secondary', size: 'md' }),
              )}
            >
              <PlayCircle size={14} />
              Start from a task
            </Link>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Library snapshot">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: DESIGN_TOKENS.space[4] }}>
                <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                  <div style={{ fontSize: DESIGN_TOKENS.type.size.title, fontWeight: DESIGN_TOKENS.type.weight.semibold, color: DESIGN_TOKENS.color.textPrimary }}>{statusSummary.total}</div>
                  <div style={bodyTextStyle('tertiary')}>Saved workflows</div>
                </div>
                <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
                  <div style={{ fontSize: DESIGN_TOKENS.type.size.title, fontWeight: DESIGN_TOKENS.type.weight.semibold, color: DESIGN_TOKENS.color.textPrimary }}>{recentWorkflowCount}</div>
                  <div style={bodyTextStyle('tertiary')}>Updated this week</div>
                </div>
              </div>
              <div style={bodyTextStyle()}>
                {statusSummary.active > 0
                  ? `${statusSummary.active} workflow${statusSummary.active === 1 ? '' : 's'} already active.`
                  : 'No active workflows yet. Start with one repeatable task.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="When to use this">
              <div style={bodyTextStyle()}>
                Use workflows for recurring business work that already has a clear process, execution target, and trust boundary.
              </div>
            </PageHeroCard>
          </>
        }
      />
      <MetricStrip
        items={[
          { label: 'Saved', value: String(statusSummary.total) },
          { label: 'Active', value: String(statusSummary.active) },
          { label: 'Draft', value: String(statusSummary.draft) },
          { label: 'Needs attention', value: String(statusSummary.needsAttention) },
        ]}
      />
      {loading ? (
        <LoadingState
          title="Loading workflows…"
          copy="Reading saved workflows and recent updates."
        />
      ) : loadError ? (
        <ErrorState
          title="Workflows are unavailable"
          copy={
            <>
              {UI_ERROR_COPY.backend}
              {showWorkflowLoadDetail ? (
                <>
                  <br />
                  {workflowLoadDetail}
                </>
              ) : null}
            </>
          }
          actions={<RetryActions onRetry={() => void refresh()} />}
        />
      ) : (
        <>
          {workflows.length > 0 ? (
            <PageFilterBar
              title="Find a workflow"
              description="Search by name or purpose."
              summary={<span style={bodyTextStyle('tertiary')}>{filteredWorkflows.length} of {workflows.length} workflows</span>}
            >
              <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                  <Input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search workflows…"
                    style={{ paddingLeft: 36 }}
                  />
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: DESIGN_TOKENS.space[3],
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: DESIGN_TOKENS.color.textTertiary,
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
            </PageFilterBar>
          ) : null}

          {filteredWorkflows.length === 0 ? (
            <EmptyState
              title={workflows.length === 0 ? 'No reusable workflows yet' : 'No workflows match'}
              copy={
                workflows.length === 0
                  ? 'Start with a task. Save it as a workflow when it becomes repeatable.'
                  : 'Try another search or clear the current query.'
              }
              filtered={workflows.length > 0}
              actions={
                hasQuery ? (
                  <RetryActions onRetry={clearQuery} retryLabel="Clear search" />
                ) : workflows.length === 0 ? (
                  <Link
                    href="/"
                    style={mergeStyles(
                      {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: DESIGN_TOKENS.space[2],
                        textDecoration: 'none',
                      },
                      buttonStyle({ tone: 'primary', size: 'md' }),
                    )}
                  >
                    <Plus size={14} />
                    Start in chat
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <PageCollection
              title="Saved workflows"
              description="Operator playbooks you can inspect, refine, and launch again."
            >
              <section style={{ overflow: 'hidden', borderRadius: DESIGN_TOKENS.radius.lg, border: `1px solid ${DESIGN_TOKENS.color.borderSubtle}` }}>
                {filteredWorkflows.map((workflow) => (
                  <WorkflowListRow
                    key={workflow.id}
                    workflow={workflow}
                    onEdit={() => router.push('/agents')}
                    onRun={() => {
                      void handleRunWorkflow(workflow.id);
                    }}
                    onDelete={() => setDeleteTarget(workflow)}
                    onDuplicate={() => {
                      void duplicateWorkflow(workflow.id).catch((error) => {
                        addToast({
                          type: 'error',
                          title: 'Duplicate failed',
                          message: formatApiError(error, 'Failed to duplicate workflow'),
                        });
                      });
                    }}
                    runBusy={runningWorkflowId === workflow.id}
                  />
                ))}
              </section>
            </PageCollection>
          )}
        </>
      )}
      <PageDialog
        open={Boolean(deleteTarget)}
        portalTarget={modalPortalTarget}
        title="Delete Workflow"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                void confirmDelete().catch((error) => {
                  addToast({
                    type: 'error',
                    title: 'Delete failed',
                    message: formatApiError(error, 'Failed to delete workflow'),
                  });
                });
              }}
              variant="destructive"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <div>
          This will delete <strong>{deleteTarget?.name}</strong> from the reusable workflow library.
        </div>
      </PageDialog>
    </div>
  );
}
