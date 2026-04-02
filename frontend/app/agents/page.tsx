'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, MessageSquare, Plus } from 'lucide-react';
import { type AgentRoleId, isAgentRoleId } from '@/app/page.catalog';
import { PageCollection } from '@/components/orion/page/PageCollection';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { EmptyState } from '@/components/orion/state/EmptyState';
import { ErrorState } from '@/components/orion/state/ErrorState';
import { LoadingState } from '@/components/orion/state/LoadingState';
import { createWorkflow, fetchWorkflows, getWorkflow, updateWorkflow } from '@/lib/api';

type AgentRecord = {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
  updated_at?: string;
  definition?: {
    nodes?: Array<Record<string, unknown>>;
  };
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

function formatActionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? `${fallback}: ${message}` : fallback;
}

function inferAgentRoleId(value?: string): AgentRoleId {
  const normalized = String(value || '').trim().toLowerCase();
  if (isAgentRoleId(normalized)) return normalized;
  if (!normalized) return 'builder';
  if (normalized.includes('support') || normalized.includes('inbox')) return 'support';
  if (normalized.includes('sales') || normalized.includes('lead') || normalized.includes('booking')) return 'sales';
  if (normalized.includes('research') || normalized.includes('memory') || normalized.includes('analysis')) return 'research';
  if (normalized.includes('finance') || normalized.includes('sheet') || normalized.includes('account')) return 'finance';
  if (normalized.includes('private') || normalized.includes('personal') || normalized.includes('assistant')) return 'private-assistant';
  if (normalized.includes('orchestr')) return 'orchestrator';
  return 'builder';
}

function resolveAgentChatRole(agent: AgentRecord): AgentRoleId {
  const nodes = Array.isArray(agent.definition?.nodes) ? agent.definition?.nodes : [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    if (String(node.type || '').trim().toLowerCase() !== 'agent') continue;
    const config = node.config && typeof node.config === 'object' ? node.config as Record<string, unknown> : {};
    const identity = config.identity && typeof config.identity === 'object' ? config.identity as Record<string, unknown> : {};
    const role = String(identity.role || '').trim();
    if (role) return inferAgentRoleId(role);
    const data = node.data && typeof node.data === 'object' ? node.data as Record<string, unknown> : {};
    const dataRole = String(data.role || data.label || '').trim();
    if (dataRole) return inferAgentRoleId(dataRole);
  }
  return inferAgentRoleId(agent.name || agent.description || 'builder');
}

function buildAgentChatHref(agent: AgentRecord): string {
  const query = new URLSearchParams({
    chat: 'direct',
    agent: resolveAgentChatRole(agent),
    deck: 'context',
  });
  return `/?${query.toString()}`;
}

export default function AgentsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AgentTab>('drafts');
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [duplicatingId, setDuplicatingId] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        setActionError('');
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

  const duplicateAgent = async (agentId: string) => {
    try {
      setActionError('');
      setDuplicatingId(agentId);
      const original = await getWorkflow(agentId);
      const copyName = `${String(original.name || 'Agent').trim() || 'Agent'} Copy`;
      const copyDescription = String(original.description || '').trim();
      const created = await createWorkflow(copyName, copyDescription);
      const createdId = typeof created.id === 'string' ? created.id.trim() : '';
      if (!createdId) {
        throw new Error('Unable to create the duplicated agent right now.');
      }
      if (original.definition) {
        await updateWorkflow(createdId, original.definition);
      }
      router.push(`/builder/${createdId}`);
    } catch (duplicateError) {
      setActionError(formatActionError(duplicateError, 'Failed to duplicate agent'));
    } finally {
      setDuplicatingId('');
    }
  };

  return (
    <div className="orion-page-shell is-static-entry">
      <PageHero
        kicker="Agents"
        title="Create and manage reusable agents."
        copy="Use this page for reusable agent systems. Edit agents here. Use chat separately when you want live help from an assistant."
        actions={
          <Link href="/builder/new" className="btn-primary">
            <Plus size={14} />
            Create agent
          </Link>
        }
        aside={
          <PageHeroCard label="Agent library">
            <div className="orion-home-side-stats">
              <div>
                <div className="orion-home-side-value">{draftAgents.length}</div>
                <div className="orion-home-side-note">Draft agents</div>
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
              copy="Agents are specialized AI assistants you can assign to tasks. Create one or let Empyralis create one for you."
              actions={
                <Link href="/builder/new" className="btn-primary">
                  <Plus size={14} />
                  Create agent
                </Link>
              }
            />
          ) : (
            <>
              {actionError ? <div className="orion-builder-hub-feedback">{actionError}</div> : null}
              <div className="orion-builder-hub-grid">
                {draftAgents.map((agent) => (
                  <article
                    key={agent.id}
                    className="orion-stat-card orion-control-card orion-builder-hub-card is-static"
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
                    <div className="orion-builder-hub-card-actions">
                      <Link href={`/builder/${agent.id}`} className="btn-primary">
                        Edit
                      </Link>
                      <Link href={buildAgentChatHref(agent)} className="btn-secondary">
                        <MessageSquare size={14} />
                        Open chat
                      </Link>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          void duplicateAgent(agent.id);
                        }}
                        disabled={duplicatingId === agent.id}
                      >
                        {duplicatingId === agent.id ? 'Duplicating…' : 'Duplicate'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )
        ) : (
          <div className="orion-builder-hub-grid">
            {AGENT_TEMPLATES.map((template) => (
              <article
                key={template.id}
                className="orion-stat-card orion-control-card orion-builder-hub-card is-static"
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
                <div className="orion-builder-hub-card-actions">
                  <Link href="/builder/new" className="btn-primary">
                    Create agent
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </PageCollection>
    </div>
  );
}
