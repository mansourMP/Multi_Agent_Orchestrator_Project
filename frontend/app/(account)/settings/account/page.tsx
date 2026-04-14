import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';

export default function AccountSettingsPage() {
  return (
    <ListDetailShell
      title="Account settings"
      subtitle="Account-global identity and recovery settings live outside any single workspace, but they still render inside the same product chrome."
    >
      <div data-account-settings-page="shell" style={{ display: 'grid', gap: '1rem' }}>
        <ListDetailPanel
          eyebrow="Account"
          title="Identity scope"
          subtitle="This route is intentionally account-global rather than workspace-scoped."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormReadout label="Route scope" value="Account-global" />
            <FormReadout label="Workspace state" value="Not mounted here" />
            <FormReadout label="Purpose" value="Identity, recovery, and security controls" />
            <FormReadout label="Chrome" value="Shared product shell" />
          </FormGrid>
        </ListDetailPanel>
      </div>
    </ListDetailShell>
  );
}
