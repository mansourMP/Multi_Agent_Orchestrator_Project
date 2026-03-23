'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GitBranch, KeyRound, PlayCircle } from 'lucide-react';
import { fetchWorkflows } from '@/lib/api';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

type WorkflowRecord = {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
  updated_at?: string;
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

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={null}
        title="Home"
        subtitle="What would you like to do today?"
      />

      <section className="orion-grid-3">
        <Link href="/builder/new" className="orion-stat-card orion-control-card" style={{ textDecoration: 'none' }}>
          <div className="orion-stat-label orion-item-meta-entry">
            <GitBranch size={14} />
            Create agent system
          </div>
          <div className="orion-stat-note">Open Builder and design a reusable system that can run work end to end.</div>
        </Link>
        <Link href="/executions" className="orion-stat-card orion-control-card" style={{ textDecoration: 'none' }}>
          <div className="orion-stat-label orion-item-meta-entry">
            <PlayCircle size={14} />
            View Runs
          </div>
          <div className="orion-stat-note">See what is running, what finished, and what needs your review.</div>
        </Link>
        <Link href="/credentials" className="orion-stat-card orion-control-card" style={{ textDecoration: 'none' }}>
          <div className="orion-stat-label orion-item-meta-entry">
            <KeyRound size={14} />
            Add Integration
          </div>
          <div className="orion-stat-note">Connect the systems your agents need to access, update, and operate.</div>
        </Link>
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Recent workflows</div>
            <div className="orion-panel-copy">Recent playbooks you can open, refine, and run again.</div>
          </div>
        </div>

        {loading ? (
          <div className="orion-empty orion-loading-panel">
            <div className="orion-empty-title">Loading workflows…</div>
          </div>
        ) : error ? (
          <div className="orion-empty orion-loading-panel">
            <div className="orion-empty-title">Couldn't load this section.</div>
            <div className="orion-empty-copy">{error}</div>
          </div>
        ) : recentWorkflows.length === 0 ? (
          <div className="orion-empty orion-loading-panel">
            <div className="orion-empty-title">No workflows yet</div>
            <div className="orion-empty-copy">Create your first workflow to give the platform a reusable way to execute work.</div>
          </div>
        ) : (
          <div className="orion-list">
            {recentWorkflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/builder/${workflow.id}`}
                className="orion-list-row"
                style={{ textDecoration: 'none' }}
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
                <div className="orion-toolbar-summary">
                  Updated {formatDate(workflow.updatedAt || workflow.updated_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
