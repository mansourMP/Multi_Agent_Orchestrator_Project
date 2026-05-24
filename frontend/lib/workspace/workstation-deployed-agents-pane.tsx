'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import {
  ListDetailShell,
} from '@/lib/ui/list-detail';
import { PlatformNotification } from '@/lib/ui/platform-notification';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import { StudioIcon } from '@/lib/ui/icons';
import type {
  DeployedAgentAnalyticsRecord,
  DeployedAgentConversationDetail,
  DeployedAgentConversationRecord,
  DeployedAgentMemoryRecord,
  DeployedAgentRecord,
  DeployedAgentTelegramReadinessRecord,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';
import { WorkstationSplitWorkbench } from '@/lib/workspace/workstation-split-workbench';
import { WorkstationSurfaceRoot } from '@/lib/workspace/workstation-surface-primitives';
import type {
  AgentAnalyticsSnapshot,
  AgentOperationalMetrics,
  ConversationFilters,
  DetailConfigDraft,
  LaunchReadinessItem,
  ProviderCatalogSnapshot,
  RuntimeAttachmentSnapshot,
  SpecialistOverlayTabId,
  StudioSubview,
  StudioTemplate,
  TelegramReadinessSnapshot,
  WizardMode,
  WizardState,
} from './deployed-agents/types';
import {
  CUSTOM_STUDIO_TEMPLATE,
  DEFAULT_SAFE_AGENT_PERSONA,
  DEFAULT_SAFE_AGENT_SYSTEM_PROMPT,
  DEFAULT_STUDIO_TEMPLATE,
  normalizeSpecialistOverlayTabId,
  STUDIO_TEMPLATES,
} from './deployed-agents/constants';
import {
  AgentWizard,
} from './deployed-agents/wizard';
import {
  AgentDetailView,
} from './deployed-agents/detail-view';
import {
  AgentInboxView,
} from './deployed-agents/inbox-view';
import {
  AgentRosterSidebar,
} from './deployed-agents/roster-sidebar';
import {
  studioPaneCache,
  updateStudioPaneCache,
  readString,
  readPositiveDecimalString,
  readRecord,
  readNumber,
  readItems,
  normalizeRuntimeAttachments,
  selfHostedNodeGateReason,
  selfHostedNodeHealthLabel,
  normalizeProviderCatalog,
  normalizeAgentAnalytics,
  normalizeTelegramReadiness,
  selectedProviderId,
  selectedModelId,
  providerCatalogById,
  formatDeploymentModelLabel,
  agentModelDeployBlocker,
  normalizeWizardAiTier,
  normalizeRuntimePlacement,
  runtimeTargetForPlacement,
  runtimePlacementLabel,
  testRuntimeModeForPlacement,
  inferAiTierFromProviderModel,
  pickStudioModelForTier,
  resolveProviderModelForTier,
  applyProviderCatalogDefaults,
  buildWizardState,
  buildDeploymentConfig,
  buildDetailConfigDraft,
  readBudgetCycle,
  summarizeConversationMetrics,
  buildMetricsPlaceholder,
  matchesConversationFilters,
  upsertAgentRecord,
  summarizeStudioErrorMessage,
  isWizardScopedError,
  studioRuntimeOption,
  listEnabledChannels,
  hasEnabledChannel,
  normalizeTemplateToken,
  studioTemplateById,
  normalizeStudioTemplates,
  parseKnowledgeSources,
} from './deployed-agents/utils';

function useStableEvent<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback((...args: TArgs) => handlerRef.current(...args), []);
}

type StudioRosterFilterId = 'all' | 'live' | 'draft' | 'needs_attention' | 'paused';

function normalizeStudioRosterFilter(value: string | null): StudioRosterFilterId {
  return value === 'live' || value === 'draft' || value === 'needs_attention' || value === 'paused'
    ? value
    : 'all';
}

function agentDeploymentState(agent: DeployedAgentRecord): string {
  return readString(agent.deployment_state ?? agent.status, 'draft').toLowerCase();
}

function agentNeedsAttention(agent: DeployedAgentRecord): boolean {
  const config = readRecord(agent.config);
  const metadata = readRecord(agent.metadata);
  const state = agentDeploymentState(agent);
  const error = readString(
    agent.last_error
    ?? config.last_error
    ?? metadata.last_error
    ?? config.blocker
    ?? metadata.blocker,
  );
  return Boolean(error) || /attention|blocked|error|failed|invalid/.test(state);
}

function agentMatchesStudioRosterFilter(agent: DeployedAgentRecord, filter: StudioRosterFilterId): boolean {
  const state = agentDeploymentState(agent);
  if (filter === 'live') {
    return state === 'live';
  }
  if (filter === 'paused') {
    return state === 'paused' || state === 'disabled' || state === 'inactive' || state === 'suspended';
  }
  if (filter === 'needs_attention') {
    return agentNeedsAttention(agent);
  }
  if (filter === 'draft') {
    return state !== 'live' && state !== 'paused' && state !== 'disabled' && state !== 'inactive' && state !== 'suspended';
  }
  return true;
}

export function WorkstationDeployedAgentsPane({
  initialSubview = 'agents',
}: {
  initialSubview?: StudioSubview;
}) {
  const { workspaceId, bootstrap } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cachedStudioPane = studioPaneCache.get(workspaceId) ?? null;
  const [hadInitialCache] = useState(() => cachedStudioPane !== null);
  const [currentStudioSubview, setCurrentStudioSubview] = useState<StudioSubview>(initialSubview);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogSnapshot[]>(() => cachedStudioPane?.providerCatalog ?? []);
  const [studioTemplates, setStudioTemplates] = useState<StudioTemplate[]>(() => [...STUDIO_TEMPLATES]);
  const [agents, setAgents] = useState<DeployedAgentRecord[]>([]);
  const [connectorVaultIds, setConnectorVaultIds] = useState<Set<string>>(() => new Set(cachedStudioPane?.connectorVaultIds ?? []));
  const [agentMetricsById, setAgentMetricsById] = useState<Record<string, AgentOperationalMetrics>>(() => cachedStudioPane?.agentMetricsById ?? {});
  const [agentAnalyticsById, setAgentAnalyticsById] = useState<Record<string, AgentAnalyticsSnapshot>>(() => cachedStudioPane?.agentAnalyticsById ?? {});
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [overlayAgentId, setOverlayAgentId] = useState<string | null>(null);
  const [overlayTab, setOverlayTab] = useState<SpecialistOverlayTabId>(() => (
    normalizeSpecialistOverlayTabId(searchParams.get('tab') || searchParams.get('studioTab'))
  ));
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<DeployedAgentRecord | null>(null);
  const [selectedAgentAnalytics, setSelectedAgentAnalytics] = useState<AgentAnalyticsSnapshot | null>(null);
  const [selectedTelegramReadiness, setSelectedTelegramReadiness] = useState<TelegramReadinessSnapshot | null>(null);
  const [conversations, setConversations] = useState<DeployedAgentConversationRecord[]>([]);
  const [agentMemoryById, setAgentMemoryById] = useState<Record<string, DeployedAgentMemoryRecord[]>>({});
  const [runtimeAttachments, setRuntimeAttachments] = useState<RuntimeAttachmentSnapshot[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<DeployedAgentConversationDetail | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [hasLoadedAgentListOnce, setHasLoadedAgentListOnce] = useState(false);
  const [isLoadingProviderCatalog, setIsLoadingProviderCatalog] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isLoadingTelegramReadiness, setIsLoadingTelegramReadiness] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingOverlayMemory, setIsLoadingOverlayMemory] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isLoadingRuntimeAttachments, setIsLoadingRuntimeAttachments] = useState(false);
  const [isSavingProviderCredential, setIsSavingProviderCredential] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => CUSTOM_STUDIO_TEMPLATE.id);
  const handledTemplateDeepLinkRef = useRef<string | null>(null);
  const [detailConfigDraft, setDetailConfigDraft] = useState<DetailConfigDraft | null>(null);
  const [isSavingDetailConfig, setIsSavingDetailConfig] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [busyAuditExportAgentId, setBusyAuditExportAgentId] = useState<string | null>(null);
  const [busyExternalUserId, setBusyExternalUserId] = useState<string | null>(null);
  const [recentlyCreatedAgentId, setRecentlyCreatedAgentId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conversationFilters, setConversationFilters] = useState<ConversationFilters>({
    channel: 'all',
    escalationState: 'all',
    outcome: 'all',
  });

  const selectedAgent = useMemo(
    () => selectedAgentDetail ?? agents.find((item) => readString(item.id) === selectedAgentId) ?? null,
    [agents, selectedAgentDetail, selectedAgentId],
  );
  const selectedAgentMetrics = useMemo(
    () => (selectedAgentId ? agentMetricsById[selectedAgentId] ?? null : null),
    [agentMetricsById, selectedAgentId],
  );
  const selectedAnalytics = useMemo(
    () => selectedAgentAnalytics ?? (selectedAgentId ? agentAnalyticsById[selectedAgentId] ?? null : null),
    [agentAnalyticsById, selectedAgentAnalytics, selectedAgentId],
  );
  const providerCatalogIndex = useMemo(
    () => providerCatalogById(providerCatalog),
    [providerCatalog],
  );
  const selfHostedNodeOptions = useMemo(
    () => runtimeAttachments
      .filter((item) => item.runtimeProfileId)
      .sort((left, right) => left.label.localeCompare(right.label)),
    [runtimeAttachments],
  );
  const selectedAgentRuntimePlacement = useMemo(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    const runtimeSupply = readRecord(config.runtime_supply ?? metadata.runtime_supply);
    const placement = readRecord(runtimeSupply.placement);
    return normalizeRuntimePlacement(
      placement.kind
      ?? config.runtime_placement
      ?? metadata.runtime_placement
      ?? selectedAgent?.runtime_target,
    );
  }, [selectedAgent]);
  const selectedAgentSelfHostedProfileId = useMemo(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    const binding = readRecord(metadata.self_hosted_runtime_binding);
    return readString(config.runtime_profile_id ?? binding.runtime_profile_id ?? metadata.runtime_profile_id);
  }, [selectedAgent]);
  const selectedAgentSelfHostedNode = useMemo(
    () => selfHostedNodeOptions.find((item) => item.runtimeProfileId === selectedAgentSelfHostedProfileId) ?? null,
    [selectedAgentSelfHostedProfileId, selfHostedNodeOptions],
  );
  const selectedAgentSelfHostedDeployBlocker = useMemo(() => {
    if (selectedAgentRuntimePlacement !== 'customer_hosted') {
      return null;
    }
    if (!selectedAgentSelfHostedProfileId) {
      return 'Server/VPS deployment requires an explicit runtime binding.';
    }
    return selfHostedNodeGateReason(selectedAgentSelfHostedNode);
  }, [selectedAgentRuntimePlacement, selectedAgentSelfHostedNode, selectedAgentSelfHostedProfileId]);
  const selectedAgentModelDeployBlocker = useMemo(
    () => agentModelDeployBlocker(selectedAgent, providerCatalogIndex),
    [providerCatalogIndex, selectedAgent],
  );
  const selectedStudioTemplate = useMemo(
    () => studioTemplateById(selectedTemplateId, studioTemplates),
    [selectedTemplateId, studioTemplates],
  );
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => matchesConversationFilters(conversation, conversationFilters)),
    [conversationFilters, conversations],
  );
  const selectedConversation = useMemo(
    () => filteredConversations.find((item) => readString(item.session_id) === selectedSessionId) ?? null,
    [filteredConversations, selectedSessionId],
  );
  const channelFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.channel).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const escalationFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.escalation_state).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const outcomeFilterOptions = useMemo(
    () => Array.from(new Set(conversations.map((item) => readString(item.outcome).toLowerCase()).filter(Boolean))),
    [conversations],
  );
  const requestedAgentId = useMemo(
    () => String(searchParams.get('agent') || '').trim(),
    [searchParams],
  );
  const requestedProofAgentTemplateId = useMemo(
    () => String(searchParams.get('proof_agent') || searchParams.get('template') || '').trim(),
    [searchParams],
  );
  const requestedCreateAgent = searchParams.get('createAgent') === '1';
  const studioRosterFilter = useMemo(
    () => normalizeStudioRosterFilter(searchParams.get('studioFilter')),
    [searchParams],
  );
  const requestedOverlayTab = useMemo(
    () => normalizeSpecialistOverlayTabId(searchParams.get('tab') || searchParams.get('studioTab')),
    [searchParams],
  );
  const selectOverlayTab = useCallback((nextTab: SpecialistOverlayTabId) => {
    setOverlayTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'overview') {
      params.delete('tab');
      params.delete('studioTab');
    } else {
      params.set('tab', nextTab);
      params.delete('studioTab');
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setOverlayTab(requestedOverlayTab);
  }, [requestedOverlayTab]);

  async function refreshAgentAnalytics(items: DeployedAgentRecord[]) {
    if (items.length === 0) {
      setAgentAnalyticsById({});
      updateStudioPaneCache(workspaceId, { agentAnalyticsById: {} });
      return;
    }
    try {
      const payload = await services.client.listDeployedAgentAnalytics();
      const analyticsItems = readItems<DeployedAgentAnalyticsRecord>(payload);
      const nextEntries = analyticsItems
        .map((item) => {
          const deployedAgentId = readString(item.deployed_agent_id);
          const analytics = normalizeAgentAnalytics(item);
          if (!deployedAgentId || !analytics) {
            return null;
          }
          return [deployedAgentId, analytics] as const;
        })
        .filter((entry): entry is readonly [string, AgentAnalyticsSnapshot] => Boolean(entry));
      setAgentAnalyticsById((current) => {
        const nextValue = {
          ...current,
          ...Object.fromEntries(nextEntries),
        };
        updateStudioPaneCache(workspaceId, { agentAnalyticsById: nextValue });
        return nextValue;
      });
    } catch {
      setAgentAnalyticsById((current) => current);
    }
  }

  async function refreshProviderCatalog() {
    setIsLoadingProviderCatalog(true);
    try {
      const payload = await services.client.listProviderCatalog();
      const nextCatalog = normalizeProviderCatalog(payload);
      updateStudioPaneCache(workspaceId, { providerCatalog: nextCatalog });
      setProviderCatalog(nextCatalog);
    } catch (error) {
      setProviderCatalog([]);
      setErrorMessage(error instanceof Error ? error.message : 'AI model catalog is unavailable.');
    } finally {
      setIsLoadingProviderCatalog(false);
    }
  }

  async function refreshProviderModels(providerId: string) {
    const normalizedProviderId = readString(providerId);
    if (!normalizedProviderId) {
      return;
    }
    setIsLoadingProviderCatalog(true);
    try {
      await services.client.refreshWorkspaceProviderModels({ providerId: normalizedProviderId });
      const payload = await services.client.listProviderCatalog();
      const nextCatalog = normalizeProviderCatalog(payload);
      updateStudioPaneCache(workspaceId, { providerCatalog: nextCatalog });
      setProviderCatalog(nextCatalog);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not refresh provider models.');
    } finally {
      setIsLoadingProviderCatalog(false);
    }
  }

  async function loadRuntimeAttachments() {
    setIsLoadingRuntimeAttachments(true);
    try {
      const payload = await services.client.listRuntimeAttachments();
      setRuntimeAttachments(normalizeRuntimeAttachments(payload));
    } catch (error) {
      setRuntimeAttachments([]);
      setErrorMessage(error instanceof Error ? error.message : 'Server/VPS inventory is unavailable.');
    } finally {
      setIsLoadingRuntimeAttachments(false);
    }
  }

  async function refreshStudioTemplates() {
    try {
      const payload = await services.client.listStudioTemplates();
      const nextTemplates = normalizeStudioTemplates(payload);
      setStudioTemplates(nextTemplates);
      setSelectedTemplateId((current) => (
        current === CUSTOM_STUDIO_TEMPLATE.id || nextTemplates.some((template) => template.id === current)
          ? current
          : nextTemplates[0]?.id ?? DEFAULT_STUDIO_TEMPLATE.id
      ));
    } catch {
      setStudioTemplates([...STUDIO_TEMPLATES]);
    }
  }

  async function refreshAgents(options: { preserveSelection?: boolean; selectAgentId?: string | null } = {}) {
    setIsLoadingAgents(true);
    setErrorMessage(null);
    try {
      const payload = await services.client.listDeployedAgents();
      const items = readItems<DeployedAgentRecord>(payload);
      setAgents(items);
      setHasLoadedAgentListOnce(true);
      void refreshAgentAnalytics(items);
      setAgentMetricsById((current) => {
        const nextValue = {
          ...current,
          ...Object.fromEntries(
            items
              .map((item) => readString(item.id))
              .filter(Boolean)
              .map((agentId) => [agentId, current[agentId] ?? buildMetricsPlaceholder()]),
          ),
        };
        updateStudioPaneCache(workspaceId, { agents: items, agentMetricsById: nextValue });
        return nextValue;
      });
      const explicitSelection = readString(options.selectAgentId);
      if (explicitSelection) {
        setSelectedAgentId(explicitSelection);
      } else if (!options.preserveSelection) {
        const cachedSelection = readString(cachedStudioPane?.selectedAgentId);
        const nextSelection = cachedSelection && items.some((item) => readString(item.id) === cachedSelection)
          ? cachedSelection
          : readString(items[0]?.id) || null;
        setSelectedAgentId(nextSelection);
      } else if (selectedAgentId && !items.some((item) => readString(item.id) === selectedAgentId)) {
        setSelectedAgentId(readString(items[0]?.id) || null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Deployed agents could not be loaded.');
    } finally {
      setIsLoadingAgents(false);
    }
  }

  async function loadAgentDetail(agentId: string) {
    setIsLoadingDetail(true);
    try {
      const payload = await services.client.getDeployedAgent({
        deployedAgentId: agentId,
        allowMissing: true,
      });
      const nextDetail = payload as DeployedAgentRecord | null;
      setSelectedAgentDetail(nextDetail);
      updateStudioPaneCache(workspaceId, { selectedAgentDetail: nextDetail });
    } catch (error) {
      setSelectedAgentDetail(null);
      updateStudioPaneCache(workspaceId, { selectedAgentDetail: null });
      setErrorMessage(error instanceof Error ? error.message : 'Deployment detail is unavailable.');
    } finally {
      setIsLoadingDetail(false);
    }
  }

  async function loadAgentAnalytics(agentId: string) {
    setIsLoadingAnalytics(true);
    try {
      const payload = await services.client.getDeployedAgentAnalytics({
        deployedAgentId: agentId,
        allowMissing: true,
      });
      const analytics = normalizeAgentAnalytics(payload as DeployedAgentAnalyticsRecord | null);
      setSelectedAgentAnalytics(analytics);
      updateStudioPaneCache(workspaceId, { selectedAgentAnalytics: analytics });
      if (analytics) {
        setAgentAnalyticsById((current) => ({
          ...current,
          [agentId]: analytics,
        }));
      }
    } catch {
      setSelectedAgentAnalytics(null);
      updateStudioPaneCache(workspaceId, { selectedAgentAnalytics: null });
    } finally {
      setIsLoadingAnalytics(false);
    }
  }

  async function loadTelegramReadiness(agentId?: string | null) {
    setIsLoadingTelegramReadiness(true);
    try {
      const payload = await services.client.getDeployedAgentTelegramReadiness({
        deployedAgentId: agentId || undefined,
        allowMissing: true,
      });
      const nextReadiness = normalizeTelegramReadiness(payload as DeployedAgentTelegramReadinessRecord | null);
      setSelectedTelegramReadiness(nextReadiness);
      updateStudioPaneCache(workspaceId, { selectedTelegramReadiness: nextReadiness });
    } catch {
      setSelectedTelegramReadiness(null);
      updateStudioPaneCache(workspaceId, { selectedTelegramReadiness: null });
    } finally {
      setIsLoadingTelegramReadiness(false);
    }
  }

  async function loadConversations(agentId: string) {
    setIsLoadingConversations(true);
    try {
      const payload = await services.client.listDeployedAgentConversations({
        deployedAgentId: agentId,
        limit: 50,
        offset: 0,
      });
      const items = readItems<DeployedAgentConversationRecord>(payload);
      setConversations(items);
      updateStudioPaneCache(workspaceId, { conversations: items });
      setAgentMetricsById((current) => {
        const nextValue = {
          ...current,
          [agentId]: summarizeConversationMetrics(items, {
            hasMore: readRecord(payload).has_more === true,
          }),
        };
        updateStudioPaneCache(workspaceId, { agentMetricsById: nextValue });
        return nextValue;
      });
      setSelectedSessionId((current) => {
        if (current && items.some((item) => readString(item.session_id) === current)) {
          return current;
        }
        return readString(items[0]?.session_id) || null;
      });
    } catch {
      setConversations([]);
      updateStudioPaneCache(workspaceId, { conversations: [] });
      setSelectedSessionId(null);
    } finally {
      setIsLoadingConversations(false);
    }
  }

  async function loadMemoryEntries(agentId: string) {
    setIsLoadingOverlayMemory(true);
    try {
      const payload = await services.client.listDeployedAgentMemory({
        deployedAgentId: agentId,
        limit: 50,
        offset: 0,
      });
      setAgentMemoryById((current) => ({
        ...current,
        [agentId]: readItems<DeployedAgentMemoryRecord>(payload),
      }));
    } catch {
      setAgentMemoryById((current) => ({
        ...current,
        [agentId]: [],
      }));
    } finally {
      setIsLoadingOverlayMemory(false);
    }
  }

  async function loadTranscript(agentId: string, sessionId: string) {
    setIsLoadingTranscript(true);
    try {
      const payload = await services.client.getDeployedAgentConversationDetail({
        deployedAgentId: agentId,
        sessionId,
        allowMissing: true,
      });
      const nextTranscript = payload as DeployedAgentConversationDetail | null;
      setSelectedTranscript(nextTranscript);
      updateStudioPaneCache(workspaceId, { selectedTranscript: nextTranscript });
    } catch {
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, { selectedTranscript: null });
    } finally {
      setIsLoadingTranscript(false);
    }
  }

  useEffect(() => {
    void refreshAgents();
    void refreshStudioTemplates();
    void loadRuntimeAttachments();
    const handle = window.setTimeout(() => {
      void refreshProviderCatalog();
    }, hadInitialCache ? 120 : 260);
    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hadInitialCache, services.client, workspaceId]);

  useEffect(() => {
    setCurrentStudioSubview(initialSubview);
  }, [initialSubview]);

  useEffect(() => {
    if (!requestedAgentId) {
      return;
    }
    if (!agents.some((item) => readString(item.id) === requestedAgentId)) {
      return;
    }
    setCurrentStudioSubview('agents');
    setSelectedAgentId(requestedAgentId);
    setOverlayAgentId(null);
  }, [agents, requestedAgentId]);

  useEffect(() => {
    const normalizedRequestedTemplateId = normalizeTemplateToken(requestedProofAgentTemplateId);
    if (!normalizedRequestedTemplateId || handledTemplateDeepLinkRef.current === normalizedRequestedTemplateId) {
      return;
    }
    const template = studioTemplateById(normalizedRequestedTemplateId, studioTemplates);
    if (normalizeTemplateToken(template.id) !== normalizedRequestedTemplateId) {
      return;
    }
    handledTemplateDeepLinkRef.current = normalizedRequestedTemplateId;
    setCurrentStudioSubview('agents');
    openCreateWizard(template.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProofAgentTemplateId, studioTemplates]);

  useEffect(() => {
    if (!requestedCreateAgent) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('createAgent');
    const query = params.toString();
    const nextHref = query ? `${pathname}?${query}` : pathname;
    setCurrentStudioSubview('agents');
    openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id);
    router.replace(nextHref, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCreateAgent]);

  useEffect(() => {
    updateStudioPaneCache(workspaceId, {
      selectedAgentId,
      selectedSessionId,
    });
  }, [selectedAgentId, selectedSessionId, workspaceId]);

  useEffect(() => {
    const agentId = readString(selectedAgentId);
    if (!agentId) {
      setSelectedAgentDetail(null);
      setSelectedAgentAnalytics(null);
      setSelectedTelegramReadiness(null);
      setConversations([]);
      setConversationFilters({
        channel: 'all',
        escalationState: 'all',
        outcome: 'all',
      });
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, {
        selectedAgentId: null,
        selectedAgentDetail: null,
        selectedAgentAnalytics: null,
        selectedTelegramReadiness: null,
        conversations: [],
        selectedSessionId: null,
        selectedTranscript: null,
      });
      return;
    }
    const currentDetailAgentId = readString(selectedAgentDetail?.id);
    if (currentDetailAgentId && currentDetailAgentId !== agentId) {
      setSelectedAgentDetail(null);
      setSelectedAgentAnalytics(null);
      setSelectedTelegramReadiness(null);
      setConversations([]);
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, {
        selectedAgentDetail: null,
        selectedAgentAnalytics: null,
        selectedTelegramReadiness: null,
        conversations: [],
        selectedSessionId: null,
        selectedTranscript: null,
      });
    }
    setConversationFilters((current) => (
      current.channel === 'all' && current.escalationState === 'all' && current.outcome === 'all'
        ? current
        : {
          channel: 'all',
          escalationState: 'all',
          outcome: 'all',
        }
    ));
    let cancelled = false;
    let timeoutHandle: number | null = null;
    const frameHandle = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      void Promise.all([
        loadAgentDetail(agentId),
        loadConversations(agentId),
      ]);
      timeoutHandle = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        void Promise.all([
          loadAgentAnalytics(agentId),
          loadTelegramReadiness(agentId),
        ]);
      }, 140);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameHandle);
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayAgentId, selectedAgentDetail?.id, selectedAgentId, workspaceId]);

  useEffect(() => {
    const agentId = readString(selectedAgentId);
    const sessionId = readString(selectedSessionId);
    if (!agentId || !sessionId) {
      setSelectedTranscript(null);
      updateStudioPaneCache(workspaceId, { selectedTranscript: null });
      return;
    }
    void loadTranscript(agentId, sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, selectedSessionId]);

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSessionId && filteredConversations.some((item) => readString(item.session_id) === selectedSessionId)) {
      return;
    }
    setSelectedSessionId(readString(filteredConversations[0]?.session_id) || null);
  }, [filteredConversations, selectedSessionId]);

  const overlayMemoryTargetAgentId = readString(overlayAgentId || selectedAgentId);
  useEffect(() => {
    const agentId = overlayMemoryTargetAgentId;
    if (!agentId || overlayTab !== 'memory') {
      return;
    }
    void loadMemoryEntries(agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayMemoryTargetAgentId, overlayTab]);

  useEffect(() => {
    setDetailConfigDraft(buildDetailConfigDraft(selectedAgent));
  }, [selectedAgent]);

  useEffect(() => {
    if (!overlayAgentId) {
      return;
    }
    if (!agents.some((item) => readString(item.id) === overlayAgentId)) {
      setOverlayAgentId(null);
    }
  }, [agents, overlayAgentId]);

  useEffect(() => {
    let cancelled = false;
    void services.client.listConnectorsVault()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const connectorIds = new Set(
          readItems<Record<string, unknown>>(payload)
            .map((item) => readString(item.connector).toLowerCase())
            .filter(Boolean),
        );
        setConnectorVaultIds(connectorIds);
        updateStudioPaneCache(workspaceId, { connectorVaultIds: Array.from(connectorIds) });
      })
      .catch(() => {
        if (!cancelled) {
          setConnectorVaultIds(new Set());
          updateStudioPaneCache(workspaceId, { connectorVaultIds: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.client]);

  function openCreateWizard(templateId: string = selectedTemplateId) {
    const template = studioTemplateById(templateId, studioTemplates);
    setWizardMode('create');
    setSelectedTemplateId(template.id);
    setIsWizardOpen(true);
  }

  function openEditWizard() {
    setWizardMode('edit');
    setIsWizardOpen(true);
  }

  function closeWizard() {
    setIsWizardOpen(false);
    if (selectedAgentId) {
      void loadTelegramReadiness(selectedAgentId);
    }
  }

  async function handleWizardSuccess(record: DeployedAgentRecord) {
    const recordId = readString(record.id);
    setAgents((current) => upsertAgentRecord(current, record));
    setSelectedAgentDetail(record);
    setSelectedAgentId(recordId || null);
    setIsWizardOpen(false);

    if (wizardMode === 'create') {
      setSelectedAgentAnalytics(null);
      setOverlayAgentId(null);
      selectOverlayTab('overview');
      setRecentlyCreatedAgentId(recordId || null);
      setStatusMessage(`Created agent ${readString(record.name)}.`);
      if (recordId) {
        await Promise.all([
          loadAgentAnalytics(recordId),
          loadTelegramReadiness(recordId),
          loadConversations(recordId),
        ]);
      }
    } else {
      await Promise.all([
        refreshAgentAnalytics(upsertAgentRecord(agents, record)),
        loadAgentAnalytics(recordId),
        loadTelegramReadiness(recordId),
      ]);
      setRecentlyCreatedAgentId(null);
      setStatusMessage(`Updated ${readString(record.name, 'assistant')} settings.`);
    }
  }

  async function handleDeploymentAction(action: 'deploy' | 'pause') {
    const agentId = readString(selectedAgent?.id);
    if (!agentId) {
      return;
    }
    const selectedConfig = readRecord(selectedAgent?.config);
    const selectedMetadata = readRecord(selectedAgent?.metadata);
    const selectedCommercePolicy = readRecord(selectedConfig.commerce_policy);
    const selectedMonthlyCostCap = readPositiveDecimalString(
      selectedCommercePolicy.monthly_cost_cap_usd ?? selectedMetadata.monthly_cost_cap_usd,
    );
    const needsDeploySafeDefaults = action === 'deploy' && Boolean(selectedAgent) && (
      !readString(selectedAgent?.persona)
      || !readString(selectedAgent?.system_prompt)
      || !selectedMonthlyCostCap
    );
    if (action === 'deploy' && selectedAgentSelfHostedDeployBlocker) {
      setErrorMessage(selectedAgentSelfHostedDeployBlocker);
      return;
    }
    if (action === 'deploy' && selectedAgentModelDeployBlocker) {
      selectOverlayTab('connectors');
      setErrorMessage(`${selectedAgentModelDeployBlocker} Open Integrations and connect OpenRouter, OpenAI, Anthropic, Google Gemini, or another API provider.`);
      return;
    }
    if (
      action === 'deploy'
      && hasEnabledChannel(selectedAgent?.channels, 'telegram')
      && !selectedTelegramReadiness
    ) {
      setErrorMessage('Telegram checks are still loading. Wait for readiness to finish before enabling that customer channel.');
      return;
    }
    if (
      action === 'deploy'
      && hasEnabledChannel(selectedAgent?.channels, 'telegram')
      && selectedTelegramReadiness
      && selectedTelegramReadiness.readyForLive !== true
    ) {
      const firstBlocker = selectedTelegramReadiness.blockers[0];
      const guidance = firstBlocker?.guidance || selectedTelegramReadiness.nextAction || 'Resolve the Telegram readiness blockers before enabling that customer channel.';
      setErrorMessage(firstBlocker?.message ? `${firstBlocker.message} ${guidance}` : guidance);
      return;
    }
    setBusyAgentId(agentId);
    setErrorMessage(null);
    try {
      if (needsDeploySafeDefaults) {
        const currentState = buildWizardState(selectedAgent);
        const safePersona = currentState.persona.trim() || DEFAULT_SAFE_AGENT_PERSONA;
        const safeSystemPrompt = currentState.systemPrompt.trim() || DEFAULT_SAFE_AGENT_SYSTEM_PROMPT;
        const route = resolveProviderModelForTier(currentState.aiTier, providerCatalog);
        const resolvedProviderId = route.providerId || currentState.providerId || selectedProviderId(selectedAgent) || null;
        const resolvedModelId = route.modelId || currentState.modelId || selectedModelId(selectedAgent) || null;
        const patched = await services.client.updateDeployedAgent({
          deployedAgentId: agentId,
          persona: safePersona,
          systemPrompt: safeSystemPrompt,
          provider: resolvedProviderId,
          model: resolvedModelId,
          config: buildDeploymentConfig({
            ...currentState,
            persona: safePersona,
            systemPrompt: safeSystemPrompt,
            providerId: resolvedProviderId || '',
            modelId: resolvedModelId || '',
          }),
        });
        if (patched) {
          const patchedRecord = patched as DeployedAgentRecord;
          setAgents((current) => upsertAgentRecord(current, patchedRecord));
          setSelectedAgentDetail(patchedRecord);
        }
      }
      const payload =
        action === 'deploy'
          ? await services.client.deployDeployedAgent({ deployedAgentId: agentId })
          : await services.client.pauseDeployedAgent({ deployedAgentId: agentId });
      const record = (payload ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setStatusMessage(
        action === 'deploy'
          ? listEnabledChannels(record.channels).length > 0
            ? `${readString(record.name, 'Assistant')} is now live on its configured channels.`
            : `${readString(record.name, 'Assistant')} is live with safe defaults. Connect a customer channel when ready.`
          : `${readString(record.name, 'Assistant')} is paused and will no longer reply to live customer messages.`,
      );
      await Promise.all([
        refreshAgentAnalytics(upsertAgentRecord(agents, record)),
        loadAgentAnalytics(agentId),
        loadTelegramReadiness(agentId),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Deployment state could not be updated.');
    } finally {
      setBusyAgentId(null);
    }
  }

  async function saveDetailConfig() {
    const agentId = readString(selectedAgent?.id);
    if (!agentId || !detailConfigDraft) {
      return;
    }

    const currentState = buildWizardState(selectedAgent);
    const nextState: WizardState = {
      ...currentState,
      persona: detailConfigDraft.persona,
      systemPrompt: detailConfigDraft.systemPrompt,
      aiTier: detailConfigDraft.aiTier,
      aiSource: detailConfigDraft.aiSource,
      providerId: detailConfigDraft.providerId,
      modelId: detailConfigDraft.modelId,
      billingPlan: detailConfigDraft.billingPlan,
      selectedToolIds: detailConfigDraft.selectedToolIds,
      memoryEnabled: detailConfigDraft.memoryEnabled,
      contextBudgetPreset: detailConfigDraft.contextBudgetPreset,
      retentionPreset: detailConfigDraft.retentionPreset,
    };
    const resolvedProviderModel = resolveProviderModelForTier(nextState.aiTier, providerCatalog);
    const resolvedProviderId = nextState.providerId || resolvedProviderModel.providerId;
    const resolvedProvider = providerCatalogIndex[resolvedProviderId] ?? null;
    const resolvedModelId = nextState.modelId && resolvedProvider?.models.some((item) => item.id === nextState.modelId)
      ? nextState.modelId
      : resolvedProvider
        ? pickStudioModelForTier(resolvedProvider, nextState.aiTier)
        : resolvedProviderModel.modelId;
    const nextConfigPayload = buildDeploymentConfig(nextState);
    const currentConfig = readRecord(selectedAgent?.config);
    const currentMetadata = readRecord(selectedAgent?.metadata);
    const mergedConfig = {
      ...currentConfig,
      runtime_supply: readRecord(nextConfigPayload.runtime_supply),
      provider: resolvedProviderId || null,
      model: resolvedModelId || null,
      memory_policy: {
        ...readRecord(currentConfig.memory_policy),
        ...readRecord(nextConfigPayload.memory_policy),
      },
      tool_policy: {
        ...readRecord(currentConfig.tool_policy),
        ...readRecord(nextConfigPayload.tool_policy),
      },
    };
    const mergedMetadata = {
      ...currentMetadata,
      public_tier: nextState.aiTier,
      model_tier: nextState.aiTier,
      empyralis_model_tier: nextState.aiTier,
      billing_source: nextState.aiSource,
    };

    setIsSavingDetailConfig(true);
    setErrorMessage(null);
    try {
      const updated = await services.client.updateDeployedAgent({
        deployedAgentId: agentId,
        persona: nextState.persona.trim(),
        systemPrompt: nextState.systemPrompt.trim(),
        knowledgeSources: parseKnowledgeSources(nextState.knowledgeSourceText),
        provider: resolvedProviderId || null,
        model: resolvedModelId || null,
        billingPlan: nextState.billingPlan,
        config: mergedConfig,
        metadata: mergedMetadata,
      });
      const record = (updated ?? {}) as DeployedAgentRecord;
      setAgents((current) => upsertAgentRecord(current, record));
      setSelectedAgentDetail(record);
      setDetailConfigDraft(buildDetailConfigDraft(record));
      setStatusMessage(`Updated ${readString(record.name, 'assistant')} purpose, AI, actions, and memory settings.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI, actions, and memory settings could not be saved.');
    } finally {
      setIsSavingDetailConfig(false);
    }
  }

  function updateDetailAiTier(nextTier: WizardState['aiTier']) {
    setDetailConfigDraft((current) => {
      if (!current) {
        return current;
      }
      if (current.aiSource === 'empyralis_credits') {
        const route = resolveProviderModelForTier(nextTier, providerCatalog);
        return {
          ...current,
          aiTier: nextTier,
          providerId: route.providerId || current.providerId,
          modelId: route.modelId || current.modelId,
        };
      }
      const provider = providerCatalogIndex[current.providerId] ?? null;
      return {
        ...current,
        aiTier: nextTier,
        modelId: provider ? pickStudioModelForTier(provider, nextTier) : current.modelId,
      };
    });
  }

  function updateDetailProvider(nextProviderId: string) {
    const nextProvider = providerCatalogIndex[nextProviderId] ?? null;
    setDetailConfigDraft((current) => {
      if (!current) {
        return current;
      }
      const nextModelId = nextProvider
        ? pickStudioModelForTier(nextProvider, current.aiTier)
        : '';
      return {
        ...current,
        providerId: nextProviderId,
        modelId: nextModelId,
      };
    });
  }

  function updateDetailModel(nextModelId: string) {
    setDetailConfigDraft((current) => current ? {
      ...current,
      modelId: nextModelId,
      aiTier: inferAiTierFromProviderModel(current.providerId, nextModelId),
    } : current);
  }

  const activeChannels = listEnabledChannels(selectedAgent?.channels);
  const studioTitle = currentStudioSubview === 'agents'
    ? 'Business Agents'
    : currentStudioSubview === 'inbox'
      ? 'Business Agent inbox'
      : 'Business Agent launch';
  const studioSubtitle = currentStudioSubview === 'agents'
    ? 'Workers Sage can run for customer, channel, and business workflows.'
    : currentStudioSubview === 'inbox'
      ? 'Customer sessions and handoffs for Business Agents already working.'
      : 'Go-live checks and spending guardrails for Business Agents.';
  const showAgentsIndex = currentStudioSubview === 'agents' || currentStudioSubview === 'inbox';
  const showReadinessPanel = currentStudioSubview === 'deploy';
  const visibleErrorMessage = isWizardScopedError(errorMessage) ? null : summarizeStudioErrorMessage(errorMessage);
  const isRecoverableLoadTimeout = Boolean(visibleErrorMessage && /too long to respond|timed out/i.test(visibleErrorMessage));
  const isWorkspaceLoadAccessError =
    visibleErrorMessage === 'Business Agents cannot load that workspace data right now. Refresh, or check workspace access if it keeps happening.';
  const hasVisibleAgentWorkspace = Boolean(selectedAgent || agents.length > 0);
  const isAgentListUnavailable = Boolean(visibleErrorMessage && !isRecoverableLoadTimeout && !isLoadingAgents && agents.length === 0);
  const isAgentListPriming = agents.length === 0 && (
    isLoadingAgents
    || isRecoverableLoadTimeout
    || (!hasLoadedAgentListOnce && !isAgentListUnavailable)
  );
  const visibleGlobalErrorMessage =
    isRecoverableLoadTimeout || (isWorkspaceLoadAccessError && hasVisibleAgentWorkspace)
      ? null
      : visibleErrorMessage;
  const hasGatewayOnlineTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target) => target.id === 'local_companion' && target.online),
    [bootstrap.runtime.runtimeTargets],
  );
  const hasCloudComputerAvailableTarget = useMemo(
    () => bootstrap.runtime.runtimeTargets.some((target) => target.id === 'sage_cloud_computer' && target.available),
    [bootstrap.runtime.runtimeTargets],
  );
  const selectedAgentRuntimeOption = studioRuntimeOption(selectedAgentRuntimePlacement);
  const selectedAgentRuntimeBlocker = useMemo(() => {
    if (selectedAgentRuntimePlacement === 'managed_cloud') {
      return null;
    }
    if (selectedAgentRuntimePlacement === 'hosted_hardware_pool' && !hasCloudComputerAvailableTarget) {
      return 'Empyralis Cloud Computer is not enabled for this workspace.';
    }
    if (selectedAgentRuntimePlacement === 'customer_local' && !hasGatewayOnlineTarget) {
      return 'Connect a customer computer before this agent can run there.';
    }
    if (selectedAgentRuntimePlacement === 'customer_hosted') {
      return selectedAgentSelfHostedDeployBlocker;
    }
    return null;
  }, [
    hasCloudComputerAvailableTarget,
    hasGatewayOnlineTarget,
    selectedAgentRuntimePlacement,
    selectedAgentSelfHostedDeployBlocker,
  ]);
  const selectedAgentLaunchReadinessItems = useMemo<LaunchReadinessItem[]>(() => {
    const config = readRecord(selectedAgent?.config);
    const metadata = readRecord(selectedAgent?.metadata);
    const commercePolicy = readRecord(config.commerce_policy ?? metadata.commerce_policy);
    const monthlyCostCapUsd = readNumber(commercePolicy.monthly_cost_cap_usd ?? metadata.monthly_cost_cap_usd);
    const dailyMessageLimit = readNumber(
      config.daily_message_limit
      ?? metadata.daily_message_limit
      ?? commercePolicy.daily_message_limit,
    );
    const instructionText = readString(selectedAgent?.system_prompt ?? config.system_prompt ?? metadata.system_prompt);
    const memoryPolicy = readRecord(config.memory_policy);
    const memoryEnabled = memoryPolicy.memory_enabled === true || metadata.memory_enabled === true;
    return [
      {
        id: 'runtime',
        label: 'Runtime',
        detail: selectedAgentRuntimeBlocker || `${selectedAgentRuntimeOption.label} is ready for this agent.`,
        ok: !selectedAgentRuntimeBlocker,
      },
      {
        id: 'model',
        label: 'Model provider',
        detail: selectedAgentModelDeployBlocker || formatDeploymentModelLabel(selectedAgent, providerCatalogIndex),
        ok: !selectedAgentModelDeployBlocker,
      },
      {
        id: 'instructions',
        label: 'Instructions',
        detail: instructionText.trim() ? 'Behavior instructions are configured.' : 'Add instructions before a customer sees this agent.',
        ok: instructionText.trim().length > 0,
      },
      {
        id: 'channel',
        label: 'Customer channel',
        detail: activeChannels.length > 0 ? `${activeChannels.join(', ')} connected.` : 'Connect Telegram or another customer channel before launch.',
        ok: activeChannels.length > 0,
      },
      {
        id: 'memory',
        label: 'Memory policy',
        detail: memoryEnabled ? 'Customer memory is enabled.' : 'Customer memory is off; the agent will use recent conversation context only.',
        ok: true,
      },
      {
        id: 'limits',
        label: 'Usage limits',
        detail: monthlyCostCapUsd || dailyMessageLimit ? 'Cost or message limits are configured.' : 'Default production limits apply.',
        ok: true,
      },
    ];
  }, [
    activeChannels,
    providerCatalogIndex,
    selectedAgent,
    selectedAgentModelDeployBlocker,
    selectedAgentRuntimeBlocker,
    selectedAgentRuntimeOption.label,
  ]);

  async function handleDeleteExternalUserData() {
    const agentId = readString(selectedAgent?.id);
    const selectedTranscriptCustomer = readRecord(selectedTranscript?.customer);
    const selectedExternalUserId = readString(selectedTranscriptCustomer.id || readRecord(selectedConversation?.customer).id);
    const selectedExternalUserLabel = readString(
      selectedTranscriptCustomer.label || readRecord(selectedConversation?.customer).label,
      'this customer',
    );
    const channel = readString(selectedConversation?.channel || selectedTranscript?.channel).toLowerCase();
    if (!agentId || !selectedExternalUserId || !channel) {
      return;
    }
    const confirmed = window.confirm(
      `Delete saved conversation data for ${selectedExternalUserLabel} from this Business Agent? This removes message history, memory summaries, and usage records for that user.`,
    );
    if (!confirmed) {
      return;
    }
    setBusyExternalUserId(selectedExternalUserId);
    setErrorMessage(null);
    try {
      await services.client.deleteDeployedAgentExternalUserData({
        deployedAgentId: agentId,
        externalUserId: selectedExternalUserId,
        channel,
        sessionId: readString(selectedConversation?.session_id || selectedTranscript?.session_id) || undefined,
      });
      setSelectedSessionId(null);
      setSelectedTranscript(null);
      await Promise.all([
        loadConversations(agentId),
        loadAgentAnalytics(agentId),
        loadMemoryEntries(agentId),
      ]);
      setStatusMessage(`Deleted saved data for ${selectedExternalUserLabel} from ${readString(selectedAgent?.name, 'this Business Agent')}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Customer data could not be deleted.');
    } finally {
      setBusyExternalUserId(null);
    }
  }

  const handleOpenChatProof = useStableEvent(() => {
    router.push(`/w/${encodeURIComponent(workspaceId)}/sage`);
  });

  const handleOpenBilling = useStableEvent(() => {
    router.push(`/w/${encodeURIComponent(workspaceId)}/settings?section=billing`);
  });

  const handleExportAudit = useStableEvent(async (agentId: string) => {
    const cleanAgentId = readString(agentId, '');
    if (!cleanAgentId) {
      setErrorMessage('Select a Business Agent before exporting its audit log.');
      return;
    }
    setBusyAuditExportAgentId(cleanAgentId);
    setErrorMessage(null);
    try {
      const payload = await services.client.exportDeployedAgentAudit({
        deployedAgentId: cleanAgentId,
        limit: 500,
      });
      const agentLabel = readString(
        selectedAgent?.id === cleanAgentId ? selectedAgent?.name : agents.find((item) => readString(item.id, '') === cleanAgentId)?.name,
        cleanAgentId,
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || cleanAgentId;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${agentLabel}-audit.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatusMessage('Audit export downloaded.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Audit export could not be downloaded.');
    } finally {
      setBusyAuditExportAgentId(null);
    }
  });

  const handleOpenAssistantDetail = useStableEvent((id: string) => {
    setSelectedAgentId(id);
    setOverlayAgentId(null);
    selectOverlayTab('overview');
  });

  const handleRefreshAgentsEvent = useStableEvent(() => {
    void Promise.all([
      refreshProviderCatalog(),
      refreshAgents({ preserveSelection: true }),
    ]);
  });

  const handleSelectAgent = useStableEvent((id: string) => {
    setSelectedAgentId(id);
    setOverlayAgentId(null);
    selectOverlayTab('overview');
  });

  const handleSaveDetailConfigEvent = useStableEvent(() => {
    void saveDetailConfig();
  });

  const handleUpdateDetailConfig = useStableEvent((next: Partial<DetailConfigDraft>) => {
    setDetailConfigDraft((current) => current ? { ...current, ...next } : current);
  });

  const handleUploadKnowledgeFile = useStableEvent(async (file: File) => {
    const agentId = readString(selectedAgentId);
    if (!agentId) {
      throw new Error('Select a Business Agent before uploading knowledge.');
    }
    const contentText = await file.text();
    const uploaded = await services.client.uploadDeployedAgentKnowledgeFile({
      deployedAgentId: agentId,
      fileName: file.name,
      contentText,
    });
    const uploadedRecord = readRecord(readRecord(uploaded).deployed_agent);
    if (!Object.keys(uploadedRecord).length) {
      throw new Error('Knowledge file uploaded, but the Business Agent record was not returned.');
    }
    const record = uploadedRecord as DeployedAgentRecord;
    setAgents((current) => upsertAgentRecord(current, record));
    setSelectedAgentDetail(record);
    setDetailConfigDraft(buildDetailConfigDraft(record));
    setStatusMessage(`Added ${file.name} to ${readString(record.name, 'Business Agent')} knowledge.`);
  });

  const handleRefreshProviderModelsEvent = useStableEvent((id: string) => {
    void refreshProviderModels(id);
  });

  const handleSaveProviderCredential = useStableEvent(async (providerId: string, apiKey: string) => {
    const normalizedProviderId = readString(providerId);
    const normalizedApiKey = readString(apiKey);
    if (!normalizedProviderId || !normalizedApiKey) {
      throw new Error('Select a provider and paste its API key first.');
    }
    setIsSavingProviderCredential(true);
    setErrorMessage(null);
    try {
      await services.client.upsertWorkspaceProviderCredential({
        provider: normalizedProviderId,
        apiKey: normalizedApiKey,
        baseUrl: null,
        model: null,
      });
      await refreshProviderModels(normalizedProviderId);
      const providerLabel = providerCatalogIndex[normalizedProviderId]?.label ?? normalizedProviderId;
      setStatusMessage(`${providerLabel} API key saved for this workspace.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'API key could not be saved.';
      setErrorMessage(message);
      throw new Error(message);
    } finally {
      setIsSavingProviderCredential(false);
    }
  });

  const handleDeploy = useStableEvent(() => {
    void handleDeploymentAction('deploy');
  });

  const handlePause = useStableEvent(() => {
    void handleDeploymentAction('pause');
  });

  const handleOpenCreateWizard = useStableEvent((templateId: string = selectedTemplateId) => {
    openCreateWizard(templateId);
  });

  const handleDismissRecentlyCreated = useStableEvent(() => {
    setRecentlyCreatedAgentId(null);
  });

  const selectedTranscriptCustomer = readRecord(selectedTranscript?.customer);
  const selectedExternalUserId = readString(selectedTranscriptCustomer.id || readRecord(selectedConversation?.customer).id);
  const selectedExternalUserLabel = readString(
    selectedTranscriptCustomer.label || readRecord(selectedConversation?.customer).label,
    'this customer',
  );
  const overlayMemoryAgentId = readString(overlayAgentId || selectedAgentId);
  const overlayMemoryEntries = overlayMemoryAgentId
    ? agentMemoryById[overlayMemoryAgentId] ?? []
    : [];
  const filteredAgents = useMemo(
    () => agents.filter((agent) => agentMatchesStudioRosterFilter(agent, studioRosterFilter)),
    [agents, studioRosterFilter],
  );

  return (
    <WorkstationSurfaceRoot surface="deployed-agents">
      <ListDetailShell
        className={joinClassNames(
          'app-studio-shell',
          currentStudioSubview === 'agents' && 'app-studio-shell--agents',
        )}
        title={studioTitle}
        subtitle={studioSubtitle}
      >
        {visibleGlobalErrorMessage ? (
          <PlatformNotification
            tone="danger"
            title="Business Agents are having trouble loading"
            detail="Studio keeps successfully loaded agent data visible while retrying failed requests."
            onClose={() => setErrorMessage(null)}
          >
            {visibleGlobalErrorMessage}
          </PlatformNotification>
        ) : statusMessage ? (
          <PlatformNotification
            tone="success"
            title="Assistant updated"
            detail={statusMessage}
            onClose={() => setStatusMessage(null)}
          />
        ) : null}

        <WorkstationSplitWorkbench
          ariaLabel="Agents"
          className={joinClassNames(
            'studio-agents-workbench',
          )}
          resizableSidebar
          sidebarResizeStorageKey={`empyralis:studio-agent-roster-width:${workspaceId}`}
          sidebarDefaultWidth={330}
          sidebarMinWidth={96}
          sidebarMaxWidth={440}
          sidebar={(
            <AgentRosterSidebar
              showAgentsIndex={showAgentsIndex}
              recentlyCreatedAgentId={recentlyCreatedAgentId}
              selectedAgent={selectedAgent}
              onDismissRecentlyCreated={handleDismissRecentlyCreated}
              onOpenChatProof={handleOpenChatProof}
              onOpenBilling={handleOpenBilling}
              onExportAudit={handleExportAudit}
              onOpenAssistantDetail={handleOpenAssistantDetail}
              onOpenCreateWizard={handleOpenCreateWizard}
              currentStudioSubview={currentStudioSubview}
              onRefreshAgents={handleRefreshAgentsEvent}
              studioTemplates={studioTemplates}
              agents={filteredAgents}
              selectedAgentId={selectedAgentId}
              busyAuditExportAgentId={busyAuditExportAgentId}
              onSelectAgent={handleSelectAgent}
              agentMetricsById={agentMetricsById}
              isAgentListPriming={isAgentListPriming}
              isAgentListUnavailable={isAgentListUnavailable}
              showReadinessPanel={showReadinessPanel}
              activeChannels={activeChannels}
              selectedAgentModelDeployBlocker={selectedAgentModelDeployBlocker}
              selectedAgentRuntimeOption={selectedAgentRuntimeOption}
              selectedAgentRuntimeBlocker={selectedAgentRuntimeBlocker}
              selectedAgentRuntimePlacement={selectedAgentRuntimePlacement}
              selectedAgentLaunchReadinessItems={selectedAgentLaunchReadinessItems}
              selectedAgentSelfHostedNode={selectedAgentSelfHostedNode}
              selectedAgentSelfHostedDeployBlocker={selectedAgentSelfHostedDeployBlocker}
              selfHostedNodeHealthLabel={selfHostedNodeHealthLabel}
            />
          )}
        >
          {currentStudioSubview === 'agents' && !selectedAgent ? (
            isAgentListPriming || isAgentListUnavailable ? (
              <div className="studio-agent-detail-empty" data-loading={isAgentListPriming} aria-label="Agent detail">
                {isAgentListPriming ? (
                  <div className="studio-agent-detail-loading-body app-stack-5">
                    <SkeletonBlock height="8rem" />
                    <div className="studio-agent-overview__grid">
                      <SkeletonBlock height="12rem" />
                      <SkeletonBlock height="12rem" />
                      <SkeletonBlock height="12rem" />
                      <SkeletonBlock height="12rem" />
                    </div>
                  </div>
                ) : isAgentListUnavailable ? (
                  <>
                    <strong>Agent list did not load</strong>
                    <span>Retry the Business Agent list.</span>
                    <AppButton type="button" tone="secondary" onClick={handleRefreshAgentsEvent}>
                      Retry
                    </AppButton>
                  </>
                ) : null}
              </div>
            ) : agents.length === 0 ? (
              <div className="studio-agent-detail-empty" aria-label="No Business Agents">
                <strong>No Business Agents yet</strong>
                <span>Create a worker to configure knowledge, model, actions, channels, and test chat.</span>
                <AppButton type="button" onClick={() => openCreateWizard(CUSTOM_STUDIO_TEMPLATE.id)}>
                  Create Business Agent
                </AppButton>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="studio-agent-detail-empty" aria-label="No matching Business Agents">
                <strong>No Business Agents match this filter</strong>
                <span>Choose another Studio filter or create a new Business Agent.</span>
                <AppButton type="button" tone="secondary" onClick={handleRefreshAgentsEvent}>
                  Refresh
                </AppButton>
              </div>
            ) : (
              <div className="app-watermark">
                <StudioIcon className="app-watermark__icon" size={48} />
                <div className="app-watermark__text">Select a Business Agent to view configuration and signals</div>
              </div>
            )
          ) : null}

          {currentStudioSubview === 'agents' && selectedAgent && (
            <AgentDetailView
              selectedAgent={selectedAgent}
              overlayTab={overlayTab}
              detailConfigDraft={detailConfigDraft}
              onSaveDetailConfig={handleSaveDetailConfigEvent}
              isSavingDetailConfig={isSavingDetailConfig}
              onUpdateDetailConfig={handleUpdateDetailConfig}
              onUploadKnowledgeFile={handleUploadKnowledgeFile}
              providerCatalog={providerCatalog}
              isLoadingProviderCatalog={isLoadingProviderCatalog}
              onRefreshProviderModels={handleRefreshProviderModelsEvent}
              onSaveProviderCredential={handleSaveProviderCredential}
              isSavingProviderCredential={isSavingProviderCredential}
              workspaceId={workspaceId}
              services={services}
              bootstrap={bootstrap}
              runtimeAttachments={runtimeAttachments}
              selectedAgentAnalytics={selectedAnalytics}
              isLoadingAnalytics={isLoadingAnalytics}
              selectedAgentMetrics={selectedAgentMetrics}
              selectedTelegramReadiness={selectedTelegramReadiness}
              isLoadingTelegramReadiness={isLoadingTelegramReadiness}
              onOpenEditWizard={openEditWizard}
              onDeploy={handleDeploy}
              onPause={handlePause}
              busyAgentId={busyAgentId}
              hasGatewayOnlineTarget={hasGatewayOnlineTarget}
              hasCloudComputerAvailableTarget={hasCloudComputerAvailableTarget}
              isLoadingDetail={isLoadingDetail}
              overlayMemoryEntries={overlayMemoryEntries}
              isLoadingOverlayMemory={isLoadingOverlayMemory}
              currentStudioSubview={currentStudioSubview}
              onSelectTab={selectOverlayTab}
              connectorVaultIds={connectorVaultIds}
              selectedAgentModelDeployBlocker={selectedAgentModelDeployBlocker}
              selectedAgentSelfHostedDeployBlocker={selectedAgentSelfHostedDeployBlocker}
              selectedStudioTemplate={selectedStudioTemplate}
              onOpenCreateWizard={handleOpenCreateWizard}
            />
          )}

          {currentStudioSubview === 'inbox' && (
            <AgentInboxView
              selectedAgent={selectedAgent}
              conversations={conversations}
              isLoadingConversations={isLoadingConversations}
              conversationFilters={conversationFilters}
              onUpdateFilters={(next) => setConversationFilters((current) => ({ ...current, ...next }))}
              selectedSessionId={selectedSessionId}
              onSelectSession={setSelectedSessionId}
              selectedConversation={selectedConversation}
              isLoadingTranscript={isLoadingTranscript}
              selectedTranscript={selectedTranscript}
              onDeleteCustomerData={() => { void handleDeleteExternalUserData(); }}
              busyExternalUserId={busyExternalUserId}
              selectedExternalUserId={selectedExternalUserId}
              selectedExternalUserLabel={selectedExternalUserLabel}
              channelFilterOptions={channelFilterOptions}
              escalationFilterOptions={escalationFilterOptions}
              outcomeFilterOptions={outcomeFilterOptions}
              filteredConversations={filteredConversations}
            />
          )}
        </WorkstationSplitWorkbench>

        <AgentWizard
          open={isWizardOpen}
          mode={wizardMode}
          onClose={closeWizard}
          templateId={selectedTemplateId}
          onSuccess={(record) => { void handleWizardSuccess(record); }}
          workspaceId={workspaceId}
          bootstrap={bootstrap}
          services={services}
          providerCatalog={providerCatalog}
          runtimeAttachments={runtimeAttachments}
          isLoadingProviderCatalog={isLoadingProviderCatalog}
          isLoadingRuntimeAttachments={isLoadingRuntimeAttachments}
          selectedAgent={selectedAgent}
        />
      </ListDetailShell>
    </WorkstationSurfaceRoot>
  );
}
