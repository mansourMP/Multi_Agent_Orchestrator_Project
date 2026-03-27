'use client';

import Link from 'next/link';
import { Plus, PlayCircle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { MetricStrip } from '@/components/ui/MetricStrip';
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
import { humanizeUiError, UI_ERROR_COPY } from '@/lib/uiError';

export default function WorkflowsPage() {
  const router = useRouter();
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

  return (
    <div className="orion-page-shell is-static-entry">
      <PageHero
        kicker="Workflows"
        title="Save the tasks that work well and run them again."
        copy="Start with a task. When the steps are stable, keep it here as a reusable workflow for your team."
        actions={
          <>
            <Link href="/workflows/new" className="btn-primary">
              <Plus size={14} />
              New Workflow
            </Link>
            <Link href="/setup" className="btn-secondary">
              <PlayCircle size={14} />
              Start from a task
            </Link>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Library snapshot">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{statusSummary.total}</div>
                  <div className="orion-home-side-note">Saved workflows</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{recentWorkflowCount}</div>
                  <div className="orion-home-side-note">Updated this week</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                {statusSummary.active > 0
                  ? `${statusSummary.active} workflow${statusSummary.active === 1 ? '' : 's'} already active.`
                  : 'No active workflows yet. Start with one repeatable task.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="When to use this">
              <div className="orion-home-side-empty">
                Use workflows for recurring business work that already has a clear process, tools, and approvals.
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
              summary={<span className="orion-toolbar-summary">{filteredWorkflows.length} of {workflows.length} workflows</span>}
            >
              <div className="orion-toolbar">
                <div className="orion-toolbar-input-wrap">
                  <Search size={14} className="icon" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search workflows…"
                    className="input"
                    style={{ paddingLeft: 36 }}
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
                  <Link href="/workflows/new" className="btn-primary">
                    <Plus size={14} />
                    New Workflow
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <PageCollection
              title="Saved workflows"
              description="Reusable playbooks you can open, refine, and run again."
            >
              <section className="orion-list">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowListRow
                    key={workflow.id}
                    workflow={workflow}
                    onOpen={() => router.push(`/workflows/${workflow.id}`)}
                    onDelete={() => setDeleteTarget(workflow)}
                    onDuplicate={() => {
                      void duplicateWorkflow(workflow.id).catch((error) => {
                        alert(formatApiError(error, 'Failed to duplicate workflow'));
                      });
                    }}
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
            <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmDelete().catch((error) => {
                  alert(formatApiError(error, 'Failed to delete workflow'));
                });
              }}
              className="orion-btn orion-btn-danger"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
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
