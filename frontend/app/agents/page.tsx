'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bot, MessageSquare, Plus } from 'lucide-react';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { fetchWorkflows } from '@/lib/api';

type AgentRecord = {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
  updated_at?: string;
};

type AgentTab = 'drafts' | 'templates';

const AGENT_TEMPLATES = [
  {
    id: 'support',
    title: 'Support agent',
    description: 'Handle inbound requests, classify urgency, and draft the next best reply or handoff.',
  },
  {
    id: 'research',
    title: 'Research agent',
    description: 'Investigate a topic, gather findings, and return a clear summary with follow-up actions.',
  },
  {
    id: 'operations',
    title: 'Operations agent',
    description: 'Coordinate updates, summarize blockers, and keep recurring work moving without manual chasing.',
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

export default function AgentsPage() {
  const [activeTab, setActiveTab] = useState<AgentTab>('drafts');
  const [agents, setAgents] = useState<AgentRecord[]>([]);
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
          : Array.isArray((data as { items?: AgentRecord[] } | null | undefined)?.items)
            ? (data as { items: AgentRecord[] }).items
            : [];
        if (!alive) return;
        setAgents(items);
      } catch (loadError) {
        if (!alive) return;
        setAgents([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agents.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const draftAgents = useMemo(
    () =>
      [...agents]
        .sort((left, right) => {
          const leftTs = new Date(left.updatedAt || left.updated_at || 0).getTime();
          const rightTs = new Date(right.updatedAt || right.updated_at || 0).getTime();
          return rightTs - leftTs;
        })
        .slice(0, 8),
    [agents],
  );

  return (
    <div className="orion-page-shell is-static-entry">
      <PageHero
        kicker="Agents"
        title="Create and manage reusable agents."
        copy="Use this page for reusable agent systems. Chat stays separate, so you can build here and then talk to your assistant when you need live help."
        actions={
          <>
            <Link href="/builder/new" className="btn-primary">
              <Plus size={14} />
              Create agent
            </Link>
            <Link href="/" className="btn-secondary">
              <MessageSquare size={14} />
              Open chat
            </Link>
          </>
        }
        aside={
          <PageHeroCard label="Agent library">
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{draftAgents.length}</div>
                <div className="orion-home-side-note">Draft agents</div>
              </div>
              <div>
                <div className="orion-home-side-value">{AGENT_TEMPLATES.length}</div>
                <div className="orion-home-side-note">Templates</div>
              </div>
            </div>
            <div className="orion-runs-overview-side-note">
              Keep reusable agent systems here. Use chat when you want to talk to an assistant directly.
            </div>
          </PageHeroCard>
        }
      />

      <PageCollection
        title="Agent library"
        description="Open saved agents or start from a reusable template."
        actions={
          <div className="orion-segmented orion-builder-hub-tabbar" role="tablist" aria-label="Agent library tabs">
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
              title="Loading agents…"
              copy="Reading saved agent drafts."
            />
          ) : error ? (
            <ErrorState
              title="Couldn't load agents."
              copy={error}
            />
          ) : draftAgents.length === 0 ? (
            <EmptyState
              title="No agents yet"
              copy="Create your first reusable agent here, then use chat separately when you want to interact with it."
              actions={
                <Link href="/builder/new" className="btn-primary">
                  <Plus size={14} />
                  Create agent
                </Link>
              }
            />
          ) : (
            <div className="orion-builder-hub-grid">
              {draftAgents.map((agent) => (
                <Link
                  key={agent.id}
                  href={`/builder/${agent.id}`}
                  className="orion-stat-card orion-control-card orion-builder-hub-card"
                >
                  <div className="orion-builder-hub-card-icon">
                    <Bot size={16} />
                  </div>
                  <div className="orion-builder-hub-card-title">{agent.name || 'Untitled agent'}</div>
                  <div className="orion-builder-hub-card-copy">{compactText(agent.description)}</div>
                  <div className="orion-builder-hub-card-meta">
                    <span>{formatDate(agent.updatedAt || agent.updated_at)}</span>
                    <span>You</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          <div className="orion-builder-hub-grid">
            {AGENT_TEMPLATES.map((template) => (
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
