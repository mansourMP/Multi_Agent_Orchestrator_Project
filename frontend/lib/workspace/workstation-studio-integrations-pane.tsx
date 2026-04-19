'use client';

import { WorkstationSageConnectorsPane } from '@/lib/workspace/workstation-sage-connectors-pane';

export function WorkstationStudioIntegrationsPane() {
  return (
    <WorkstationSageConnectorsPane
      showProviders={false}
      showTools={false}
      connectorIds={['telegram', 'whatsapp', 'gmail', 'webhook']}
    />
  );
}
