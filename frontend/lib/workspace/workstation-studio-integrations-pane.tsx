'use client';

import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { WorkstationSageConnectorsPane } from '@/lib/workspace/workstation-sage-connectors-pane';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

export function WorkstationStudioIntegrationsPane() {
  return (
    <WorkstationSurfaceRoot surface="studio-integrations">
      <ListDetailShell
        className="app-studio-shell app-studio-shell--integrations"
        title="Build · Connected Apps"
        subtitle="Business messaging and workflow app connections for deployed specialists."
      >
        <ListDetailPanel
          className="studio-panel studio-panel--integrations"
          eyebrow="Connected Apps"
          title="Messaging and workflow connections"
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
