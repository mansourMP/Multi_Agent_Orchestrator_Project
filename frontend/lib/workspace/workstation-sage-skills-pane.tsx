'use client';

import { useEffect, useMemo, useState } from 'react';

import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { WorkstationSageSkillRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  WorkstationSurfaceCard,
  WorkstationSurfaceList,
  WorkstationSurfaceListItem,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type SkillSnapshot = {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'gated' | 'unavailable';
  reason: string | null;
  source: string | null;
  requiredBins: string[];
  missingBins: string[];
  tools: string[];
  slashCommands: string[];
  permissionLabel: string | null;
  actionClass: string | null;
  requiresApproval: boolean;
  executionMode: string | null;
  allowedRuntimeModes: string[];
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSkillSnapshot(payload: unknown): SkillSnapshot[] {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const candidate = item as WorkstationSageSkillRecord;
    const statusToken = readString(candidate.status).toLowerCase();
    const status: SkillSnapshot['status'] = statusToken === 'active' || statusToken === 'gated' ? statusToken : 'unavailable';
    return [{
      id: readString(candidate.id),
      name: readString(candidate.name) || 'Skill',
      description: readString(candidate.description) || null,
      status,
      reason: readString(candidate.reason) || null,
      source: readString(candidate.source) || null,
      requiredBins: Array.isArray(candidate.required_bins) ? candidate.required_bins.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      missingBins: Array.isArray(candidate.missing_bins) ? candidate.missing_bins.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      tools: Array.isArray(candidate.tools) ? candidate.tools.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      slashCommands: Array.isArray(candidate.slash_commands) ? candidate.slash_commands.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      permissionLabel: readString(candidate.permission_label) || null,
      actionClass: readString(candidate.action_class) || null,
      requiresApproval: candidate.requires_approval === true,
      executionMode: readString(candidate.execution_mode) || null,
      allowedRuntimeModes: Array.isArray(candidate.allowed_runtime_modes) ? candidate.allowed_runtime_modes.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
    }];
  });
}

export function WorkstationSageSkillsPane() {
  const services = useWorkspaceServices();
  const [skills, setSkills] = useState<SkillSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void services.client.listSageSkills()
      .then((payload) => {
        if (!cancelled) {
          setSkills(normalizeSkillSnapshot(payload));
          setIsLoading(false);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Skills are unavailable right now.');
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const activeSkills = useMemo(() => skills.filter((item) => item.status === 'active'), [skills]);
  const gatedSkills = useMemo(() => skills.filter((item) => item.status === 'gated'), [skills]);
  const unavailableSkills = useMemo(() => skills.filter((item) => item.status === 'unavailable'), [skills]);

  return (
    <WorkstationSurfaceRoot surface="sage-skills">
      <main className="app-stack-4">
        {error ? <WorkstationSurfaceNotice tone="warning">{error}</WorkstationSurfaceNotice> : null}

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="7rem" />
            <SkeletonBlock height="12rem" />
            <SkeletonBlock height="12rem" />
          </div>
        ) : (
          <>
            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat label="Active" value={activeSkills.length} hint="Loaded and available now" />
              <WorkstationSurfaceStat label="Gated" value={gatedSkills.length} hint="Present, but blocked by runtime requirements" />
              <WorkstationSurfaceStat label="Unavailable" value={unavailableSkills.length} hint="Installed but disabled for this workspace" />
            </WorkstationSurfaceStatGrid>

            {[
              { key: 'active', title: 'Active skills', description: 'These are loaded into Sage now.', items: activeSkills, tone: 'success' as const },
              { key: 'gated', title: 'Gated skills', description: 'These skills exist, but the current runtime is missing something they require.', items: gatedSkills, tone: 'warning' as const },
              { key: 'unavailable', title: 'Unavailable skills', description: 'These skills are present but disabled for this workspace.', items: unavailableSkills, tone: 'neutral' as const },
            ].map((section) => (
              <WorkstationSurfaceCard
                key={section.key}
                title={section.title}
                description={section.description}
              >
                {section.items.length > 0 ? (
                  <WorkstationSurfaceList>
                    {section.items.map((item) => {
                      const detailBits = [
                        item.source,
                        item.permissionLabel,
                        item.actionClass,
                        item.requiresApproval ? 'needs approval' : null,
                        item.executionMode,
                      ].filter(Boolean);
                      const requirementBits = [
                        item.reason,
                        item.requiredBins.length > 0 ? `Requires: ${item.requiredBins.join(', ')}` : null,
                        item.allowedRuntimeModes.length > 0 ? `Runtimes: ${item.allowedRuntimeModes.join(', ')}` : null,
                        item.tools.length > 0 ? `Tools: ${item.tools.join(', ')}` : null,
                      ].filter(Boolean);
                      return (
                        <WorkstationSurfaceListItem
                          key={item.id || item.name}
                          title={item.name}
                          subtitle={detailBits.join(' · ') || null}
                          description={item.description || requirementBits.join(' · ') || null}
                        />
                      );
                    })}
                  </WorkstationSurfaceList>
                ) : (
                  <WorkstationSurfaceNotice tone={section.tone}>
                    No {section.key} skills right now.
                  </WorkstationSurfaceNotice>
                )}
              </WorkstationSurfaceCard>
            ))}
          </>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
