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
        subtitle="A runtime resource that can be attached to native or connected agents. It is not an agent brain by default."
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
              <p>Use Agent Computers as scoped execution resources for browser, file, terminal, or self-hosted model work after explicit grants.</p>
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
            <AppSurfaceStat label="Chat surface" value="None by default" hint="Attach to an agent before chat use" />
          </AppSurfaceStatGrid>
          <ListDetailPanel
            className="studio-panel studio-panel--detail"
            eyebrow="Capabilities"
            title="Runtime capabilities"
            subtitle="These capabilities describe the machine. Agent chat, knowledge, and memory stay on the attached agent surface."
          >
            {capabilities.length > 0 ? (
              <div className="studio-inline-wrap">
                {capabilities.map((item) => <DataBadge key={readString(item)}>{humanizeToken(item, 'Capability')}</DataBadge>)}
              </div>
            ) : (
              <div className="studio-agent-overview__grid">
                <div className="studio-agent-overview__card">
                  <div className="studio-agent-overview__card-icon"><MonitorCheck size={15} aria-hidden="true" /></div>
                  <div>
                    <strong>No capabilities reported</strong>
                    <span>Reconnect or refresh the runtime to publish a machine manifest.</span>
                  </div>
                </div>
                <div className="studio-agent-overview__card">
                  <div className="studio-agent-overview__card-icon"><ShieldCheck size={15} aria-hidden="true" /></div>
                  <div>
                    <strong>Approval boundary</strong>
                    <span>Machine permissions must be granted by the owner before action use.</span>
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
