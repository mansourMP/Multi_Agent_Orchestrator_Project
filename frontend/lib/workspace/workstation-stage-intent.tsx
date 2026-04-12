'use client';

import { useMemo, useSyncExternalStore } from 'react';

import { useWorkstationKernel } from '@/lib/workspace/workspace-services';

export type WorkstationStageIntentKind = 'agent' | 'application' | 'runtime_target';

export type WorkstationStageIntent = {
  sourcePane: 'roster';
  kind: WorkstationStageIntentKind;
  id: string;
  label: string;
  subtitle: string;
  description: string;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

export function useWorkstationStageIntentState() {
  const services = useWorkstationKernel();
  const store = useMemo(
    () => services.stores.createStore<WorkstationStageIntent | null>('workstation:stage-intent', null),
    [services],
  );
  const intent = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  return {
    intent,
    setIntent(nextIntent: WorkstationStageIntent) {
      store.setState(nextIntent);
    },
    clearIntent() {
      store.setState(null);
    },
  };
}
