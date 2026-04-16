'use client';

import { useEffect, useMemo, useState } from 'react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { DataBadge } from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type { WorkstationSageMemoryRecord } from '@/lib/workspace/workstation-client';
import { useWorkspaceServices, useWorkstationStreamState } from '@/lib/workspace/workspace-services';
import {
  WorkstationActionButton,
  WorkstationSurfaceCard,
  WorkstationSurfaceNotice,
  WorkstationSurfaceRoot,
  WorkstationSurfaceStat,
  WorkstationSurfaceStatGrid,
} from '@/lib/workspace/workstation-surface-primitives';

type SageMemoryCategoryRecord = {
  id: string;
  label: string;
  description: string;
  count: number;
};

type SageMemorySnapshot = {
  items: WorkstationSageMemoryRecord[];
  categories: SageMemoryCategoryRecord[];
  summary: Record<string, unknown>;
  updatedAt: string | null;
};

type SageMemoryDraft = {
  entryId: string | null;
  category: string;
  title: string;
  content: string;
  pinned: boolean;
};

const DEFAULT_MEMORY_CATEGORIES: readonly SageMemoryCategoryRecord[] = [
  {
    id: 'profile_fact',
    label: 'Profile facts',
    description: 'Personal baseline facts about the user.',
    count: 0,
  },
  {
    id: 'project_context',
    label: 'Active work',
    description: 'Current projects and in-flight context.',
    count: 0,
  },
  {
    id: 'app_state',
    label: 'App state',
    description: 'State that keeps services and workflows in sync.',
    count: 0,
  },
  {
    id: 'saved_preference',
    label: 'Saved preferences',
    description: 'Long-term preferences and recurring defaults.',
    count: 0,
  },
];

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not recorded';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
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
      return [{
        id,
        label,
        description: readString(category.description),
        count: readNumber(category.count, 0),
      } satisfies SageMemoryCategoryRecord];
    })
    : [];
  const categories = parsedCategories.length > 0 ? parsedCategories : [...DEFAULT_MEMORY_CATEGORIES];
  return {
    items,
    categories,
    summary: readObject(record.summary),
    updatedAt: readString(record.updated_at) || null,
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

function categoryLabel(categories: SageMemoryCategoryRecord[], categoryId: string): string {
  return categories.find((item) => item.id === categoryId)?.label ?? categoryId.replace(/_/g, ' ');
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

export function WorkstationActivityPane() {
  const services = useWorkspaceServices();
  const streamState = useWorkstationStreamState();
  const [snapshot, setSnapshot] = useState<SageMemorySnapshot>(() => normalizeMemorySnapshot(null));
  const [memoryFilter, setMemoryFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
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
    setSnapshot({
      ...nextSnapshot,
      items: sortMemoryEntries(nextSnapshot.items),
    });
    setIsLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void refresh(true).catch((loadError) => {
      if (cancelled) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Memory is unavailable right now.');
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  useEffect(() => {
    if (streamState.activity.version === 0) {
      return;
    }
    void refresh(false).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Memory is unavailable right now.');
      setIsLoading(false);
    });
  }, [services.client, streamState.activity.version]);

  const filteredMemoryItems = useMemo(
    () => snapshot.items.filter((item) => memoryFilter === 'all' || readString(item.category) === memoryFilter),
    [memoryFilter, snapshot.items],
  );
  const pendingDeleteMemory = useMemo(
    () => snapshot.items.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null,
    [pendingDeleteMemoryId, snapshot.items],
  );
  const pinnedCount = readNumber(snapshot.summary.pinned_count, snapshot.items.filter((item) => Boolean(item.pinned)).length);
  const totalCount = readNumber(snapshot.summary.total_count, snapshot.items.length);
  const categoryCount = snapshot.categories.length;

  const openCreateMemory = (categoryId?: string) => {
    setMemoryDraft(defaultMemoryDraft(categoryId || (memoryFilter !== 'all' ? memoryFilter : 'profile_fact')));
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
      setStatusMessage(Boolean(entry.pinned) ? 'Memory unpinned.' : 'Memory pinned.');
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
      setStatusMessage('Memory forgotten.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not forget memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  return (
    <WorkstationSurfaceRoot surface="activity">
      <WorkstationSurfaceCard
        title="Memory"
        description="Explicit memory that Sage carries between turns."
        actions={(
          <div className="app-inline-actions">
            <WorkstationActionButton
              type="button"
              tone="secondary"
              onClick={() => {
                void refresh(false);
              }}
            >
              Refresh
            </WorkstationActionButton>
            <WorkstationActionButton
              type="button"
              onClick={() => {
                openCreateMemory();
              }}
            >
              Add memory
            </WorkstationActionButton>
          </div>
        )}
      >
        {statusMessage ? <WorkstationSurfaceNotice tone="success">{statusMessage}</WorkstationSurfaceNotice> : null}
        {error ? <WorkstationSurfaceNotice tone="danger">{error}</WorkstationSurfaceNotice> : null}

        <WorkstationSurfaceStatGrid>
          <WorkstationSurfaceStat
            label="Saved memories"
            value={String(totalCount)}
            hint="Explicitly persisted memory entries"
          />
          <WorkstationSurfaceStat
            label="Pinned"
            value={String(pinnedCount)}
            hint="High-priority context Sage should keep prominent"
          />
          <WorkstationSurfaceStat
            label="Categories"
            value={String(categoryCount)}
            hint={`Last updated ${formatTimestamp(snapshot.updatedAt)}`}
          />
        </WorkstationSurfaceStatGrid>

        <div className="app-inline-actions app-inline-actions--tight">
          <button
            type="button"
            className={`workstation-command-bar__link${memoryFilter === 'all' ? ' workstation-command-bar__link--active' : ''}`}
            onClick={() => setMemoryFilter('all')}
          >
            All
          </button>
          {snapshot.categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`workstation-command-bar__link${memoryFilter === category.id ? ' workstation-command-bar__link--active' : ''}`}
              onClick={() => setMemoryFilter(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="app-stack-3">
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
            <SkeletonBlock height="4.8rem" />
          </div>
        ) : filteredMemoryItems.length === 0 ? (
          <EmptyPanel
            title="No memory in this view"
            body="Save profile facts, active work, app state, or long-term preferences when you want Sage to retain them explicitly."
            actions={(
              <WorkstationActionButton
                type="button"
                onClick={() => {
                  openCreateMemory(memoryFilter !== 'all' ? memoryFilter : undefined);
                }}
              >
                Add first memory
              </WorkstationActionButton>
            )}
          />
        ) : (
          <div className="app-stack-3">
            {filteredMemoryItems.map((entry) => {
              const entryId = readString(entry.id);
              const busy = mutatingMemory === entryId;
              return (
                <article key={entryId || `memory-${readString(entry.title)}`} className="app-surface-list-item">
                  <div className="app-surface-list-item__row">
                    <div className="app-surface-list-item__copy">
                      <div className="app-surface-list-item__title">{readString(entry.title) || 'Saved memory'}</div>
                      <div className="app-surface-list-item__subtitle">
                        {categoryLabel(snapshot.categories, readString(entry.category))}
                        {readString(entry.source_label) ? ` · ${readString(entry.source_label)}` : ''}
                        {` · ${formatTimestamp(readString(entry.updated_at) || readString(entry.created_at) || null)}`}
                      </div>
                    </div>
                    <div className="app-inline-actions app-inline-actions--tight">
                      <DataBadge tone={Boolean(entry.pinned) ? 'success' : 'neutral'}>
                        {Boolean(entry.pinned) ? 'Pinned' : 'Standard'}
                      </DataBadge>
                      <WorkstationActionButton
                        type="button"
                        tone="secondary"
                        disabled={busy}
                        onClick={() => {
                          void togglePinned(entry);
                        }}
                      >
                        {Boolean(entry.pinned) ? 'Unpin' : 'Pin'}
                      </WorkstationActionButton>
                      <WorkstationActionButton
                        type="button"
                        tone="secondary"
                        disabled={busy}
                        onClick={() => {
                          openEditMemory(entry);
                        }}
                      >
                        Correct
                      </WorkstationActionButton>
                      <WorkstationActionButton
                        type="button"
                        tone="danger"
                        disabled={busy}
                        onClick={() => {
                          setPendingDeleteMemoryId(entryId);
                        }}
                      >
                        Forget
                      </WorkstationActionButton>
                    </div>
                  </div>
                  <p className="app-surface-list-item__description">{readString(entry.content) || 'No memory content recorded.'}</p>
                </article>
              );
            })}
          </div>
        )}
      </WorkstationSurfaceCard>

      <CommandSheet
        open={isMemorySheetOpen}
        title={memoryDraft.entryId ? 'Correct memory' : 'Save memory'}
        description="Memory writes are explicit. Save only what Sage should carry into future turns."
        onClose={() => {
          setIsMemorySheetOpen(false);
          setMemoryDraft(defaultMemoryDraft(memoryFilter !== 'all' ? memoryFilter : 'profile_fact'));
        }}
        actions={(
          <>
            <WorkstationActionButton
              type="button"
              tone="secondary"
              disabled={Boolean(mutatingMemory)}
              onClick={() => {
                setIsMemorySheetOpen(false);
                setMemoryDraft(defaultMemoryDraft(memoryFilter !== 'all' ? memoryFilter : 'profile_fact'));
              }}
            >
              Cancel
            </WorkstationActionButton>
            <WorkstationActionButton
              type="button"
              disabled={Boolean(mutatingMemory)}
              onClick={() => {
                void submitMemoryDraft();
              }}
            >
              {mutatingMemory ? 'Saving…' : memoryDraft.entryId ? 'Save correction' : 'Save memory'}
            </WorkstationActionButton>
          </>
        )}
      >
        <FormSection
          title="Memory entry"
          description="Set category intentionally so Sage can treat this memory with the right priority."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Category">
              <select
                className="app-select"
                value={memoryDraft.category}
                onChange={(event) => {
                  const nextCategory = event.currentTarget.value;
                  setMemoryDraft((current) => ({ ...current, category: nextCategory }));
                }}
              >
                {snapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Pin now">
              <WorkstationActionButton
                type="button"
                tone={memoryDraft.pinned ? 'primary' : 'secondary'}
                onClick={() => {
                  setMemoryDraft((current) => ({ ...current, pinned: !current.pinned }));
                }}
              >
                {memoryDraft.pinned ? 'Pinned' : 'Pin memory'}
              </WorkstationActionButton>
            </FormField>
          </FormGrid>
          <FormGrid columns="1fr">
            <FormField label="Title" hint="Keep it short and scannable.">
              <FormInput
                value={memoryDraft.title}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({ ...current, title: nextValue }));
                }}
                placeholder="Example: Preferred working style"
              />
            </FormField>
            <FormField label="Content" hint="Use explicit factual wording.">
              <FormTextarea
                rows={5}
                value={memoryDraft.content}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({ ...current, content: nextValue }));
                }}
                placeholder="Example: Prefers concise updates with clear next actions."
              />
            </FormField>
          </FormGrid>
        </FormSection>
      </CommandSheet>

      <ConfirmDialog
        open={Boolean(pendingDeleteMemory)}
        title="Forget memory?"
        body={pendingDeleteMemory
          ? `Sage will remove "${readString(pendingDeleteMemory.title) || 'this memory'}" from explicit carry-forward memory.`
          : 'Sage will remove this memory.'}
        confirmLabel="Forget memory"
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
