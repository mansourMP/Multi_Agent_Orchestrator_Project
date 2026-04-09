'use client';

import Link from 'next/link';
import { Bot, MessageSquare, Play, Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { WorkspaceAgentInstallRecord } from '@/lib/api';

function trustModeLabel(install: WorkspaceAgentInstallRecord): string {
  const trustMode = String(install.policy_context_overrides?.trust_mode || '').trim().toLowerCase();
  if (trustMode === 'auto') return 'Autonomous';
  return 'Requires approval';
}

function installDescription(install: WorkspaceAgentInstallRecord): string {
  const raw = String(install.agent_definition?.description || '').trim();
  if (!raw) return 'Ready to run in this workspace.';
  const normalized = raw.toLowerCase();
  if (
    normalized.includes('without touching the graph')
    || normalized.includes('placeholder')
    || normalized.includes('workflow-backed')
  ) {
    return 'Ready to run in this workspace.';
  }
  return raw;
}

export function InstalledAgentCard({
  install,
  configureHref,
  onRun,
  running,
}: {
  install: WorkspaceAgentInstallRecord;
  configureHref: string;
  onRun: () => void;
  running: boolean;
}) {
  const profileLabel = install.runtime_profile?.label || 'Unassigned placement';
  const statusLabel = install.enabled ? (install.status || 'active') : 'paused';
  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Bot size={16} />
              <CardTitle>{install.label || install.agent_definition?.name || 'Installed Agent'}</CardTitle>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="orion-chip">{statusLabel}</span>
              <span className="orion-chip">{profileLabel}</span>
              <span className="orion-chip">{trustModeLabel(install)}</span>
            </div>
          </div>
          <span className={`orion-chip${install.enabled ? ' is-accent' : ''}`}>
            {install.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <CardDescription>{installDescription(install)}</CardDescription>
      </CardHeader>
      <CardContent style={{ display: 'grid', gap: 10 }}>
        {Array.isArray(install.folder_grants) && install.folder_grants.length > 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Folder scope: {install.folder_grants.slice(0, 2).join(', ')}
          </div>
        ) : null}
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Placement route: {install.runtime_profile?.runtime_class || 'cloud_worker'}
        </div>
      </CardContent>
      <CardFooter style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={onRun} disabled={running || !install.enabled}>
            <Play size={14} />
            {running ? 'Starting…' : 'Run'}
          </Button>
          <Link href={configureHref} style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              <Settings2 size={14} />
              Configure
            </Button>
          </Link>
        </div>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Button variant="ghost">
            <MessageSquare size={14} />
            Chat
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
