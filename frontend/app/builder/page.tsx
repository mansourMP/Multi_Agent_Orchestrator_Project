'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { fetchWorkflows } from '@/lib/api';

type WorkflowRecord = {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
  updated_at?: string;
};

type BuilderTab = 'drafts' | 'templates';

const BUILDER_TEMPLATES = [
  {
    id: 'support',
    title: 'Support triage',
    description: 'Route incoming requests, classify urgency, and hand off follow-up tasks.',
  },
  {
    id: 'content',
    title: 'Content pipeline',
    description: 'Generate briefs, draft assets, and send outputs to the right channel.',
  },
  {
    id: 'ops',
    title: 'Operations handoff',
    description: 'Collect updates, summarize blockers, and notify the next owner automatically.',
  },
];

function compactText(value?: string, maxLength = 72) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No description provided';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function BuilderLandingPage() {
  const [activeTab, setActiveTab] = useState<BuilderTab>('drafts');
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
            ? (data as { items: WorkflowRecord[] }).items
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

  const draftWorkflows = useMemo(
    () =>
      [...workflows]
        .sort((left, right) => {
          const leftTs = new Date(left.updatedAt || left.updated_at || 0).getTime();
          const rightTs = new Date(right.updatedAt || right.updated_at || 0).getTime();
          return rightTs - leftTs;
        })
        .slice(0, 8),
    [workflows],
  );

  return (
    <div className="orion-page-shell is-static-entry">
      <PageHero
        kicker="Builder"
        title="Create an agent system"
        copy="Design a reusable system that can coordinate tools, reasoning, approvals, and follow-up work."
        actions={
          <Link href="/builder/new" className="btn-primary">
            <Plus size={14} />
            Create
          </Link>
        }
        aside={
          <>
            <PageHeroCard label="Draft library">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{draftWorkflows.length}</div>
                  <div className="orion-home-side-note">Drafts</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{BUILDER_TEMPLATES.length}</div>
                  <div className="orion-home-side-note">Templates</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                Use drafts for active work and templates when you want a faster starting point.
              </div>
            </PageHeroCard>
          </>
        }
      />

      <PageCollection
        title="Builder library"
        description="Open saved drafts or start from a reusable template."
        actions={
          <div className="orion-segmented orion-builder-hub-tabbar" role="tablist" aria-label="Builder library tabs">
            <button
              type="button"
              className={`orion-segmented-btn${activeTab === 'drafts' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('drafts')}
            >
              Drafts
            </button>
            <button
              type="button"
              className={`orion-segmented-btn${activeTab === 'templates' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              Templates
            </button>
          </div>
        }
      >
        {activeTab === 'drafts' ? (
          loading ? (
            <LoadingState
              title="Loading drafts…"
              copy="Reading saved builder drafts."
            />
          ) : error ? (
            <ErrorState
              title="Couldn't load this section."
              copy={error}
            />
          ) : draftWorkflows.length === 0 ? (
            <EmptyState
              title="No drafts yet"
              copy="Create your first workflow to start shaping your agent system."
              actions={
                <Link href="/builder/new" className="btn-primary">
                  <Plus size={14} />
                  Create
                </Link>
              }
            />
          ) : (
            <div className="orion-builder-hub-grid">
              {draftWorkflows.map((workflow) => (
                <Link
                  key={workflow.id}
                  href={`/builder/${workflow.id}`}
                  className="orion-stat-card orion-control-card orion-builder-hub-card"
                >
                  <div className="orion-builder-hub-card-icon">
                    <Bot size={16} />
                  </div>
                  <div className="orion-builder-hub-card-title">{workflow.name || 'Untitled workflow'}</div>
                  <div className="orion-builder-hub-card-copy">{compactText(workflow.description)}</div>
                  <div className="orion-builder-hub-card-meta">
                    <span>{formatDate(workflow.updatedAt || workflow.updated_at)}</span>
                    <span>You</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="orion-builder-hub-grid">
            {BUILDER_TEMPLATES.map((template) => (
              <Link
                key={template.id}
                href="/builder/new"
                className="orion-stat-card orion-control-card orion-builder-hub-card"
              >
                <div className="orion-builder-hub-card-icon">
                  <Bot size={16} />
                </div>
                <div className="orion-builder-hub-card-title">{template.title}</div>
                <div className="orion-builder-hub-card-copy">{template.description}</div>
                <div className="orion-builder-hub-card-meta">
                  <span>Template</span>
                  <span>Start here</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageCollection>
    </div>
  );
}
