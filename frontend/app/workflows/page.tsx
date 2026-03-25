'use client';

import Link from 'next/link';
import { Plus, PlayCircle, Search, Workflow as WorkflowIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
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

  return (
    <div className="orion-page-shell is-static-entry">
      <OsPageHeader
        icon={<WorkflowIcon size={16} />}
        title="Workflows"
        subtitle="Save repeatable work as reusable playbooks."
        meta={
          workflows.length > 0 ? (
            <>
              <span>{workflows.length} saved</span>
              <span>{statusSummary.active} active</span>
            </>
          ) : (
            <span>Reusable playbooks for repeatable work</span>
          )
        }
        actions={
          <div className="orion-page-section-actions">
            <Link href="/setup" className="btn-secondary">
              <PlayCircle size={14} />
              New Task
            </Link>
            <Link href="/builder/new" className="btn-primary">
              <Plus size={14} />
              New Workflow
            </Link>
          </div>
        }
      />
      <PageHero
        kicker="Reusable playbooks"
        title="Save the tasks that work well and run them again."
        copy="Start with a task. When the steps are stable, keep it here as a reusable workflow for your team."
        actions={
          <>
            <Link href="/builder/new" className="btn-primary">
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
              The workflow library could not be loaded right now. If the backend is offline, start it first, then retry.
              <br />
              {loadError}
            </>
          }
          actions={
            <RetryActions onRetry={() => void refresh()}>
              <Link href="/builder/new" className="btn-primary">
                <Plus size={14} />
                New Workflow
              </Link>
            </RetryActions>
          }
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
                workflows.length === 0 ? (
                  <div className="orion-inline-actions">
                    <Link href="/setup" className="btn-secondary">New Task</Link>
                    <Link href="/builder/new" className="btn-primary">New Workflow</Link>
                  </div>
                ) : hasQuery ? (
                  <RetryActions onRetry={clearQuery} retryLabel="Clear search" />
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
                    onOpen={() => router.push(`/builder/${workflow.id}`)}
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
