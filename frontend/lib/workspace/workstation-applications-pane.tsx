'use client';

import { useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import {
  DataBadge,
  DataTable,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableRow,
} from '@/lib/ui/data-table';
import { EmptyPanel } from '@/lib/ui/empty-panel';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSection,
  FormTextarea,
} from '@/lib/ui/form-controls';
import { ListDetailColumns, ListDetailPanel, ListDetailShell } from '@/lib/ui/list-detail';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import { AppButton } from '@/lib/ui/primitives';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import {
  type WorkstationSageServiceRecord,
} from '@/lib/workspace/workstation-client';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';

type ServiceRecord = WorkstationSageServiceRecord & {
  id: 'flashcards' | 'language_coach' | 'nutrition_log';
};

type DraftMap = Record<string, Record<string, string>>;

type PendingDelete = {
  serviceId: string;
  entryId: string;
  summary: string;
} | null;

function normalizeServices(payload: unknown): ServiceRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const items = (payload as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter((item): item is ServiceRecord => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const id = String((item as Record<string, unknown>).id ?? '').trim();
    return id === 'flashcards' || id === 'language_coach' || id === 'nutrition_log';
  });
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'Not recorded';
  }
  const date = new Date(token);
  if (Number.isNaN(date.getTime())) {
    return token;
  }
  return date.toLocaleString();
}

function memoryLine(values: unknown): string {
  if (!Array.isArray(values)) {
    return 'Nothing recorded yet';
  }
  const filtered = values
    .map((item) => readString(item))
    .filter(Boolean)
    .slice(0, 3);
  return filtered.length > 0 ? filtered.join(' · ') : 'Nothing recorded yet';
}

function defaultProfileDraft(serviceId: string, profile: Record<string, unknown> | null | undefined): Record<string, string> {
  if (serviceId === 'flashcards') {
    return {
      focus_topic: readString(profile?.focus_topic),
      active_deck: readString(profile?.active_deck),
    };
  }
  if (serviceId === 'language_coach') {
    return {
      target_language: readString(profile?.target_language),
      current_level: readString(profile?.current_level),
      focus_area: readString(profile?.focus_area),
    };
  }
  return {
    daily_calorie_target: profile?.daily_calorie_target == null ? '' : String(profile.daily_calorie_target),
    daily_protein_target: profile?.daily_protein_target == null ? '' : String(profile.daily_protein_target),
    dietary_pattern: readString(profile?.dietary_pattern),
  };
}

function defaultEntryDraft(serviceId: string): Record<string, string> {
  if (serviceId === 'flashcards') {
    return { deck: '', topic: '', front: '', back: '' };
  }
  if (serviceId === 'language_coach') {
    return { language: '', phrase: '', translation: '', notes: '', confidence: '' };
  }
  return { meal: '', calories: '', protein_grams: '', occurred_on: '', notes: '' };
}

function payloadFromDraft(serviceId: string, draft: Record<string, string>): Record<string, unknown> {
  if (serviceId === 'flashcards') {
    return {
      deck: readString(draft.deck),
      topic: readString(draft.topic),
      front: readString(draft.front),
      back: readString(draft.back),
    };
  }
  if (serviceId === 'language_coach') {
    return {
      language: readString(draft.language),
      phrase: readString(draft.phrase),
      translation: readString(draft.translation),
      notes: readString(draft.notes),
      confidence: readString(draft.confidence) ? Number(draft.confidence) : null,
    };
  }
  return {
    meal: readString(draft.meal),
    calories: readString(draft.calories) ? Number(draft.calories) : null,
    protein_grams: readString(draft.protein_grams) ? Number(draft.protein_grams) : null,
    occurred_on: readString(draft.occurred_on),
    notes: readString(draft.notes),
  };
}

function profilePayloadFromDraft(serviceId: string, draft: Record<string, string>): Record<string, unknown> {
  if (serviceId === 'flashcards') {
    return {
      focus_topic: readString(draft.focus_topic),
      active_deck: readString(draft.active_deck),
    };
  }
  if (serviceId === 'language_coach') {
    return {
      target_language: readString(draft.target_language),
      current_level: readString(draft.current_level),
      focus_area: readString(draft.focus_area),
    };
  }
  return {
    daily_calorie_target: readString(draft.daily_calorie_target) ? Number(draft.daily_calorie_target) : null,
    daily_protein_target: readString(draft.daily_protein_target) ? Number(draft.daily_protein_target) : null,
    dietary_pattern: readString(draft.dietary_pattern),
  };
}

function summaryTone(service: ServiceRecord): 'success' | 'accent' | 'neutral' {
  const pinnedCount = readNumber(service.summary?.pinned_count) ?? 0;
  const entryCount = readNumber(service.summary?.entry_count) ?? 0;
  if (pinnedCount > 0) {
    return 'success';
  }
  if (entryCount > 0) {
    return 'accent';
  }
  return 'neutral';
}

function summaryBannerTone(service: ServiceRecord): 'success' | 'warning' | 'neutral' {
  const tone = summaryTone(service);
  if (tone === 'accent') {
    return 'warning';
  }
  return tone;
}

function ServicesSkeleton() {
  return (
    <ListDetailColumns
      primary={(
        <div className="app-stack-4">
          <ListDetailPanel eyebrow="Services" title="Loading Sage services">
            <SkeletonBlock height="3.2rem" />
            <SkeletonBlock height="3.2rem" />
            <SkeletonBlock height="3.2rem" />
          </ListDetailPanel>
        </div>
      )}
      secondary={(
        <ListDetailPanel eyebrow="Selection" title="Loading service detail">
          <SkeletonBlock height="4rem" />
          <SkeletonBlock height="7rem" />
          <SkeletonBlock height="10rem" />
        </ListDetailPanel>
      )}
    />
  );
}

export function WorkstationApplicationsPane() {
  const services = useWorkspaceServices();
  const [items, setItems] = useState<ServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [profileDrafts, setProfileDrafts] = useState<DraftMap>({});
  const [entryDrafts, setEntryDrafts] = useState<DraftMap>({});
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const refresh = async (showLoading = false) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const payload = await services.client.listSageServices();
      setItems(normalizeServices(payload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Sage services are unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, [services.client]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedServiceId(null);
      return;
    }
    if (selectedServiceId && items.some((item) => item.id === selectedServiceId)) {
      return;
    }
    setSelectedServiceId(items[0].id);
  }, [items, selectedServiceId]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    setProfileDrafts((current) => {
      const next = { ...current };
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = defaultProfileDraft(item.id, item.profile ?? null);
        }
      }
      return next;
    });
    setEntryDrafts((current) => {
      const next = { ...current };
      for (const item of items) {
        if (!next[item.id]) {
          next[item.id] = defaultEntryDraft(item.id);
        }
      }
      return next;
    });
  }, [items]);

  const selectedService = useMemo(
    () => items.find((item) => item.id === selectedServiceId) ?? null,
    [items, selectedServiceId],
  );

  const mutate = async (key: string, action: () => Promise<Record<string, unknown> | null>, successMessage: string) => {
    setMutatingKey(key);
    setError(null);
    setStatus(null);
    try {
      await action();
      await refresh();
      setStatus(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Service action failed.');
    } finally {
      setMutatingKey(null);
      setPendingDelete(null);
    }
  };

  const selectedProfileDraft = selectedService ? profileDrafts[selectedService.id] ?? defaultProfileDraft(selectedService.id, selectedService.profile ?? null) : null;
  const selectedEntryDraft = selectedService ? entryDrafts[selectedService.id] ?? defaultEntryDraft(selectedService.id) : null;

  return (
    <WorkstationSurfaceRoot surface="applications">
      <ListDetailShell
        title="Sage Services"
        subtitle="Three structured services Sage can carry forward as memory-backed state: Flashcards, Language Coach, and Nutrition Log."
        actions={(
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              void refresh(false);
            }}
          >
            Refresh
          </AppButton>
        )}
      >
        {status ? (
          <StateBanner tone="success" title="Service state saved">
            {status}
          </StateBanner>
        ) : null}
        {error ? (
          <StateBanner tone="danger" title="Sage services are degraded">
            {error}
          </StateBanner>
        ) : null}

        {isLoading ? (
          <ServicesSkeleton />
        ) : (
          <ListDetailColumns
            primary={(
              <div className="app-stack-4">
                <ListDetailPanel
                  eyebrow="Services"
                  title="Structured state Sage can reuse"
                  subtitle="These replace the old catalog surface. Each service stores real state, emits explicit memory updates, and stays available to Sage."
                >
                  {items.length === 0 ? (
                    <EmptyPanel
                      title="No Sage services are available"
                      body="Enable Sage services for this workspace and Flashcards, Language Coach, or Nutrition Log will appear here."
                    />
                  ) : (
                    <div className="app-stack-2">
                      {items.map((item) => {
                        const entryCount = readNumber(item.summary?.entry_count) ?? 0;
                        const pinnedCount = readNumber(item.summary?.pinned_count) ?? 0;
                        const selected = item.id === selectedServiceId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedServiceId(item.id)}
                            className={`app-card-button${selected ? ' app-card-button--selected' : ''}`}
                          >
                            <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                              <strong className="app-card-button__title">{readString(item.name, item.id)}</strong>
                              <DataBadge tone={summaryTone(item)}>{entryCount} items</DataBadge>
                            </div>
                            <span className="app-card-button__subtitle">
                              {readString(item.description, 'Structured service state')}
                            </span>
                            <span className="app-card-button__subtitle">
                              {pinnedCount > 0 ? `${pinnedCount} pinned for Sage` : readString(item.suggested_prompt, 'Ready for Sage')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ListDetailPanel>
              </div>
            )}
            secondary={(
              <ListDetailPanel
                eyebrow="Selection"
                title={selectedService ? readString(selectedService.name, selectedService.id) : 'No service selected'}
                subtitle={selectedService ? readString(selectedService.description, 'Service detail is available here.') : 'Choose a Sage service to inspect and update its state.'}
              >
                {!selectedService || !selectedProfileDraft || !selectedEntryDraft ? (
                  <EmptyPanel
                    title="No selected Sage service"
                    body="Choose Flashcards, Language Coach, or Nutrition Log to edit reusable state Sage can carry forward."
                  />
                ) : (
                  <div className="app-stack-4">
                    <StateBanner
                      tone={summaryBannerTone(selectedService)}
                      title="Memory-backed service state"
                      detail="Changes here are explicit, stored in workspace state, and published into Sage’s structured context feed."
                    >
                      {`${readNumber(selectedService.summary?.entry_count) ?? 0} ${readString(selectedService.entry_noun, 'items')} recorded · updated ${formatTimestamp(selectedService.summary?.updated_at)}`}
                    </StateBanner>

                    <FormSection
                      title="Saved preferences"
                      description="Long-term settings Sage should carry forward for this service."
                    >
                      {selectedService.id === 'flashcards' ? (
                        <FormGrid>
                          <FormField label="Focus topic">
                            <FormInput
                              value={selectedProfileDraft.focus_topic ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, focus_topic: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Active deck">
                            <FormInput
                              value={selectedProfileDraft.active_deck ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, active_deck: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      {selectedService.id === 'language_coach' ? (
                        <FormGrid>
                          <FormField label="Target language">
                            <FormInput
                              value={selectedProfileDraft.target_language ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, target_language: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Current level">
                            <FormInput
                              value={selectedProfileDraft.current_level ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, current_level: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Focus area">
                            <FormInput
                              value={selectedProfileDraft.focus_area ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, focus_area: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      {selectedService.id === 'nutrition_log' ? (
                        <FormGrid>
                          <FormField label="Daily calorie target">
                            <FormInput
                              type="number"
                              value={selectedProfileDraft.daily_calorie_target ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, daily_calorie_target: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Daily protein target (g)">
                            <FormInput
                              type="number"
                              value={selectedProfileDraft.daily_protein_target ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, daily_protein_target: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Dietary pattern">
                            <FormInput
                              value={selectedProfileDraft.dietary_pattern ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedProfileDraft, dietary_pattern: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          disabled={mutatingKey === `${selectedService.id}:profile`}
                          onClick={() => {
                            void mutate(
                              `${selectedService.id}:profile`,
                              () => services.client.updateSageServiceProfile({
                                serviceId: selectedService.id,
                                profile: profilePayloadFromDraft(selectedService.id, selectedProfileDraft),
                              }),
                              `Saved ${readString(selectedService.name, selectedService.id)} preferences.`,
                            );
                          }}
                        >
                          {mutatingKey === `${selectedService.id}:profile` ? 'Saving…' : 'Save preferences'}
                        </AppButton>
                        <FormReadout label="Suggested Sage prompt" value={readString(selectedService.suggested_prompt, 'Ready for Sage')} />
                      </div>
                    </FormSection>

                    <FormSection
                      title="Capture new state"
                      description="Add structured records instead of freeform notes so Sage can reuse them cleanly."
                    >
                      {selectedService.id === 'flashcards' ? (
                        <FormGrid>
                          <FormField label="Deck">
                            <FormInput
                              value={selectedEntryDraft.deck ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, deck: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Topic">
                            <FormInput
                              value={selectedEntryDraft.topic ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, topic: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Front">
                            <FormInput
                              value={selectedEntryDraft.front ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, front: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Back">
                            <FormInput
                              value={selectedEntryDraft.back ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, back: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      {selectedService.id === 'language_coach' ? (
                        <FormGrid>
                          <FormField label="Language">
                            <FormInput
                              value={selectedEntryDraft.language ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, language: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Phrase">
                            <FormInput
                              value={selectedEntryDraft.phrase ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, phrase: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Translation">
                            <FormInput
                              value={selectedEntryDraft.translation ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, translation: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Confidence (1-5)">
                            <FormInput
                              type="number"
                              min={1}
                              max={5}
                              value={selectedEntryDraft.confidence ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, confidence: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Notes">
                            <FormTextarea
                              rows={3}
                              value={selectedEntryDraft.notes ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, notes: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      {selectedService.id === 'nutrition_log' ? (
                        <FormGrid>
                          <FormField label="Meal">
                            <FormInput
                              value={selectedEntryDraft.meal ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, meal: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Calories">
                            <FormInput
                              type="number"
                              value={selectedEntryDraft.calories ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, calories: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Protein (g)">
                            <FormInput
                              type="number"
                              value={selectedEntryDraft.protein_grams ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, protein_grams: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Occurred on">
                            <FormInput
                              type="date"
                              value={selectedEntryDraft.occurred_on ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, occurred_on: value },
                                }));
                              }}
                            />
                          </FormField>
                          <FormField label="Notes">
                            <FormTextarea
                              rows={3}
                              value={selectedEntryDraft.notes ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setEntryDrafts((current) => ({
                                  ...current,
                                  [selectedService.id]: { ...selectedEntryDraft, notes: value },
                                }));
                              }}
                            />
                          </FormField>
                        </FormGrid>
                      ) : null}

                      <div className="app-inline-actions">
                        <AppButton
                          type="button"
                          disabled={mutatingKey === `${selectedService.id}:entry`}
                          onClick={() => {
                            void mutate(
                              `${selectedService.id}:entry`,
                              () => services.client.createSageServiceEntry({
                                serviceId: selectedService.id,
                                entry: payloadFromDraft(selectedService.id, selectedEntryDraft),
                              }),
                              `Added a new ${readString(selectedService.entry_noun, 'item')} to ${readString(selectedService.name, selectedService.id)}.`,
                            );
                            setEntryDrafts((current) => ({
                              ...current,
                              [selectedService.id]: defaultEntryDraft(selectedService.id),
                            }));
                          }}
                        >
                          {mutatingKey === `${selectedService.id}:entry` ? 'Saving…' : `Add ${readString(selectedService.entry_noun, 'item')}`}
                        </AppButton>
                      </div>
                    </FormSection>

                    <FormSection
                      title="Recent state"
                      description="Pinned entries stay prominent for Sage. Recent entries stay available as structured app state."
                    >
                      {Array.isArray(selectedService.entries) && selectedService.entries.length > 0 ? (
                        <DataTable>
                          <DataTableHeader columns="minmax(0, 1.4fr) minmax(10rem, 0.8fr) minmax(7rem, 0.6fr) auto">
                            <DataTableHeaderCell>Entry</DataTableHeaderCell>
                            <DataTableHeaderCell>Updated</DataTableHeaderCell>
                            <DataTableHeaderCell>Status</DataTableHeaderCell>
                            <DataTableHeaderCell align="end">Actions</DataTableHeaderCell>
                          </DataTableHeader>
                          {selectedService.entries.map((item, index) => {
                            const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                            const entryId = readString(record.id, `${selectedService.id}-${index}`);
                            const summary = readString(record.summary, 'Structured entry');
                            const pinned = Boolean(record.pinned);
                            return (
                              <DataTableRow
                                key={entryId}
                                columns="minmax(0, 1.4fr) minmax(10rem, 0.8fr) minmax(7rem, 0.6fr) auto"
                              >
                                <DataTableCell
                                  primary={summary}
                                  secondary={selectedService.id === 'nutrition_log'
                                    ? readString(record.occurred_on, '')
                                    : selectedService.id === 'flashcards'
                                      ? readString(record.topic, '')
                                      : readString(record.notes, '')}
                                />
                                <DataTableCell primary={formatTimestamp(record.updated_at ?? record.created_at)} />
                                <DataTableCell
                                  primary={<DataBadge tone={pinned ? 'success' : 'neutral'}>{pinned ? 'Pinned' : 'Recent'}</DataBadge>}
                                />
                                <DataTableCell
                                  align="end"
                                  primary={(
                                    <div className="app-inline-actions">
                                      <AppButton
                                        type="button"
                                        tone="secondary"
                                        disabled={mutatingKey === `${selectedService.id}:${entryId}:pin`}
                                        onClick={() => {
                                          void mutate(
                                            `${selectedService.id}:${entryId}:pin`,
                                            () => services.client.setSageServiceEntryPinned({
                                              serviceId: selectedService.id,
                                              entryId,
                                              pinned: !pinned,
                                            }),
                                            `${pinned ? 'Unpinned' : 'Pinned'} ${summary}.`,
                                          );
                                        }}
                                      >
                                        {pinned ? 'Unpin' : 'Pin'}
                                      </AppButton>
                                      <AppButton
                                        type="button"
                                        tone="danger"
                                        onClick={() => {
                                          setPendingDelete({
                                            serviceId: selectedService.id,
                                            entryId,
                                            summary,
                                          });
                                        }}
                                      >
                                        Remove
                                      </AppButton>
                                    </div>
                                  )}
                                />
                              </DataTableRow>
                            );
                          })}
                        </DataTable>
                      ) : (
                        <EmptyPanel
                          title="No structured entries yet"
                          body="Add the first card, phrase, or meal above and Sage will start reusing it from this service."
                        />
                      )}
                    </FormSection>

                    <FormSection
                      title="Sage memory view"
                      description="This is the compact state Sage can carry forward without reading a debug dump."
                    >
                      <FormGrid>
                        <FormReadout
                          label="Saved preferences"
                          value={memoryLine(selectedService.memory_snapshot?.preferences)}
                        />
                        <FormReadout
                          label="Active context"
                          value={memoryLine(selectedService.memory_snapshot?.active_context)}
                        />
                        <FormReadout
                          label="App state"
                          value={memoryLine(selectedService.memory_snapshot?.app_state)}
                        />
                      </FormGrid>
                      <div className="app-stack-2">
                        <strong className="app-card-button__title">Recent memory updates</strong>
                        {Array.isArray(selectedService.recent_activity) && selectedService.recent_activity.length > 0 ? (
                          selectedService.recent_activity.map((item, index) => {
                            const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                            return (
                              <div key={readString(record.id, `${selectedService.id}-activity-${index}`)} className="app-card-button">
                                <div className="app-inline-actions app-inline-actions--between app-inline-actions--start">
                                  <strong className="app-card-button__title">{readString(record.summary, 'Memory update')}</strong>
                                  <DataBadge tone="neutral">{readString(record.action, 'recorded')}</DataBadge>
                                </div>
                                <span className="app-card-button__subtitle">{formatTimestamp(record.created_at)}</span>
                              </div>
                            );
                          })
                        ) : (
                          <EmptyPanel
                            title="No memory updates yet"
                            body="As this service writes explicit state, the latest memory updates will appear here."
                          />
                        )}
                      </div>
                    </FormSection>
                  </div>
                )}
              </ListDetailPanel>
            )}
          />
        )}
      </ListDetailShell>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove structured service entry"
        body={pendingDelete ? `Remove ${pendingDelete.summary} from ${pendingDelete.serviceId.replace(/_/g, ' ')}?` : 'Remove this structured service entry?'}
        confirmLabel="Remove entry"
        busy={pendingDelete ? mutatingKey === `${pendingDelete.serviceId}:${pendingDelete.entryId}:delete` : false}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) {
            return;
          }
          void mutate(
            `${pendingDelete.serviceId}:${pendingDelete.entryId}:delete`,
            () => services.client.deleteSageServiceEntry({
              serviceId: pendingDelete.serviceId,
              entryId: pendingDelete.entryId,
            }),
            `Removed ${pendingDelete.summary}.`,
          );
        }}
      />
    </WorkstationSurfaceRoot>
  );
}
