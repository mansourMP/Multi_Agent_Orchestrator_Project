'use client';

import { memo } from 'react';
import { MonitorCheck, ShieldCheck } from 'lucide-react';

import { ListDetailPanel } from '@/lib/ui/list-detail';
import { AppSurfaceStat, AppSurfaceStatGrid } from '@/lib/ui/primitives';
import { DataBadge } from '@/lib/ui/data-table';
import type { RuntimeAttachmentSnapshot, StudioAgentComputerSurface } from './types';
import { AGENT_STUDIO_OBJECT_LABELS } from './constants';
import { formatTimestamp, humanizeToken, readRecord, readString } from './utils';

function formatOptionalTimestamp(value: unknown, fallback: string): string {
  return readString(value) ? formatTimestamp(value) : fallback;
}

function computerValue(computer: StudioAgentComputerSurface | RuntimeAttachmentSnapshot | null, key: string): unknown {
  if (!computer) {
    return null;
  }
  if (key in computer) {
    return (computer as Record<string, unknown>)[key];
  }
  return readRecord((computer as StudioAgentComputerSurface).record)[key];
}

export const AgentComputerDetailView = memo(({
  computer,
}: {
  computer: StudioAgentComputerSurface | RuntimeAttachmentSnapshot | null;
}) => {
  if (!computer) {
    return (
      <div className="studio-agent-detail-empty" aria-label="Agent Computer detail">
        <strong>Select an Agent Computer</strong>
        <span>Runtime health, permissions, attached agents, and logs will appear here.</span>
      </div>
    );
  }

  const name = readString(computerValue(computer, 'name') ?? computerValue(computer, 'label'), 'Agent Computer');
  const status = readString(computerValue(computer, 'status'), 'unknown');
  const nodeKind = readString(computerValue(computer, 'nodeKind') ?? computerValue(computer, 'node_kind'), 'runtime');
  const online = computerValue(computer, 'online') === true;
  const healthy = computerValue(computer, 'healthy') === true;
  const heartbeatAt = readString(computerValue(computer, 'heartbeatAt') ?? computerValue(computer, 'heartbeat_at') ?? computerValue(computer, 'last_seen_at'));
  const capabilities = Array.isArray(computerValue(computer, 'capabilities'))
    ? computerValue(computer, 'capabilities') as unknown[]
    : [];

  return (
    <div className="app-stack-4 studio-agent-detail-motion">
      <ListDetailPanel
        className="studio-panel studio-panel--detail"
        hideHeaderText
        eyebrow="Agent Computer"
        title={name}
        subtitle="Connected hardware runtime for native or connected agents."
      >
        <div className="studio-agent-overview">
          <div className="studio-agent-overview__readiness-hero">
            <div className="studio-agent-overview__hero-copy">
              <div className="studio-agent-overview__state-row">
                <span className="studio-agent-overview__state-dot" data-tone={online && healthy ? 'live' : 'warning'} />
                <DataBadge tone={online && healthy ? 'success' : 'warning'}>
                  {online && healthy ? 'Available' : humanizeToken(status, 'Unknown')}
                </DataBadge>
              </div>
              <h3>{AGENT_STUDIO_OBJECT_LABELS.agent_computer}</h3>
              <p>Gateway keeps the computer connected. Supervisor executes governed hardware actions for attached agents.</p>
              <div className="studio-agent-overview__chips">
                <span>{humanizeToken(nodeKind, 'Runtime')}</span>
                <span>{online ? 'Online' : 'Offline'}</span>
                <span>{healthy ? 'Healthy' : 'Needs check'}</span>
              </div>
            </div>
          </div>
          <AppSurfaceStatGrid>
            <AppSurfaceStat label="Resource" value={name} hint="Registered runtime resource" />
            <AppSurfaceStat label="Status" value={humanizeToken(status, 'Unknown')} hint="Runtime-reported state" />
            <AppSurfaceStat label="Last heartbeat" value={formatOptionalTimestamp(heartbeatAt, 'Not seen')} hint="Last runtime check-in" />
            <AppSurfaceStat label="Runtime" value="Gateway + Supervisor" hint="The hardware connector and local executor" />
          </AppSurfaceStatGrid>
          <ListDetailPanel
            className="studio-panel studio-panel--detail"
            eyebrow="Runtime"
            title="Gateway and Supervisor"
            subtitle="The hardware details are implementation status, not a menu of things the agent may advertise."
          >
            {capabilities.length > 0 ? (
              <div className="studio-inline-wrap">
                <DataBadge tone={online ? 'success' : 'neutral'}>Gateway</DataBadge>
                <DataBadge tone={healthy ? 'success' : 'neutral'}>Supervisor</DataBadge>
              </div>
            ) : (
              <div className="studio-agent-overview__grid">
                <div className="studio-agent-overview__card">
                  <div className="studio-agent-overview__card-icon"><MonitorCheck size={15} aria-hidden="true" /></div>
                  <div>
                    <strong>Gateway</strong>
                    <span>Reconnect or refresh the runtime to publish a hardware heartbeat.</span>
                  </div>
                </div>
                <div className="studio-agent-overview__card">
                  <div className="studio-agent-overview__card-icon"><ShieldCheck size={15} aria-hidden="true" /></div>
                  <div>
                    <strong>Supervisor</strong>
                    <span>Governed hardware execution becomes available after the runtime heartbeat.</span>
                  </div>
                </div>
              </div>
            )}
          </ListDetailPanel>
        </div>
      </ListDetailPanel>
    </div>
  );
});

AgentComputerDetailView.displayName = 'AgentComputerDetailView';
