'use client';

import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { WorkstationSageConnectorsPane } from '@/lib/workspace/workstation-sage-connectors-pane';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

export function WorkstationStudioIntegrationsPane() {
  return (
    <WorkstationSurfaceRoot surface="studio-integrations">
      <ListDetailShell
        className="app-studio-shell app-studio-shell--integrations"
        title="Studio · Integrations"
        subtitle="Business channels and workflow connectors for deployed specialists."
      >
        <ListDetailPanel
          className="studio-panel studio-panel--integrations"
          eyebrow="Integrations"
          title="Channel and workflow connections"
          subtitle="Keep customer-facing channels and follow-up systems ready for inbox, deploy, and launch work."
        >
          <WorkstationSageConnectorsPane
            showProviders={false}
            showTools={false}
            connectorIds={['telegram', 'whatsapp', 'gmail', 'webhook']}
            className="studio-integrations-pane"
          />
        </ListDetailPanel>
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
