'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Pin, Plus, Trash2 } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { WorkstationSageMemoryRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type SageMemoryCategoryRecord = {
  id: string;
  label: string;
};

type SageMemorySnapshot = {
  items: WorkstationSageMemoryRecord[];
  categories: SageMemoryCategoryRecord[];
};

type SageMemoryDraft = {
  entryId: string | null;
  category: string;
  title: string;
  content: string;
  pinned: boolean;
};

const memoryPaneCache = new Map<string, SageMemorySnapshot>();

const DEFAULT_MEMORY_CATEGORIES: readonly SageMemoryCategoryRecord[] = [
  { id: 'profile_fact', label: 'Profile facts' },
  { id: 'project_context', label: 'Active work' },
  { id: 'app_state', label: 'App state' },
  { id: 'saved_preference', label: 'Saved preferences' },
] as const;

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function defaultMemoryDraft(category = 'profile_fact'): SageMemoryDraft {
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

export function WorkstationActivityPane() {
  const { workspaceId } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const cachedSnapshot = memoryPaneCache.get(workspaceId) ?? null;
  const [snapshot, setSnapshot] = useState<SageMemorySnapshot>(() => cachedSnapshot ?? normalizeMemorySnapshot(null));
  const [isLoading, setIsLoading] = useState(() => cachedSnapshot === null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<SageMemoryDraft>(() => defaultMemoryDraft());
  const [mutatingMemory, setMutatingMemory] = useState<string | null>(null);
  const [pendingDeleteMemoryId, setPendingDeleteMemoryId] = useState<string | null>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    const payload = await services.client.listSageMemory();
    const nextSnapshot = normalizeMemorySnapshot(payload);
    const normalizedSnapshot = {
      ...nextSnapshot,
      items: sortMemoryEntries(nextSnapshot.items),
    };
    memoryPaneCache.set(workspaceId, normalizedSnapshot);
    setSnapshot(normalizedSnapshot);
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(cachedSnapshot === null).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : 'Memory is unavailable right now.');
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cachedSnapshot, services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Memory is unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  const pendingDeleteMemory = useMemo(
    () => snapshot.items.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null,
    [pendingDeleteMemoryId, snapshot.items],
  );
  const categoryLabels = useMemo(
    () => new Map(snapshot.categories.map((category) => [readString(category.id), readString(category.label)])),
    [snapshot.categories],
  );

  const openCreateMemory = () => {
    setMemoryDraft(defaultMemoryDraft());
    setIsMemorySheetOpen(true);
  };

  const openEditMemory = (entry: WorkstationSageMemoryRecord) => {
    setMemoryDraft({
      entryId: readString(entry.id) || null,
      category: readString(entry.category) || 'profile_fact',
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
      setSnapshot({
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      });
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
      setSnapshot({
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      });
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
      setSnapshot({
        ...nextSnapshot,
        items: sortMemoryEntries(nextSnapshot.items),
      });
      setPendingDeleteMemoryId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not forget memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  return (
    <WorkstationSurfaceRoot surface="activity">
      <main className="app-memory-minimal-page" data-workstation-surface="memory-minimal">
        <div className="app-memory-minimal-page__header">
          <div />
          <button
            type="button"
            className="app-memory-minimal-page__add"
            onClick={openCreateMemory}
            aria-label="Add memory"
            title="Add memory"
          >
            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>

        {statusMessage ? <div className="app-surface-inline-status">{statusMessage}</div> : null}
        {error ? <div className="app-surface-inline-status">{error}</div> : null}

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4.25rem" />
            <SkeletonBlock height="4.25rem" />
            <SkeletonBlock height="4.25rem" />
          </div>
        ) : snapshot.items.length === 0 ? (
          <EmptyPanel
            title="No memory yet"
            body="Sage will remember things as you work together."
          />
        ) : (
          <div className="app-memory-minimal-list">
            {snapshot.items.map((entry) => {
              const entryId = readString(entry.id);
              const busy = mutatingMemory === entryId;
              const categoryLabel = categoryLabels.get(readString(entry.category)) || 'Saved memory';
              const updatedLabel = formatMemoryTimestamp(readString(entry.updated_at) || readString(entry.created_at) || null);
              return (
                <article key={entryId || `memory-${readString(entry.title)}`} className="app-memory-minimal-entry">
                  <div className="app-memory-minimal-entry__row">
                    <div className="app-memory-minimal-entry__copy">
                      <div className="app-memory-minimal-entry__meta">
                        <span className="app-memory-minimal-entry__category">{categoryLabel}</span>
                        {Boolean(entry.pinned) ? (
                          <span className="app-memory-minimal-entry__badge">Pinned</span>
                        ) : null}
                        {updatedLabel ? (
                          <time className="app-memory-minimal-entry__timestamp" dateTime={readString(entry.updated_at) || readString(entry.created_at) || undefined}>
                            {updatedLabel}
                          </time>
                        ) : null}
                      </div>
                      <div className="app-memory-minimal-entry__title">{readString(entry.title) || 'Saved memory'}</div>
                      <p className="app-memory-minimal-entry__content">{readString(entry.content) || 'No memory content recorded.'}</p>
                    </div>
                    <div className="app-memory-minimal-entry__actions">
                      <button
                        type="button"
                        className="app-memory-minimal-entry__action"
                        disabled={busy}
                        onClick={() => {
                          void togglePinned(entry);
                        }}
                        aria-label={Boolean(entry.pinned) ? 'Unpin memory' : 'Pin memory'}
                        title={Boolean(entry.pinned) ? 'Unpin memory' : 'Pin memory'}
                      >
                        <Pin size={16} strokeWidth={1.9} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="app-memory-minimal-entry__action"
                        disabled={busy}
                        onClick={() => {
                          openEditMemory(entry);
                        }}
                        aria-label="Edit memory"
                        title="Edit memory"
                      >
                        <Pencil size={16} strokeWidth={1.9} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="app-memory-minimal-entry__action app-memory-minimal-entry__action--danger"
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
                </article>
              );
            })}
          </div>
        )}
      </main>

      <CommandSheet
        open={isMemorySheetOpen}
        title={memoryDraft.entryId ? 'Edit memory' : 'Add memory'}
        description="Save only what Sage should carry into future turns."
        onClose={() => {
          setIsMemorySheetOpen(false);
          setMemoryDraft(defaultMemoryDraft('profile_fact'));
        }}
        actions={(
          <>
            <button
              type="button"
              className="app-memory-sheet__link"
              disabled={Boolean(mutatingMemory)}
              onClick={() => {
                setIsMemorySheetOpen(false);
                setMemoryDraft(defaultMemoryDraft('profile_fact'));
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
    </WorkstationSurfaceRoot>
  );
}
