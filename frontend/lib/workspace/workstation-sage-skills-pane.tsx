'use client';

import { useEffect, useMemo, useState } from 'react';

import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { DataBadge } from '@/lib/ui/data-table';
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
  whatItDoes: string | null;
  status: 'ready' | 'needs_setup' | 'unsupported_device' | 'disabled_policy';
  statusLabel: string;
  reason: string | null;
  setupRequirement: string | null;
  source: string | null;
  activeNow: boolean;
  curated: boolean;
  curatedRank: number | null;
  requiredBins: string[];
  missingBins: string[];
  requiredEnvVars: string[];
  missingEnvVars: string[];
  requiredPythonPackages: string[];
  missingPythonPackages: string[];
  supportedOs: string[];
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
    const status: SkillSnapshot['status'] =
      statusToken === 'ready'
      || statusToken === 'needs_setup'
      || statusToken === 'unsupported_device'
      || statusToken === 'disabled_policy'
        ? statusToken
        : 'needs_setup';
    return [{
      id: readString(candidate.id),
      name: readString(candidate.name) || 'Skill',
      description: readString(candidate.description) || null,
      whatItDoes: readString(candidate.what_it_does) || null,
      status,
      statusLabel: readString(candidate.status_label) || 'Needs setup',
      reason: readString(candidate.reason) || null,
      setupRequirement: readString(candidate.setup_requirement) || null,
      source: readString(candidate.source) || null,
      activeNow: candidate.active_now === true,
      curated: candidate.curated === true,
      curatedRank: typeof candidate.curated_rank === 'number' ? candidate.curated_rank : null,
      requiredBins: Array.isArray(candidate.required_bins) ? candidate.required_bins.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      missingBins: Array.isArray(candidate.missing_bins) ? candidate.missing_bins.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      requiredEnvVars: Array.isArray(candidate.required_env_vars) ? candidate.required_env_vars.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      missingEnvVars: Array.isArray(candidate.missing_env_vars) ? candidate.missing_env_vars.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      requiredPythonPackages: Array.isArray(candidate.required_python_packages) ? candidate.required_python_packages.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      missingPythonPackages: Array.isArray(candidate.missing_python_packages) ? candidate.missing_python_packages.flatMap((value) => {
        const token = readString(value);
        return token ? [token] : [];
      }) : [],
      supportedOs: Array.isArray(candidate.supported_os) ? candidate.supported_os.flatMap((value) => {
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

function statusTone(status: SkillSnapshot['status']): 'success' | 'warning' | 'neutral' | 'danger' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'needs_setup':
      return 'warning';
    case 'unsupported_device':
      return 'neutral';
    case 'disabled_policy':
      return 'danger';
    default:
      return 'neutral';
  }
}

function buildSkillRequirementBits(item: SkillSnapshot): string[] {
  const bits: string[] = [];
  if (item.setupRequirement) {
    bits.push(`Setup: ${item.setupRequirement}`);
  }
  if (item.reason) {
    bits.push(`Why unavailable: ${item.reason}`);
  }
  if (item.missingBins.length > 0) {
    bits.push(`Missing runtime dependencies: ${item.missingBins.join(', ')}`);
  }
  if (item.missingEnvVars.length > 0) {
    bits.push(`Missing environment variables: ${item.missingEnvVars.join(', ')}`);
  }
  if (item.missingPythonPackages.length > 0) {
    bits.push(`Missing Python packages: ${item.missingPythonPackages.join(', ')}`);
  }
  if (item.supportedOs.length > 0) {
    bits.push(`Supported devices: ${item.supportedOs.join(', ')}`);
  }
  if (item.tools.length > 0) {
    bits.push(`Tools: ${item.tools.join(', ')}`);
  }
  return bits;
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

  const curatedSkills = useMemo(
    () => skills.filter((item) => item.curated).sort((left, right) => (left.curatedRank ?? 999) - (right.curatedRank ?? 999)),
    [skills],
  );
  const otherSkills = useMemo(
    () => skills.filter((item) => !item.curated).sort((left, right) => left.name.localeCompare(right.name)),
    [skills],
  );
  const readySkills = useMemo(() => skills.filter((item) => item.status === 'ready'), [skills]);
  const needsSetupSkills = useMemo(() => skills.filter((item) => item.status === 'needs_setup'), [skills]);
  const unsupportedSkills = useMemo(() => skills.filter((item) => item.status === 'unsupported_device'), [skills]);
  const disabledSkills = useMemo(() => skills.filter((item) => item.status === 'disabled_policy'), [skills]);

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
              <WorkstationSurfaceStat label="Ready" value={readySkills.length} hint="Available to Sage right now" />
              <WorkstationSurfaceStat label="Needs setup" value={needsSetupSkills.length} hint="Configured conceptually, but still missing local setup" />
              <WorkstationSurfaceStat label="Unsupported" value={unsupportedSkills.length} hint="Not supported on this device" />
              <WorkstationSurfaceStat label="Disabled" value={disabledSkills.length} hint="Blocked by workspace policy" />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="Curated skills"
              description="This is the first-class pack for trusted local work. These are the capabilities Sage should make feel deliberate, not accidental."
            >
              {curatedSkills.length > 0 ? (
                <WorkstationSurfaceList>
                  {curatedSkills.map((item) => {
                    const detailBits = [
                      item.activeNow ? 'active now' : null,
                      item.permissionLabel,
                      item.actionClass,
                      item.requiresApproval ? 'needs approval' : null,
                      item.executionMode,
                    ].filter(Boolean);
                    const requirementBits = buildSkillRequirementBits(item);
                    return (
                      <WorkstationSurfaceListItem
                        key={item.id || item.name}
                        title={item.name}
                        subtitle={detailBits.join(' · ') || item.statusLabel}
                        description={item.whatItDoes || item.description || requirementBits.join(' · ') || null}
                        actions={(
                          <DataBadge tone={statusTone(item.status)}>
                            {item.statusLabel}
                          </DataBadge>
                        )}
                      />
                    );
                  })}
                </WorkstationSurfaceList>
              ) : (
                <WorkstationSurfaceNotice tone="neutral">
                  No curated skills are defined right now.
                </WorkstationSurfaceNotice>
              )}
            </WorkstationSurfaceCard>

            {curatedSkills.length > 0 ? (
              <WorkstationSurfaceCard
                title="Setup truth"
                description="Each curated skill tells you exactly why it is available now or what still needs to be finished."
              >
                <WorkstationSurfaceList>
                  {curatedSkills.map((item) => (
                    <WorkstationSurfaceListItem
                      key={`${item.id || item.name}-setup`}
                      title={item.name}
                      subtitle={item.statusLabel}
                      description={buildSkillRequirementBits(item).join(' · ') || 'Ready now.'}
                      actions={(
                        <DataBadge tone={statusTone(item.status)}>
                          {item.statusLabel}
                        </DataBadge>
                      )}
                    />
                  ))}
                </WorkstationSurfaceList>
              </WorkstationSurfaceCard>
            ) : null}

            {[
              { key: 'ready', title: 'Ready now', description: 'These skills are active and can be used by Sage right now.', items: readySkills, tone: 'success' as const },
              { key: 'needs_setup', title: 'Needs setup', description: 'These skills belong in the product, but local setup is still missing.', items: needsSetupSkills, tone: 'warning' as const },
              { key: 'unsupported_device', title: 'Unsupported on this device', description: 'These skills exist, but not on the current computer.', items: unsupportedSkills, tone: 'neutral' as const },
              { key: 'disabled_policy', title: 'Disabled by policy', description: 'These skills are blocked by workspace policy even if the runtime could support them.', items: disabledSkills, tone: 'danger' as const },
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
                        item.curated ? 'curated' : null,
                        item.source,
                        item.permissionLabel,
                        item.actionClass,
                        item.requiresApproval ? 'needs approval' : null,
                        item.executionMode,
                      ].filter(Boolean);
                      const requirementBits = [
                        ...buildSkillRequirementBits(item),
                        item.allowedRuntimeModes.length > 0 ? `Runtimes: ${item.allowedRuntimeModes.join(', ')}` : null,
                      ].filter(Boolean);
                      return (
                        <WorkstationSurfaceListItem
                          key={item.id || item.name}
                          title={item.name}
                          subtitle={detailBits.join(' · ') || null}
                          description={item.description || item.whatItDoes || requirementBits.join(' · ') || null}
                          actions={(
                            <DataBadge tone={statusTone(item.status)}>
                              {item.statusLabel}
                            </DataBadge>
                          )}
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

            {otherSkills.length > 0 ? (
              <WorkstationSurfaceCard
                title="Other installed skills"
                description="Installed skills outside the first-class pack stay available here, but the curated pack comes first."
              >
                <WorkstationSurfaceList>
                  {otherSkills.map((item) => (
                    <WorkstationSurfaceListItem
                      key={`other-${item.id || item.name}`}
                      title={item.name}
                      subtitle={item.statusLabel}
                      description={item.description || item.whatItDoes || buildSkillRequirementBits(item).join(' · ') || null}
                      actions={(
                        <DataBadge tone={statusTone(item.status)}>
                          {item.statusLabel}
                        </DataBadge>
                      )}
                    />
                  ))}
                </WorkstationSurfaceList>
              </WorkstationSurfaceCard>
            ) : null}
          </>
        )}
      </main>
    </WorkstationSurfaceRoot>
  );
}
