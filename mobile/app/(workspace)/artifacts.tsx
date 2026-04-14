import React, { useEffect, useState } from 'react';

import { useMobileRuntimeState } from '../../src/lib/mobile-runtime.js';
import { ListDetailScreen } from '../../src/ui/list-detail';
import {
  SurfaceErrorScreen,
  SurfaceLoadingScreen,
  SurfaceNoticeCard,
} from '../../src/ui/state-screens';

export default function ArtifactsScreen() {
  const runtimeState = useMobileRuntimeState();
  const surface = runtimeState.shellModel?.surfaces.artifacts ?? null;
  const [result, setResult] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!surface) {
      return undefined;
    }

    void surface.loadArtifacts({ refresh: true }).then((nextResult) => {
      if (cancelled) {
        return;
      }
      setResult(nextResult);
      setSelectedId(nextResult.data?.[0]?.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [surface]);

  if (!surface) {
    return (
      <SurfaceErrorScreen
        title="Artifacts unavailable"
        body="This workspace does not expose the mobile artifact catalog."
      />
    );
  }

  if (!result) {
    return (
      <SurfaceLoadingScreen
        title="Loading artifacts"
        body="Syncing the latest workspace outputs and deliverables."
      />
    );
  }

  if (result.status === 'error' && result.data.length === 0) {
    return (
      <SurfaceErrorScreen
        title="Artifacts could not be loaded"
        body={result.statusMessage ?? 'Artifact history is unavailable right now.'}
      />
    );
  }

  return (
    <ListDetailScreen
      badge="Artifacts"
      title="Output history"
      body="Browse generated outputs and supporting files as a native catalog with focused detail."
      items={result.data}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyTitle="No artifacts yet"
      emptyBody="This workspace has not produced any saved outputs in the current history window."
      notice={result.statusMessage ? (
        <SurfaceNoticeCard
          title={result.status === 'degraded' ? 'Using cached artifacts' : 'Artifacts updated'}
          body={result.statusMessage}
          tone={result.status === 'degraded' ? 'warning' : 'accent'}
        />
      ) : undefined}
    />
  );
}
