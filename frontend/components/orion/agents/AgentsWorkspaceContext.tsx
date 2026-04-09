'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { fetchAgents, type WorkspaceAgentInstallRecord } from '@/lib/api';
import {
  createDraftManifest,
  createDraftManifestFromBlueprint,
  getAgentManifest,
  metadataFromManifest,
  updateManifestBible,
  updateManifestIdentity,
  updateManifestSkills,
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
    archetype: AgentForgeArchetype;
  }) => WorkspaceAgentInstallRecord;
  createDraftAgentFromBlueprint: (input: {
    rawBlueprint: string;
    fallbackName?: string;
  }) => WorkspaceAgentInstallRecord;
  updateDraftAgent: (
    draftId: string,
    patch: Partial<WorkspaceAgentInstallRecord> & { metadata?: Record<string, unknown> },
  ) => void;
};

const AGENT_DRAFTS_STORAGE_KEY = 'empyralis.agent-drafts.v1';
const FORGE_NAME_STORAGE_KEY = 'empyralis.agent-forge-name.v1';

const ARCHETYPE_LABELS: Record<AgentForgeArchetype, { category: string; runtimeLabel: string; description: string }> = {
  support_specialist: {
    category: 'Support',
    runtimeLabel: 'Support inbox + phone lane',
    description: 'Handles inbound questions, triage, and high-confidence replies with escalation rules.',
  },
  task_automator: {
    category: 'Operations',
    runtimeLabel: 'Workflow lane + runtime tools',
    description: 'Executes repeatable tasks, updates systems, and requests approval only when policy requires it.',
  },
  intelligence_researcher: {
    category: 'Research',
    runtimeLabel: 'Web research + report lane',
    description: 'Investigates, synthesizes, and turns messy information into operator-ready conclusions.',
  },
};

const AgentsWorkspaceContext = createContext<AgentsWorkspaceContextValue | null>(null);

function safeSlug(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent';
}

function draftId(): string {
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readDraftAgents(): WorkspaceAgentInstallRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AGENT_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkspaceAgentInstallRecord => typeof item?.id === 'string');
  } catch {
    return [];
  }
}

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
  const metadataSource = String(install.metadata?.source || '').trim().toLowerCase();
  if (metadataSource === 'draft') return 'draft';
  return 'installed';
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
  return String(install.runtime_profile?.label || '').trim() || 'Awaiting placement';
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
  const [draftAgents, setDraftAgents] = useState<WorkspaceAgentInstallRecord[]>([]);
  const [forgeName, setForgeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftAgents(readDraftAgents());
    if (typeof window === 'undefined') return;
    const nextForgeName = window.localStorage.getItem(FORGE_NAME_STORAGE_KEY) || '';
    setForgeName(nextForgeName);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AGENT_DRAFTS_STORAGE_KEY, JSON.stringify(draftAgents));
  }, [draftAgents]);

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

  const channels = useMemo(() => {
    const installedChannels = items.map(toChannelRecord);
    const draftChannels = draftAgents.map(toChannelRecord);
    return [...installedChannels, ...draftChannels];
  }, [draftAgents, items]);

  const updateDraftAgent = useCallback((
    draftId: string,
    patch: Partial<WorkspaceAgentInstallRecord> & { metadata?: Record<string, unknown> },
  ) => {
    const normalizedId = String(draftId || '').trim();
    if (!normalizedId) return;
    setDraftAgents((current) => current.map((item) => {
      if (item.id !== normalizedId) return item;
      const nextPatchMetadata = patch.metadata && typeof patch.metadata === 'object' ? patch.metadata : {};
      let nextManifest = getAgentManifest(item);
      if (Object.prototype.hasOwnProperty.call(nextPatchMetadata, 'agent_manifest')) {
        nextManifest = getAgentManifest({
          ...item,
          metadata: { ...(item.metadata || {}), agent_manifest: nextPatchMetadata.agent_manifest },
        } as WorkspaceAgentInstallRecord);
      }
      if (typeof patch.label === 'string' && patch.label.trim()) {
        nextManifest = updateManifestIdentity(nextManifest, { name: patch.label.trim(), role: patch.label.trim() });
      }
      if (typeof nextPatchMetadata.draft_bible === 'string') {
        nextManifest = updateManifestBible(nextManifest, nextPatchMetadata.draft_bible);
      }
      if (Array.isArray(nextPatchMetadata.bound_skills)) {
        nextManifest = updateManifestSkills(nextManifest, nextPatchMetadata.bound_skills as AgentBoundSkillId[]);
      }
      const nextMetadata = {
        ...(item.metadata || {}),
        ...nextPatchMetadata,
        ...metadataFromManifest(nextManifest, {
          source: 'draft',
          draft_prompt: String(nextPatchMetadata.draft_prompt || item.metadata?.draft_prompt || item.agent_definition?.description || nextManifest.identity.summary || '').trim(),
          visibility: String(nextPatchMetadata.visibility || item.metadata?.visibility || 'private').trim() || 'private',
          channel_bindings: nextManifest.channels,
        }),
      };
      return {
        ...item,
        ...patch,
        metadata: nextMetadata,
      };
    }));
  }, []);

  const createDraftAgent = useCallback((input: {
    name: string;
    prompt: string;
    archetype: AgentForgeArchetype;
  }) => {
    const trimmedName = input.name.trim() || 'Untitled Agent';
    const trimmedPrompt = input.prompt.trim() || `help with ${trimmedName}`;
    const archetype = ARCHETYPE_LABELS[input.archetype];
    const manifest = createDraftManifest({
      name: trimmedName,
      prompt: trimmedPrompt,
      archetype: input.archetype,
    });
    const nextDraft: WorkspaceAgentInstallRecord = {
      id: draftId(),
      label: trimmedName,
      status: 'draft',
      enabled: true,
      workspace_id: activeWorkspaceId,
      thread_id: `draft-thread-${safeSlug(trimmedName)}`,
      metadata: metadataFromManifest(manifest, {
        source: 'draft',
        draft_prompt: trimmedPrompt,
        visibility: 'private',
        channel_bindings: manifest.channels,
      }),
      policy_context_overrides: {
        trust_mode: 'guarded',
      },
      agent_definition: {
        id: safeSlug(trimmedName),
        slug: safeSlug(trimmedName),
        name: trimmedName,
        description: trimmedPrompt,
        category: archetype.category,
        agent_kind: 'specialist',
      },
      runtime_profile: {
        id: `draft-runtime-${safeSlug(trimmedName)}`,
        label: archetype.runtimeLabel,
        runtime_class: 'cloud_worker',
        placement_mode: 'shared',
        status: 'draft',
      },
    };
    setDraftAgents((current) => [nextDraft, ...current.filter((item) => item.id !== nextDraft.id)]);
    setForgeName(trimmedName);
    return nextDraft;
  }, [activeWorkspaceId]);

  const createDraftAgentFromBlueprint = useCallback((input: {
    rawBlueprint: string;
    fallbackName?: string;
  }) => {
    const manifest = createDraftManifestFromBlueprint(input.rawBlueprint, input.fallbackName);
    const trimmedName = manifest.identity.name.trim() || input.fallbackName?.trim() || 'Imported Agent';
    const nextDraft: WorkspaceAgentInstallRecord = {
      id: draftId(),
      label: trimmedName,
      status: 'draft',
      enabled: true,
      workspace_id: activeWorkspaceId,
      thread_id: `draft-thread-${safeSlug(trimmedName)}`,
      metadata: metadataFromManifest(manifest, {
        source: 'draft',
        draft_prompt: manifest.identity.summary,
        visibility: 'private',
        imported_blueprint: true,
        channel_bindings: manifest.channels,
      }),
      policy_context_overrides: {
        trust_mode: 'guarded',
      },
      agent_definition: {
        id: safeSlug(trimmedName),
        slug: safeSlug(trimmedName),
        name: trimmedName,
        description: manifest.identity.summary,
        category: ARCHETYPE_LABELS[manifest.identity.archetype === 'master_os' ? 'support_specialist' : manifest.identity.archetype].category,
        agent_kind: 'specialist',
      },
      runtime_profile: {
        id: `draft-runtime-${safeSlug(trimmedName)}`,
        label: ARCHETYPE_LABELS[manifest.identity.archetype === 'master_os' ? 'support_specialist' : manifest.identity.archetype].runtimeLabel,
        runtime_class: 'cloud_worker',
        placement_mode: 'shared',
        status: 'draft',
      },
    };
    setDraftAgents((current) => [nextDraft, ...current.filter((item) => item.id !== nextDraft.id)]);
    setForgeName(trimmedName);
    return nextDraft;
  }, [activeWorkspaceId]);

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
    updateDraftAgent,
  }), [channels, createDraftAgent, createDraftAgentFromBlueprint, draftAgents, error, forgeName, items, load, loading, updateDraftAgent, workspaceLoading]);

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
