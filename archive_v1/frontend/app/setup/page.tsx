'use client';

import { Suspense } from 'react';
import { DesktopSetupWizard } from '@/components/orion/setup/DesktopSetupWizard';
import { LegacySetupWizard } from '@/components/orion/setup/LegacySetupWizard';
import { useDesktopShell } from '@/lib/desktopBridge';

function SetupPageContent() {
  const isDesktop = useDesktopShell();
  return isDesktop ? <DesktopSetupWizard /> : <LegacySetupWizard />;
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupPageContent />
    </Suspense>
  );
}
