'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { fetchWorkflows } from '@/lib/api';

type WorkflowRecord = {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
  updated_at?: string;
  definition?: {
    meta?: Record<string, unknown>;
  };
};

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function compactText(value?: string, maxLength = 60) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No description provided';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function runtimeProfileLabel(workflow: WorkflowRecord): string {
  const meta = workflow.definition?.meta;
  if (!meta || typeof meta !== 'object') return '';
  const label = String(meta.runtime_profile_label || '').trim();
  if (label) return label;
  const profileId = String(meta.runtime_profile_id || '').trim();
  return profileId ? `Profile ${profileId.slice(0, 8)}` : '';
}

export default function HomePage() {
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchWorkflows();
        const items = Array.isArray(data)
          ? data
          : Array.isArray((data as { items?: WorkflowRecord[] } | null | undefined)?.items)
            ? ((data as { items: WorkflowRecord[] }).items)
            : [];
        if (!alive) return;
        setWorkflows(items);
      } catch (loadError) {
        if (!alive) return;
        setWorkflows([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load workflows.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const recentWorkflows = useMemo(() => {
    return [...workflows]
      .sort((left, right) => {
        const leftTs = new Date(left.updatedAt || left.updated_at || 0).getTime();
        const rightTs = new Date(right.updatedAt || right.updated_at || 0).getTime();
        return rightTs - leftTs;
      })
      .slice(0, 5);
  }, [workflows]);

  const featuredWorkflow = recentWorkflows[0] || null;
  const supportingWorkflows = recentWorkflows.slice(1, 3);

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Home"
        title="Describe the work you want done and let Hekor handle the setup."
        copy="The fastest path is a single task. Review the plan, connect what is needed, and run it. Reusable workflows are still here when you want to save a playbook."
        actions={
          <>
            <Link href="/setup" className="btn-primary">
              <PlayCircle size={14} />
              New Task
            </Link>
            <Link href="/executions" className="btn-secondary">
              <PlayCircle size={14} />
              View Runs
            </Link>
            <Link href="/workflows" className="btn-secondary">
              <ArrowRight size={14} />
              Reusable workflows
            </Link>
          </>
        }
        aside={
          <>
            <PageHeroCard label="Continue recent work">
              {loading ? (
                <div className="orion-home-side-empty">Loading workflows…</div>
              ) : error ? (
                <div className="orion-home-side-empty">Couldn&apos;t load workflows.</div>
              ) : featuredWorkflow ? (
                <Link href={`/builder/${featuredWorkflow.id}`} className="orion-home-featured-link">
                  <div className="orion-home-featured-title">{featuredWorkflow.name || 'Untitled Workflow'}</div>
                  <div className="orion-home-featured-copy">{compactText(featuredWorkflow.description, 72)}</div>
                  <div className="orion-home-featured-meta">
                    {runtimeProfileLabel(featuredWorkflow) ? <span>{runtimeProfileLabel(featuredWorkflow)}</span> : null}
                    <span>Updated {formatDate(featuredWorkflow.updatedAt || featuredWorkflow.updated_at)}</span>
                  </div>
                </Link>
              ) : (
                <div className="orion-home-side-empty">No workflows yet.</div>
              )}
            </PageHeroCard>

            <PageHeroCard label="Reusable workflows">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{workflows.length}</div>
                  <div className="orion-home-side-note">Saved playbooks</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{recentWorkflows.length}</div>
                  <div className="orion-home-side-note">Recently edited</div>
                </div>
              </div>
              {supportingWorkflows.length > 0 ? (
                <div className="orion-home-mini-list">
                  {supportingWorkflows.map((workflow) => (
                    <Link key={workflow.id} href={`/builder/${workflow.id}`} className="orion-home-mini-link">
                      <span>{workflow.name || 'Untitled Workflow'}</span>
                      <ArrowRight size={13} />
                    </Link>
                  ))}
                </div>
              ) : null}
            </PageHeroCard>
          </>
        }
      />

      <PageSection
        title="Reusable workflows"
        description="Saved playbooks you can open, refine, and run again."
        actions={
          <Link href="/workflows" className="orion-control-link">
            Open Workflows
          </Link>
        }
        className="orion-home-list-panel"
      >

        {loading ? (
          <PageStatePanel variant="loading" title="Loading workflows…" />
        ) : error ? (
          <PageStatePanel variant="error" title="Couldn't load this section." copy={error} />
        ) : recentWorkflows.length === 0 ? (
          <PageStatePanel variant="empty" title="No workflows yet" copy="Start with a task. Save it as a workflow later if it works well." />
        ) : (
          <div className="orion-list">
            {recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/builder/${workflow.id}`}
                className="orion-list-row orion-home-list-link"
              >
                <div className="orion-item-leading">
                  <div className="orion-item-avatar">
                    {(workflow.name || 'WF').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="orion-list-row-main">
                    <div className="orion-list-row-title">{workflow.name || 'Untitled Workflow'}</div>
                    <div className="orion-list-row-subtitle">{compactText(workflow.description)}</div>
                  </div>
                </div>
                <div className="orion-home-list-meta">
                  <span>Updated {formatDate(workflow.updatedAt || workflow.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
