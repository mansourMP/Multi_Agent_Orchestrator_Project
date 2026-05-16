'use client';

import { useState } from 'react';
import { RefreshCw, Plus } from 'lucide-react';

import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
} from '@/lib/ui/form-controls';
import { joinClassNames } from '@/lib/ui/primitives';
import { StateBanner } from '@/lib/ui/state-banner';
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
  formatUsdPer1k,
  formatContextWindow,
  pickStudioModelForTier,
  modelPreferenceScore,
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
  const [modelQuery, setModelQuery] = useState('');
  const selectedProvider = providerCatalog.find((provider) => provider.id === value.providerId) ?? null;
  const selectedModel = selectedProvider?.models.find((model) => model.id === value.modelId) ?? null;
  const selectedTier = STUDIO_AI_TIER_OPTIONS.find((option) => option.value === value.aiTier) ?? STUDIO_AI_TIER_OPTIONS[1];
  const providerReady = providerReadyForStudio(selectedProvider);
  const activeProvider = selectedProvider ?? providerCatalog[0] ?? null;
  const query = modelQuery.trim().toLowerCase();
  const modelOptions = providerCatalog.flatMap((provider) => provider.models.map((model) => ({ provider, model })));
  const filteredModelOptions = modelOptions
    .filter(({ provider, model }) => {
      if (!query) {
        return true;
      }
      return `${provider.label} ${provider.id} ${model.label} ${model.id} ${model.capabilityLabels.join(' ')}`.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      const leftSelected = left.provider.id === value.providerId && left.model.id === value.modelId ? -1 : 0;
      const rightSelected = right.provider.id === value.providerId && right.model.id === value.modelId ? -1 : 0;
      if (leftSelected !== rightSelected) {
        return leftSelected - rightSelected;
      }
      const tierDelta = modelPreferenceScore(left.model, value.aiTier) - modelPreferenceScore(right.model, value.aiTier);
      if (tierDelta !== 0) {
        return tierDelta;
      }
      return `${left.provider.label} ${left.model.label}`.localeCompare(`${right.provider.label} ${right.model.label}`);
    });
  const visibleModelOptions = filteredModelOptions.slice(0, 18);
  const liveModelCount = providerCatalog.reduce((total, provider) => total + provider.models.length, 0);
  const liveProviderCount = providerCatalog.filter((provider) => provider.modelsSource === 'workspace_cached_models').length;
  const catalogModeLabel = liveProviderCount > 0 ? 'Live catalog' : 'Fallback catalog';
  const sourceLabel = selectedProvider?.modelsSource === 'workspace_cached_models'
    ? 'Live catalog'
    : selectedProvider?.modelsSource === 'static_catalog'
      ? 'Fallback catalog'
      : humanizeToken(selectedProvider?.modelsSource, selectedProvider?.modelsSource || 'Catalog');
  function selectProviderModel(providerId: string, modelId: string) {
    onSelectProvider(providerId);
    onSelectModel(modelId);
  }
  return (
    <div className="studio-ai-settings">
      <div className="studio-ai-settings__summary" aria-label="Model setup summary">
        <div>
          <span>Model setup</span>
          <strong>{selectedModel?.label ?? selectedTier.label} · {selectedProvider?.label ?? 'Connect provider'}</strong>
          <p>Connect a provider in Integrations to fetch the live model list. The fallback catalog keeps setup usable before a key is connected.</p>
        </div>
        <div className="studio-ai-settings__badges" aria-label="Model setup constraints">
          <span>{liveProviderCount > 0 ? `${liveModelCount} models` : `${liveModelCount} fallback models`}</span>
          <span>{catalogModeLabel}</span>
        </div>
      </div>

      <section className="studio-ai-settings__section" aria-label="AI quality tier">
        <div className="studio-actions__section-head">
          <div>
            <span>Quality tier</span>
            <strong>Choose the default answer quality</strong>
          </div>
          <small>{selectedTier.label}</small>
        </div>
        <div className="studio-ai-settings__tier-grid" role="radiogroup" aria-label="AI quality tier">
          {STUDIO_AI_TIER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={joinClassNames('studio-ai-settings__tier', value.aiTier === option.value && 'studio-ai-settings__tier--selected')}
              aria-checked={value.aiTier === option.value}
              role="radio"
              onClick={() => onSelectTier(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="studio-ai-settings__section" aria-label="Default model">
        <div className="studio-actions__section-head">
          <div>
            <span>Connected model provider</span>
            <strong>Default model for this agent</strong>
          </div>
          <div className="studio-actions__section-head-actions">
            <small>{providerCatalog.length} provider{providerCatalog.length === 1 ? '' : 's'} · {filteredModelOptions.length} visible model{filteredModelOptions.length === 1 ? '' : 's'}</small>
            {activeProvider && onRefreshProviderModels ? (
              <button type="button" className="studio-actions__link-button" onClick={() => onRefreshProviderModels(activeProvider.id)}>
                <RefreshCw aria-hidden="true" />
                Refresh models
              </button>
            ) : null}
            {onOpenIntegrations ? (
              <button type="button" className="studio-actions__link-button" onClick={onOpenIntegrations}>
                <Plus aria-hidden="true" />
                Connect provider
              </button>
            ) : null}
          </div>
        </div>
        <div className="studio-ai-settings__form">
          {providerCatalog.length === 0 ? (
            <StateBanner
              tone="warning"
              title={isLoadingProviderCatalog ? 'Loading model providers' : 'No model providers connected'}
              detail={isLoadingProviderCatalog ? 'Checking workspace provider catalog.' : 'Connect a provider account before changing the model route.'}
            />
          ) : null}
          <div className="studio-ai-settings__provider-strip" aria-label="Connected providers">
            {providerCatalog.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={joinClassNames('studio-ai-settings__provider-pill', provider.id === value.providerId && 'studio-ai-settings__provider-pill--selected')}
                onClick={() => {
                  const nextModel = pickStudioModelForTier(provider, value.aiTier);
                  selectProviderModel(provider.id, nextModel);
                }}
              >
                <strong>{provider.label}</strong>
                <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} · {provider.modelsSource === 'workspace_cached_models' ? 'live' : 'fallback'}</span>
              </button>
            ))}
          </div>
          <FormField label="Search models" hint="Live models appear after the provider account is connected. Fallback models are used only when discovery is unavailable.">
            <FormInput
              value={modelQuery}
              onChange={(event) => setModelQuery(event.currentTarget.value)}
              placeholder="Search by provider, model, or capability"
              disabled={providerCatalog.length === 0}
            />
          </FormField>
          <div className="studio-ai-settings__model-grid" aria-label="Model choices">
            {visibleModelOptions.length > 0 ? visibleModelOptions.map(({ provider, model }) => {
              const selected = provider.id === value.providerId && model.id === value.modelId;
              const tags = [
                model.supportsReasoning ? 'Reasoning' : null,
                model.supportsTools ? 'Tools' : null,
                model.supportsVision ? 'Vision' : null,
                model.supportsJson ? 'JSON' : null,
                ...model.capabilityLabels,
              ].filter((item): item is string => Boolean(item));
              return (
                <button
                  key={`${provider.id}:${model.id}`}
                  type="button"
                  className={joinClassNames('studio-ai-settings__model-card', selected && 'studio-ai-settings__model-card--selected')}
                  onClick={() => selectProviderModel(provider.id, model.id)}
                >
                  <span>{provider.label}</span>
                  <strong>{model.label}</strong>
                  <small>{formatContextWindow(model.contextWindowTokens)} · {model.pricingKnown ? `${formatUsdPer1k(model.inputCostPer1kUsd)} in / ${formatUsdPer1k(model.outputCostPer1kUsd)} out` : 'Pricing unknown'}</small>
                  {tags.length > 0 ? (
                    <em>{Array.from(new Set(tags)).slice(0, 4).join(' · ')}</em>
                  ) : null}
                </button>
              );
            }) : (
              <StateBanner
                tone="warning"
                title="No models found"
                detail="Refresh the provider catalog or enter a model ID manually."
              />
            )}
          </div>
          <p className="studio-ai-settings__catalog-foot">
            {filteredModelOptions.length > visibleModelOptions.length
              ? `Showing the strongest ${visibleModelOptions.length} matches. Search by provider, model, or capability to narrow the full catalog.`
              : liveProviderCount > 0
                ? 'Live models are synced from connected provider accounts.'
                : 'Connect OpenRouter for the broad marketplace catalog, or connect a direct provider for its live model list.'}
          </p>
          {selectedProvider ? (
            <FormField label="Manual model ID" hint="Use this when the provider supports a model that did not appear in discovery yet.">
              <FormInput
                value={value.modelId}
                onChange={(event) => onSelectModel(event.currentTarget.value)}
                placeholder="provider/model-id or model-id"
              />
            </FormField>
          ) : null}
          <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
            <FormReadout label="Provider connection" value={providerReady ? 'Connected' : humanizeToken(selectedProvider?.state, isLoadingProviderCatalog ? 'Loading' : 'Setup required')} />
            <FormReadout label="Input price" value={selectedModel?.pricingKnown ? formatUsdPer1k(selectedModel.inputCostPer1kUsd) : 'Pricing unknown'} />
            <FormReadout label="Output price" value={selectedModel?.pricingKnown ? formatUsdPer1k(selectedModel.outputCostPer1kUsd) : 'Pricing unknown'} />
            <FormReadout label="Model capacity" value={formatContextWindow(selectedModel?.contextWindowTokens)} />
            <FormReadout
              label="Model capabilities"
              value={selectedModel?.capabilityLabels.length ? selectedModel.capabilityLabels.join(', ') : selectedProvider?.capabilityLabels.join(', ') || 'n/a'}
            />
            <FormReadout label="Catalog status" value={selectedProvider?.modelsError ? 'Refresh failed' : sourceLabel} />
          </FormGrid>
          {selectedProvider?.modelsError ? (
            <StateBanner tone="warning" title="Model refresh failed" detail={selectedProvider.modelsError} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
