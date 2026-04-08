'use client';

import { DesktopSetupWizard } from '@/components/orion/setup/DesktopSetupWizard';
import { LegacySetupWizard } from '@/components/orion/setup/LegacySetupWizard';
import { useDesktopShell } from '@/lib/desktopBridge';

export default function SetupPage() {
  const isDesktop = useDesktopShell();
  return isDesktop ? <DesktopSetupWizard /> : <LegacySetupWizard />;
}
