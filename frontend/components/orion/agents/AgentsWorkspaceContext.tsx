'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import {
  createSpecialistAgent,
  fetchAgents,
  saveSpecialistBible,
  saveSpecialistChannelBindings,
  saveSpecialistConnectorBindings,
  saveSpecialistRuntimeProfile,
  saveSpecialistSkillBindings,
  updateSpecialistManifest,
  type WorkspaceAgentInstallRecord,
} from '@/lib/api';
import {
  createDraftManifest,
  createDraftManifestFromBlueprint,
  type AgentManifest,
  getRuntimeMode,
  runtimeModeLabel,
  type AgentBoundSkillId,
  type AgentForgeArchetype,
} from '@/components/orion/agents/agentRuntime';

export type AgentChannelSource = 'installed' | 'draft';

export type AgentChannelRecord = {
  id: string;
  href: string;
  label: string;
  summary: string;
  category: string;
  runtimeLabel: string;
  source: AgentChannelSource;
  sourceLabel: string;
  statusLabel: string;
  live: boolean;
  install: WorkspaceAgentInstallRecord;
};

type AgentsWorkspaceContextValue = {
  items: WorkspaceAgentInstallRecord[];
  channels: AgentChannelRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  draftAgents: WorkspaceAgentInstallRecord[];
  forgeName: string;
  setForgeName: (value: string) => void;
  createDraftAgent: (input: {
    name: string;
    prompt: string;
    behaviorPrompt?: string;
    knowledgePrompt?: string;
    archetype: AgentForgeArchetype;
  }) => Promise<WorkspaceAgentInstallRecord>;
  createDraftAgentFromBlueprint: (input: {
    rawBlueprint: string;
    fallbackName?: string;
  }) => Promise<WorkspaceAgentInstallRecord>;
  saveDraftBible: (draftId: string, bible: string) => Promise<WorkspaceAgentInstallRecord | null>;
  saveDraftSkills: (draftId: string, skills: AgentBoundSkillId[]) => Promise<WorkspaceAgentInstallRecord | null>;
  saveDraftChannels: (draftId: string, channelBindings: Record<string, unknown>) => Promise<WorkspaceAgentInstallRecord | null>;
  saveDraftManifest: (
    draftId: string,
    payload: {
      manifest: AgentManifest;
      runtime_profile_id?: string;
      runtime_mode?: 'hosted_secure' | 'local_secure' | 'privileged_device';
      connector_bindings?: Record<string, unknown>;
      channel_bindings?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<WorkspaceAgentInstallRecord | null>;
  saveDraftConnectors: (draftId: string, connectorBindings: Record<string, unknown>) => Promise<WorkspaceAgentInstallRecord | null>;
  saveDraftRuntime: (
    draftId: string,
    payload: {
      runtime_profile_id?: string;
      runtime_mode: 'hosted_secure' | 'local_secure' | 'privileged_device';
    },
  ) => Promise<WorkspaceAgentInstallRecord | null>;
};

const FORGE_NAME_STORAGE_KEY = 'empyralis.agent-forge-name.v1';

const AgentsWorkspaceContext = createContext<AgentsWorkspaceContextValue | null>(null);

function installSummary(install: WorkspaceAgentInstallRecord): string {
  const draftPrompt = String(install.metadata?.draft_prompt || '').trim();
  if (draftPrompt) return draftPrompt;
  const raw = String(install.agent_definition?.description || '').trim();
  if (raw) return raw;
  return 'Ready for customer conversations and owner supervision.';
}

function installCategory(install: WorkspaceAgentInstallRecord): string {
  return String(install.agent_definition?.category || '').trim() || 'Operations';
}

function installSource(install: WorkspaceAgentInstallRecord): AgentChannelSource {
  return String(install.metadata?.source || '').trim().toLowerCase() === 'draft' ? 'draft' : 'installed';
}

function sourceLabelForInstall(install: WorkspaceAgentInstallRecord): string {
  const source = installSource(install);
  if (source === 'draft') return 'Draft';
  const visibility = String(install.metadata?.visibility || '').trim().toLowerCase();
  if (visibility === 'commercial') return 'Commercial';
  if (visibility === 'private') return 'Private';
  return 'Installed';
}

function statusLabelForInstall(install: WorkspaceAgentInstallRecord): string {
  if (installSource(install) === 'draft') return 'Bible in progress';
  if (install.enabled === false) return 'Paused';
  const status = String(install.status || '').trim();
  if (!status) return 'Ready';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function runtimeLabelForInstall(install: WorkspaceAgentInstallRecord): string {
  return String(install.runtime_profile?.label || '').trim() || runtimeModeLabel(getRuntimeMode(install));
}

function isLiveInstall(install: WorkspaceAgentInstallRecord): boolean {
  return install.enabled !== false && String(install.status || '').trim().toLowerCase() === 'active';
}

function toChannelRecord(install: WorkspaceAgentInstallRecord): AgentChannelRecord {
  return {
    id: install.id,
    href: `/agents/${encodeURIComponent(install.id)}`,
    label: String(install.label || install.agent_definition?.name || 'Agent').trim() || 'Agent',
    summary: installSummary(install),
    category: installCategory(install),
    runtimeLabel: runtimeLabelForInstall(install),
    source: installSource(install),
    sourceLabel: sourceLabelForInstall(install),
    statusLabel: statusLabelForInstall(install),
    live: isLiveInstall(install),
    install,
  };
}

export function AgentsWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { activeWorkspaceId, workspaceLoading } = usePlatformShell();
  const [items, setItems] = useState<WorkspaceAgentInstallRecord[]>([]);
  const [forgeName, setForgeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextForgeName = window.localStorage.getItem(FORGE_NAME_STORAGE_KEY) || '';
    setForgeName(nextForgeName);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (forgeName.trim()) {
      window.localStorage.setItem(FORGE_NAME_STORAGE_KEY, forgeName.trim());
    } else {
      window.localStorage.removeItem(FORGE_NAME_STORAGE_KEY);
    }
  }, [forgeName]);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextItems = await fetchAgents(activeWorkspaceId);
      setItems(nextItems);
    } catch (nextError) {
      setItems([]);
      setError(nextError instanceof Error ? nextError.message : 'Unable to load agent channels.');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaceLoading) return;
    void load();
  }, [load, workspaceLoading]);

  const upsertInstall = useCallback((record: WorkspaceAgentInstallRecord) => {
    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.id === record.id);
      if (existingIndex === -1) return [record, ...current];
      const next = [...current];
      next[existingIndex] = record;
      return next;
    });
  }, []);

  const draftAgents = useMemo(
    () => items.filter((item) => installSource(item) === 'draft'),
    [items],
  );

  const channels = useMemo(
    () => items.map(toChannelRecord),
    [items],
  );

  const createDraftAgent = useCallback(async (input: {
    name: string;
    prompt: string;
    behaviorPrompt?: string;
    knowledgePrompt?: string;
    archetype: AgentForgeArchetype;
  }) => {
    if (!activeWorkspaceId) throw new Error('Active workspace is unavailable.');
    const trimmedName = input.name.trim() || 'Untitled Agent';
    const trimmedPrompt = input.prompt.trim() || `help with ${trimmedName}`;
    const manifest = createDraftManifest({
      name: trimmedName,
      prompt: trimmedPrompt,
      behaviorPrompt: input.behaviorPrompt,
      knowledgePrompt: input.knowledgePrompt,
      archetype: input.archetype,
    });
    const record = await createSpecialistAgent({
      workspace_id: activeWorkspaceId,
      label: trimmedName,
      manifest,
      runtime_mode: 'hosted_secure',
      metadata: {
        source: 'draft',
        visibility: 'private',
        draft_prompt: trimmedPrompt,
      },
      channel_bindings: manifest.channels,
    });
    upsertInstall(record);
    setForgeName(trimmedName);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const createDraftAgentFromBlueprint = useCallback(async (input: {
    rawBlueprint: string;
    fallbackName?: string;
  }) => {
    if (!activeWorkspaceId) throw new Error('Active workspace is unavailable.');
    const manifest = createDraftManifestFromBlueprint(input.rawBlueprint, input.fallbackName);
    const trimmedName = manifest.identity.name.trim() || input.fallbackName?.trim() || 'Imported Agent';
    const record = await createSpecialistAgent({
      workspace_id: activeWorkspaceId,
      label: trimmedName,
      manifest,
      runtime_mode: 'hosted_secure',
      metadata: {
        source: 'draft',
        visibility: 'private',
        imported_blueprint: true,
        draft_prompt: manifest.identity.summary,
      },
      channel_bindings: manifest.channels,
    });
    upsertInstall(record);
    setForgeName(trimmedName);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftBible = useCallback(async (draftId: string, bible: string) => {
    if (!activeWorkspaceId) return null;
    const record = await saveSpecialistBible(draftId, {
      workspace_id: activeWorkspaceId,
      bible,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftSkills = useCallback(async (draftId: string, skills: AgentBoundSkillId[]) => {
    if (!activeWorkspaceId) return null;
    const record = await saveSpecialistSkillBindings(draftId, {
      workspace_id: activeWorkspaceId,
      skill_ids: skills,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftChannels = useCallback(async (draftId: string, channelBindings: Record<string, unknown>) => {
    if (!activeWorkspaceId) return null;
    const record = await saveSpecialistChannelBindings(draftId, {
      workspace_id: activeWorkspaceId,
      channel_bindings: channelBindings,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftManifest = useCallback(async (
    draftId: string,
    payload: {
      manifest: AgentManifest;
      runtime_profile_id?: string;
      runtime_mode?: 'hosted_secure' | 'local_secure' | 'privileged_device';
      connector_bindings?: Record<string, unknown>;
      channel_bindings?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    },
  ) => {
    if (!activeWorkspaceId) return null;
    const record = await updateSpecialistManifest(draftId, {
      workspace_id: activeWorkspaceId,
      manifest: payload.manifest,
      runtime_profile_id: payload.runtime_profile_id,
      runtime_mode: payload.runtime_mode,
      connector_bindings: payload.connector_bindings,
      channel_bindings: payload.channel_bindings,
      metadata: payload.metadata,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftConnectors = useCallback(async (draftId: string, connectorBindings: Record<string, unknown>) => {
    if (!activeWorkspaceId) return null;
    const record = await saveSpecialistConnectorBindings(draftId, {
      workspace_id: activeWorkspaceId,
      connector_bindings: connectorBindings,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const saveDraftRuntime = useCallback(async (
    draftId: string,
    payload: {
      runtime_profile_id?: string;
      runtime_mode: 'hosted_secure' | 'local_secure' | 'privileged_device';
    },
  ) => {
    if (!activeWorkspaceId) return null;
    const record = await saveSpecialistRuntimeProfile(draftId, {
      workspace_id: activeWorkspaceId,
      runtime_profile_id: payload.runtime_profile_id,
      runtime_mode: payload.runtime_mode,
    });
    upsertInstall(record);
    return record;
  }, [activeWorkspaceId, upsertInstall]);

  const value = useMemo<AgentsWorkspaceContextValue>(() => ({
    items,
    channels,
    loading: workspaceLoading || loading,
    error,
    refresh: load,
    draftAgents,
    forgeName,
    setForgeName,
    createDraftAgent,
    createDraftAgentFromBlueprint,
    saveDraftBible,
    saveDraftSkills,
    saveDraftChannels,
    saveDraftManifest,
    saveDraftConnectors,
    saveDraftRuntime,
  }), [
    channels,
    createDraftAgent,
    createDraftAgentFromBlueprint,
    draftAgents,
    error,
    forgeName,
    items,
    load,
    loading,
    saveDraftBible,
    saveDraftChannels,
    saveDraftConnectors,
    saveDraftManifest,
    saveDraftRuntime,
    saveDraftSkills,
    workspaceLoading,
  ]);

  return (
    <AgentsWorkspaceContext.Provider value={value}>
      {children}
    </AgentsWorkspaceContext.Provider>
  );
}

export function useAgentsWorkspace() {
  const context = useContext(AgentsWorkspaceContext);
  if (!context) {
    throw new Error('useAgentsWorkspace must be used inside AgentsWorkspaceProvider.');
  }
  return context;
}
