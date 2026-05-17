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
  const readyProviders = providerCatalog.filter((provider) => providerReadyForStudio(provider));
  const firstReadyProvider = readyProviders[0] ?? providerCatalog[0] ?? null;
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
  const selectedModelLabel = usesEmpyralisCredits
    ? `${selectedTier.label} quality`
    : (selectedModel?.label ?? value.modelId) || 'Choose a model';
  const selectedModelDetail = usesEmpyralisCredits
    ? 'Empyralis manages routing, billing, and provider reliability for this agent.'
    : providerReady
      ? `${selectedProvider?.label ?? 'Provider'} API account. Pricing follows the provider route.`
      : 'Provider connection is required before this route can answer customers.';

  function selectProviderModel(providerId: string, modelId: string) {
    onSelectProvider(providerId);
    onSelectModel(modelId);
  }
  return (
    <div
      className={joinClassNames('studio-ai-settings', isLoadingProviderCatalog && 'studio-ai-settings--loading')}
      aria-busy={isLoadingProviderCatalog}
    >
      <section className="studio-ai-settings__route-overview" aria-label="AI route options">
        <div className="studio-ai-settings__route-grid">
          <button
            type="button"
            className={joinClassNames('studio-ai-settings__route-option', usesEmpyralisCredits && 'studio-ai-settings__route-option--selected')}
            aria-pressed={usesEmpyralisCredits}
            onClick={() => selectProviderModel('', '')}
          >
            <div className="studio-ai-settings__route-option-head">
              <span>Managed route</span>
              <DataBadge tone="success">Recommended</DataBadge>
            </div>
            <strong>Empyralis Credits</strong>
            <p>Best for non-technical teams. Empyralis handles the API model route and usage accounting.</p>
          </button>

          <button
            type="button"
            className={joinClassNames('studio-ai-settings__route-option', !usesEmpyralisCredits && 'studio-ai-settings__route-option--selected')}
            aria-pressed={!usesEmpyralisCredits}
            onClick={() => {
              if (firstReadyProvider) {
                selectProviderModel(firstReadyProvider.id, firstReadyProvider.defaultModel || firstReadyProvider.models[0]?.id || '');
              } else {
                onOpenIntegrations?.();
              }
            }}
          >
            <div className="studio-ai-settings__route-option-head">
              <span>Bring your own key</span>
              <DataBadge tone={readyProviders.length > 0 ? 'success' : 'neutral'}>
                {readyProviders.length > 0 ? `${readyProviders.length} ready` : 'Connect'}
              </DataBadge>
            </div>
            <strong>Custom API Account</strong>
            <p>Use OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, or another connected API provider.</p>
          </button>
        </div>

        <div className="studio-ai-settings__quality-card">
          <div className="studio-actions__section-head">
            <div>
              <span>Quality</span>
              <strong>Default answer quality</strong>
            </div>
            <small>{selectedTier.label}</small>
          </div>
          <div className="studio-ai-settings__tier-grid studio-ai-settings__tier-grid--segmented">
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

        <section className="studio-ai-settings__selected-card">
          <div className="studio-ai-settings__selected-copy">
            <span>Selected route</span>
            <strong>{selectedRouteLabel}</strong>
            <p>{selectedRouteDetail}</p>
          </div>
          <div className="studio-ai-settings__selected-copy">
            <span>Default model</span>
            <strong>{selectedModelLabel}</strong>
            <p>{selectedModelDetail}</p>
          </div>
          <div className="studio-ai-settings__selected-actions">
            <DataBadge tone={providerReady ? 'success' : 'warning'}>{providerReady ? 'Ready' : 'Setup needed'}</DataBadge>
            <AppButton type="button" tone="secondary" onClick={() => setShowModelBrowser((current) => !current)}>
              {showModelBrowser ? 'Hide model list' : 'Change model'}
            </AppButton>
          </div>
        </section>
      </section>

      {showModelBrowser ? (
        <section className="studio-ai-settings__browser">
          <div className="studio-actions__section-head">
            <div>
              <span>Model catalog</span>
              <strong>Choose a connected API model</strong>
            </div>
            <small>{providerCatalog.length} provider{providerCatalog.length === 1 ? '' : 's'}</small>
          </div>

          {value.providerId && value.providerId !== 'empyralis' ? (
            <div className="studio-ai-settings__byok">
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
          ) : (
            <div className="studio-ai-settings__catalog-empty">
              <strong>Using Empyralis Credits</strong>
              <p>The direct model catalog is only needed when this agent uses your own API account.</p>
              <AppButton type="button" tone="secondary" onClick={() => {
                if (firstReadyProvider) {
                  selectProviderModel(firstReadyProvider.id, firstReadyProvider.defaultModel || firstReadyProvider.models[0]?.id || '');
                } else {
                  onOpenIntegrations?.();
                }
              }}>
                {firstReadyProvider ? 'Use connected provider' : 'Connect provider'}
              </AppButton>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
