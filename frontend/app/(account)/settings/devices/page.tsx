import { redirectToWorkspaceSettings } from '@/app/(account)/settings/resolve-settings-route';

export default async function DeviceSettingsPage() {
  await redirectToWorkspaceSettings('devices');
}
