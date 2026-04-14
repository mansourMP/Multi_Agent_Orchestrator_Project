import { FormGrid, FormReadout } from '@/lib/ui/form-controls';
import { ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';

export default function DeviceSettingsPage() {
  return (
    <ListDetailShell
      title="Device sessions"
      subtitle="Operator machine and session inventory is account-global, but it should still read like part of the workstation product."
    >
      <div data-device-settings-page="shell" style={{ display: 'grid', gap: '1rem' }}>
        <ListDetailPanel
          eyebrow="Devices"
          title="Session scope"
          subtitle="This route stays outside the workspace boundary because it governs account-level session trust."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormReadout label="Route scope" value="Account-global" />
            <FormReadout label="Workspace coupling" value="None" />
            <FormReadout label="Purpose" value="Device trust and active session review" />
            <FormReadout label="Presentation" value="Shared product chrome" />
          </FormGrid>
        </ListDetailPanel>
      </div>
    </ListDetailShell>
  );
}
