'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Pin, PinOff, Plus, Trash2 } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { AppButton } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type {
  WorkstationSageMemoryRecord,
  WorkstationSageProfileQuestionRecord,
  WorkstationSageProfileRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type SageMemoryCategoryRecord = {
  id: string;
  label: string;
};

type SageMemorySnapshot = {
  items: WorkstationSageMemoryRecord[];
  categories: SageMemoryCategoryRecord[];
};

type SageProfileSnapshot = {
  profile: {
    user_name: string;
    identity_summary: string;
    communication_style: string;
    recurring_responsibility: string;
    standing_rules: string[];
    standing_rules_text: string;
  };
  bootstrap: {
    complete: boolean;
    answered_count: number;
    total_count: number;
    progress_label: string;
    current_question: WorkstationSageProfileQuestionRecord | null;
  };
  storagePolicy: Record<string, unknown>;
  projections: Record<string, string>;
  accountSeed: {
    display_name: string;
    email: string;
  };
};

type SageProfileDraft = {
  user_name: string;
  identity_summary: string;
  communication_style: string;
  recurring_responsibility: string;
  standing_rules_text: string;
};

type SageMemoryStoragePolicy = Record<string, unknown> & {
  authority?: string | null;
  max_entries?: number | null;
  used_entries?: number | null;
  remaining_entries?: number | null;
};

type SageMemoryDraft = {
  entryId: string | null;
  category: string;
  title: string;
  content: string;
  pinned: boolean;
};

type MemorySensitivityClass = 'green' | 'yellow' | 'orange' | 'red';

const memoryPaneCache = new Map<string, SageMemorySnapshot>();

const DEFAULT_MEMORY_CATEGORIES: readonly SageMemoryCategoryRecord[] = [
  { id: 'safe_general', label: 'Safe' },
  { id: 'sensitive', label: 'Sensitive' },
  { id: 'private', label: 'Private' },
  { id: 'critical_restricted', label: 'Critical' },
] as const;

const MEMORY_SENSITIVITY_ORDER: readonly MemorySensitivityClass[] = ['green', 'yellow', 'orange', 'red'] as const;

const MEMORY_SENSITIVITY_META: Record<MemorySensitivityClass, { label: string; description: string }> = {
  green: {
    label: 'Safe',
    description: 'General context Sage can reuse freely.',
  },
  yellow: {
    label: 'Sensitive',
    description: 'Useful context Sage should handle carefully.',
  },
  orange: {
    label: 'Private',
    description: 'Personal context with tighter handling.',
  },
  red: {
    label: 'Critical',
    description: 'Restricted facts such as secrets or credentials.',
  },
};

const MEMORY_ITEM_LIMIT = 50;
const SAGE_MEMORY_WIPE_CONFIRMATION = 'WIPE SAGE MEMORY';

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMemorySnapshot(payload: unknown): SageMemorySnapshot {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const items = Array.isArray(record.items)
    ? record.items.filter((item): item is WorkstationSageMemoryRecord => Boolean(item) && typeof item === 'object')
    : [];
  const parsedCategories = Array.isArray(record.categories)
    ? record.categories.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const category = item as Record<string, unknown>;
      const id = readString(category.id);
      const label = readString(category.label);
      if (!id || !label) {
        return [];
      }
      return [{ id, label }];
    })
    : [];
  return {
    items,
    categories: parsedCategories.length > 0 ? parsedCategories : [...DEFAULT_MEMORY_CATEGORIES],
  };
}

function defaultProfileSnapshot(): SageProfileSnapshot {
  return {
    profile: {
      user_name: '',
      identity_summary: '',
      communication_style: '',
      recurring_responsibility: '',
      standing_rules: [],
      standing_rules_text: '',
    },
    bootstrap: {
      complete: false,
      answered_count: 0,
      total_count: 5,
      progress_label: '0/5',
      current_question: null,
    },
    storagePolicy: {},
    projections: {},
    accountSeed: {
      display_name: '',
      email: '',
    },
  };
}

function normalizeProfileSnapshot(payload: unknown): SageProfileSnapshot {
  const record = payload && typeof payload === 'object' ? payload as WorkstationSageProfileRecord : {};
  const profileRecord = record.profile && typeof record.profile === 'object'
    ? record.profile as Record<string, unknown>
    : {};
  const bootstrapRecord = record.bootstrap && typeof record.bootstrap === 'object'
    ? record.bootstrap as Record<string, unknown>
    : {};
  const standingRules = Array.isArray(profileRecord.standing_rules)
    ? profileRecord.standing_rules.flatMap((item) => {
      const rule = readString(item);
      return rule ? [rule] : [];
    })
    : [];
  const projectionsRecord = record.projections && typeof record.projections === 'object'
    ? record.projections as Record<string, unknown>
    : {};
  const accountSeedRecord = record.account_seed && typeof record.account_seed === 'object'
    ? record.account_seed as Record<string, unknown>
    : {};
  const answeredCount = readNumber(bootstrapRecord.answered_count);
  const totalCount = Math.max(1, readNumber(bootstrapRecord.total_count, 5));
  return {
    profile: {
      user_name: readString(profileRecord.user_name),
      identity_summary: readString(profileRecord.identity_summary),
      communication_style: readString(profileRecord.communication_style),
      recurring_responsibility: readString(profileRecord.recurring_responsibility),
      standing_rules: standingRules,
      standing_rules_text: readString(profileRecord.standing_rules_text) || standingRules.join('\n'),
    },
    bootstrap: {
      complete: Boolean(bootstrapRecord.complete),
      answered_count: answeredCount,
      total_count: totalCount,
      progress_label: readString(bootstrapRecord.progress_label) || `${answeredCount}/${totalCount}`,
      current_question: bootstrapRecord.current_question && typeof bootstrapRecord.current_question === 'object'
        ? bootstrapRecord.current_question as WorkstationSageProfileQuestionRecord
        : null,
    },
    storagePolicy: record.storage_policy && typeof record.storage_policy === 'object'
      ? record.storage_policy as Record<string, unknown>
      : {},
    projections: Object.entries(projectionsRecord).reduce<Record<string, string>>((accumulator, [key, value]) => {
      const normalized = readString(value);
      if (normalized) {
        accumulator[key] = normalized;
      }
      return accumulator;
    }, {}),
    accountSeed: {
      display_name: readString(accountSeedRecord.display_name),
      email: readString(accountSeedRecord.email),
    },
  };
}

function draftFromProfileSnapshot(snapshot: SageProfileSnapshot): SageProfileDraft {
  return {
    user_name: snapshot.profile.user_name,
    identity_summary: snapshot.profile.identity_summary,
    communication_style: snapshot.profile.communication_style,
    recurring_responsibility: snapshot.profile.recurring_responsibility,
    standing_rules_text: snapshot.profile.standing_rules_text,
  };
}

function defaultMemoryDraft(category = 'safe_general'): SageMemoryDraft {
  return {
    entryId: null,
    category,
    title: '',
    content: '',
    pinned: false,
  };
}

function sortMemoryEntries(items: WorkstationSageMemoryRecord[]): WorkstationSageMemoryRecord[] {
  return [...items].sort((left, right) => {
    const leftPinned = Boolean(left.pinned);
    const rightPinned = Boolean(right.pinned);
    if (leftPinned !== rightPinned) {
      return rightPinned ? 1 : -1;
    }
    const leftUpdated = Date.parse(readString(left.updated_at) || readString(left.created_at) || '');
    const rightUpdated = Date.parse(readString(right.updated_at) || readString(right.created_at) || '');
    if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }
    return readString(left.id).localeCompare(readString(right.id));
  });
}

function formatMemoryTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const diffMinutes = Math.round((parsed - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return formatter.format(diffDays, 'day');
  }
  return new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function inferMemorySensitivity(entry: WorkstationSageMemoryRecord): MemorySensitivityClass {
  const metadata = entry.metadata && typeof entry.metadata === 'object'
    ? entry.metadata as Record<string, unknown>
    : {};
  const explicit = readString(
    entry.sensitivity_class
    ?? entry.classification
    ?? metadata.sensitivity_class
    ?? metadata.sensitivity,
  ).toLowerCase();
  if (explicit === 'green' || explicit === 'yellow' || explicit === 'orange' || explicit === 'red') {
    return explicit;
  }
  const content = `${readString(entry.title)} ${readString(entry.content)}`.toLowerCase();
  if (/(api key|token|password|secret|credential|ssh|private key|recovery code)/i.test(content)) {
    return 'red';
  }
  const category = readString(entry.category).toLowerCase();
  if (category === 'safe_general' || category === 'green') {
    return 'green';
  }
  if (category === 'sensitive' || category === 'yellow') {
    return 'yellow';
  }
  if (category === 'private' || category === 'orange') {
    return 'orange';
  }
  if (category === 'critical_restricted' || category === 'critical' || category === 'red') {
    return 'red';
  }
  if (category === 'work_context' || category === 'profile_fact' || category === 'saved_preference') {
    return 'green';
  }
  if (
    category === 'top_of_mind'
    || category === 'brief_history'
    || category === 'earlier_context'
    || category === 'long_term_background'
    || category === 'project_context'
  ) {
    return 'yellow';
  }
  if (category === 'personal_context' || category === 'app_state') {
    return 'orange';
  }
  return 'yellow';
}

function memoryPaneErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) {
    return 'Memory is unavailable right now.';
  }
  if (message === 'Sage cannot run that request in this workspace right now.') {
    return 'Memory is unavailable in this workspace.';
  }
  if (message === 'The requested item could not be found.') {
    return 'Memory has not been set up for this workspace yet.';
  }
  return message;
}

export function WorkstationActivityPane() {
  const { workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const cachedSnapshot = memoryPaneCache.get(workspaceId) ?? null;
  const [snapshot, setSnapshot] = useState<SageMemorySnapshot>(() => cachedSnapshot ?? normalizeMemorySnapshot(null));
  const [isLoading, setIsLoading] = useState(() => cachedSnapshot === null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [storagePolicy, setStoragePolicy] = useState<SageMemoryStoragePolicy | null>(null);
  const cachedProfilePayload = services.queryClient.peek<unknown>('chat:canonical:sage-profile');
  const cachedProfile = cachedProfilePayload ? normalizeProfileSnapshot(cachedProfilePayload) : null;
  const [profileSnapshot, setProfileSnapshot] = useState<SageProfileSnapshot>(() => cachedProfile ?? defaultProfileSnapshot());
  const [profileDraft, setProfileDraft] = useState<SageProfileDraft>(() => draftFromProfileSnapshot(cachedProfile ?? defaultProfileSnapshot()));
  const [isProfileLoading, setIsProfileLoading] = useState(() => cachedProfile === null);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isIdentitySheetOpen, setIsIdentitySheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<SageMemoryDraft>(() => defaultMemoryDraft());
  const [mutatingMemory, setMutatingMemory] = useState<string | null>(null);
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);
  const [pendingWipeMemory, setPendingWipeMemory] = useState(false);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const [payload, policyPayload] = await Promise.all([
      services.client.listSageMemory(),
      services.client.getSageMemoryStoragePolicy().catch(() => null),
    ]);
    const nextSnapshot = normalizeMemorySnapshot(payload);
    const normalizedSnapshot = {
      ...nextSnapshot,
      items: sortMemoryEntries(nextSnapshot.items),
    };
    memoryPaneCache.set(workspaceId, normalizedSnapshot);
    setSnapshot(normalizedSnapshot);
    if (policyPayload && typeof policyPayload === 'object') {
      setStoragePolicy(policyPayload as SageMemoryStoragePolicy);
    }
    setIsLoading(false);
  };

  const refreshProfile = async (showLoading = false) => {
    if (showLoading) {
      setIsProfileLoading(true);
    }
    setError(null);
    const payload = await services.client.getSageProfile();
    const nextSnapshot = normalizeProfileSnapshot(payload);
    services.queryClient.set('chat:canonical:sage-profile', nextSnapshot);
    setProfileSnapshot(nextSnapshot);
    setProfileDraft(draftFromProfileSnapshot(nextSnapshot));
    setIsProfileLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(cachedSnapshot === null).catch((loadError) => {
      if (!cancelled) {
        setError(memoryPaneErrorMessage(loadError));
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services.client, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void refreshProfile(cachedProfile === null).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Memory identity is unavailable right now.');
        setIsProfileLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  const pendingDeleteMemory = useMemo(
    () => snapshot.items.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null,
    [pendingDeleteMemoryId, snapshot.items],
  );
  const categoryLabels = useMemo(
    () => new Map(snapshot.categories.map((category) => [readString(category.id), readString(category.label)])),
    [snapshot.categories],
  );
  const groupedMemoryItems = useMemo(() => {
    const grouped = new Map<MemorySensitivityClass, WorkstationSageMemoryRecord[]>(
      MEMORY_SENSITIVITY_ORDER.map((sensitivity) => [sensitivity, []]),
    );
    snapshot.items.forEach((entry) => {
      grouped.get(inferMemorySensitivity(entry))?.push(entry);
    });
    return grouped;
  }, [snapshot.items]);
  const memoryLimit = readNumber(storagePolicy?.max_entries, MEMORY_ITEM_LIMIT) || MEMORY_ITEM_LIMIT;
  const memoryUsed = readNumber(storagePolicy?.used_entries, snapshot.items.length);
  const memoryRemaining = readNumber(storagePolicy?.remaining_entries, Math.max(0, memoryLimit - memoryUsed));
  const memoryAuthorityLabel = readString(storagePolicy?.authority).replace(/_/g, ' ') || 'cloud canonical';
  const runtimeFormatLabel = readString(storagePolicy?.runtime_format).replace(/_/g, ' ') || 'structured classes';
  const pinnedCount = snapshot.items.filter((entry) => Boolean(entry.pinned)).length;
  const pinnedMemoryItems = useMemo(
    () => snapshot.items.filter((entry) => Boolean(entry.pinned)),
    [snapshot.items],
  );
  const recentMemoryItems = useMemo(
    () => sortMemoryEntries(snapshot.items.filter((entry) => !Boolean(entry.pinned) && inferMemorySensitivity(entry) !== 'red')).slice(0, 12),
    [snapshot.items],
  );
  const sensitiveMemoryItems = useMemo(
    () => snapshot.items.filter((entry) => {
      const sensitivity = inferMemorySensitivity(entry);
      return sensitivity === 'orange' || sensitivity === 'red';
    }),
    [snapshot.items],
  );
  const projectionItems = useMemo(
    () => Object.entries(profileSnapshot.projections).map(([filename, content]) => ({
      filename,
      preview: content.split('\n').find((line) => readString(line)) || 'Generated projection',
    })),
    [profileSnapshot.projections],
  );
  const profileAuthority = readString(profileSnapshot.storagePolicy.authority).replace(/_/g, ' ') || 'structured profile cloud canonical';
  const projectedFiles = Array.isArray(profileSnapshot.storagePolicy.projected_files)
    ? profileSnapshot.storagePolicy.projected_files.flatMap((value) => {
      const token = readString(value);
      return token ? [token] : [];
    })
    : [];
  const bootstrapQuestion = profileSnapshot.bootstrap.current_question;
  const displayNameHint = profileSnapshot.accountSeed.display_name || profileSnapshot.accountSeed.email || 'Set a preferred name';

  const saveProfileDraft = async () => {
    if (isProfileSaving) {
      return;
    }
    setIsProfileSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const payload = await services.client.updateSageProfile({
        userName: profileDraft.user_name,
        identitySummary: profileDraft.identity_summary,
        communicationStyle: profileDraft.communication_style,
        recurringResponsibility: profileDraft.recurring_responsibility,
        standingRulesText: profileDraft.standing_rules_text,
      });
      const nextSnapshot = normalizeProfileSnapshot(payload);
      services.queryClient.set('chat:canonical:sage-profile', nextSnapshot);
      setProfileSnapshot(nextSnapshot);
      setProfileDraft(draftFromProfileSnapshot(nextSnapshot));
      setStatusMessage('Memory identity updated.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update memory identity.');
    } finally {
      setIsProfileSaving(false);
    }
  };

  const openCreateMemory = () => {
    setMemoryDraft(defaultMemoryDraft());
    setIsMemorySheetOpen(true);
  };

  const openEditMemory = (entry: WorkstationSageMemoryRecord) => {
    setMemoryDraft({
      entryId: readString(entry.id) || null,
      category: readString(entry.category) || 'safe_general',
      title: readString(entry.title),
      content: readString(entry.content),
      pinned: Boolean(entry.pinned),
    });
    setIsMemorySheetOpen(true);
  };

  const submitMemoryDraft = async () => {
    if (mutatingMemory) {
      return;
    }
    const category = readString(memoryDraft.category);
    const title = readString(memoryDraft.title);
    const content = readString(memoryDraft.content);
    if (!category || !title || !content) {
      setStatusMessage('Memory entries need a category, title, and content.');
      return;
    }
    setMutatingMemory(memoryDraft.entryId || 'new');
    setStatusMessage(null);
    try {
      const payload = memoryDraft.entryId
        ? await services.client.updateSageMemoryEntry({
          entryId: memoryDraft.entryId,
          category,
          title,
          content,
          pinned: memoryDraft.pinned,
        })
        : await services.client.createSageMemoryEntry({
          category,
          title,
          content,
          pinned: memoryDraft.pinned,
        });
      const nextSnapshot = normalizeMemorySnapshot(payload);
      const normalizedSnapshot = {
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      };
      memoryPaneCache.set(workspaceId, normalizedSnapshot);
      setSnapshot(normalizedSnapshot);
      setIsMemorySheetOpen(false);
      setMemoryDraft(defaultMemoryDraft(category));
      setStatusMessage(memoryDraft.entryId ? 'Memory corrected.' : 'Memory saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Memory update failed.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const togglePinned = async (entry: WorkstationSageMemoryRecord) => {
    const entryId = readString(entry.id);
    if (!entryId || mutatingMemory) {
      return;
    }
    setMutatingMemory(entryId);
    setStatusMessage(null);
    try {
      const payload = await services.client.setSageMemoryEntryPinned({
        entryId,
        pinned: !Boolean(entry.pinned),
      });
      const nextSnapshot = normalizeMemorySnapshot(payload);
      const normalizedSnapshot = {
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      };
      memoryPaneCache.set(workspaceId, normalizedSnapshot);
      setSnapshot(normalizedSnapshot);
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : 'Could not update memory pin state.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const confirmDeleteMemory = async () => {
    if (!pendingDeleteMemoryId || mutatingMemory) {
      return;
    }
    setMutatingMemory(pendingDeleteMemoryId);
    setStatusMessage(null);
    try {
      const payload = await services.client.deleteSageMemoryEntry({
        entryId: pendingDeleteMemoryId,
      });
      const nextSnapshot = normalizeMemorySnapshot(payload);
      const normalizedSnapshot = {
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      };
      memoryPaneCache.set(workspaceId, normalizedSnapshot);
      setSnapshot(normalizedSnapshot);
      setPendingDeleteMemoryId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not forget memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const exportMemory = async () => {
    if (mutatingMemory || snapshot.items.length === 0) {
      return;
    }
    setMutatingMemory('export');
    setStatusMessage(null);
    try {
      const payload = await services.client.exportSageMemory();
      const markdown = readString(payload.markdown);
      const content = markdown || JSON.stringify(payload, null, 2);
      const extension = markdown ? 'md' : 'json';
      const blob = new Blob([content], {
        type: markdown ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sage-memory-${workspaceId}.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage('Memory export prepared.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Could not export memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const confirmWipeMemory = async () => {
    if (mutatingMemory || snapshot.items.length === 0) {
      return;
    }
    setMutatingMemory('wipe');
    setStatusMessage(null);
    try {
      const payload = await services.client.wipeSageMemory({
        confirm: SAGE_MEMORY_WIPE_CONFIRMATION,
      });
      const nextSnapshot = normalizeMemorySnapshot(payload);
      const normalizedSnapshot = {
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      };
      memoryPaneCache.set(workspaceId, normalizedSnapshot);
      setSnapshot(normalizedSnapshot);
      setPendingWipeMemory(false);
      if (payload.storage_policy && typeof payload.storage_policy === 'object') {
        setStoragePolicy(payload.storage_policy as SageMemoryStoragePolicy);
      }
      setStatusMessage('Workspace memory wiped.');
    } catch (wipeError) {
      setError(wipeError instanceof Error ? wipeError.message : 'Could not wipe memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const renderMemoryRows = (items: WorkstationSageMemoryRecord[], emptyLabel: string) => (
    <div className="app-memory-minimal-group__list">
      {items.length === 0 ? (
        <div className="app-memory-minimal-empty-row">{emptyLabel}</div>
      ) : items.map((entry) => {
        const entryId = readString(entry.id);
        const busy = mutatingMemory === entryId;
        const categoryLabel = categoryLabels.get(readString(entry.category)) || 'Saved memory';
        const updatedLabel = formatMemoryTimestamp(readString(entry.updated_at) || readString(entry.created_at) || null);
        const contentLabel = [readString(entry.title), readString(entry.content)]
          .filter(Boolean)
          .join(' — ');
        return (
          <div key={entryId || `memory-${readString(entry.title)}`} className="app-memory-minimal-row">
            <button
              type="button"
              className="app-memory-minimal-row__copy"
              onClick={() => {
                openEditMemory(entry);
              }}
            >
              <span className="app-memory-minimal-row__content" title={contentLabel || 'Saved memory'}>
                {contentLabel || 'Saved memory'}
              </span>
              <span className="app-memory-minimal-row__meta">
                {[categoryLabel, updatedLabel, entry.pinned ? 'Pinned' : null].filter(Boolean).join(' · ')}
              </span>
            </button>
            <div className="app-inline-actions">
              <button
                type="button"
                className="app-memory-minimal-row__delete"
                disabled={busy}
                onClick={() => {
                  void togglePinned(entry);
                }}
                aria-label={entry.pinned ? 'Unpin memory' : 'Pin memory'}
                title={entry.pinned ? 'Unpin memory' : 'Pin memory'}
              >
                {entry.pinned ? <PinOff size={16} strokeWidth={1.9} aria-hidden="true" /> : <Pin size={16} strokeWidth={1.9} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="app-memory-minimal-row__delete"
                disabled={busy}
                onClick={() => {
                  setPendingDeleteMemoryId(entryId);
                }}
                aria-label="Delete memory"
                title="Delete memory"
              >
                <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <WorkstationSurfaceRoot surface="memory">
      <main className="app-stack-4">
        {statusMessage ? <WorkstationSurfaceNotice tone="success">{statusMessage}</WorkstationSurfaceNotice> : null}
        {error ? <WorkstationSurfaceNotice tone="warning">{error}</WorkstationSurfaceNotice> : null}

        {isLoading || isProfileLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="7rem" />
            <SkeletonBlock height="12rem" />
            <SkeletonBlock height="18rem" />
          </div>
        ) : (
          <>
            <WorkstationSurfaceStatGrid>
              <WorkstationSurfaceStat
                label="Memory entries"
                value={`${Math.min(memoryUsed, memoryLimit)}/${memoryLimit}`}
                hint={`${memoryRemaining} slots open`}
              />
              <WorkstationSurfaceStat
                label="Identity"
                value={profileSnapshot.bootstrap.complete ? 'Complete' : 'In progress'}
                hint={profileSnapshot.bootstrap.progress_label}
              />
              <WorkstationSurfaceStat
                label="Storage policy"
                value={runtimeFormatLabel}
                hint={memoryAuthorityLabel}
              />
            </WorkstationSurfaceStatGrid>

            <WorkstationSurfaceCard
              title="About me"
              description="What Sage currently knows about you. It should learn this through conversation; this page is for review and correction."
              actions={(
                <AppButton
                  type="button"
                  tone="primary"
                  disabled={isProfileSaving}
                  onClick={() => {
                    setIsIdentitySheetOpen(true);
                  }}
                >
                  Correct memory
                </AppButton>
              )}
            >
              <div className="app-stack-3">
                <WorkstationSurfaceNotice tone="neutral">
                  {profileSnapshot.bootstrap.complete
                    ? `Sage has enough identity context to work normally. ${profileAuthority}.`
                    : 'Sage is still learning. Keep chatting naturally; use Correct memory only when something is wrong.'}
                </WorkstationSurfaceNotice>
                <div className="app-memory-minimal-list">
                  <section className="app-memory-minimal-group">
                    <div className="app-memory-minimal-group__list">
                      <div className="app-memory-minimal-row">
                        <span className="app-memory-minimal-row__copy">
                          <span className="app-memory-minimal-row__content">Name</span>
                          <span className="app-memory-minimal-row__meta">{profileSnapshot.profile.user_name || displayNameHint}</span>
                        </span>
                      </div>
                      <div className="app-memory-minimal-row">
                        <span className="app-memory-minimal-row__copy">
                          <span className="app-memory-minimal-row__content">Identity</span>
                          <span className="app-memory-minimal-row__meta">{profileSnapshot.profile.identity_summary || 'Not learned yet'}</span>
                        </span>
                      </div>
                      <div className="app-memory-minimal-row">
                        <span className="app-memory-minimal-row__copy">
                          <span className="app-memory-minimal-row__content">Recurring responsibility</span>
                          <span className="app-memory-minimal-row__meta">{profileSnapshot.profile.recurring_responsibility || 'Not set yet'}</span>
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Preferences"
              description="Tone and working style Sage should carry into normal sessions."
            >
              <WorkstationSurfaceNotice tone="neutral">
                {profileSnapshot.profile.communication_style || 'No communication preference saved yet. Sage can infer this from chat, or you can correct it manually.'}
              </WorkstationSurfaceNotice>
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Rules"
              description="Standing rules are durable instructions Sage should obey across sessions."
            >
              <div className="app-memory-minimal-list">
                <section className="app-memory-minimal-group">
                  <div className="app-memory-minimal-group__list">
                    {profileSnapshot.profile.standing_rules.length === 0 ? (
                      <div className="app-memory-minimal-empty-row">No standing rules saved yet.</div>
                    ) : profileSnapshot.profile.standing_rules.map((rule) => (
                      <div key={rule} className="app-memory-minimal-row">
                        <span className="app-memory-minimal-row__copy">
                          <span className="app-memory-minimal-row__content">{rule}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Pinned"
              description="High-signal facts Sage should keep at the top of carry-forward memory."
              actions={(
                <AppButton type="button" tone="primary" onClick={openCreateMemory} disabled={Boolean(mutatingMemory)}>
                  <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
                  <span>Add memory</span>
                </AppButton>
              )}
            >
              {renderMemoryRows(pinnedMemoryItems, `No pinned facts yet. ${pinnedCount > 0 ? '' : 'Pin important memory when it should stay prominent.'}`)}
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Recent"
              description="Short-term and long-term memory Sage recently saved or updated."
            >
              {renderMemoryRows(recentMemoryItems, 'No recent memory yet.')}
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Sensitive"
              description="Private and restricted memory that needs tighter handling."
            >
              {renderMemoryRows(sensitiveMemoryItems, 'No sensitive memory saved.')}
            </WorkstationSurfaceCard>

            <WorkstationSurfaceCard
              title="Controls"
              description="Export, inspect projections, or wipe explicit Sage memory for this workspace."
              actions={(
                <div className="app-inline-actions">
                  <AppButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      void exportMemory();
                    }}
                    disabled={Boolean(mutatingMemory) || snapshot.items.length === 0}
                  >
                    <Download size={16} strokeWidth={1.9} aria-hidden="true" />
                    <span>Export</span>
                  </AppButton>
                  <AppButton
                    type="button"
                    tone="danger"
                    onClick={() => {
                      setPendingWipeMemory(true);
                    }}
                    disabled={Boolean(mutatingMemory) || snapshot.items.length === 0}
                  >
                    <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
                    <span>Wipe</span>
                  </AppButton>
                </div>
              )}
            >
              <div className="app-stack-3">
                <WorkstationSurfaceNotice tone="neutral">
                  Structured backend memory is authoritative. Markdown files are projections for inspection, export, or advanced editing.
                </WorkstationSurfaceNotice>
                <div className="app-memory-minimal-list">
                  <section className="app-memory-minimal-group">
                    <div className="app-memory-minimal-group__label">
                      <span className="app-memory-minimal-group__copy">
                        <span className="app-memory-minimal-group__name">USER / IDENTITY / SOUL projections</span>
                        <span className="app-memory-minimal-group__description">
                          {projectedFiles.join(' · ') || 'USER.md · IDENTITY.md · SOUL.md · HEARTBEAT.md'}
                        </span>
                      </span>
                      <span className="app-memory-minimal-group__count">{projectionItems.length || projectedFiles.length || 4}</span>
                    </div>
                    <div className="app-memory-minimal-group__list">
                      {projectionItems.length === 0 ? (
                        <div className="app-memory-minimal-empty-row">Projection previews will appear after identity setup.</div>
                      ) : projectionItems.map((item) => (
                        <div key={item.filename} className="app-memory-minimal-row">
                          <span className="app-memory-minimal-row__copy">
                            <span className="app-memory-minimal-row__content">{item.filename}</span>
                            <span className="app-memory-minimal-row__meta">{item.preview}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </WorkstationSurfaceCard>
          </>
        )}
      </main>

      <CommandSheet
        open={isIdentitySheetOpen}
        title="Correct Sage memory"
        description="Use this only to correct durable identity, tone, or standing rules. Normal learning should happen through chat."
        onClose={() => {
          setIsIdentitySheetOpen(false);
          setProfileDraft(draftFromProfileSnapshot(profileSnapshot));
        }}
        actions={(
          <>
            <button
              type="button"
              className="app-memory-sheet__link"
              disabled={isProfileSaving}
              onClick={() => {
                setIsIdentitySheetOpen(false);
                setProfileDraft(draftFromProfileSnapshot(profileSnapshot));
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="app-button"
              disabled={isProfileSaving}
              onClick={() => {
                void saveProfileDraft().then(() => {
                  setIsIdentitySheetOpen(false);
                });
              }}
            >
              {isProfileSaving ? 'Saving…' : 'Save correction'}
            </button>
          </>
        )}
      >
        <FormSection
          title="Durable identity"
          description="This updates the structured backend truth Sage carries into future turns."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Name">
              <FormInput
                value={profileDraft.user_name}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, user_name: event.currentTarget.value }));
                }}
                placeholder={displayNameHint}
              />
            </FormField>
            <FormField label="Recurring responsibility">
              <FormInput
                value={profileDraft.recurring_responsibility}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, recurring_responsibility: event.currentTarget.value }));
                }}
                placeholder="Example: Keep my inbox triaged."
              />
            </FormField>
          </FormGrid>
          <FormGrid columns="1fr">
            <FormField label="Identity">
              <FormTextarea
                rows={4}
                value={profileDraft.identity_summary}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, identity_summary: event.currentTarget.value }));
                }}
                placeholder="Example: I run product and engineering for Empyralis."
              />
            </FormField>
            <FormField label="Tone and communication style">
              <FormTextarea
                rows={4}
                value={profileDraft.communication_style}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, communication_style: event.currentTarget.value }));
                }}
                placeholder="Example: Be direct, concise, and lead with the answer."
              />
            </FormField>
            <FormField label="Standing rules" hint="One rule per line. These are stronger than casual chat preferences.">
              <FormTextarea
                rows={5}
                value={profileDraft.standing_rules_text}
                onChange={(event) => {
                  setProfileDraft((current) => ({ ...current, standing_rules_text: event.currentTarget.value }));
                }}
                placeholder="Example: Never send external messages without approval."
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </CommandSheet>

      <CommandSheet
        open={isMemorySheetOpen}
        title={memoryDraft.entryId ? 'Edit memory' : 'Add memory'}
        description="Save only what Sage should carry into future turns."
        onClose={() => {
          setIsMemorySheetOpen(false);
          setMemoryDraft(defaultMemoryDraft('safe_general'));
        }}
        actions={(
          <>
            <button
              type="button"
              className="app-memory-sheet__link"
              disabled={Boolean(mutatingMemory)}
              onClick={() => {
                setIsMemorySheetOpen(false);
                setMemoryDraft(defaultMemoryDraft('safe_general'));
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="app-button"
              disabled={Boolean(mutatingMemory)}
              onClick={() => {
                void submitMemoryDraft();
              }}
            >
              {mutatingMemory ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        <FormSection
          title="Memory entry"
          description="Choose the right category so Sage treats it with the right weight."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Category">
              <select
                className="app-select"
                value={memoryDraft.category}
                onChange={(event) => {
                  setMemoryDraft((current) => ({ ...current, category: event.currentTarget.value }));
                }}
              >
                {snapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Pinned">
              <button
                type="button"
                className="app-button app-button--secondary"
                onClick={() => {
                  setMemoryDraft((current) => ({ ...current, pinned: !current.pinned }));
                }}
              >
                {memoryDraft.pinned ? 'Pinned' : 'Pin memory'}
              </button>
            </FormField>
          </FormGrid>
          <FormGrid columns="1fr">
            <FormField label="Title">
              <FormInput
                value={memoryDraft.title}
                onChange={(event) => {
                  setMemoryDraft((current) => ({ ...current, title: event.currentTarget.value }));
                }}
                placeholder="Example: Preferred working style"
              />
            </FormField>
            <FormField label="Content">
              <FormTextarea
                rows={5}
                value={memoryDraft.content}
                onChange={(event) => {
                  setMemoryDraft((current) => ({ ...current, content: event.currentTarget.value }));
                }}
                placeholder="Example: Prefers concise updates with clear next actions."
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </CommandSheet>

      <ConfirmDialog
        open={Boolean(pendingDeleteMemory)}
        title="Delete memory?"
        body={pendingDeleteMemory
          ? `Sage will remove "${readString(pendingDeleteMemory.title) || 'this memory'}" from carry-forward memory.`
          : 'Sage will remove this memory.'}
        confirmLabel="Delete"
        busy={Boolean(mutatingMemory)}
        onConfirm={() => {
          void confirmDeleteMemory();
        }}
        onCancel={() => {
          setPendingDeleteMemoryId(null);
        }}
      />
      <ConfirmDialog
        open={pendingWipeMemory}
        title="Wipe all memory?"
        body="This removes all explicit Sage carry-forward memory in this workspace. Chat history and audit events are not deleted by this action."
        confirmLabel="Wipe memory"
        busy={mutatingMemory === 'wipe'}
        onConfirm={() => {
          void confirmWipeMemory();
        }}
        onCancel={() => {
          setPendingWipeMemory(false);
        }}
      />
    </WorkstationSurfaceRoot>
  );
}
