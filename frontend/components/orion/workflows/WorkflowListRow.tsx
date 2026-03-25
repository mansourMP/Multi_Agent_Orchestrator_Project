'use client';

import { Clock, Copy, Trash } from 'lucide-react';
import type { WorkflowRecord } from '@/hooks/pages/useWorkflowLibrary';
import { ResourceActionGroup } from '@/components/orion/list/ResourceActionGroup';
import { ResourceMetaLine } from '@/components/orion/list/ResourceMetaLine';

function compactWorkflowText(value?: string, fallback = 'No description yet') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= 110) return normalized;
  return `${normalized.slice(0, 107).trimEnd()}…`;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function runtimeProfileLabel(workflow: WorkflowRecord) {
  const meta = workflow.definition?.meta;
  if (!meta || typeof meta !== 'object') return '';
  const label = String(meta.runtime_profile_label || '').trim();
  if (label) return label;
  const profileId = String(meta.runtime_profile_id || '').trim();
  return profileId ? `Profile ${profileId.slice(0, 8)}` : '';
}

function getStatusDisplay(status?: string) {
  switch (status) {
    case 'published':
      return { color: 'var(--success-fg)', ring: 'var(--success-border)', label: 'Active' };
    case 'paused':
      return { color: 'var(--warning-fg)', ring: 'var(--warning-border)', label: 'Paused' };
    case 'error':
      return { color: 'var(--error-fg)', ring: 'var(--error-border)', label: 'Error' };
    default:
      return { color: 'var(--text-tertiary)', ring: 'var(--border-default)', label: 'Draft' };
  }
}

type WorkflowListRowProps = {
  workflow: WorkflowRecord;
  onOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function WorkflowListRow({ workflow, onOpen, onDelete, onDuplicate }: WorkflowListRowProps) {
  const status = getStatusDisplay(workflow.status);

  return (
    <article
      className="orion-list-row"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="orion-item-leading">
        <div className="orion-item-avatar is-accent">
          {workflow.name?.slice(0, 2).toUpperCase() || 'WF'}
        </div>
        <div className="orion-list-row-main">
          <div className="orion-list-row-title">{workflow.name || 'Untitled Workflow'}</div>
          <div className="orion-list-row-subtitle">{compactWorkflowText(workflow.description)}</div>
          <ResourceMetaLine>
            <span className="orion-item-meta-entry">
              <Clock size={11} />
              Updated {formatDate(workflow.updatedAt)}
            </span>
            <span>Last run {formatDate(workflow.lastRun)}</span>
            {runtimeProfileLabel(workflow) ? <span>AI {runtimeProfileLabel(workflow)}</span> : null}
          </ResourceMetaLine>
        </div>
      </div>

      <ResourceActionGroup>
        <button
          type="button"
          className="orion-icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Delete workflow"
        >
          <Trash size={14} />
        </button>
        <button
          type="button"
          className="orion-icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate();
          }}
          aria-label="Duplicate workflow"
        >
          <Copy size={14} />
        </button>
        <span className="orion-status-inline">
          <span
            className="orion-status-inline-dot"
            style={{
              background: status.color,
              boxShadow: `0 0 0 3px ${status.ring}`,
            }}
          />
          {status.label}
        </span>
      </ResourceActionGroup>
    </article>
  );
}
