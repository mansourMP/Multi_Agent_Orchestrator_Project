'use client';

import { useState } from 'react';

import {
  FormField,
  FormSelect,
} from '@/lib/ui/form-controls';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { DataBadge } from '@/lib/ui/data-table';
import type {
  DetailConfigDraft,
  ProviderCatalogSnapshot,
  WizardState,
} from './types';
import {
  STUDIO_AI_TIER_OPTIONS,
} from './constants';
import {
  humanizeToken,
  pickStudioModelForTier,
  providerReadyForStudio,
} from './utils';

export function AgentAiSettingsSections({
  value,
  providerCatalog,
  isLoadingProviderCatalog,
  onSelectTier,
  onSelectProvider,
  onSelectModel,
  onRefreshProviderModels,
  onOpenIntegrations,
}: {
  value: DetailConfigDraft;
  providerCatalog: ProviderCatalogSnapshot[];
  isLoadingProviderCatalog: boolean;
  onSelectTier: (nextTier: WizardState['aiTier']) => void;
  onSelectProvider: (nextProviderId: string) => void;
  onSelectModel: (nextModelId: string) => void;
  onRefreshProviderModels?: (providerId: string) => void;
  onOpenIntegrations?: () => void;
}) {
  const [showModelBrowser, setShowModelBrowser] = useState(false);
  const usesEmpyralisCredits = !value.providerId || value.providerId === 'empyralis';
  const selectedProvider = providerCatalog.find((provider) => provider.id === value.providerId) ?? null;
  const selectedModel = selectedProvider?.models.find((model) => model.id === value.modelId) ?? null;
  const selectedTier = STUDIO_AI_TIER_OPTIONS.find((option) => option.value === value.aiTier) ?? STUDIO_AI_TIER_OPTIONS[1];
  const providerReady = usesEmpyralisCredits || providerReadyForStudio(selectedProvider);
  const selectedRouteLabel = usesEmpyralisCredits
    ? 'Empyralis Credits'
    : providerReady
      ? selectedProvider?.label ?? 'Connected provider'
      : selectedProvider
        ? `Connect ${selectedProvider.label}`
        : 'Connect AI';
  const selectedRouteDetail = usesEmpyralisCredits
    ? 'Use the workspace credit balance. No API key is required for this agent.'
    : providerReady
      ? 'Provider setup lives in Integrations. This agent will use the selected API route at runtime.'
      : selectedProvider
        ? 'Connect the provider account in Integrations before using it for customers.'
        : 'Connect an API provider before using your own model route.';

  function selectProviderModel(providerId: string, modelId: string) {
    onSelectProvider(providerId);
    onSelectModel(modelId);
  }
  return (
    <div
      className={joinClassNames('studio-ai-settings', isLoadingProviderCatalog && 'studio-ai-settings--loading')}
      aria-busy={isLoadingProviderCatalog}
    >
      {!showModelBrowser ? (
        <section className="studio-ai-settings__route-card">
          <div className="studio-ai-settings__summary">
            <div>
              <span>AI Route</span>
              <strong>{selectedRouteLabel}</strong>
              <p>{selectedRouteDetail}</p>
            </div>
            <div>
              <span>Quality tier</span>
              <strong className="text-live">{selectedTier.label}</strong>
            </div>
            <AppButton type="button" tone="secondary" onClick={() => setShowModelBrowser(true)}>
              Change route
            </AppButton>
          </div>
          <div className="studio-ai-settings__badges">
            <DataBadge tone={providerReady ? 'success' : 'warning'}>{providerReady ? 'Ready' : 'Setup needed'}</DataBadge>
            <DataBadge tone="neutral">{usesEmpyralisCredits ? selectedTier.label : selectedModel?.label ?? 'Model pending'}</DataBadge>
          </div>
        </section>
      ) : (
        <section className="studio-ai-settings__browser">
          <div className="studio-actions__section-head">
            <div>
              <span>Choose AI Route</span>
              <strong>How this assistant thinks</strong>
            </div>
            <AppButton type="button" tone="secondary" onClick={() => setShowModelBrowser(false)}>
              Cancel
            </AppButton>
          </div>

          <div className="studio-ai-settings__choices">
            <button
              type="button"
              className={joinClassNames('studio-ai-settings__choice', usesEmpyralisCredits && 'studio-ai-settings__choice--active')}
              aria-pressed={usesEmpyralisCredits}
              onClick={() => selectProviderModel('', '')}
            >
              <div className="studio-ai-settings__choice-head">
                <strong>Empyralis Credits</strong>
                <DataBadge tone="success">Recommended</DataBadge>
              </div>
              <p>Fast and platform-managed. No API keys required. Uses your workspace credit balance.</p>
            </button>

            <button
              type="button"
              className={joinClassNames('studio-ai-settings__choice', value.providerId && value.providerId !== 'empyralis' && 'studio-ai-settings__choice--active')}
              aria-pressed={Boolean(value.providerId && value.providerId !== 'empyralis')}
              onClick={() => {
                if (providerCatalog.length > 0) {
                  const firstReady = providerCatalog.find((provider) => providerReadyForStudio(provider)) ?? providerCatalog[0];
                  if (firstReady) {
                    selectProviderModel(firstReady.id, firstReady.defaultModel || firstReady.models[0]?.id || '');
                  }
                } else {
                  onOpenIntegrations?.();
                }
              }}
            >
              <div className="studio-ai-settings__choice-head">
                <strong>Connect Your Own Provider</strong>
              </div>
              <p>Bring your own API keys for OpenAI, Anthropic, Gemini, or DeepSeek. Configure in Integrations.</p>
            </button>
          </div>

          {usesEmpyralisCredits && (
            <div className="studio-ai-settings__section">
              <div className="studio-actions__section-head">
                <span>Quality tier</span>
                <strong>Choose answer quality</strong>
              </div>
              <div className="studio-ai-settings__tier-grid">
                {STUDIO_AI_TIER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={joinClassNames('studio-ai-settings__tier', value.aiTier === option.value && 'studio-ai-settings__tier--selected')}
                    onClick={() => onSelectTier(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {value.providerId && value.providerId !== 'empyralis' && (
            <div className="studio-ai-settings__byok app-stack-3">
              <FormField label="AI Provider" hint="Select the provider you have configured in Integrations.">
                <FormSelect
                  value={value.providerId}
                  onChange={(event) => {
                    const nextProviderId = event.currentTarget.value;
                    const provider = providerCatalog.find((item) => item.id === nextProviderId);
                    const nextModelId = provider ? pickStudioModelForTier(provider, value.aiTier) : '';
                    selectProviderModel(nextProviderId, nextModelId);
                  }}
                >
                  <option value="">Select a provider</option>
                  {providerCatalog.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({humanizeToken(p.state)})</option>
                  ))}
                </FormSelect>
              </FormField>

              {selectedProvider && (
                <FormField label="Model" hint="Choose the specific model from this provider.">
                  <FormSelect
                    value={value.modelId}
                    onChange={(event) => onSelectModel(event.currentTarget.value)}
                  >
                    {selectedProvider.models.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </FormSelect>
                </FormField>
              )}

              <div className="app-inline-actions">
                {selectedProvider && onRefreshProviderModels ? (
                  <AppButton type="button" tone="secondary" onClick={() => onRefreshProviderModels(selectedProvider.id)}>
                    Refresh models
                  </AppButton>
                ) : null}
                <p className="app-surface-field-help">
                  To add a new provider, go to <button type="button" className="app-link-button" onClick={() => onOpenIntegrations?.()}>Integrations</button>.
                </p>
              </div>
            </div>
          )}

          <div className="app-inline-actions">
            <AppButton type="button" onClick={() => setShowModelBrowser(false)}>
              Apply route
            </AppButton>
          </div>
        </section>
      )}
    </div>
  );
}
