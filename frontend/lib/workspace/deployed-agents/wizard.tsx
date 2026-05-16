'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { CommandSheet } from '@/lib/ui/command-sheet';
import {
  FormField,
  FormGrid,
  FormInput,
  FormReadout,
  FormSelect,
  FormTextarea,
} from '@/lib/ui/form-controls';
import { ModalSection } from '@/lib/ui/modal';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StateBanner } from '@/lib/ui/state-banner';
import type {
  DeployedAgentRecord,
} from '@/lib/workspace/workstation-client';
import { WorkspaceChannelPairingSurface } from '@/lib/workspace/workspace-channel-pairing-surface';
import type {
  LaunchReadinessItem,
  ProviderCatalogSnapshot,
  RuntimeAttachmentSnapshot,
  StudioTemplate,
  TelegramReadinessSnapshot,
  WizardMode,
  WizardState,
} from './types';
import {
  CREATE_AGENT_WIZARD_STEPS,
  CUSTOM_STUDIO_TEMPLATE,
  DEFAULT_SAFE_MONTHLY_COST_CAP_USD,
  DEFAULT_STUDIO_TEMPLATE,
  DEPLOYED_AGENT_WIZARD_STEPS,
  STUDIO_AI_TIER_OPTIONS,
  STUDIO_APPROVAL_MODE_OPTIONS,
  STUDIO_DEFAULT_RUNTIME_PLACEMENT,
  STUDIO_RUNTIME_OPTIONS,
  STUDIO_TOOL_OPTIONS,
} from './constants';
import {
  AgentLaunchChecklist,
  AgentSafetySummary,
  ContextPresetControl,
  RetentionPresetControl,
  RuntimeModeSelector,
} from './components';
import {
  readString,
  readRecord,
  readNumber,
  normalizeRuntimeAttachments,
  selfHostedNodeGateReason,
  selfHostedNodeHealthLabel,
  formatRelativeTime,
  formatUsdPer1k,
  formatContextWindow,
  humanizeToken,
  parseKnowledgeSources,
  studioTemplateById,
  applyStudioTemplate,
  readProviderCatalogItems,
  normalizeProviderCatalog,
  normalizeTelegramReadiness,
  selectedProviderId,
  selectedModelId,
  providerCatalogById,
  formatDeploymentModelLabel,
  inferAiTierFromProviderModel,
  normalizeWizardAiTier,
  runtimeTargetForPlacement,
  runtimeSupplierForPlacement,
  applyApprovalModeToWizardState,
  pickStudioModelForTier,
  resolveProviderModelForTier,
  applyProviderCatalogDefaults,
  buildWizardState,
  buildCreateDraftWizardState,
  buildChannelPayload,
  buildDeploymentConfig,
  summarizeStudioErrorMessage,
} from './utils';

export interface AgentWizardProps {
  open: boolean;
  mode: WizardMode;
  onClose: () => void;
  initialState?: WizardState;
  templateId?: string;
  onSuccess: (record: DeployedAgentRecord) => void;
  workspaceId: string;
  bootstrap: any;
  services: any;
  providerCatalog: ProviderCatalogSnapshot[];
  runtimeAttachments: RuntimeAttachmentSnapshot[];
  isLoadingProviderCatalog: boolean;
  isLoadingRuntimeAttachments: boolean;
  selectedAgent?: DeployedAgentRecord | null;
}

export function AgentWizard({
  open,
  mode,
  onClose,
  initialState,
  templateId,
  onSuccess,
  workspaceId,
  bootstrap,
  services,
  providerCatalog,
  runtimeAttachments,
  isLoadingProviderCatalog,
  isLoadingRuntimeAttachments,
  selectedAgent,
}: AgentWizardProps) {
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(() => initialState ?? buildWizardState(null));
  const [wizardErrorMessage, setWizardErrorMessage] = useState<string | null>(null);
  const [isSubmittingWizard, setIsSubmittingWizard] = useState(false);
  const [isTelegramSetupOpen, setIsTelegramSetupOpen] = useState(false);
  const [selectedTelegramReadiness, setSelectedTelegramReadiness] = useState<TelegramReadinessSnapshot | null>(null);
  const [isLoadingTelegramReadiness, setIsLoadingTelegramReadiness] = useState(false);

  const activeWizardSteps = mode === 'create' ? CREATE_AGENT_WIZARD_STEPS : DEPLOYED_AGENT_WIZARD_STEPS;
  const wizardStep = activeWizardSteps[Math.min(wizardStepIndex, activeWizardSteps.length - 1)] ?? activeWizardSteps[0];

  const providerCatalogIndex = useMemo(
    () => providerCatalogById(providerCatalog),
    [providerCatalog],
  );

  const selectedProviderCatalog = useMemo(
    () => providerCatalogIndex[wizardState.providerId] ?? null,
    [providerCatalogIndex, wizardState.providerId],
  );

  const selectedProviderModelCatalog = useMemo(
    () => selectedProviderCatalog?.models.find((item) => item.id === wizardState.modelId) ?? null,
    [selectedProviderCatalog, wizardState.modelId],
  );

  const selfHostedNodeOptions = useMemo(
    () => runtimeAttachments
      .filter((item) => item.runtimeProfileId)
      .sort((left, right) => left.label.localeCompare(right.label)),
    [runtimeAttachments],
  );

  const selectedSelfHostedNode = useMemo(
    () => selfHostedNodeOptions.find((item) => item.runtimeProfileId === wizardState.selfHostedRuntimeProfileId) ?? null,
    [selfHostedNodeOptions, wizardState.selfHostedRuntimeProfileId],
  );

  const selfHostedWizardNodeBlocker = useMemo(() => {
    if (wizardState.runtimePlacement !== 'customer_hosted') {
      return null;
    }
    return selfHostedNodeGateReason(selectedSelfHostedNode);
  }, [selectedSelfHostedNode, wizardState.runtimePlacement]);

  const selectedStudioTemplate = useMemo(
    () => studioTemplateById(templateId),
    [templateId],
  );

  const selectedWizardConnector = useMemo(
    () => selectedTelegramReadiness?.connectors.find((item) => item.id === wizardState.telegramConnectorId) ?? null,
    [selectedTelegramReadiness, wizardState.telegramConnectorId],
  );

  const hasGatewayOnlineTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target: any) => target.id === 'local_companion' && target.online),
    [bootstrap.runtime.runtimeTargets],
  );
  const hasCloudComputerAvailableTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target: any) => target.id === 'sage_cloud_computer' && target.available),
    [bootstrap.runtime.runtimeTargets],
  );
  const editAgentId = readString(selectedAgent?.id);

  async function loadTelegramReadiness(agentId?: string | null) {
    setIsLoadingTelegramReadiness(true);
    try {
      const payload = await services.client.getDeployedAgentTelegramReadiness({
        deployedAgentId: agentId || undefined,
        allowMissing: true,
      });
      const nextReadiness = normalizeTelegramReadiness(payload as any);
      setSelectedTelegramReadiness(nextReadiness);
    } catch (error) {
      setSelectedTelegramReadiness(null);
    } finally {
      setIsLoadingTelegramReadiness(false);
    }
  }

  useEffect(() => {
    if (open) {
      if (initialState) {
        setWizardState(initialState);
      } else if (mode === 'edit' && selectedAgent) {
        setWizardState(buildWizardState(selectedAgent));
      } else if (mode === 'create') {
        const template = studioTemplateById(templateId);
        setWizardState(applyProviderCatalogDefaults({
          ...applyStudioTemplate(buildWizardState(null), template),
          customerChannel: 'draft',
          telegramEnabled: false,
          telegramConnectorId: '',
          telegramEndpointKey: '',
          runtimePlacement: STUDIO_DEFAULT_RUNTIME_PLACEMENT,
          runtimeTarget: runtimeTargetForPlacement(STUDIO_DEFAULT_RUNTIME_PLACEMENT),
          runtimeSupplierKind: runtimeSupplierForPlacement(STUDIO_DEFAULT_RUNTIME_PLACEMENT),
          selfHostedRuntimeProfileId: '',
          selfHostedPrivacyAccepted: false,
          selfHostedSafetyAccepted: false,
          computerAutomationEnabled: false,
        }, providerCatalog));
      }
      setWizardStepIndex(0);
      setWizardErrorMessage(null);
      setIsTelegramSetupOpen(false);
      void loadTelegramReadiness(mode === 'edit' ? editAgentId : null);
    }
  }, [open, mode, initialState, selectedAgent, editAgentId, templateId]);

  useEffect(() => {
    if (!open || !isTelegramSetupOpen) {
      return;
    }
    const connectors = selectedTelegramReadiness?.connectors ?? [];
    if (connectors.length === 0) {
      return;
    }
    const nextConnector = connectors[0];
    setWizardState((current) => ({
      ...current,
      telegramEnabled: true,
      telegramConnectorId: current.telegramConnectorId.trim() || nextConnector.id,
      telegramEndpointKey: current.telegramEndpointKey.trim() || (nextConnector.endpointKey ?? ''),
    }));
    setIsTelegramSetupOpen(false);
  }, [isTelegramSetupOpen, open, selectedTelegramReadiness]);

  useEffect(() => {
    if (!open || !isTelegramSetupOpen) {
      return;
    }
    const agentId = mode === 'edit' ? editAgentId : undefined;
    const intervalId = window.setInterval(() => {
      void loadTelegramReadiness(agentId);
    }, 3000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTelegramSetupOpen, open, mode, editAgentId]);

  function setWizardField<K extends keyof WizardState>(field: K, value: WizardState[K]) {
    setWizardErrorMessage(null);
    setWizardState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function persistWizard() {
    const stateForSave = mode === 'create' ? buildCreateDraftWizardState(wizardState) : wizardState;
    if (mode === 'create') {
      const name = stateForSave.name.trim();
      if (!name) {
        setWizardErrorMessage('Name the agent before creating it.');
        return;
      }
      setIsSubmittingWizard(true);
      setWizardErrorMessage(null);
      try {
        const route = resolveProviderModelForTier(stateForSave.aiTier, providerCatalog);
        const created = await services.client.createDeployedAgent({
          name,
          avatar: null,
          persona: stateForSave.persona,
          systemPrompt: stateForSave.systemPrompt,
          channels: {},
          knowledgeSources: [],
          runtimeTarget: 'cloud',
          billingPlan: 'free',
          config: {
            studio_agent_mode: 'text_agent',
            runtime_placement: 'managed_cloud',
            runtime_target: 'cloud',
            runtime_supplier: 'empyralis',
            tool_policy: {
              enabled_tools: [],
            },
            memory_policy: {
              memory_enabled: false,
              context_budget_preset: 'balanced',
              retention_preset: 'standard',
            },
            escalation_policy: {
              preset: 'standard',
              handoff_mode: 'notify_owner',
            },
            commerce_policy: {
              monthly_cost_cap_usd: Number(DEFAULT_SAFE_MONTHLY_COST_CAP_USD),
            },
            computer_automation: {
              enabled: false,
            },
          },
          metadata: {
            customer_channel: 'draft',
            runtime_placement: 'managed_cloud',
            runtime_supplier: 'empyralis',
            computer_automation_enabled: false,
            selected_tool_ids: [],
            memory_enabled: false,
            monthly_cost_cap_usd: Number(DEFAULT_SAFE_MONTHLY_COST_CAP_USD),
            escalation_preset: 'standard',
            handoff_mode: 'notify_owner',
          },
          provider: route.providerId || null,
          model: route.modelId || null,
        });
        onSuccess(created as DeployedAgentRecord);
      } catch (error) {
        setWizardErrorMessage(error instanceof Error ? error.message : 'The agent could not be created.');
      } finally {
        setIsSubmittingWizard(false);
      }
      return;
    }

    const dailyMessageLimit = stateForSave.dailyMessageLimit.trim();
    const monthlyCostCapUsd = stateForSave.monthlyCostCapUsd.trim();
    const route = resolveProviderModelForTier(stateForSave.aiTier, providerCatalog);
    const resolvedProviderId = route.providerId || stateForSave.providerId || null;
    const resolvedModelId = route.modelId || stateForSave.modelId || null;

    if (dailyMessageLimit) {
      const parsedLimit = Number(dailyMessageLimit);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
        setWizardErrorMessage('Daily message limit must be a whole number greater than zero.');
        return;
      }
      if (!stateForSave.upgradeCtaLabel.trim()) {
        setWizardErrorMessage('Add an upgrade CTA label when a daily message limit is enabled.');
        return;
      }
      if (!stateForSave.upgradeCtaUrl.trim()) {
        setWizardErrorMessage('Add an upgrade CTA URL when a daily message limit is enabled.');
        return;
      }
    }
    if (monthlyCostCapUsd) {
      const parsedCap = Number(monthlyCostCapUsd);
      if (!Number.isFinite(parsedCap) || parsedCap <= 0) {
        setWizardErrorMessage('Monthly cost cap must be a number greater than zero.');
        return;
      }
    }
    if (stateForSave.computerAutomationEnabled) {
      if (!stateForSave.computerAutomationAllowedDomains.trim()) {
        setWizardErrorMessage('Computer Automation needs at least one allowed domain.');
        return;
      }
      const parsedSessions = Number(stateForSave.computerAutomationMaxSessions.trim());
      if (!Number.isFinite(parsedSessions) || parsedSessions < 1) {
        setWizardErrorMessage('Computer Automation needs at least one allowed session.');
        return;
      }
    }
    if (stateForSave.runtimePlacement === 'customer_hosted') {
      if (!stateForSave.selfHostedRuntimeProfileId.trim()) {
        setWizardErrorMessage('Self-hosted mode requires selecting a self-hosted node.');
        return;
      }
      if (selfHostedWizardNodeBlocker) {
        setWizardErrorMessage(selfHostedWizardNodeBlocker);
        return;
      }
      if (!stateForSave.selfHostedPrivacyAccepted) {
        setWizardErrorMessage('Accept the privacy contract before saving a self-hosted assistant.');
        return;
      }
      if (!stateForSave.selfHostedSafetyAccepted) {
        setWizardErrorMessage('Accept the safety contract before saving a self-hosted assistant.');
        return;
      }
    }
    if (stateForSave.customerChannel === 'telegram' && stateForSave.telegramEnabled && !stateForSave.telegramConnectorId.trim()) {
      setWizardErrorMessage('Choose a Telegram connected app before saving a live-ready assistant.');
      return;
    }

    const approvalPolicy = applyApprovalModeToWizardState(stateForSave.approvalMode, {
      escalationPreset: stateForSave.escalationPreset,
      handoffMode: stateForSave.handoffMode,
    });
    const resolvedRuntimeTarget = runtimeTargetForPlacement(stateForSave.runtimePlacement);

    const payload = {
      name: stateForSave.name.trim(),
      avatar: stateForSave.avatar.trim() || null,
      persona: stateForSave.persona.trim(),
      systemPrompt: stateForSave.systemPrompt.trim(),
      channels: buildChannelPayload(stateForSave),
      knowledgeSources: parseKnowledgeSources(stateForSave.knowledgeSourceText),
      runtimeTarget: resolvedRuntimeTarget,
      runtimeProfileId: stateForSave.runtimePlacement === 'customer_hosted'
        ? stateForSave.selfHostedRuntimeProfileId.trim() || null
        : null,
      billingPlan: stateForSave.billingPlan,
      provider: resolvedProviderId,
      model: resolvedModelId,
      config: buildDeploymentConfig({
        ...stateForSave,
        runtimeTarget: resolvedRuntimeTarget,
        escalationPreset: approvalPolicy.escalationPreset,
        handoffMode: approvalPolicy.handoffMode,
      }),
      metadata: {
        public_tier: stateForSave.aiTier,
        model_tier: stateForSave.aiTier,
        empyralis_model_tier: stateForSave.aiTier,
        runtime_placement: stateForSave.runtimePlacement,
        runtime_supplier: runtimeSupplierForPlacement(stateForSave.runtimePlacement),
        computer_automation_enabled: stateForSave.computerAutomationEnabled,
        approval_mode: stateForSave.approvalMode,
        customer_channel: stateForSave.customerChannel,
        self_hosted_runtime_profile_id: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedRuntimeProfileId.trim() || null
          : null,
        self_hosted_privacy_contract_accepted: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedPrivacyAccepted
          : null,
        self_hosted_safety_contract_accepted: stateForSave.runtimePlacement === 'customer_hosted'
          ? stateForSave.selfHostedSafetyAccepted
          : null,
      },
    };

    if (!payload.name) {
      setWizardErrorMessage('An assistant needs a public name before it can be saved.');
      return;
    }

    setIsSubmittingWizard(true);
    setWizardErrorMessage(null);
    try {
      const agentId = editAgentId;
      if (!agentId) {
        throw new Error('Select an assistant before editing it.');
      }
      const updated = await services.client.updateDeployedAgent({
        deployedAgentId: agentId,
        ...payload,
      });
      onSuccess(updated as DeployedAgentRecord);
    } catch (error) {
      setWizardErrorMessage(error instanceof Error ? error.message : 'The assistant could not be saved.');
    } finally {
      setIsSubmittingWizard(false);
    }
  }

  return (
    <CommandSheet
      open={open}
      title={mode === 'create' ? 'Create agent' : 'Edit agent'}
      description={
        mode === 'create'
          ? 'Start with a deploy-safe draft. Add knowledge, integrations, and channels after it exists.'
          : 'Adjust the agent profile, knowledge, customer channel, and safety behavior.'
      }
      onClose={onClose}
      actions={(
        <div className="app-inline-actions">
          {wizardStepIndex > 0 ? (
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => setWizardStepIndex((current) => Math.max(0, current - 1))}
              disabled={isSubmittingWizard}
            >
              Back
            </AppButton>
          ) : null}
          {wizardStepIndex < activeWizardSteps.length - 1 ? (
            <AppButton
              type="button"
              onClick={() => setWizardStepIndex((current) => Math.min(activeWizardSteps.length - 1, current + 1))}
              disabled={isSubmittingWizard}
            >
              Continue
            </AppButton>
          ) : (
            <AppButton
              type="button"
              onClick={() => {
                void persistWizard();
              }}
              disabled={isSubmittingWizard}
            >
              {mode === 'create' ? 'Create agent' : 'Save'}
            </AppButton>
          )}
        </div>
      )}
    >
      <div data-deployed-agent-wizard="root" className="deployed-agents-wizard">
        {activeWizardSteps.length > 1 ? (
          <div className="deployed-agents-wizard__steps">
            {activeWizardSteps.map((step, index) => (
              <button
                type="button"
                key={step.id}
                data-deployed-agent-wizard-step={step.id}
                className="deployed-agents-wizard__step"
                data-active={index === wizardStepIndex ? 'true' : 'false'}
                disabled={isSubmittingWizard}
                onClick={() => setWizardStepIndex(index)}
              >
                <span className="deployed-agents-wizard__step-eyebrow">
                  Step {index + 1}
                </span>
                <strong className="deployed-agents-wizard__step-title">{step.label}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {summarizeStudioErrorMessage(wizardErrorMessage) ? (
          <StateBanner tone="warning" title="Agent setup needs attention">
            {summarizeStudioErrorMessage(wizardErrorMessage)}
          </StateBanner>
        ) : null}

        <ModalSection title={wizardStep.label} description={wizardStep.description}>
          {wizardStep.id === 'overview' ? (
            mode === 'create' ? (
              <div className="deployed-agents-wizard__create-draft">
                <div className="deployed-agents-wizard__quickstart">
                  <FormField label="Agent name" hint="The name your team sees in the agent list.">
                    <FormInput
                      value={wizardState.name}
                      onChange={(event) => setWizardField('name', event.currentTarget.value)}
                      placeholder="New agent"
                    />
                  </FormField>
                </div>
              </div>
            ) : (
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Assistant name" hint="The public name customers will see.">
                  <FormInput
                    value={wizardState.name}
                    onChange={(event) => setWizardField('name', event.currentTarget.value)}
                    placeholder="Bluebird Cafe"
                  />
                </FormField>
                <FormField label="Avatar URL" hint="Optional public avatar or brand mark.">
                  <FormInput
                    value={wizardState.avatar}
                    onChange={(event) => setWizardField('avatar', event.currentTarget.value)}
                    placeholder="https://example.com/avatar.png"
                  />
                </FormField>
                <FormField label="Personality" hint="Short description of how this assistant should speak and behave.">
                  <FormTextarea
                    rows={4}
                    value={wizardState.persona}
                    onChange={(event) => setWizardField('persona', event.currentTarget.value)}
                    placeholder="Fast, friendly customer assistant for a cafe, clinic, shop, or support desk."
                  />
                  <div className="deployed-agents-wizard__memory-toggle">
                    <div className="sage-tool-row__copy">
                      <strong className="sage-tool-row__title">Enable persistent memory</strong>
                      <p className="sage-tool-row__description">Assistant remembers useful customer facts across conversations.</p>
                    </div>
                    <button
                      type="button"
                      className={joinClassNames('sage-tool-toggle', wizardState.memoryEnabled && 'sage-tool-toggle--enabled')}
                      role="switch"
                      aria-checked={wizardState.memoryEnabled}
                      onClick={() => setWizardField('memoryEnabled', !wizardState.memoryEnabled)}
                    >
                      <span className="sage-tool-toggle__thumb" />
                    </button>
                  </div>
                </FormField>
                <FormField label="Purpose and behavior" hint="Core customer instructions this assistant follows.">
                  <FormTextarea
                    rows={6}
                    value={wizardState.systemPrompt}
                    onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                    placeholder="Answer menu questions, check specials and availability, confirm orders clearly, and escalate edge cases to a human."
                  />
                </FormField>
                <FormField label="Knowledge references" hint="Menu, catalog, FAQ, or Google Sheet references, one per line.">
                  <FormTextarea
                    rows={6}
                    value={wizardState.knowledgeSourceText}
                    onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                    placeholder={'kb://menu-pdf\nsheet://daily-menu'}
                  />
                  <ContextPresetControl
                    value={wizardState.contextBudgetPreset}
                    onSelect={(nextValue) => setWizardField('contextBudgetPreset', nextValue)}
                  />
                </FormField>
              </FormGrid>
            )
          ) : null}

          {wizardStep.id === 'knowledge' ? (
            <div className="app-stack-3">
              <FormField label="Knowledge source" hint="Paste a sheet, PDF, document, URL, or leave empty and add it later.">
                <FormTextarea
                  rows={5}
                  value={wizardState.knowledgeSourceText}
                  onChange={(event) => setWizardField('knowledgeSourceText', event.currentTarget.value)}
                  placeholder={selectedStudioTemplate.knowledgePlaceholder}
                />
              </FormField>
              <FormField label="Instructions" hint="Specific rules this assistant must follow when answering customers.">
                <FormTextarea
                  data-deployed-agent-instructions-input="true"
                  rows={6}
                  value={wizardState.systemPrompt}
                  onChange={(event) => setWizardField('systemPrompt', event.currentTarget.value)}
                  placeholder={selectedStudioTemplate.systemPrompt}
                />
              </FormField>
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Public intro" hint="Optional customer-facing intro for mini-app or channel entry points.">
                  <FormTextarea
                    rows={3}
                    value={wizardState.welcomeIntro}
                    onChange={(event) => setWizardField('welcomeIntro', event.currentTarget.value)}
                    placeholder="Quickly ask questions, check availability, and get help."
                  />
                </FormField>
                <FormField label="Core value" hint="One sentence explaining what this assistant does for customers.">
                  <FormTextarea
                    rows={3}
                    value={wizardState.welcomeCoreValue}
                    onChange={(event) => setWizardField('welcomeCoreValue', event.currentTarget.value)}
                    placeholder={selectedStudioTemplate.outcome}
                  />
                </FormField>
              </FormGrid>
            </div>
          ) : null}

          {wizardStep.id === 'tools' ? (
            <div className="app-stack-3">
              <FormField label="Actions this assistant can take" hint="Keep this narrow. Add only the actions needed for the job.">
                <div className="deployed-agents-wizard__tool-grid">
                  {STUDIO_TOOL_OPTIONS.map((tool) => {
                    const selected = wizardState.selectedToolIds.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={joinClassNames(
                          'deployed-agents-wizard__tool-card',
                          selected && 'deployed-agents-wizard__tool-card--selected',
                        )}
                        aria-pressed={selected}
                        onClick={() => {
                          setWizardState((current) => {
                            const nextSelectedToolIds = current.selectedToolIds.includes(tool.id)
                              ? current.selectedToolIds.filter((item) => item !== tool.id)
                              : [...current.selectedToolIds, tool.id];
                            return {
                              ...current,
                              selectedToolIds: nextSelectedToolIds,
                            };
                          });
                        }}
                      >
                        <span>{selected ? 'Enabled' : 'Disabled'}</span>
                        <strong>{tool.label}</strong>
                        <small>{tool.description}</small>
                      </button>
                    );
                  })}
                </div>
              </FormField>
            </div>
          ) : null}

          {wizardStep.id === 'channels' ? (
            <div className="app-stack-3">
              {selectedTelegramReadiness ? (
                <StateBanner
                  tone={selectedTelegramReadiness.readyForLive ? 'success' : selectedTelegramReadiness.blockers.length > 0 ? 'warning' : 'neutral'}
                  title={selectedTelegramReadiness.readyForLive ? 'Telegram launch path is ready' : 'Telegram launch checks'}
                  detail={selectedTelegramReadiness.nextAction ?? 'Connected app checks are in progress.'}
                >
                  {selectedTelegramReadiness.blockers.length > 0
                    ? selectedTelegramReadiness.blockers.map((item) => item.message).join(' · ')
                    : selectedTelegramReadiness.warnings.map((item) => item.message).join(' · ') || `${selectedTelegramReadiness.connectors.length} connected app${selectedTelegramReadiness.connectors.length === 1 ? '' : 's'} checked.`}
                </StateBanner>
              ) : isLoadingTelegramReadiness ? (
                <SkeletonBlock height="5rem" />
              ) : null}
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Telegram state" hint="Enable Telegram when this assistant is ready for live customer conversations.">
                  <FormSelect
                    value={wizardState.telegramEnabled ? 'enabled' : 'disabled'}
                    onChange={(event) => {
                      const enabled = event.currentTarget.value === 'enabled';
                      setWizardState((current) => ({
                        ...current,
                        telegramEnabled: enabled,
                        customerChannel: enabled
                          ? 'telegram'
                          : (current.customerChannel === 'telegram' ? 'draft' : current.customerChannel),
                      }));
                    }}
                  >
                    <option value="disabled">Keep disabled</option>
                    <option value="enabled">Ready for live deploy</option>
                  </FormSelect>
                </FormField>
                <FormField label="Telegram connected app" hint="Bind to one workspace Telegram bot.">
                  <FormSelect
                    value={wizardState.telegramConnectorId}
                    onChange={(event) => {
                      const nextConnectorId = event.currentTarget.value;
                      const nextConnector = selectedTelegramReadiness?.connectors.find((item) => item.id === nextConnectorId) ?? null;
                      setWizardState((current) => ({
                        ...current,
                        telegramConnectorId: nextConnectorId,
                        telegramEndpointKey: nextConnector?.endpointKey ?? '',
                      }));
                    }}
                    disabled={!wizardState.telegramEnabled || isLoadingTelegramReadiness}
                  >
                    <option value="">
                      {isLoadingTelegramReadiness
                        ? 'Checking Telegram connected apps…'
                        : selectedTelegramReadiness?.connectors.length
                          ? 'Select a Telegram bot'
                          : 'No Telegram connected apps available'}
                    </option>
                    {(selectedTelegramReadiness?.connectors ?? []).map((connector) => (
                      <option key={connector.id} value={connector.id}>
                        {connector.label}
                      </option>
                    ))}
                  </FormSelect>
                </FormField>
              </FormGrid>
              {!isLoadingTelegramReadiness && (selectedTelegramReadiness?.connectors.length ?? 0) === 0 ? (
                <div className="app-stack-3">
                  <StateBanner tone="neutral" title="No Telegram bot connected yet.">
                    Build needs one Telegram bot before this assistant can go live.
                  </StateBanner>
                  <div className="app-inline-actions">
                    <AppButton
                      type="button"
                      tone="secondary"
                      onClick={() => {
                        const nextOpenState = !isTelegramSetupOpen;
                        setIsTelegramSetupOpen(nextOpenState);
                        if (nextOpenState) {
                          void loadTelegramReadiness(mode === 'edit' ? editAgentId : null);
                        }
                      }}
                    >
                      {isTelegramSetupOpen ? 'Hide Telegram setup' : 'Connect Telegram bot'}
                    </AppButton>
                  </div>
                  {isTelegramSetupOpen ? (
                    <WorkspaceChannelPairingSurface featureId="settings" />
                  ) : null}
                </div>
              ) : null}
              <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                <FormReadout label="Inbound binding key" value={selectedWizardConnector?.endpointKey || wizardState.telegramEndpointKey || 'Select a connector'} />
                <FormReadout label="Bot username" value={selectedWizardConnector?.botUsername || 'Not exposed by connector'} />
                <FormReadout
                  label="Webhook path"
                  value={selectedWizardConnector?.webhookPath || readString(readRecord(selectedTelegramReadiness?.webhook).path_template, 'Awaiting connector')}
                />
                <FormReadout
                  label="Webhook status"
                  value={humanizeToken(readRecord(selectedTelegramReadiness?.webhook).status, 'Checking')}
                />
              </FormGrid>
            </div>
          ) : null}

          {wizardStep.id === 'memory' ? (
            <div className="app-stack-3">
              <div className="deployed-agents-wizard__memory-toggle deployed-agents-wizard__memory-toggle--panel">
                <div className="sage-tool-row__copy">
                  <strong className="sage-tool-row__title">Persistent customer memory</strong>
                  <p className="sage-tool-row__description">
                    Remember useful customer facts across conversations.
                  </p>
                </div>
                <button
                  type="button"
                  className={joinClassNames('sage-tool-toggle', wizardState.memoryEnabled && 'sage-tool-toggle--enabled')}
                  role="switch"
                  aria-checked={wizardState.memoryEnabled}
                  onClick={() => setWizardField('memoryEnabled', !wizardState.memoryEnabled)}
                >
                  <span className="sage-tool-toggle__thumb" />
                </button>
              </div>
              {wizardState.memoryEnabled ? (
                <RetentionPresetControl
                  value={wizardState.retentionPreset}
                  onSelect={(nextValue) => setWizardField('retentionPreset', nextValue)}
                />
              ) : null}
            </div>
          ) : null}

          {wizardStep.id === 'safety' ? (
            <div className="app-stack-3">
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Human handoff" hint="When the assistant should involve a human.">
                  <FormSelect
                    value={wizardState.escalationPreset}
                    onChange={(event) => setWizardField('escalationPreset', event.currentTarget.value)}
                  >
                    <option value="conservative">Escalate early</option>
                    <option value="standard">Standard</option>
                    <option value="autonomous">More autonomous</option>
                  </FormSelect>
                </FormField>
                <FormField label="Handoff mode" hint="Where human handoff should go.">
                  <FormSelect
                    value={wizardState.handoffMode}
                    onChange={(event) => setWizardField('handoffMode', event.currentTarget.value)}
                  >
                    <option value="notify_owner">Notify owner</option>
                    <option value="pause_thread">Pause customer thread</option>
                    <option value="summary_only">Create summary only</option>
                  </FormSelect>
                </FormField>
              </FormGrid>
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Owner notification destination" hint="Email, Telegram chat, or internal queue for handoff.">
                  <FormInput
                    value={wizardState.ownerNotificationDestination}
                    onChange={(event) => setWizardField('ownerNotificationDestination', event.currentTarget.value)}
                    placeholder="owner@example.com"
                  />
                </FormField>
                <FormField label="Paused message" hint="What customers see when the assistant is paused.">
                  <FormInput
                    value={wizardState.pausedMessage}
                    onChange={(event) => setWizardField('pausedMessage', event.currentTarget.value)}
                    placeholder="A human will follow up shortly."
                  />
                </FormField>
              </FormGrid>
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Sensitive-topic safety" hint="Enable for health, legal, finance, or restricted customer cases.">
                  <FormSelect
                    value={wizardState.healthSafetyEnabled ? 'enabled' : 'disabled'}
                    onChange={(event) => setWizardField('healthSafetyEnabled', event.currentTarget.value === 'enabled')}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="enabled">Enabled</option>
                  </FormSelect>
                </FormField>
                <FormField label="Safety assistant name" hint="Optional name used in regulated-domain handoffs.">
                  <FormInput
                    value={wizardState.healthSafetyAssistantName}
                    onChange={(event) => setWizardField('healthSafetyAssistantName', event.currentTarget.value)}
                    placeholder="Safety reviewer"
                  />
                </FormField>
              </FormGrid>
            </div>
          ) : null}

          {wizardStep.id === 'test' ? (
            <div className="app-stack-3">
              <StateBanner
                tone="neutral"
                title="Draft review"
                detail="This is the pre-launch checklist. Create the assistant, test it privately, then deploy from the detail panel."
              />
              <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                <FormReadout label="Template" value={selectedStudioTemplate.title} />
                <FormReadout label="Assistant name" value={wizardState.name || 'Not named'} />
                <FormReadout label="Channel" value={wizardState.customerChannel === 'telegram' ? 'Telegram bot' : wizardState.customerChannel === 'draft' ? 'Draft only' : humanizeToken(wizardState.customerChannel, 'Draft only')} />
                <FormReadout label="Knowledge" value={wizardState.knowledgeSourceText.trim() ? 'Source added' : 'Add later'} />
                <FormReadout label="Actions" value={`${wizardState.selectedToolIds.length} enabled`} />
                <FormReadout label="Memory" value={wizardState.memoryEnabled ? 'Enabled' : 'Disabled'} />
              </FormGrid>
            </div>
          ) : null}

          {wizardStep.id === 'deploy' ? (
            <div className="app-stack-3">
              <StateBanner
                tone="neutral"
                title="Launch contract for this business assistant"
                detail="Defaults are safe for production. Change these only when the assistant needs a different runtime, channel, or spending cap."
              />
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="AI tier" hint="Product-level capability for this assistant.">
                  <FormSelect
                    value={wizardState.aiTier}
                    onChange={(event) => {
                      const nextTier = normalizeWizardAiTier(event.currentTarget.value);
                      const route = resolveProviderModelForTier(nextTier, providerCatalog);
                      setWizardState((current) => ({
                        ...current,
                        aiTier: nextTier,
                        providerId: route.providerId || current.providerId,
                        modelId: route.modelId || current.modelId,
                      }));
                    }}
                  >
                    {STUDIO_AI_TIER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                  <div className="app-surface-field-help">
                    {STUDIO_AI_TIER_OPTIONS.find((item) => item.value === wizardState.aiTier)?.hint}
                  </div>
                </FormField>
                <FormField label="Where it runs" hint="Studio agents start as text/API agents in Empyralis Cloud. Computer and customer-owned deployments require setup.">
                  <RuntimeModeSelector
                    value={wizardState.runtimePlacement}
                    options={STUDIO_RUNTIME_OPTIONS}
                    hasGatewayOnlineTarget={hasGatewayOnlineTarget}
                    hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
                    onSelect={(nextRuntime) => {
                      setWizardState((current) => ({
                        ...current,
                        runtimePlacement: nextRuntime,
                        runtimeTarget: runtimeTargetForPlacement(nextRuntime),
                      }));
                    }}
                  />
                </FormField>
                <FormField label="Approval mode" hint="How much autonomy this assistant gets before human handoff.">
                  <FormSelect
                    value={wizardState.approvalMode}
                    onChange={(event) => {
                      const nextMode = readString(event.currentTarget.value) as WizardState['approvalMode'];
                      const normalizedMode = nextMode === 'guarded' || nextMode === 'autonomous' ? nextMode : 'balanced';
                      const mapping = applyApprovalModeToWizardState(normalizedMode, {
                        escalationPreset: wizardState.escalationPreset,
                        handoffMode: wizardState.handoffMode,
                      });
                      setWizardState((current) => ({
                        ...current,
                        approvalMode: normalizedMode,
                        escalationPreset: mapping.escalationPreset,
                        handoffMode: mapping.handoffMode,
                      }));
                    }}
                  >
                    {STUDIO_APPROVAL_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FormSelect>
                  <div className="app-surface-field-help">
                    {STUDIO_APPROVAL_MODE_OPTIONS.find((item) => item.value === wizardState.approvalMode)?.hint}
                  </div>
                </FormField>
                <FormField label="Customer Channels" hint="Primary live channel for this assistant.">
                  <FormSelect
                    value={wizardState.customerChannel}
                    onChange={(event) => {
                      const nextChannel = readString(event.currentTarget.value) as WizardState['customerChannel'];
                      setWizardState((current) => ({
                        ...current,
                        customerChannel: nextChannel,
                        telegramEnabled: nextChannel === 'telegram' ? current.telegramEnabled : false,
                      }));
                    }}
                  >
                    <option value="telegram">Telegram bot</option>
                    <option value="draft">Draft only</option>
                    <option value="whatsapp" disabled>WhatsApp Business soon</option>
                    <option value="web_widget" disabled>Web chat soon</option>
                  </FormSelect>
                </FormField>
              </FormGrid>
              <AgentSafetySummary
                approvalMode={wizardState.approvalMode}
                memoryEnabled={wizardState.memoryEnabled}
                monthlyCostCapUsd={wizardState.monthlyCostCapUsd}
                dailyMessageLimit={wizardState.dailyMessageLimit}
              />
              <AgentLaunchChecklist
                hasGatewayOnlineTarget={hasGatewayOnlineTarget}
                hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
                state={wizardState}
              />
              {wizardState.runtimePlacement === 'customer_hosted' ? (
                <div className="app-stack-3">
                  <StateBanner
                    tone="neutral"
                    title="Self-hosted execution boundary"
                    detail="This mode runs only on your selected customer-owned node. Platform-hosted compute is not used as fallback."
                  />
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Self-hosted node" hint="Choose an enrolled self-hosted node in this workspace.">
                      <FormSelect
                        value={wizardState.selfHostedRuntimeProfileId}
                        onChange={(event) => setWizardField('selfHostedRuntimeProfileId', event.currentTarget.value)}
                        disabled={isLoadingRuntimeAttachments}
                      >
                        <option value="">
                          {isLoadingRuntimeAttachments ? 'Loading nodes…' : selfHostedNodeOptions.length > 0 ? 'Select a node' : 'No enrolled nodes found'}
                        </option>
                        {selfHostedNodeOptions.map((node) => (
                          <option key={node.runtimeProfileId} value={node.runtimeProfileId}>
                            {node.label} ({humanizeToken(node.nodeKind, 'node')})
                          </option>
                        ))}
                      </FormSelect>
                    </FormField>
                    <FormReadout label="Node health" value={selfHostedNodeHealthLabel(selectedSelfHostedNode)} />
                    <FormReadout label="Heartbeat" value={selectedSelfHostedNode?.heartbeatAt ? formatRelativeTime(selectedSelfHostedNode.heartbeatAt) : 'n/a'} />
                    <FormReadout label="Capabilities" value={selectedSelfHostedNode?.capabilities.length ? selectedSelfHostedNode.capabilities.join(', ') : 'n/a'} />
                  </FormGrid>
                  <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                    <FormField label="Privacy contract" hint="Required before a self-hosted assistant can be saved.">
                      <FormSelect
                        value={wizardState.selfHostedPrivacyAccepted ? 'accepted' : 'pending'}
                        onChange={(event) => setWizardField('selfHostedPrivacyAccepted', event.currentTarget.value === 'accepted')}
                      >
                        <option value="pending">Not accepted</option>
                        <option value="accepted">Accepted</option>
                      </FormSelect>
                    </FormField>
                    <FormField label="Safety contract" hint="Required before a self-hosted assistant can be saved.">
                      <FormSelect
                        value={wizardState.selfHostedSafetyAccepted ? 'accepted' : 'pending'}
                        onChange={(event) => setWizardField('selfHostedSafetyAccepted', event.currentTarget.value === 'accepted')}
                      >
                        <option value="pending">Not accepted</option>
                        <option value="accepted">Accepted</option>
                      </FormSelect>
                    </FormField>
                  </FormGrid>
                  {selfHostedWizardNodeBlocker ? (
                    <StateBanner tone="warning" title="Self-hosted setup required" detail={selfHostedWizardNodeBlocker} />
                  ) : (
                    <StateBanner tone="success" title="Self-hosted node ready" detail="Node selection and health checks passed for this draft." />
                  )}
                </div>
              ) : null}
              <details className="app-stack-3">
                <summary>Computer Automation Add-on</summary>
                <p className="app-surface-field-help">
                  Off by default. Enable only when this assistant must operate websites or apps without APIs.
                </p>
                <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                  <FormField label="Automation" hint="Customer messages cannot start computer sessions while this is off.">
                    <FormSelect
                      value={wizardState.computerAutomationEnabled ? 'enabled' : 'disabled'}
                      onChange={(event) => setWizardState((current) => ({
                        ...current,
                        computerAutomationEnabled: event.currentTarget.value === 'enabled',
                      }))}
                    >
                      <option value="disabled">Off</option>
                      <option value="enabled">On — approval gated</option>
                    </FormSelect>
                  </FormField>
                  <FormField label="Computer add-on" hint="Choose the computer environment for this add-on.">
                    <FormSelect
                      value={wizardState.computerAutomationRuntimeClass}
                      disabled={!wizardState.computerAutomationEnabled}
                      onChange={(event) => setWizardField('computerAutomationRuntimeClass', event.currentTarget.value as WizardState['computerAutomationRuntimeClass'])}
                    >
                      <option value="virtual_browser">Cloud browser</option>
                      <option value="virtual_desktop">Cloud desktop</option>
                      <option value="virtual_code_sandbox">Cloud code sandbox</option>
                      <option value="local_browser">Browser on my computer</option>
                      <option value="local_desktop">Desktop on my computer</option>
                    </FormSelect>
                  </FormField>
                  <FormField label="Allowed domains" hint="Comma-separated domains. Required when automation is on.">
                    <FormInput
                      value={wizardState.computerAutomationAllowedDomains}
                      disabled={!wizardState.computerAutomationEnabled}
                      onChange={(event) => setWizardField('computerAutomationAllowedDomains', event.currentTarget.value)}
                      placeholder="supplier.example.com, portal.example.com"
                    />
                  </FormField>
                  <FormField label="Max active sessions" hint="Many agents can be registered; active sessions stay capped and the rest queue.">
                    <FormInput
                      type="number"
                      min="1"
                      value={wizardState.computerAutomationMaxSessions}
                      disabled={!wizardState.computerAutomationEnabled}
                      onChange={(event) => setWizardField('computerAutomationMaxSessions', event.currentTarget.value)}
                    />
                  </FormField>
                  <FormField label="Daily budget" hint="Stops automation when the daily cloud-computer budget is hit.">
                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={wizardState.computerAutomationDailyBudgetUsd}
                      disabled={!wizardState.computerAutomationEnabled}
                      onChange={(event) => setWizardField('computerAutomationDailyBudgetUsd', event.currentTarget.value)}
                    />
                  </FormField>
                  <FormField label="Monthly budget" hint="Stops automation when the monthly cloud-computer budget is hit.">
                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      value={wizardState.computerAutomationMonthlyBudgetUsd}
                      disabled={!wizardState.computerAutomationEnabled}
                      onChange={(event) => setWizardField('computerAutomationMonthlyBudgetUsd', event.currentTarget.value)}
                    />
                  </FormField>
                </FormGrid>
              </details>
              <details className="app-stack-3">
                <summary>AI model and cost details</summary>
                <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                  <FormField label="AI model provider" hint="Choose the AI model provider for this assistant.">
                    <FormSelect
                      data-deployed-agent-provider-select="true"
                      value={wizardState.providerId}
                      onChange={(event) => {
                        const nextProviderId = event.currentTarget.value;
                        const nextProvider = providerCatalogIndex[nextProviderId] ?? null;
                        const nextModelId = nextProvider?.defaultModel && nextProvider.models.some((item: any) => item.id === nextProvider.defaultModel)
                          ? nextProvider.defaultModel
                          : nextProvider?.models[0]?.id || '';
                        setWizardState((current) => ({
                          ...current,
                          providerId: nextProviderId,
                          modelId: nextModelId,
                          aiTier: inferAiTierFromProviderModel(nextProviderId, nextModelId),
                        }));
                      }}
                      disabled={isLoadingProviderCatalog || providerCatalog.length === 0}
                    >
                      <option value="">
                        {isLoadingProviderCatalog ? 'Loading AI model providers…' : 'Select an AI model provider'}
                      </option>
                      {providerCatalog.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                  <FormField label="Model" hint="Choose the model this assistant should use.">
                    <FormSelect
                      data-deployed-agent-model-select="true"
                      value={wizardState.modelId}
                      onChange={(event) => {
                        const nextModelId = event.currentTarget.value;
                        setWizardState((current) => ({
                          ...current,
                          modelId: nextModelId,
                          aiTier: inferAiTierFromProviderModel(current.providerId, nextModelId),
                        }));
                      }}
                      disabled={!selectedProviderCatalog || selectedProviderCatalog.models.length === 0}
                    >
                      <option value="">
                        {selectedProviderCatalog ? 'Select a model' : 'Select an AI model provider first'}
                      </option>
                      {(selectedProviderCatalog?.models ?? []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </FormSelect>
                  </FormField>
                </FormGrid>
                <FormGrid columns="repeat(auto-fit, minmax(12rem, 1fr))">
                  <FormReadout label="AI model provider state" value={humanizeToken(selectedProviderCatalog?.state, isLoadingProviderCatalog ? 'Loading' : 'Unknown')} />
                  <FormReadout label="Privacy profile" value={selectedProviderCatalog?.privacyPosture || 'n/a'} />
                  <FormReadout label="Jurisdiction" value={selectedProviderCatalog?.jurisdiction || 'n/a'} />
                  <FormReadout label="Residency" value={selectedProviderCatalog?.residency || 'n/a'} />
                  <FormReadout label="Model capacity" value={formatContextWindow(selectedProviderModelCatalog?.contextWindowTokens)} />
                  <FormReadout
                    label="Pricing"
                    value={
                      selectedProviderModelCatalog
                        ? `${formatUsdPer1k(selectedProviderModelCatalog.inputCostPer1kUsd)} in · ${formatUsdPer1k(selectedProviderModelCatalog.outputCostPer1kUsd)} out`
                        : 'n/a'
                    }
                  />
                </FormGrid>
                <FormReadout
                  label="Capabilities"
                  value={
                    selectedProviderModelCatalog?.capabilityLabels.join(', ')
                    || selectedProviderCatalog?.capabilityLabels.join(', ')
                    || 'No capability labels yet'
                  }
                />
              </details>
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Budget cap (USD)" hint="Automatic monthly pause threshold for this assistant.">
                  <FormInput
                    value={wizardState.monthlyCostCapUsd}
                    onChange={(event) => setWizardField('monthlyCostCapUsd', event.currentTarget.value)}
                    inputMode="decimal"
                    placeholder="250"
                  />
                </FormField>
                <FormField label="Daily message limit" hint="Per external user, reset at UTC midnight. Leave blank to disable free-tier limits.">
                  <FormInput
                    value={wizardState.dailyMessageLimit}
                    onChange={(event) => setWizardField('dailyMessageLimit', event.currentTarget.value)}
                    inputMode="numeric"
                    placeholder="25"
                  />
                </FormField>
              </FormGrid>
              <FormGrid columns="repeat(auto-fit, minmax(14rem, 1fr))">
                <FormField label="Upgrade CTA label" hint="Required when message limits are active.">
                  <FormInput
                    value={wizardState.upgradeCtaLabel}
                    onChange={(event) => setWizardField('upgradeCtaLabel', event.currentTarget.value)}
                    placeholder="Continue on Empyralis"
                  />
                </FormField>
                <FormField label="Upgrade CTA URL" hint="Where limited users go when they need more messages.">
                  <FormInput
                    value={wizardState.upgradeCtaUrl}
                    onChange={(event) => setWizardField('upgradeCtaUrl', event.currentTarget.value)}
                    placeholder="https://app.empyralis.com/upgrade"
                  />
                </FormField>
              </FormGrid>
            </div>
          ) : null}
        </ModalSection>
      </div>
    </CommandSheet>
  );
}
