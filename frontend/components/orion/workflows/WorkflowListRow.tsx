'use client';

import { Clock, Copy, Pencil, Play, Trash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResourceActionGroup } from '@/components/orion/list/ResourceActionGroup';
import { ResourceListRow } from '@/components/orion/list/ResourceListRow';
import { ResourceMetaLine } from '@/components/orion/list/ResourceMetaLine';
import type { WorkflowRecord } from '@/hooks/pages/useWorkflowLibrary';
import { DESIGN_TOKENS, bodyTextStyle, mergeStyles } from '@/design-constraints';

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
      return { variant: 'default' as const, label: 'Active' };
    case 'paused':
      return { variant: 'secondary' as const, label: 'Paused' };
    case 'error':
      return { variant: 'destructive' as const, label: 'Error' };
    default:
      return { variant: 'secondary' as const, label: 'Draft' };
  }
}

type WorkflowListRowProps = {
  workflow: WorkflowRecord;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  runBusy?: boolean;
};

export function WorkflowListRow({ workflow, onEdit, onRun, onDelete, onDuplicate, runBusy = false }: WorkflowListRowProps) {
  const status = getStatusDisplay(workflow.status);

  return (
    <ResourceListRow
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      leading={
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: DESIGN_TOKENS.radius.lg,
            display: 'grid',
            placeItems: 'center',
            background: DESIGN_TOKENS.color.accentSoft,
            color: DESIGN_TOKENS.color.accentText,
            fontSize: DESIGN_TOKENS.type.size.label,
            fontWeight: DESIGN_TOKENS.type.weight.semibold,
            flexShrink: 0,
          }}
        >
          {workflow.name?.slice(0, 2).toUpperCase() || 'WF'}
        </div>
      }
      end={
        <ResourceActionGroup>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            <Pencil size={14} />
            Edit
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
            disabled={runBusy}
          >
            <Play size={14} />
            {runBusy ? 'Running…' : 'Run'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              onDuplicate();
            }}
            aria-label="Duplicate workflow"
          >
            <Copy size={14} />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            aria-label="Delete workflow"
          >
            <Trash size={14} />
          </Button>
        </ResourceActionGroup>
      }
    >
      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2], minWidth: 0 }}>
        <div
          style={{
            color: DESIGN_TOKENS.color.textPrimary,
            fontSize: DESIGN_TOKENS.type.size.bodyLg,
            fontWeight: DESIGN_TOKENS.type.weight.semibold,
            lineHeight: DESIGN_TOKENS.type.lineHeight.snug,
          }}
        >
          {workflow.name || 'Untitled Workflow'}
        </div>
        <div style={mergeStyles(bodyTextStyle(), { maxWidth: 720 })}>{compactWorkflowText(workflow.description)}</div>
        <ResourceMetaLine>
          <Badge variant={status.variant}>{status.label}</Badge>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} />
            Updated {formatDate(workflow.updatedAt)}
          </span>
          <span>Last run {formatDate(workflow.lastRun)}</span>
          {runtimeProfileLabel(workflow) ? <span>AI {runtimeProfileLabel(workflow)}</span> : null}
        </ResourceMetaLine>
      </div>
    </ResourceListRow>
  );
}
