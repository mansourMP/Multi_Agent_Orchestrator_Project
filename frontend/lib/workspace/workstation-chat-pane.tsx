'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SquarePen,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { CommandSheet } from '@/lib/ui/command-sheet';
import { ConfirmDialog } from '@/lib/ui/confirm-dialog';
import { FormField, FormGrid, FormInput, FormSection, FormTextarea } from '@/lib/ui/form-controls';
import { AppButton, AppNotice, AppShinyText } from '@/lib/ui/primitives';
import { ScrollRegion } from '@/lib/ui/scroll-region';
import {
  ChatComposer,
  type ComposerPreRunCostEstimate,
  type ComposerToolGroup,
} from '@/lib/workspace/chat-composer';
import type {
  WorkstationChatArtifactReference,
  WorkstationChatMessageRecord,
} from '@/lib/workspace/chat-message';
import { CodexChatCell, type CodexApprovalAction } from '@/lib/workspace/codex-chat/cell-components';
import type { CodexTranscriptCell } from '@/lib/workspace/codex-chat/cells';
import {
  resolveModelContextWindow,
} from '@/lib/workspace/model-capabilities';
import { useWorkstationDesktopBridge } from '@/lib/workspace/workstation-desktop-bridge';
import type { WorkspaceBootstrapRuntimeTarget } from '@/lib/workspace/workspace-bootstrap';
import {
  resolveWorkstationApproval,
  subscribeWorkstationApprovalResolved,
} from '@/lib/workspace/workstation-approval-events';
import { useWorkspaceBoundary } from '@/lib/workspace/workspace-boundary';
import { subscribeWorkstationProviderChanged } from '@/lib/workspace/workstation-provider-events';
import {
  useWorkspaceServices,
  useWorkstationActivityVersion,
  useWorkstationStreamSelector,
} from '@/lib/workspace/workspace-services';
import {
  WorkstationClientError,
  type WorkstationAgentTraceEvent,
  type WorkstationAgentTraceRecord,
  type ProviderCatalogModelRecord,
  type ProviderCatalogRecord,
  type ProviderProfileRecord,
  type VaultCredentialRecord,
  type WorkstationSageMemoryRecord,
  type WorkstationSageProfileRecord,
  type WorkstationSessionActor,
  type WorkstationSessionRecord,
  type WorkstationTurnStreamAbortHandle,
  type WorkstationTurnResponse,
} from '@/lib/workspace/workstation-client';
import {
  type CanonicalApprovalSummary,
  type CanonicalChatThreadState,
  type CanonicalRunSummary,
  type ChatAutonomyMode,
  type ChatMachineTrust,
  type ChatModelOption,
  type ChatReasoningEffort,
  type GatewayReadinessDoctorPayload,
  type LiveActivityStepState,
  type SageMemoryCategoryRecord,
  type LiveTraceState,
  type RecentThreadSummary,
  type SageMemoryDraft,
  type SageMemorySnapshot,
  type SageProfileSnapshot,
  type SageSetupSurfaceState,
  type SageToolPolicyRecord,
  type SendFailureNotice,
  refreshProviderModelCatalog,
  useChatComposerState,
  useChatMemoryEditorState,
  useChatMemoryProfileState,
  useChatProviderModelState,
  useChatRunAndApprovalState,
  useChatStreamRunState,
  useChatThreadState,
  useChatUiPanelsState,
} from '@/lib/workspace/workstation-chat-pane-hooks';
import {
  isApprovalsPlanError,
  loadChatMemorySnapshot,
  loadChatProfileSnapshot,
} from '@/lib/workspace/workstation-chat-memory-loaders';
import { useWorkstationTimelineProjection } from '@/lib/workspace/workstation-chat-timeline-projection';
import {
  PRIMARY_THREAD_ID,
  CHAT_READ_TIMEOUT_MS,
  SAGE_SETUP_TIMEOUT_MS,
  CHAT_THINKING_RECOVERY_MS,
  ACTIVE_THREAD_QUERY_KEY,
  RUNS_QUERY_KEY,
  APPROVALS_QUERY_KEY,
  SAGE_MEMORY_QUERY_KEY,
  SAGE_PROFILE_QUERY_KEY,
  RECENT_THREADS_QUERY_KEY,
  activeThreadStorageKey,
  readPersistedActiveThread,
  persistActiveThread,
  threadQueryKey,
  readString,
  isSmallOllamaSelection,
  readNumber,
  readObject,
  mergeTraceEvents,
  isTerminalTraceEvent,
  normalizeTraceStreamEvent,
  buildLiveTraceRecord,
  isTextEditingTarget,
  isSyntheticTranscriptMessage,
  isProviderRuntimeGateMessage,
  isProviderGateSystemCell,
  isProviderGateTranscriptCell,
  normalizeCanonicalChatThread,
  normalizeCanonicalRunItems,
  normalizeCanonicalApprovalItems,
  normalizeProviderCatalogRecords,
  normalizeProviderProfiles,
  sortProviderProfiles,
  profileMetadataRecord,
  normalizeTimelineItems,
  deriveRecentThreads,
  summarizeThreadForHistory,
  readExecutionTarget,
  resolveRuntimeTrustZone,
  EMPYRALIS_TIER_SET,
  USER_OWNED_SECTION_LABELS,
  isProviderEligibleForModelSelector,
  workspaceDefaultModelOption,
  disconnectedModelOption,
  providerPathLabel,
  providerSummaryLabel,
  providerFailureMessageForProvider,
  providerFailureNoticeForProvider,
  providerReadyForChat,
  modelOptionDisplayLabel,
  normalizeChatModelOptions,
  normalizeHostedCreditStateForChat,
  buildPreRunCostEstimate,
  formatContextWindowLabel,
  reasoningLabel,
  findProviderFailureIntervention,
  createCanonicalAssistantMessage,
  createPendingUserMessage,
  createClientTurnRequestId,
  createIncompleteAssistantMessage,
  canonicalIncludesMessage,
  projectedAssistantLooksSynthetic,
  upsertLiveActivityStep,
  normalizeStepEvent,
  settleLiveActivitySteps,
  countArtifacts,
  localCompanionTarget,
  localDevicePlatformLabel,
  summarizeRuntimeCard,
  classifyStatusNotice,
  isLocalCompanionGateMessage,
  browserReadinessPill,
  normalizeSageMemorySnapshot,
  defaultSageProfileSnapshot,
  normalizeSageProfileSnapshot,
  humanizeSageSetupFailure,
  withTimeout,
  hostedCreditsFallbackProvider,
  normalizeSageToolPolicy,
  normalizeConnectorVaultRecords,
  toolPolicyEnabled,
  hasConnectedConnector,
  defaultSageMemoryDraft,
  isTransientBackgroundReadError,
  shouldSuppressBackgroundRefreshNotice,
  formatRelativeTime,
  runPreviewLabel,
  runContextTitle,
  resolveProviderModelContext,
  resolvePersistedSelectedModelId
} from '@/lib/workspace/workstation-chat-pane-model';
import type {
  SageReadinessPill,
  GatewayReadinessRegistration,
  ChatRuntimeTrustZone
} from '@/lib/workspace/workstation-chat-pane-model';


export function WorkstationChatPane() {
  const { bootstrap, routeManifest, hasCapability } = useWorkspaceBoundary();
  const services = useWorkspaceServices();
  const activityVersion = useWorkstationActivityVersion();
  const activityConnectionState = useWorkstationStreamSelector((state) => state.activity.connectionState);
  const notificationsConnectionState = useWorkstationStreamSelector((state) => state.notifications.connectionState);
  const desktop = useWorkstationDesktopBridge();
  const router = useRouter();
  const actor = useMemo<WorkstationSessionActor>(() => ({
    type: 'user',
    id: bootstrap.account.id,
    display_name: bootstrap.account.displayName ?? bootstrap.account.email,
  }), [bootstrap.account.displayName, bootstrap.account.email, bootstrap.account.id]);

  const {
    activeThreadId,
    setActiveThreadId,
    activeThreadIdRef,
    thread,
    setThread,
    threadRef,
    recentThreads,
    setRecentThreads,
  } = useChatThreadState({
    queryClient: services.queryClient,
    activeThreadQueryKey: ACTIVE_THREAD_QUERY_KEY,
    recentThreadsQueryKey: RECENT_THREADS_QUERY_KEY,
    workspaceStorageKey: activeThreadStorageKey(bootstrap.workspace.id),
    primaryThreadId: PRIMARY_THREAD_ID,
    threadQueryKey,
  });
  const {
    draft,
    setDraft,
    statusMessage,
    setStatusMessage,
    sendFailureNotice,
    setSendFailureNotice,
    isSending,
    setIsSending,
  } = useChatComposerState();
  const { runs, setRuns, approvals, setApprovals } = useChatRunAndApprovalState(
    services.queryClient,
    RUNS_QUERY_KEY,
    APPROVALS_QUERY_KEY,
  );
  const {
    profileSnapshot,
    setProfileSnapshot,
    sageSetupState,
    setSageSetupState,
    sageSetupMessage,
    setSageSetupMessage,
    bootstrapAnswer,
    setBootstrapAnswer,
    memorySnapshot,
    setMemorySnapshot,
  } = useChatMemoryProfileState({
    queryClient: services.queryClient,
    profileQueryKey: SAGE_PROFILE_QUERY_KEY,
    memoryQueryKey: SAGE_MEMORY_QUERY_KEY,
    defaultProfile: defaultSageProfileSnapshot(),
    defaultMemory: normalizeSageMemorySnapshot(null),
  });
  const {
    pendingUserMessage,
    setPendingUserMessage,
    pendingUserMessageRef,
    streamingAssistantText,
    setStreamingAssistantText,
    streamingAssistantTextRef,
    liveTimelineEvents,
    setLiveTimelineEvents,
    showProjectedAssistant,
    setShowProjectedAssistant,
    timelineSettled,
    setTimelineSettled,
    liveActivitySteps,
    setLiveActivitySteps,
    liveActivityStepsRef,
    liveTrace,
    setLiveTrace,
    markTurnActivity,
    lastTurnActivityAtRef,
  } = useChatStreamRunState();
  const {
    selectedExecutionPlacement,
    machineTrust,
    setMachineTrust,
    autonomyMode,
    setAutonomyMode,
    modelOptions,
    setModelOptions,
    selectedModel,
    setSelectedModel,
    providerCatalog,
    setProviderCatalog,
    providerProfiles,
    setProviderProfiles,
    toolPolicy,
    setToolPolicy,
    connectorCredentials,
    setConnectorCredentials,
    browserGatewayDoctor,
    setBrowserGatewayDoctor,
    reasoningEffort,
    setReasoningEffort,
    isPersistingModelSelection,
    setIsPersistingModelSelection,
  } = useChatProviderModelState(disconnectedModelOption());
  const {
    titlebarActionsHost,
    setTitlebarActionsHost,
    isLoading,
    setIsLoading,
    isSubmittingBootstrap,
    setIsSubmittingBootstrap,
    isRetryingSageSetup,
    setIsRetryingSageSetup,
    hasEnteredConversationFlow,
    setHasEnteredConversationFlow,
    smallModelWarningVisible,
    setSmallModelWarningVisible,
    resolvingApprovalId,
    setResolvingApprovalId,
    mutatingMemory,
    setMutatingMemory,
    memoryFilter,
    setMemoryFilter,
    isApprovalsSheetOpen,
    setIsApprovalsSheetOpen,
    isMemorySheetOpen,
    setIsMemorySheetOpen,
  } = useChatUiPanelsState();
  const {
    memoryDraft,
    setMemoryDraft,
    pendingDeleteMemoryId,
    setPendingDeleteMemoryId,
  } = useChatMemoryEditorState(defaultSageMemoryDraft());
  const [billingSummary, setBillingSummary] = useState<Record<string, unknown> | null>(null);
  const submitInFlightRef = useRef(false);
  const streamAbortHandleRef = useRef<WorkstationTurnStreamAbortHandle | null>(null);
  const streamAbortRequestedRef = useRef(false);
  const streamInFlightRef = useRef(false);
  const activeTurnRequestIdRef = useRef<string | null>(null);

  const updatePendingUserMessage = useCallback((message: WorkstationChatMessageRecord | null) => {
    pendingUserMessageRef.current = message;
    setPendingUserMessage(message);
  }, []);

  useEffect(() => {
    if (!pendingUserMessage) {
      return;
    }
    const canonicalMessages = thread.messages.filter((message) => !isSyntheticTranscriptMessage(message));
    if (canonicalIncludesMessage(canonicalMessages, pendingUserMessage)) {
      updatePendingUserMessage(null);
    }
  }, [pendingUserMessage, thread.messages, updatePendingUserMessage]);


  const refreshProviderCatalog = useCallback(async () => {
    const payload = await services.queryClient.run('chat:provider-catalog', async () => {
      const profileRequest = services.client.listProviderProfiles().catch(() => ({ items: [] }));
      const catalogRequest = (async () => {
        try {
          return await services.client.listProviderCatalog();
        } catch {
          return await services.client.listProviders();
        }
      })();
      const [catalogPayload, profilesPayload] = await Promise.all([catalogRequest, profileRequest]);
      return {
        catalogPayload,
        profilesPayload,
      };
    }).catch(() => null);

    if (!payload || typeof payload !== 'object') {
      setProviderCatalog((current) => (current.length > 0 ? current : [hostedCreditsFallbackProvider()]));
      setProviderProfiles((current) => current);
      setModelOptions((current) => (
        current.some((option) => option.providerId)
          ? current
          : normalizeChatModelOptions({ providers: [hostedCreditsFallbackProvider()] })
      ));
      return;
    }

    const nextCatalog = refreshProviderModelCatalog(payload, {
      normalizeProviderCatalogRecords,
      normalizeProviderProfiles,
      normalizeChatModelOptions,
      hostedCreditsFallbackProvider,
      workspaceDefaultModelOption,
    });
    setProviderCatalog(nextCatalog.providers);
    setProviderProfiles(nextCatalog.profiles);
    setModelOptions(nextCatalog.options);
  }, [services.client, services.queryClient]);

  const refreshToolingState = useCallback(async () => {
    const payload = await services.queryClient.run('chat:tooling-state', async () => {
      const [toolPolicyPayload, connectorsPayload] = await Promise.all([
        services.client.getSageToolPolicy().catch(() => ({ tools: [] })),
        services.client.listConnectorsVault().catch(() => ({ items: [] })),
      ]);
      return {
        toolPolicyPayload,
        connectorsPayload,
      };
    }).catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return;
    }

    setToolPolicy(normalizeSageToolPolicy((payload as { toolPolicyPayload?: unknown }).toolPolicyPayload));
    setConnectorCredentials(normalizeConnectorVaultRecords((payload as { connectorsPayload?: unknown }).connectorsPayload));
  }, [services.client, services.queryClient]);

  const refreshBrowserGatewayReadiness = useCallback(async () => {
    const doctorPayload = await services.queryClient.run('chat:gateway-readiness', async () => {
      const registrationsPayload = await services.client.requestJson<Record<string, unknown>>({
        path: `/api/gateway/registrations?workspace_id=${encodeURIComponent(bootstrap.workspace.id)}`,
        allowStatuses: [404],
      });
      const registrations = Array.isArray(registrationsPayload?.items)
        ? registrationsPayload.items.filter((item): item is GatewayReadinessRegistration => Boolean(item) && typeof item === 'object')
        : [];
      const selectedGateway = registrations.find((item) =>
        readString(item.connection_status || item.status).toLowerCase() === 'online',
      ) ?? registrations[0] ?? null;
      const gatewayId = readString(selectedGateway?.gateway_id) || null;
      if (!gatewayId) {
        return null;
      }
      return await services.client.requestJson<GatewayReadinessDoctorPayload>({
        path: `/api/gateway/registrations/${encodeURIComponent(gatewayId)}/doctor`,
        allowStatuses: [403, 404],
      });
    }).catch(() => null);
    setBrowserGatewayDoctor(doctorPayload && typeof doctorPayload === 'object' ? doctorPayload : null);
  }, [bootstrap.workspace.id, services.client, services.queryClient]);

  const refreshBillingSummary = useCallback(async () => {
    const payload = await services.queryClient.run('chat:billing-summary', async () => {
      return await services.client.getBillingSummary();
    }).catch(() => null);
    setBillingSummary(payload && typeof payload === 'object' ? payload : null);
  }, [services.client, services.queryClient]);

  const persistSelectedModelPreference = useCallback(async (nextModelId: string) => {
    const sortedProfiles = sortProviderProfiles(providerProfiles).filter((profile) => {
      const providerId = readString(profile.provider);
      return providerId && providerCatalog.some((provider) =>
        readString(provider.id) === providerId && isProviderEligibleForModelSelector(provider));
    });

    if (sortedProfiles.length === 0) {
      return false;
    }

    const targetOption = nextModelId === 'default'
      ? null
      : modelOptions.find((option) => option.id === nextModelId) ?? null;
    const targetProviderId = readString(targetOption?.providerId || targetOption?.routeProviderId);
    const targetProfile = targetProviderId
      ? sortedProfiles.find((profile) => readString(profile.provider) === targetProviderId && profile.enabled !== false) ?? null
      : null;

    if (nextModelId !== 'default' && (!targetOption || !targetProviderId || !targetProfile)) {
      return false;
    }

    await Promise.all(sortedProfiles.map((profile) => {
      const optionIsSelected = readString(profile.id) === readString(targetProfile?.id);
      const selectedTier = optionIsSelected
        && targetOption
        && targetOption.uiSection === 'empyralis'
        && EMPYRALIS_TIER_SET.has(readString(targetOption.id).toLowerCase())
        ? readString(targetOption.id).toLowerCase()
        : null;
      const metadata = {
        ...profileMetadataRecord(profile),
        chat_model_selection: optionIsSelected ? 'explicit' : 'default',
        chat_model_tier: selectedTier,
      };
      return services.client.upsertProviderProfile({
        id: readString(profile.id) || null,
        provider: readString(profile.provider),
        label: readString(profile.label) || `Sage ${readString(profile.provider)}`,
        credentialId: readString(profile.credential_id) || null,
        authMode: readString(profile.auth_mode) || null,
        priority: Number(profile.priority ?? 100),
        enabled: profile.enabled !== false,
        model: optionIsSelected
          ? readString(targetOption?.routeModelId || targetOption?.id) || readString(profile.model) || null
          : readString(profile.model) || null,
        metadata,
      });
    }));

    return true;
  }, [modelOptions, providerCatalog, providerProfiles, services.client]);

  const writeThreadState = (nextThread: CanonicalChatThreadState) => {
    const normalizedMessages = nextThread.messages.filter((message) => !isSyntheticTranscriptMessage(message));
    const mergedThread: CanonicalChatThreadState = {
      ...nextThread,
      messages: normalizedMessages,
    };
    services.queryClient.set(threadQueryKey(mergedThread.threadId), mergedThread);
    services.queryClient.set(ACTIVE_THREAD_QUERY_KEY, nextThread.threadId);
    persistActiveThread(bootstrap.workspace.id, mergedThread.threadId);
    activeThreadIdRef.current = mergedThread.threadId;
    setActiveThreadId(mergedThread.threadId);
    setThread(mergedThread);

    const pendingMessage = pendingUserMessageRef.current;
    if (pendingMessage && canonicalIncludesMessage(mergedThread.messages, pendingMessage)) {
      updatePendingUserMessage(null);
    }
  };

  const writeOverview = ({
    nextRuns,
    nextApprovals,
  }: {
    nextRuns: CanonicalRunSummary[];
    nextApprovals: CanonicalApprovalSummary[];
  }) => {
    services.queryClient.set(RUNS_QUERY_KEY, nextRuns);
    services.queryClient.set(APPROVALS_QUERY_KEY, nextApprovals);
    setRuns(nextRuns);
    setApprovals(nextApprovals);
  };

  const writeMemorySnapshot = (nextSnapshot: SageMemorySnapshot) => {
    services.queryClient.set(SAGE_MEMORY_QUERY_KEY, nextSnapshot);
    setMemorySnapshot(nextSnapshot);
  };

  const writeProfileSnapshot = (nextSnapshot: SageProfileSnapshot) => {
    services.queryClient.set(SAGE_PROFILE_QUERY_KEY, nextSnapshot);
    setProfileSnapshot(nextSnapshot);
    setSageSetupState(nextSnapshot.bootstrap.complete ? 'ready' : 'required');
    setSageSetupMessage(null);
  };

  const writeRecentThreads = (items: RecentThreadSummary[]) => {
    services.queryClient.set(RECENT_THREADS_QUERY_KEY, items);
    setRecentThreads(items);
  };

  const loadThread = async (requestedThreadId = activeThreadId) => {
    const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(requestedThreadId));
    const payload = await services.queryClient.run(
      `chat:canonical:thread-load:${requestedThreadId}`,
      async () => withTimeout(
        services.client.getThread({
          threadId: requestedThreadId,
          allowMissing: true,
        }),
        CHAT_READ_TIMEOUT_MS,
        'Conversation history took too long to load.',
      ),
    );
    if (payload === null) {
      if (cachedThread && cachedThread.messages.length > 0) {
        if (activeThreadIdRef.current === requestedThreadId) {
          setThread(cachedThread);
        }
        return cachedThread;
      }
      if (thread.threadId === requestedThreadId && thread.messages.length > 0) {
        return thread;
      }
    }
    const nextThread = normalizeCanonicalChatThread(payload, requestedThreadId);
    nextThread.session = cachedThread?.session ?? null;
    services.queryClient.set(threadQueryKey(nextThread.threadId), nextThread);
    if (activeThreadIdRef.current === requestedThreadId) {
      writeThreadState(nextThread);
    }
    return nextThread;
  };

  const loadOverview = async () => {
    const runsFallback = services.queryClient.peek<CanonicalRunSummary[]>(RUNS_QUERY_KEY) ?? runs;
    const approvalsFallback = services.queryClient.peek<CanonicalApprovalSummary[]>(APPROVALS_QUERY_KEY) ?? approvals;
    const recentThreadsFallback = services.queryClient.peek<RecentThreadSummary[]>(RECENT_THREADS_QUERY_KEY) ?? recentThreads;

    const runsRequest = services.client.listRuns({
      limit: 12,
    }).then(normalizeCanonicalRunItems).catch((error) => {
      if (isTransientBackgroundReadError(error)) {
        return runsFallback;
      }
      throw error;
    });
    const approvalsRequest = services.client.listApprovals({
      limit: 24,
    }).then(normalizeCanonicalApprovalItems).catch((error) => {
      if (isApprovalsPlanError(error)) {
        return [] satisfies CanonicalApprovalSummary[];
      }
      if (isTransientBackgroundReadError(error)) {
        return approvalsFallback;
      }
      throw error;
    });
    const timelineRequest = services.client.listActivityTimeline({
      limit: 40,
    }).then(normalizeTimelineItems).catch((error) => {
      if (isTransientBackgroundReadError(error)) {
        return [] satisfies Record<string, unknown>[];
      }
      throw error;
    });

    await withTimeout(services.queryClient.run('chat:canonical:overview', async () => {
      const [nextRuns, nextApprovals, timelineItems] = await Promise.all([
        runsRequest,
        approvalsRequest,
        timelineRequest,
      ]);
      writeOverview({ nextRuns, nextApprovals });
      if (timelineItems.length > 0) {
        writeRecentThreads(deriveRecentThreads(timelineItems, activeThreadIdRef.current));
        return;
      }
      if (recentThreadsFallback.length > 0) {
        writeRecentThreads(recentThreadsFallback);
        return;
      }
      writeRecentThreads(deriveRecentThreads([], activeThreadIdRef.current));
    }), CHAT_READ_TIMEOUT_MS, 'Activity overview took too long to load.');
  };

  const loadMemory = async () => {
    const cachedSnapshot = services.queryClient.peek<SageMemorySnapshot>(SAGE_MEMORY_QUERY_KEY) ?? memorySnapshot;
    return loadChatMemorySnapshot({
      services,
      memoryQueryKey: SAGE_MEMORY_QUERY_KEY,
      timeoutMs: CHAT_READ_TIMEOUT_MS,
      cachedSnapshot,
      normalizeSnapshot: normalizeSageMemorySnapshot,
      writeSnapshot: writeMemorySnapshot,
      withTimeout,
      shouldUseFallback: isTransientBackgroundReadError,
    });
  };

  const loadProfile = async () => {
    const cachedProfile = services.queryClient.peek<SageProfileSnapshot>(SAGE_PROFILE_QUERY_KEY) ?? profileSnapshot;
    return loadChatProfileSnapshot({
      services,
      timeoutMs: SAGE_SETUP_TIMEOUT_MS,
      cachedProfile,
      normalizeSnapshot: (payload) => payload === null
        ? cachedProfile
        : normalizeSageProfileSnapshot(payload),
      writeSnapshot: writeProfileSnapshot,
      setSetupState: setSageSetupState,
      setSetupMessage: setSageSetupMessage,
      humanizeFailure: humanizeSageSetupFailure,
      withTimeout,
      shouldUseFallback: isTransientBackgroundReadError,
    });
  };

  const refreshCanonicalState = async (requestedThreadId = activeThreadId) => {
    const threadFallback = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(requestedThreadId))
      ?? normalizeCanonicalChatThread(null, requestedThreadId);
    const [nextThread] = await Promise.all([
      loadThread(requestedThreadId).catch(() => threadFallback),
      Promise.allSettled([
        loadOverview(),
        loadMemory(),
        loadProfile(),
      ]),
    ]);
    return nextThread;
  };

  const submitBootstrapResponse = async () => {
    const answer = bootstrapAnswer.trim();
    if (!answer || isSubmittingBootstrap) {
      return;
    }
    setIsSubmittingBootstrap(true);
    setStatusMessage(null);
    try {
      const payload = await services.client.answerSageProfileBootstrap({ answer });
      const nextProfile = normalizeSageProfileSnapshot(payload);
      writeProfileSnapshot(nextProfile);
      setBootstrapAnswer('');
      setStatusMessage(nextProfile.bootstrap.complete ? 'Sage is ready.' : null);
    } catch (error) {
      setSageSetupState('unavailable');
      setSageSetupMessage(humanizeSageSetupFailure(error, 'save'));
      setStatusMessage(null);
    } finally {
      setIsSubmittingBootstrap(false);
    }
  };

  const retrySageSetup = async () => {
    if (isRetryingSageSetup) {
      return;
    }
    setIsRetryingSageSetup(true);
    setSageSetupState('loading');
    setSageSetupMessage(null);
    setStatusMessage(null);
    try {
      await loadProfile();
    } finally {
      setIsRetryingSageSetup(false);
    }
  };

  const handleResolveApproval = async (approvalId: string, resolution: 'approved' | 'rejected') => {
    if (!approvalId || resolvingApprovalId) {
      return;
    }
    setResolvingApprovalId(approvalId);
    setStatusMessage(null);
    try {
      await resolveWorkstationApproval(services.client, {
        approvalId,
        resolution,
      });
      services.streams.touchActivity();
    } catch (error) {
      setStatusMessage(
        error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Approval resolution failed.',
      );
    } finally {
      setResolvingApprovalId(null);
    }
  };

  const handleResolveCodexApproval = (approvalId: string, action: CodexApprovalAction) => {
    void handleResolveApproval(approvalId, action === 'deny' ? 'rejected' : 'approved');
  };

  useEffect(() => {
    if (approvals.length === 0 || resolvingApprovalId) {
      return undefined;
    }
    const approval = approvals[0];
    const approvalId = readString(approval?.approval_id || approval?.id);
    if (!approvalId) {
      return undefined;
    }
    const handleApprovalShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTextEditingTarget(event.target)) {
        return;
      }
      if (event.key === '1') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'allow_once');
        return;
      }
      if (event.key === '2') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'allow_session');
        return;
      }
      if (event.key === '3') {
        event.preventDefault();
        handleResolveCodexApproval(approvalId, 'deny');
      }
    };
    window.addEventListener('keydown', handleApprovalShortcut);
    return () => {
      window.removeEventListener('keydown', handleApprovalShortcut);
    };
  }, [approvals, resolvingApprovalId]);

  const openCreateMemory = (categoryId?: string) => {
    setMemoryDraft({
      ...defaultSageMemoryDraft(),
      category: categoryId || 'profile_fact',
    });
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
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setIsMemorySheetOpen(false);
      setMemoryDraft(defaultSageMemoryDraft());
      setStatusMessage(memoryDraft.entryId ? 'Memory corrected.' : 'Memory saved.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Memory update failed.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const toggleMemoryPinned = async (entry: WorkstationSageMemoryRecord) => {
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
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setStatusMessage(Boolean(entry.pinned) ? 'Memory unpinned.' : 'Memory pinned.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not update memory pin state.');
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
      writeMemorySnapshot(normalizeSageMemorySnapshot(payload));
      setPendingDeleteMemoryId(null);
      setStatusMessage('Memory forgotten.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not forget memory.');
    } finally {
      setMutatingMemory(null);
    }
  };

  const openRecentThread = async (threadId: string) => {
    const nextThreadId = readString(threadId);
    if (!nextThreadId || nextThreadId === activeThreadId || isSending) {
      return;
    }
    setHasEnteredConversationFlow(true);
    setStatusMessage(null);
    setShowProjectedAssistant(false);
    setTimelineSettled(false);
    setLiveTimelineEvents([]);
    setIsLoading(true);
    try {
      activeThreadIdRef.current = nextThreadId;
      setActiveThreadId(nextThreadId);
      await refreshCanonicalState(nextThreadId);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not open this thread.');
    } finally {
      setIsLoading(false);
    }
  };

  const startNewThread = async (seed?: {
    title?: string;
    sourceRunId?: string | null;
    sourceThreadId?: string | null;
  }) => {
    if (isSending) {
      return;
    }
    setHasEnteredConversationFlow(true);
    const nextThreadId = `thread-${Date.now()}`;
    const previousThread = summarizeThreadForHistory(threadRef.current, activeThreadIdRef.current || activeThreadId);
    setDraft('');
    setStatusMessage(null);
    updatePendingUserMessage(null);
    setStreamingAssistantText('');
    setShowProjectedAssistant(false);
    setTimelineSettled(false);
    setLiveTimelineEvents([]);
    setLiveActivitySteps([]);
    setLiveTrace(null);
    setIsLoading(true);
    try {
      activeThreadIdRef.current = nextThreadId;
      setActiveThreadId(nextThreadId);
      await refreshCanonicalState(nextThreadId);
      const nextRecentThreads = [
        previousThread,
        ...recentThreads.filter((item) => item.threadId !== nextThreadId && item.threadId !== previousThread?.threadId),
      ].filter((item): item is RecentThreadSummary => item !== null).slice(0, 8);
      writeRecentThreads(nextRecentThreads);
      if (readString(seed?.sourceRunId) || readString(seed?.sourceThreadId)) {
        setStatusMessage('Started a new thread from recent activity.');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start a new thread.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const cachedThread = services.queryClient.peek<CanonicalChatThreadState>(threadQueryKey(activeThreadId));
    if (cachedThread) {
      setThread(cachedThread);
    }
  }, [activeThreadId, services]);

  useEffect(() => subscribeWorkstationApprovalResolved((detail) => {
    void refreshCanonicalState(activeThreadId)
      .then(() => {
        setStatusMessage(detail.message);
      })
      .catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : detail.message);
      });
  }), [activeThreadId]);

  useEffect(() => {
    if (activityVersion === 0) {
      return;
    }
    void Promise.all([
      loadOverview(),
    ]).catch((error) => {
      if (shouldSuppressBackgroundRefreshNotice(error)) {
        return;
      }
      setStatusMessage(error instanceof Error ? error.message : 'Chat refresh failed.');
    });
  }, [activeThreadId, activityVersion]);

  useEffect(() => {
    if (activityConnectionState !== 'closed' && notificationsConnectionState !== 'closed') {
      return;
    }
    setStatusMessage((current) => current ?? 'Connection lost. Live updates paused.');
  }, [activityConnectionState, notificationsConnectionState]);

  useEffect(() => {
    persistActiveThread(bootstrap.workspace.id, activeThreadId);
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    const rememberedThreadId = readPersistedActiveThread(bootstrap.workspace.id) ?? PRIMARY_THREAD_ID;
    if (rememberedThreadId !== activeThreadId) {
      setActiveThreadId(rememberedThreadId);
    }
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    setTitlebarActionsHost(document.getElementById('workstation-titlebar-actions-slot'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const storageKey = activeThreadStorageKey(bootstrap.workspace.id);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      const nextThreadId = readString(event.newValue);
      if (!nextThreadId || nextThreadId === activeThreadId) {
        return;
      }
      setActiveThreadId(nextThreadId);
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeThreadId, bootstrap.workspace.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        await refreshCanonicalState(activeThreadId);
        if (!cancelled) {
          setStatusMessage(null);
        }
      } catch (error) {
        if (!cancelled) {
          if (shouldSuppressBackgroundRefreshNotice(error)) {
            setStatusMessage(null);
            return;
          }
          setStatusMessage(error instanceof Error ? error.message : 'Chat is unavailable right now.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, bootstrap.workspace.id]);

  const {
    projectedTimelineProjection,
    projectedTimelineCells,
    projectedSystemCells,
    projectedAssistantCell,
    pinnedTimelineCells,
    pendingApprovalCells,
    visibleTranscriptCells,
  } = useWorkstationTimelineProjection({
    approvals,
    threadMessages: thread.messages,
    pendingUserMessage,
    isSending,
    liveTimelineEvents,
    showProjectedAssistant,
    isSyntheticTranscriptMessage,
    canonicalIncludesMessage,
    isProviderGateTranscriptCell,
    isProviderGateSystemCell,
    projectedAssistantLooksSynthetic,
    readString,
  });

  const hasConversationContent = visibleTranscriptCells.length > 0
    || Boolean(liveTrace);
  const showConversationContext = hasConversationContent || hasEnteredConversationFlow;
  const showFirstImpression = !showConversationContext;
  const bootstrapQuestion = profileSnapshot.bootstrap.current_question;
  const bootstrapComplete = profileSnapshot.bootstrap.complete;
  // Keep Sage chat usable even when profile bootstrap is incomplete.
  // Setup remains available in Memory instead of owning the first impression.
  const showSetupCardsInChat = false;
  const showSageSetupLoadingCard = showSetupCardsInChat && sageSetupState === 'loading';
  const showSageSetupUnavailableCard = showSetupCardsInChat && sageSetupState === 'unavailable';
  const showBootstrapCard = showSetupCardsInChat && sageSetupState === 'required' && !bootstrapComplete;
  const showBlankTranscript = !isLoading
    && visibleTranscriptCells.length === 0
    && !liveTrace;
  const latestRun = runs[0];
  const artifactCount = useMemo(() => countArtifacts(thread.messages), [thread.messages]);
  const assistantTurnCount = useMemo(
    () => thread.messages.filter((message) => message.role !== 'user').length,
    [thread.messages],
  );
  const runtimeCard = useMemo(
    () => summarizeRuntimeCard(bootstrap.runtime.runtimeTargets),
    [bootstrap.runtime.runtimeTargets],
  );
  const localRuntimeTarget = useMemo(
    () => localCompanionTarget(bootstrap.runtime.runtimeTargets),
    [bootstrap.runtime.runtimeTargets],
  );
  const localCompanionOnline = Boolean(
    localRuntimeTarget
    && localRuntimeTarget.online,
  );
  const localCompanionConnected = Boolean(
    localRuntimeTarget
    && localRuntimeTarget.available
    && localRuntimeTarget.online
    && localRuntimeTarget.healthy,
  );
  const gatewayReadinessOnline = readString(browserGatewayDoctor?.status).toLowerCase() === 'healthy';
  const localToolingOnline = localCompanionConnected;
  const gatewayToolingOnline = useMemo(
    () => localToolingOnline || gatewayReadinessOnline,
    [gatewayReadinessOnline, localToolingOnline],
  );
  const persistedSelectedModelId = useMemo(
    () => resolvePersistedSelectedModelId({
      providers: providerCatalog,
      profiles: providerProfiles,
      modelOptions,
    }),
    [modelOptions, providerCatalog, providerProfiles],
  );
  const selectedModelOption = useMemo(
    () => modelOptions.find((option) => option.id === selectedModel) ?? modelOptions[0] ?? {
      id: 'default',
      label: 'Auto route',
      providerId: null,
      providerLabel: null,
      supportsReasoning: false,
      reasoningLevels: ['low', 'medium', 'high'],
      contextWindowTokens: null,
      routeProviderId: null,
      routeModelId: null,
      defaultReasoningEffort: 'medium',
      uiSection: 'system',
    },
    [modelOptions, selectedModel],
  );
  const effectiveSelectedModel = useMemo(
    () => modelOptions.some((option) => option.id === selectedModel)
      ? selectedModel
      : selectedModelOption.id,
    [modelOptions, selectedModel, selectedModelOption.id],
  );
  const selectedProviderContext = useMemo(
    () => resolveProviderModelContext({
      providers: providerCatalog,
      selectedModelId: effectiveSelectedModel,
      selectedModelLabel: selectedModelOption.label,
      selectedProviderId: selectedModelOption.providerId,
      modelOptions,
    }),
    [effectiveSelectedModel, modelOptions, providerCatalog, selectedModelOption.label, selectedModelOption.providerId],
  );
  const selectedProviderRecord = useMemo(
    () => {
      const routeProviderId = readString(selectedProviderContext.providerId);
      const catalogProviderId = readString(selectedModelOption.providerId);
      return providerCatalog.find((provider) => readString(provider.id) === routeProviderId)
        ?? providerCatalog.find((provider) => readString(provider.id) === catalogProviderId)
        ?? null;
    },
    [providerCatalog, selectedModelOption.providerId, selectedProviderContext.providerId],
  );
  const activeProviderSummary = useMemo(() => {
    const providerLabelById = new Map(
      providerCatalog.map((provider) => [readString(provider.id), readString(provider.label) || readString(provider.id)] as const),
    );
    const liveProviderId = readString(liveTrace?.trace?.provider);
    const liveModelId = readString(liveTrace?.trace?.model);
    if (liveProviderId) {
      const liveProvider = providerCatalog.find((provider) => readString(provider.id) === liveProviderId) ?? null;
      const label = providerSummaryLabel({
        provider: liveProvider,
        providerLabel: providerLabelById.get(liveProviderId) || liveProviderId,
        modelLabel: liveModelId || null,
      }) || providerLabelById.get(liveProviderId) || liveProviderId;
      return {
        label,
        connected: true,
      };
    }
    const selectedProviderLabel = providerSummaryLabel({
      provider: selectedProviderRecord,
      providerLabel: selectedProviderContext.providerLabel,
      modelLabel: selectedProviderContext.modelLabel,
    }) || readString(selectedProviderContext.providerLabel);
    if (selectedProviderRecord) {
      const ready = providerReadyForChat(selectedProviderRecord, {
        gatewayToolingOnline,
      });
      return {
        label: ready
          ? selectedProviderLabel
          : `${selectedProviderLabel} · setup needed`,
        connected: ready,
      };
    }
    if (selectedProviderContext.providerLabel) {
      return {
        label: `${selectedProviderLabel} · setup needed`,
        connected: false,
      };
    }
    return {
      label: 'No AI model — Set up in Integrations',
      connected: false,
    };
  }, [
    liveTrace?.trace?.model,
    liveTrace?.trace?.provider,
    gatewayToolingOnline,
    providerCatalog,
    selectedProviderRecord,
    selectedProviderContext.modelLabel,
    selectedProviderContext.providerLabel,
  ]);
  const runtimeStatus = useMemo(() => {
    const providerPath = providerPathLabel(selectedProviderRecord);
    const providerId = readString(selectedProviderRecord?.id).toLowerCase();
    const credentialPlane = readString(selectedProviderRecord?.credential_plane).toLowerCase();
    const localProvider = providerId === 'ollama'
      || providerId === 'openai-codex'
      || selectedProviderRecord?.local_only === true
      || credentialPlane === 'local_runtime';
    if (!selectedProviderRecord) {
      if (selectedModelOption.uiSection === 'empyralis') {
        return { label: 'Empyralis credits', tone: 'success' as const };
      }
      if (selectedModelOption.uiSection === 'local_ai') {
        return {
          label: localToolingOnline ? 'Connected computer' : 'Connected computer offline',
          tone: localToolingOnline ? 'success' as const : 'warning' as const,
        };
      }
      if (selectedModelOption.uiSection === 'my_api_key') {
        return { label: 'My API Key', tone: 'neutral' as const };
      }
      if (selectedModelOption.uiSection === 'my_ai_account') {
        return { label: 'My AI Account', tone: 'neutral' as const };
      }
      return { label: 'No AI model', tone: 'warning' as const };
    }
    if (localProvider && !localToolingOnline) {
      return { label: 'Connected computer offline', tone: 'warning' as const };
    }
    if (localProvider) {
      return { label: providerPath ?? 'Connected computer', tone: 'success' as const };
    }
    if (providerPath === 'Empyralis credits') {
      return { label: 'Empyralis credits', tone: 'success' as const };
    }
    if (providerPath === 'Your AI account' || providerPath === 'Ollama Cloud') {
      return { label: providerPath, tone: 'neutral' as const };
    }
    return { label: 'Cloud AI', tone: 'neutral' as const };
  }, [localToolingOnline, selectedModelOption.uiSection, selectedProviderRecord]);
  const runtimeTrustZone = useMemo<ChatRuntimeTrustZone>(
    () => resolveRuntimeTrustZone(localRuntimeTarget, machineTrust),
    [localRuntimeTarget, machineTrust],
  );
  const composerToolGroups = useMemo<ComposerToolGroup[]>(() => {
    const localReason = localToolingOnline ? 'Available through this paired computer' : 'Requires a connected computer';
    const emailAvailable = hasConnectedConnector(connectorCredentials, ['google_workspace', 'smtp', 'microsoft_365']);
    const telegramAvailable = hasConnectedConnector(connectorCredentials, ['telegram_bot']);
    const telegramChannelEnabled = hasCapability('telegram_channel_enabled');
    const whatsappChannelEnabled = hasCapability('whatsapp_channel_enabled');
    const spreadsheetAvailable = hasConnectedConnector(connectorCredentials, ['google_workspace', 'microsoft_365']);
    const webSearchEnabled = toolPolicyEnabled(toolPolicy, 'web_search');
    const fetchEnabled = toolPolicyEnabled(toolPolicy, 'http_request');
    const fileEnabled = toolPolicyEnabled(toolPolicy, 'file_access');
    const codeEnabled = toolPolicyEnabled(toolPolicy, 'code_execution');
    const browserStatus = readString(readObject(browserGatewayDoctor?.browser).status).toLowerCase();
    const browserEnabled = gatewayToolingOnline && browserStatus !== 'fail';
    const telegramSendEnabled = localToolingOnline && (telegramAvailable || telegramChannelEnabled);
    const whatsappSendEnabled = localToolingOnline && whatsappChannelEnabled;
    return [
      {
        id: 'local-machine',
        label: 'Connected computer',
        items: [
          { id: 'files', label: 'Files', detail: fileEnabled ? localReason : 'Blocked by workspace policy', enabled: localToolingOnline && fileEnabled },
          { id: 'browser', label: 'Browser', detail: browserEnabled ? localReason : 'Browser is not connected', enabled: browserEnabled },
          { id: 'screenshot', label: 'Screenshot', detail: browserEnabled ? localReason : 'Browser is not connected', enabled: browserEnabled },
          { id: 'clipboard', label: 'Clipboard', detail: localReason, enabled: localToolingOnline },
          { id: 'terminal', label: 'Terminal', detail: codeEnabled ? localReason : 'Blocked by workspace policy', enabled: localToolingOnline && codeEnabled },
        ],
      },
      {
        id: 'web',
        label: 'Web',
        items: [
          { id: 'web-search', label: 'Search', detail: webSearchEnabled ? 'Automatic web lookup is allowed' : 'Blocked by workspace policy', enabled: webSearchEnabled },
          { id: 'fetch-url', label: 'Fetch URL', detail: fetchEnabled ? 'Direct HTTP fetch is allowed' : 'Blocked by workspace policy', enabled: fetchEnabled },
        ],
      },
      {
        id: 'communication',
        label: 'Communication',
        items: [
          {
            id: 'telegram-send',
            label: 'Telegram send',
            detail: telegramSendEnabled
              ? 'Available through this paired computer'
              : (telegramChannelEnabled ? 'Connect your computer to send Telegram messages' : 'Telegram channel is disabled in this workspace'),
            enabled: telegramSendEnabled,
          },
          {
            id: 'whatsapp-send',
            label: 'WhatsApp send',
            detail: whatsappSendEnabled
              ? 'Available through this paired computer'
              : (whatsappChannelEnabled ? 'Connect your computer to send WhatsApp messages' : 'WhatsApp channel is disabled in this workspace'),
            enabled: whatsappSendEnabled,
          },
          { id: 'email-send', label: 'Email', detail: emailAvailable ? 'Email connected app is active' : 'Connect email first', enabled: emailAvailable },
        ],
      },
      {
        id: 'data',
        label: 'Data',
        items: [
          { id: 'spreadsheet', label: 'Spreadsheet', detail: spreadsheetAvailable ? 'Spreadsheet connected app is active' : 'Connect Google Workspace or Microsoft 365', enabled: spreadsheetAvailable },
          { id: 'code-execution', label: 'Code execution', detail: codeEnabled ? localReason : 'Blocked by workspace policy', enabled: localToolingOnline && codeEnabled },
        ],
      },
    ];
  }, [browserGatewayDoctor, connectorCredentials, gatewayToolingOnline, hasCapability, localToolingOnline, toolPolicy]);
  const integrationsHref = useMemo(
    () => routeManifest.routeIndex.integrations?.href ?? `/w/${encodeURIComponent(bootstrap.workspace.id)}/integrations`,
    [bootstrap.workspace.id, routeManifest.routeIndex.integrations],
  );
  const gatewayHref = useMemo(
    () => routeManifest.routeIndex.integrations?.href ?? `/w/${encodeURIComponent(bootstrap.workspace.id)}/integrations`,
    [bootstrap.workspace.id, routeManifest.routeIndex.integrations],
  );
  const runTargetOptions = useMemo(
    () => [
      {
        value: 'local',
        label: localCompanionOnline ? 'Local' : 'Local offline',
      },
    ],
    [localCompanionOnline],
  );
  const autonomyOptions = useMemo(
    () => [
      { value: 'approval', label: 'Default' },
      {
        value: 'full',
        label: 'Full access',
      },
    ],
    [],
  );
  const composerModelOptions = useMemo(
    () => {
      const providerById = new Map(
        providerCatalog.map((provider) => [readString(provider.id), provider] as const),
      );
      const groupedOptions: ({ value: string; label: string; disabled: boolean } | { label: string; options: { value: string; label: string; disabled: boolean }[] })[] = [];
      const sectionOrder: Array<'empyralis' | 'local_ai' | 'my_api_key' | 'my_ai_account'> = [
        'empyralis',
        'local_ai',
        'my_api_key',
        'my_ai_account',
      ];
      for (const section of sectionOrder) {
        const sectionItems = modelOptions
          .filter((option) => option.id !== 'default' && option.uiSection === section)
          .map((option) => ({
            value: option.id,
            label: modelOptionDisplayLabel(option, providerById.get(readString(option.providerId)) ?? null),
            disabled: !option.id,
          }));
        if (sectionItems.length === 0) {
          continue;
        }
        groupedOptions.push({
          label: section === 'empyralis' ? 'Empyralis credits' : USER_OWNED_SECTION_LABELS[section],
          options: sectionItems,
        });
      }
      if (groupedOptions.length === 0) {
        const defaultOption = modelOptions.find((option) => option.id === 'default') ?? null;
        if (defaultOption) {
          return [{
            value: defaultOption.id,
            label: modelOptionDisplayLabel(defaultOption, providerById.get(readString(defaultOption.providerId)) ?? null),
            disabled: !defaultOption.id,
          }];
        }
      }
      return groupedOptions;
    },
    [modelOptions, providerCatalog],
  );
  const reasoningOptions = useMemo(
    () => selectedModelOption.reasoningLevels.map((value) => ({
      value,
      label: reasoningLabel(value),
    })),
    [selectedModelOption.reasoningLevels],
  );
  const composerTargetLabel = useMemo(() => {
    const threadTitle = readString(thread.title);
    if (
      activeThreadId === PRIMARY_THREAD_ID
      || !threadTitle
      || threadTitle.toLowerCase() === 'chat'
      || threadTitle.toLowerCase() === 'primary thread'
    ) {
      return 'main';
    }
    return threadTitle.length > 18 ? `${threadTitle.slice(0, 18).trim()}…` : threadTitle;
  }, [activeThreadId, thread.title]);
  const structuredServicesState = artifactCount > 0
    ? `${artifactCount} attached output${artifactCount === 1 ? '' : 's'} in this thread`
    : 'No app updates yet';
  const nextStepTitle = approvals.length > 0
    ? 'Needs your OK is waiting'
    : latestRun
      ? 'Task is in progress'
      : 'Sage is ready for the next turn';
  const nextStepMeta = approvals.length > 0
    ? `${approvals.length} waiting`
    : latestRun
      ? readString(latestRun.status) || 'unknown'
      : 'Idle';
  const memoryMeta = assistantTurnCount > 0
    ? `${assistantTurnCount} Sage repl${assistantTurnCount === 1 ? 'y' : 'ies'} retained`
    : 'The first turn will establish memory';
  const serviceTone = artifactCount > 0 ? 'success' : 'neutral';
  const serviceTitle = artifactCount > 0 ? 'App updates are available' : 'No app updates yet';
  const serviceBody = artifactCount > 0
    ? 'Sage saved new output in this thread so you can keep building from it.'
    : 'When Sage creates reusable output, it will show up here.';
  const memoryItems = memorySnapshot.items;
  const pinnedMemoryCount = readNumber(memorySnapshot.summary.pinned_count, 0);
  const totalMemoryCount = readNumber(memorySnapshot.summary.total_count, 0);
  const memoryCardTitle = totalMemoryCount > 0 ? 'What Sage will carry forward' : 'No explicit memory saved yet';
  const memoryCardBody = totalMemoryCount > 0
    ? memoryItems.slice(0, 2).map((item) => `${readString(item.title)}: ${readString(item.summary || item.content)}`).join(' · ')
    : 'Save profile facts, active work, app state, or long-term preferences here when you want Sage to carry them forward explicitly.';
  const filteredMemoryItems = useMemo(
    () => memoryItems.filter((item) => memoryFilter === 'all' || readString(item.category) === memoryFilter),
    [memoryFilter, memoryItems],
  );
  const recentRunRows = useMemo(
    () => runs.slice(0, 3).map((run) => ({
      runId: readString(run.run_id) || null,
      threadId: readString(run.thread_id) || null,
      createdAt: readString(run.created_at) || null,
      preview: runPreviewLabel(run),
      title: runContextTitle(run),
    })),
    [runs],
  );
  const recentThreadRows = useMemo(() => {
    const normalized = [
      {
        threadId: activeThreadId,
        title: readString(thread.title) || 'Current chat',
        updatedAt: null as string | null,
      },
      ...recentThreads.map((item) => ({
        threadId: readString(item.threadId),
        title: readString(item.title) || 'Chat',
        updatedAt: readString(item.updatedAt) || null,
      })),
    ].filter((item) => item.threadId.length > 0);

    const deduped = new Map<string, {
      threadId: string;
      title: string;
      updatedAt: string | null;
    }>();
    for (const item of normalized) {
      if (!deduped.has(item.threadId)) {
        deduped.set(item.threadId, item);
      }
    }

    return Array.from(deduped.values())
      .sort((left, right) => {
        if (left.threadId === activeThreadId) {
          return -1;
        }
        if (right.threadId === activeThreadId) {
          return 1;
        }
        const leftTs = left.updatedAt ? Date.parse(left.updatedAt) : 0;
        const rightTs = right.updatedAt ? Date.parse(right.updatedAt) : 0;
        return rightTs - leftTs;
      })
      .slice(0, 8);
  }, [activeThreadId, recentThreads, thread.title]);
  const visibleMemoryItems = filteredMemoryItems.slice(0, 6);
  const pendingDeleteMemory = pendingDeleteMemoryId
    ? memoryItems.find((item) => readString(item.id) === pendingDeleteMemoryId) ?? null
    : null;
  const statusNotice = useMemo(
    () => (statusMessage ? classifyStatusNotice(statusMessage) : null),
    [statusMessage],
  );
  const localRuntimeTargetId = localCompanionOnline ? readString(localRuntimeTarget?.id) : null;
  const defaultReasoningEffort = useMemo<ChatReasoningEffort>(
    () => (selectedModelOption.defaultReasoningEffort
      && selectedModelOption.reasoningLevels.includes(selectedModelOption.defaultReasoningEffort)
      ? selectedModelOption.defaultReasoningEffort
      : selectedModelOption.reasoningLevels.includes('medium')
      ? 'medium'
      : selectedModelOption.reasoningLevels[0] ?? 'medium'),
    [selectedModelOption.defaultReasoningEffort, selectedModelOption.reasoningLevels],
  );
  const contextReasoningLabel = useMemo(() => {
    switch (reasoningEffort) {
      case 'medium':
        return 'Normal';
      case 'high':
      case 'xhigh':
        return 'Extended thinking';
      case 'minimal':
        return 'Minimal';
      case 'low':
        return 'Low';
      case 'none':
        return 'None';
      default:
        return reasoningLabel(reasoningEffort);
    }
  }, [reasoningEffort]);
  const contextWindowLabel = useMemo(
    () => formatContextWindowLabel(selectedModelOption.contextWindowTokens),
    [selectedModelOption.contextWindowTokens],
  );
  const contextDeviceLabel = useMemo(() => {
    if (!desktop.localCompanion.present || !desktop.localCompanion.online) {
      return null;
    }
    return `${localDevicePlatformLabel(desktop.platform, desktop.localCompanion.label)} connected`;
  }, [desktop.localCompanion.label, desktop.localCompanion.online, desktop.localCompanion.present, desktop.platform]);
  const readinessPills = useMemo<SageReadinessPill[]>(() => {
    const pills: SageReadinessPill[] = [];
    if (!selectedProviderContext.providerLabel) {
      pills.push({
        id: 'provider',
        label: 'AI: Connect model',
        tone: 'danger',
        target: 'integrations',
      });
    }
    if (!localToolingOnline) {
      pills.push({
        id: 'gateway',
        label: 'Connected computer: Offline',
        tone: 'danger',
        target: 'integrations',
      });
    }
    const browserPill = browserReadinessPill(browserGatewayDoctor, {
      gatewayOnline: gatewayReadinessOnline,
    });
    if (browserPill) {
      pills.push(browserPill);
    }
    return pills;
  }, [browserGatewayDoctor, localToolingOnline, selectedProviderContext.providerLabel]);
  const preRunCostEstimate = useMemo<ComposerPreRunCostEstimate | null>(
    () => buildPreRunCostEstimate({
      selectedModelOption,
      selectedExecutionPlacement,
      draft,
      hostedCreditState: normalizeHostedCreditStateForChat(billingSummary),
    }),
    [billingSummary, draft, selectedExecutionPlacement, selectedModelOption],
  );
  const showContextStrip = false;
  const showHeaderReadinessStrip = false;

  useEffect(() => {
    let cancelled = false;
    void refreshProviderCatalog()
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }
      });
    void refreshToolingState().catch(() => undefined);
    void refreshBrowserGatewayReadiness().catch(() => undefined);
    void refreshBillingSummary().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshBillingSummary, refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => subscribeWorkstationProviderChanged((detail) => {
    if (detail.workspaceId !== bootstrap.workspace.id) {
      return;
    }
    void refreshProviderCatalog();
    void refreshToolingState();
    void refreshBrowserGatewayReadiness();
    void refreshBillingSummary();
  }), [bootstrap.workspace.id, refreshBillingSummary, refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return () => {};
    }
    const handleFocus = () => {
      void refreshProviderCatalog();
      void refreshToolingState();
      void refreshBrowserGatewayReadiness();
      void refreshBillingSummary();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProviderCatalog();
        void refreshToolingState();
        void refreshBrowserGatewayReadiness();
        void refreshBillingSummary();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshBillingSummary, refreshBrowserGatewayReadiness, refreshProviderCatalog, refreshToolingState]);

  useEffect(() => {
    if (isPersistingModelSelection) {
      return;
    }
    const nextSelectedModel = modelOptions.some((option) => option.id === persistedSelectedModelId)
      ? persistedSelectedModelId
      : modelOptions[0]?.id ?? '';
    if (nextSelectedModel !== selectedModel) {
      setSelectedModel(nextSelectedModel);
    }
  }, [isPersistingModelSelection, modelOptions, persistedSelectedModelId, selectedModel]);

  useEffect(() => {
    if (!selectedModelOption.reasoningLevels.includes(reasoningEffort)) {
      setReasoningEffort(defaultReasoningEffort);
    }
  }, [defaultReasoningEffort, reasoningEffort, selectedModelOption.reasoningLevels]);

  const handleModelChange = useCallback((nextModelId: string) => {
    if (!nextModelId || nextModelId === selectedModel || isSending || isPersistingModelSelection) {
      return;
    }
    const previousModelId = selectedModel;
    const nextOption = modelOptions.find((option) => option.id === nextModelId) ?? null;
    setSelectedModel(nextModelId);
    if (
      nextOption?.defaultReasoningEffort
      && nextOption.reasoningLevels.includes(nextOption.defaultReasoningEffort)
    ) {
      setReasoningEffort(nextOption.defaultReasoningEffort);
    }
    setStatusMessage(null);
    setSendFailureNotice(null);
    setIsPersistingModelSelection(true);
    void persistSelectedModelPreference(nextModelId)
      .then(async (persisted) => {
        if (!persisted) {
          setSelectedModel(previousModelId);
          setStatusMessage('This provider cannot save a workspace model preference yet.');
          return;
        }
        services.queryClient.invalidate('chat:provider-catalog');
        await refreshProviderCatalog();
      })
      .catch((error) => {
        setSelectedModel(previousModelId);
        setStatusMessage(error instanceof Error ? error.message : 'Could not update the model preference.');
      })
      .finally(() => {
        setIsPersistingModelSelection(false);
      });
  }, [
    isPersistingModelSelection,
    isSending,
    persistSelectedModelPreference,
    refreshProviderCatalog,
    selectedModel,
    setReasoningEffort,
    services.queryClient,
    modelOptions,
  ]);

  const finalizePartialAssistantResponse = useCallback((threadId: string) => {
    const partialText = readString(streamingAssistantTextRef.current);
    if (!partialText) {
      return;
    }
    const currentThread = threadRef.current;
    const incompleteMessage = createIncompleteAssistantMessage(partialText, threadId, {
      trace_id: readString(liveTrace?.traceId),
      effective_provider: readString(liveTrace?.trace?.provider),
      effective_model: readString(liveTrace?.trace?.model),
    });
    if (!incompleteMessage) {
      return;
    }
    writeThreadState({
      ...currentThread,
      threadId,
      messages: [...currentThread.messages, incompleteMessage],
      session: currentThread.session,
    });
    setStreamingAssistantText('');
  }, [liveTrace?.trace?.model, liveTrace?.trace?.provider, liveTrace?.traceId]);

  const stopStreamingResponse = useCallback(() => {
    if (
      !streamInFlightRef.current
      && !submitInFlightRef.current
      && !streamAbortHandleRef.current
      && !activeTurnRequestIdRef.current
    ) {
      return;
    }
    activeTurnRequestIdRef.current = null;
    streamAbortRequestedRef.current = true;
    streamAbortHandleRef.current?.abort();
    streamAbortHandleRef.current = null;
    setShowProjectedAssistant(false);
    setTimelineSettled(true);
    finalizePartialAssistantResponse(activeThreadIdRef.current);
    setLiveTimelineEvents([]);
    setLiveActivitySteps([]);
    setLiveTrace(null);
    streamInFlightRef.current = false;
    submitInFlightRef.current = false;
    setIsSending(false);
  }, [finalizePartialAssistantResponse]);

  useEffect(() => {
    if (!isSending) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      stopStreamingResponse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSending, stopStreamingResponse]);

  useEffect(() => {
    if (!isSending) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      if (!activeTurnRequestIdRef.current) {
        stopStreamingResponse();
        return;
      }
      const lastActivityAt = lastTurnActivityAtRef.current;
      const inactiveFor = lastActivityAt > 0 ? Date.now() - lastActivityAt : 0;
      if (inactiveFor < CHAT_THINKING_RECOVERY_MS) {
        return;
      }
      stopStreamingResponse();
      setSendFailureNotice({
        message: 'Sage stopped waiting on a stalled response. Your draft is restored so you can try again.',
        retryable: true,
        retryDraft: pendingUserMessageRef.current?.content ?? draft,
      });
    }, 5_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [draft, isSending, stopStreamingResponse]);

  const sendMessage = async () => {
    const outboundMessage = draft.trim();
    if (!outboundMessage || isSending || submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;
    const resolvedProviderId = readString(selectedProviderContext.providerId) || null;
    const resolvedModelId = readString(selectedProviderContext.modelId)
      || (effectiveSelectedModel === 'default' ? null : effectiveSelectedModel);
    if (isSmallOllamaSelection(
      resolvedProviderId,
      resolvedModelId || effectiveSelectedModel,
      selectedProviderContext.modelLabel || selectedModelOption.label,
    )) {
      const warningKey = [
        'sage-small-ollama-model-warning',
        bootstrap.workspace.id,
        resolvedModelId || effectiveSelectedModel,
      ].join(':');
      try {
        if (window.sessionStorage.getItem(warningKey) !== '1') {
          window.sessionStorage.setItem(warningKey, '1');
          setSmallModelWarningVisible(true);
        }
      } catch {
        setSmallModelWarningVisible(true);
      }
    }
    setDraft('');
    setHasEnteredConversationFlow(true);
    setSendFailureNotice(null);
    setStatusMessage(null);

    const requestedThreadId = activeThreadId;
    const clientRequestId = createClientTurnRequestId();
    activeTurnRequestIdRef.current = clientRequestId;
    lastTurnActivityAtRef.current = Date.now();
    const assertTurnStillActive = () => {
      if (activeTurnRequestIdRef.current !== clientRequestId || streamAbortRequestedRef.current) {
        throw new WorkstationClientError('Turn stopped by user.', 0, null, 'stream_aborted', {
          retryable: true,
        });
      }
    };
    const pendingMessage = createPendingUserMessage(outboundMessage, requestedThreadId, clientRequestId);
    const streamAbortHandle: WorkstationTurnStreamAbortHandle = {
      signal: new AbortController().signal,
      abort: () => undefined,
    };
    const streamAbortController = new AbortController();
    streamAbortHandle.signal = streamAbortController.signal;
    streamAbortHandle.abort = () => {
      streamAbortController.abort();
    };
    setIsSending(true);
    streamInFlightRef.current = false;
    streamAbortRequestedRef.current = false;
    streamAbortHandleRef.current = streamAbortHandle;
    setStatusMessage(null);
    setSendFailureNotice(null);
    updatePendingUserMessage(pendingMessage);
    setStreamingAssistantText('');
    setShowProjectedAssistant(true);
    setTimelineSettled(false);
    setLiveTimelineEvents([
      {
        type: 'user',
        payload: { content: outboundMessage },
      },
      {
        type: 'step',
        payload: {
          id: `thinking:${clientRequestId}`,
          kind: 'thinking',
          label: 'Thinking',
          detail: 'Planning the response',
          status: 'active',
        },
      },
    ]);
    setLiveActivitySteps([{
      id: `thinking:${clientRequestId}`,
      kind: 'thinking',
      label: 'Thinking',
      detail: 'Planning the response',
      status: 'active',
      toolCallId: null,
      createdAt: new Date().toISOString(),
    }]);
    setLiveTrace({
      traceId: null,
      transport: 'external',
      trace: buildLiveTraceRecord({
        traceId: null,
        workspaceId: bootstrap.workspace.id,
        threadId: requestedThreadId,
        rootAgentId: 'sage',
      }),
      events: [],
    });

    try {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
      assertTurnStillActive();

      let session = await services.client.createSession({
        actor,
        threadId: requestedThreadId,
        channel: 'web',
        source: 'workstation_chat_pane',
        forceNew: false,
        existingSession: thread.session,
      });
      assertTurnStillActive();
      const persistedThreadPayload = await services.client.persistUserTurn({
        actor,
        sessionId: String(session.session_id),
        threadId: requestedThreadId,
        message: outboundMessage,
        channel: 'web',
        metadata: {
          source: 'workstation_chat_pane',
        },
        clientRequestId,
      });
      assertTurnStillActive();
      const persistedThreadState: CanonicalChatThreadState = {
        ...normalizeCanonicalChatThread(persistedThreadPayload, requestedThreadId),
        session,
      };
      writeThreadState(persistedThreadState);

      let observedTraceId: string | null = null;
      let observedThreadId = requestedThreadId;
      let terminalTraceSeen = false;
      let observedFinalReply: string | null = null;
      const onTraceEvent = (traceEvent: WorkstationAgentTraceEvent) => {
        observedTraceId = readString(traceEvent.trace_id) || observedTraceId;
        terminalTraceSeen = terminalTraceSeen || isTerminalTraceEvent(readString(traceEvent.event_type));
        setLiveTimelineEvents((current) => [...current, {
          type: 'trace',
          payload: traceEvent as unknown as Record<string, unknown>,
        }]);
        setLiveTrace((current) => {
          const nextEvents = mergeTraceEvents(current?.events ?? [], [traceEvent]);
          const traceId = readString(traceEvent.trace_id) || current?.traceId || observedTraceId;
          const currentTrace = current?.trace ?? buildLiveTraceRecord({
            traceId,
            workspaceId: bootstrap.workspace.id,
            threadId: observedThreadId,
            rootAgentId: readString(traceEvent.agent_id) || 'sage',
          });
          return {
            traceId,
            transport: current?.transport ?? 'external',
            trace: {
              ...currentTrace,
              id: traceId ?? currentTrace.id ?? null,
              thread_id: readString(currentTrace.thread_id) || observedThreadId,
              root_agent_id: readString(currentTrace.root_agent_id) || readString(traceEvent.agent_id) || 'sage',
            },
            events: nextEvents,
          };
        });
        const eventType = readString(traceEvent.event_type);
        const eventData = readObject(traceEvent.data);
        if (eventType === 'reasoning.summary.delta') {
          const delta = readString(eventData.delta);
          if (delta) {
            setLiveActivitySteps((current) => {
              const thinkingIndex = current.findIndex((item) => item.kind === 'thinking');
              if (thinkingIndex < 0) {
                return current;
              }
              const updated = [...current];
              updated[thinkingIndex] = {
                ...updated[thinkingIndex],
                detail: delta,
              };
              return updated;
            });
          }
          return;
        }
        if (eventType === 'tool.started') {
          const toolName = readString(eventData.tool_name) || 'Using tool';
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `${toolName}:${current.length}`,
            kind: 'tool',
            label: toolName,
            detail: 'Running',
            status: 'active',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'tool.result') {
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `tool:${current.length}`,
            kind: 'tool',
            label: '',
            detail: eventData.status === 'error' ? 'Failed' : 'Completed',
            status: eventData.status === 'error' ? 'error' : 'done',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'search.query') {
          const query = readString(eventData.query);
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `search:${query || current.length}`,
            kind: 'search',
            label: 'Searching',
            detail: query,
            status: 'active',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
          return;
        }
        if (eventType === 'search.results') {
          setLiveActivitySteps((current) => upsertLiveActivityStep(current, {
            id: readString(traceEvent.tool_call_id) || `search:${current.length}`,
            kind: 'search',
            label: 'Search',
            detail: 'Completed',
            status: 'done',
            toolCallId: readString(traceEvent.tool_call_id) || null,
            createdAt: new Date().toISOString(),
          }));
        }
      };

      streamInFlightRef.current = true;
      const { response, session: streamedSession } = await services.client.submitTurnStreamWithSessionRetry({
        actor,
        threadId: requestedThreadId,
        message: outboundMessage,
        channel: 'web',
        source: 'workstation_chat_pane',
        runtimeTarget: localRuntimeTargetId || 'cloud',
        provider: resolvedProviderId,
        model: resolvedModelId,
        reasoningEffort,
        existingSession: session,
        clientRequestId,
        abortHandle: streamAbortHandle,
        policyContext: {
          session_mode: autonomyMode === 'full' ? 'agent' : 'copilot',
          trust_mode: autonomyMode === 'full' ? 'auto' : 'guarded',
          approval_ui: 'card',
          interactive_approvals: autonomyMode !== 'full',
          machine_trust_declaration: machineTrust,
          runtime_trust_zone: runtimeTrustZone,
          elevated_mode: autonomyMode === 'full' ? 'full' : 'ask',
          elevated: {
            mode: autonomyMode === 'full' ? 'full' : 'ask',
            runtime_trust_zone: runtimeTrustZone,
            reason: autonomyMode === 'full'
              ? 'chat_full_access_requested'
              : 'chat_default_mode',
          },
        },
        onEvent: (event) => {
          if (activeTurnRequestIdRef.current !== clientRequestId || streamAbortRequestedRef.current) {
            return;
          }
          markTurnActivity();
          if (event.event === 'trace') {
            const traceEvent = normalizeTraceStreamEvent(event.payload);
            if (traceEvent) {
              onTraceEvent(traceEvent);
            }
            return;
          }

          if (event.event === 'step') {
            setLiveTimelineEvents((current) => [...current, {
              type: 'step',
              payload: event.payload,
            }]);
            const step = normalizeStepEvent(event.payload);
            if (step) {
              setLiveActivitySteps((current) => upsertLiveActivityStep(current, step));
            }
            return;
          }

          if (event.event === 'chunk') {
            const delta = readString(event.payload.delta);
            if (delta) {
              setLiveTimelineEvents((current) => [...current, {
                type: 'chunk',
                payload: { delta },
              }]);
              setStreamingAssistantText((current) => `${current}${delta}`);
              setLiveActivitySteps((current) => {
                const thinkingIndex = current.findIndex((item) => item.kind === 'thinking');
                if (thinkingIndex < 0) {
                  return current;
                }
                const updated = [...current];
                updated[thinkingIndex] = {
                  ...updated[thinkingIndex],
                  label: 'Writing output',
                  detail: 'Streaming response',
                };
                return updated;
              });
            }
            return;
          }

          if (event.event === 'final') {
            setLiveTimelineEvents((current) => [...current, {
              type: 'final',
              payload: event.payload,
            }]);
            setTimelineSettled(true);
            const finalReply = readString(event.payload.reply)
              || readString(event.payload.content)
              || readString(event.payload.message);
            if (finalReply && !isProviderRuntimeGateMessage(finalReply)) {
              observedFinalReply = finalReply;
              setStreamingAssistantText(finalReply);
              setStatusMessage(null);
              setSendFailureNotice(null);
            }
            const finalThreadId = readString(event.payload.thread_id);
            if (finalThreadId) {
              observedThreadId = finalThreadId;
            }
            const metadata = readObject(event.payload.metadata);
            const finalTraceId = readString(metadata.trace_id);
            if (finalTraceId) {
              observedTraceId = finalTraceId;
            }
          }
        },
      });
      assertTurnStillActive();
      session = streamedSession;

      const responseMetadata =
        response.metadata && typeof response.metadata === 'object'
          ? { ...(response.metadata as Record<string, unknown>) }
          : {};
      const traceId = readString(responseMetadata.trace_id) || observedTraceId;
      if (traceId) {
        responseMetadata.trace_id = traceId;
      }
      const normalizedResponse: WorkstationTurnResponse = {
        ...response,
        reply: readString(response.reply) || observedFinalReply || undefined,
        thread_id: String(response.thread_id ?? observedThreadId ?? requestedThreadId),
        metadata: responseMetadata,
      };
      const responseExecutionTarget = readExecutionTarget(responseMetadata);
      const providerFailureIntervention = findProviderFailureIntervention(normalizedResponse.interventions ?? []);
      const providerFailureRecord = providerCatalog.find((provider) =>
        readString(provider.id).toLowerCase() === readString(responseMetadata.effective_provider || responseMetadata.provider).toLowerCase(),
      ) ?? selectedProviderRecord;
      const nextThreadId = String(normalizedResponse.thread_id ?? requestedThreadId);
      const nextMessages = (
        persistedThreadState.threadId === nextThreadId && persistedThreadState.messages.length > 0
          ? persistedThreadState.messages
          : threadRef.current.messages
      );
      const assistantMessage = createCanonicalAssistantMessage(normalizedResponse, nextThreadId);
      const assistantMessageVisible = Boolean(
        assistantMessage
        && !isSyntheticTranscriptMessage(assistantMessage),
      );
      const hasVisibleAssistantReply = Boolean(
        assistantMessageVisible
        || (
          typeof normalizedResponse.reply === 'string'
          && normalizedResponse.reply.trim()
          && !isProviderRuntimeGateMessage(normalizedResponse.reply)
        ),
      );

      setLiveTrace((current) => {
        if (!traceId && !current) {
          return null;
        }
        const currentTrace = current?.trace ?? buildLiveTraceRecord({
          traceId,
          workspaceId: bootstrap.workspace.id,
          threadId: nextThreadId,
          rootAgentId: current?.trace?.root_agent_id ? String(current.trace.root_agent_id) : 'sage',
        });
        return {
          traceId,
          transport: normalizedResponse.run_id && traceId && !terminalTraceSeen ? 'trace-stream' : (current?.transport ?? 'external'),
          trace: {
            ...currentTrace,
            id: traceId ?? currentTrace.id ?? null,
            thread_id: nextThreadId,
          },
          events: current?.events ?? [],
        };
      });

      const responseMessage = assistantMessageVisible ? assistantMessage : null;
      const immediateMessages = responseMessage
        ? [...nextMessages, responseMessage]
        : nextMessages;
      writeThreadState({
        ...(persistedThreadState.threadId === nextThreadId ? persistedThreadState : thread),
        threadId: nextThreadId,
        messages: immediateMessages,
        session,
      });
      setShowProjectedAssistant(false);
      setTimelineSettled(true);
      setStreamingAssistantText('');
      setLiveActivitySteps((current) => settleLiveActivitySteps(
        current,
        normalizedResponse.status === 'incomplete' ? 'error' : 'done',
      ));
      services.streams.touchActivity();
      const canonicalThread = await refreshCanonicalState(nextThreadId)
        .catch(() => null);
      const canonicalMessages = canonicalThread?.messages ?? [];
      const canonicalHasAssistant = canonicalMessages.some((message) => (
        message.role === 'assistant'
        && readString(message.content)
        && readString(message.content) === readString(responseMessage?.content)
      ));
      if (canonicalThread && (!responseMessage || canonicalHasAssistant)) {
        writeThreadState({
          ...canonicalThread,
          session,
        });
      } else if (responseMessage) {
        writeThreadState({
          ...thread,
          threadId: nextThreadId,
          messages: immediateMessages,
          session,
        });
      }
      const hasPendingApprovals = Array.isArray(normalizedResponse.approvals) && normalizedResponse.approvals.length > 0;
      const hasProviderFailure = Boolean(providerFailureIntervention);
      const providerGateDetected = hasProviderFailure
        || isProviderRuntimeGateMessage(readString(normalizedResponse.reply));
      const needsUserIntervention = Array.isArray(normalizedResponse.interventions)
        && normalizedResponse.interventions.length > 0
        && !hasVisibleAssistantReply;
      setStatusMessage(
        providerGateDetected
          ? null
          : hasPendingApprovals
            ? responseExecutionTarget === 'local_companion'
              ? 'Sage is waiting for approval before using the connected computer.'
              : 'Needs your OK is waiting.'
            : needsUserIntervention && !hasProviderFailure
              ? 'Sage needs your input before it can continue.'
              : null,
      );
      setSendFailureNotice(
        providerGateDetected
          ? providerFailureNoticeForProvider(
              providerFailureRecord,
              providerFailureMessageForProvider(providerFailureRecord),
            )
          : null,
      );
    } catch (error) {
      updatePendingUserMessage(null);
      const normalizedError = error instanceof WorkstationClientError ? error : null;
      const aborted = normalizedError?.code === 'stream_aborted'
        || streamAbortRequestedRef.current
        || activeTurnRequestIdRef.current !== clientRequestId;
      const partialStreamText = readString(streamingAssistantTextRef.current);
      const incompleteWithPartial = normalizedError?.code === 'stream_incomplete' && Boolean(partialStreamText);
      if (aborted || incompleteWithPartial) {
        setShowProjectedAssistant(false);
        setTimelineSettled(true);
        finalizePartialAssistantResponse(activeThreadIdRef.current);
        setLiveTimelineEvents([]);
        setLiveActivitySteps([]);
        setLiveTrace(null);
        setSendFailureNotice(incompleteWithPartial
          ? {
              message: 'Response interrupted before completion.',
              retryable: true,
              retryDraft: outboundMessage,
            }
          : null);
      } else {
        setStreamingAssistantText('');
        setShowProjectedAssistant(false);
        setTimelineSettled(true);
        setLiveTimelineEvents([]);
        setLiveActivitySteps([]);
        setLiveTrace(null);
        const rawMessage = error instanceof WorkstationClientError || error instanceof Error
          ? error.message
          : 'Could not send this message.';
        const normalizedRawMessage = rawMessage.toLowerCase();
        const providerNeedsAttention = normalizedRawMessage.includes('provider')
          || normalizedRawMessage.includes('credential')
          || normalizedRawMessage.includes('api key')
          || normalizedRawMessage.includes('ollama')
          || normalizedRawMessage.includes('selected for chat')
          || normalizedRawMessage.includes('not available');
        const localComputerNeedsAttention = isLocalCompanionGateMessage(rawMessage) || normalizedRawMessage.includes('gateway offline');
        const authNeedsAttention = normalizedError?.status === 401 || normalizedError?.status === 403;
        const rateLimitFailure = normalizedError?.status === 429 || /rate.?limit|capacity/i.test(normalizedRawMessage);
        const timeoutFailure = /timed out|too long to respond|request timeout/i.test(normalizedRawMessage);
        const transportFailure = /failed to fetch|could not connect|network error|transport failure|connection/i.test(normalizedRawMessage);
        const serverFailure = (typeof normalizedError?.status === 'number' && normalizedError.status >= 500)
          || /bad gateway|gateway timeout|service unavailable|internal server error|server error/i.test(normalizedRawMessage);
        const noticeMessage = isLocalCompanionGateMessage(rawMessage)
          ? 'Connected computer is needed for this request. Connect a computer and try again.'
          : providerNeedsAttention
            ? 'The selected AI path is not ready. Use Empyralis credits, connect your own AI account, connect a computer, or choose another model in Integrations.'
            : authNeedsAttention
              ? 'Your session needs attention before Sage can continue. Refresh the page or sign in again.'
              : rateLimitFailure
                ? 'Sage is temporarily at capacity. Try again in a moment or switch AI model.'
                : timeoutFailure
                  ? 'Sage took too long to respond. Try again or switch AI model.'
                  : transportFailure
                    ? 'The request could not reach the server. Check your connection and try again.'
                    : serverFailure
                      ? 'Sage hit a temporary server issue before it could reply. Try again in a moment.'
                      : "Sage couldn't complete that turn. Try again or choose another AI model in Integrations.";
        const providerNotice = providerNeedsAttention
          ? providerFailureNoticeForProvider(selectedProviderRecord, noticeMessage)
          : null;
        setSendFailureNotice({
          message: providerNotice?.message ?? noticeMessage,
          retryable: error instanceof WorkstationClientError
            ? error.retryable
            : true,
          actions: localComputerNeedsAttention
            ? [{ label: 'Open Integrations', target: 'integrations' }]
            : authNeedsAttention
              ? undefined
              : providerNotice?.actions,
          retryDraft: outboundMessage,
        });
      }
      if (aborted || incompleteWithPartial) {
        setLiveActivitySteps((current) => settleLiveActivitySteps(current, 'done'));
      }
    } finally {
      if (activeTurnRequestIdRef.current === clientRequestId || activeTurnRequestIdRef.current === null) {
        submitInFlightRef.current = false;
        streamInFlightRef.current = false;
        streamAbortHandleRef.current = null;
        streamAbortRequestedRef.current = false;
        setIsSending(false);
      }
      if (activeTurnRequestIdRef.current === clientRequestId) {
        activeTurnRequestIdRef.current = null;
      }
    }
  };

  return (
    <>
      {titlebarActionsHost ? createPortal(
        <AppButton
          type="button"
          tone="secondary"
          aria-label="New chat"
          className="workstation-titlebar__action workstation-titlebar__action--compose"
          onClick={() => {
            void startNewThread();
          }}
        >
          <SquarePen size={15} strokeWidth={1.95} aria-hidden="true" />
        </AppButton>,
        titlebarActionsHost,
      ) : null}

      <main
        data-workstation-surface="chat"
        data-workstation-chat="pane"
        className={`app-chat-page app-chat-page--surface${showFirstImpression ? ' app-chat-page--first-impression' : ''}`}
      >
        <div className="app-chat-history-bar" aria-label="Recent chats">
          <div className="app-chat-history-bar__head">
            <span className="app-chat-history-bar__title">Recent chats</span>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                void startNewThread();
              }}
              disabled={isSending}
            >
              New chat
            </AppButton>
          </div>
          <div className="app-chat-history-bar__list" role="list">
            {recentThreadRows.map((item) => {
              const isActive = item.threadId === activeThreadId;
              return (
                <button
                  key={item.threadId}
                  type="button"
                  role="listitem"
                  className={`app-chat-history-pill${isActive ? ' app-chat-history-pill--active' : ''}`}
                  onClick={() => {
                    void openRecentThread(item.threadId);
                  }}
                  disabled={isSending || isActive}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="app-chat-history-pill__label">{item.title}</span>
                  <span className="app-chat-history-pill__time">
                    {isActive ? 'Current' : formatRelativeTime(item.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <section className={`app-chat-thread app-chat-thread--surface${showBlankTranscript || showFirstImpression ? ' app-chat-thread--blank' : ''}`}>
          {showContextStrip ? (
            <div className="app-chat-context-strip" aria-label="Sage conversation context">
              {activeProviderSummary.connected ? (
                <AppShinyText>{activeProviderSummary.label}</AppShinyText>
              ) : (
                <>
                  <button
                    type="button"
                    className="app-chat-context-strip__link"
                    onClick={() => {
                      router.push(integrationsHref);
                    }}
                  >
                    {activeProviderSummary.label}
                  </button>
                </>
              )}
              {selectedProviderContext.providerLabel === 'Ollama' && contextWindowLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Local</span>
                </>
              ) : null}
              {selectedProviderContext.providerLabel && reasoningEffort !== defaultReasoningEffort ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{contextReasoningLabel}</span>
                </>
              ) : null}
              {contextDeviceLabel ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={`app-chat-context-strip__device${desktop.localCompanion.online ? ' app-chat-context-strip__device--online' : ' app-chat-context-strip__device--offline'}`}
                  >
                    <span className="app-chat-context-strip__device-dot" aria-hidden="true" />
                    <span>{contextDeviceLabel}</span>
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          {showHeaderReadinessStrip && readinessPills.length > 0 ? (
            <div className="app-chat-readiness-strip" aria-label="Sage readiness">
              {readinessPills.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`app-chat-readiness-pill app-chat-readiness-pill--${pill.tone}`}
                  onClick={() => {
                    router.push(pill.target === 'gateway' ? gatewayHref : integrationsHref);
                  }}
                >
                  <span className="app-chat-readiness-pill__dot" aria-hidden="true" />
                  <span>{pill.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          <ScrollRegion className="app-chat-thread__scroll">
            <div className="app-chat-thread__body">
              {showSageSetupLoadingCard ? (
                <AppNotice tone="neutral" className="app-chat-status-notice">
                  <div className="app-chat-status-notice__copy">
                    <strong>Loading Sage setup</strong>
                    <span>Checking your profile and bootstrap progress before Sage starts the conversation.</span>
                  </div>
                </AppNotice>
              ) : null}

              {showSageSetupUnavailableCard ? (
                <AppNotice tone="warning" className="app-chat-status-notice">
                  <div className="app-chat-status-notice__copy">
                    <strong>Sage setup is temporarily unavailable</strong>
                    <span>{sageSetupMessage || 'Sage setup could not be loaded right now.'}</span>
                  </div>
                  <div className="app-chat-status-notice__actions">
                    <AppButton
                      type="button"
                      tone="primary"
                      onClick={() => {
                        void retrySageSetup();
                      }}
                      disabled={isRetryingSageSetup}
                    >
                      {isRetryingSageSetup ? 'Retrying…' : 'Retry'}
                    </AppButton>
                  </div>
                </AppNotice>
              ) : null}

              {showBootstrapCard ? (
                <AppNotice tone="warning" className="app-chat-status-notice">
                  <div className="app-chat-status-notice__copy">
                    <strong>Set up Sage</strong>
                    <span>
                      {bootstrapQuestion?.prompt || 'Add your identity workspace so Sage can carry the right context into future turns.'}
                    </span>
                    <span>
                      {`Progress ${profileSnapshot.bootstrap.progress_label}. Structured profile is the runtime authority; USER.md, IDENTITY.md, SOUL.md, and HEARTBEAT.md stay as projections.`}
                    </span>
                  </div>
                  <form
                    className="app-stack-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitBootstrapResponse();
                    }}
                  >
                    <FormField label="Answer">
                      <FormInput
                        value={bootstrapAnswer}
                        onChange={(event) => {
                          setBootstrapAnswer(event.currentTarget.value);
                        }}
                        placeholder={bootstrapQuestion?.placeholder || 'Add the next answer for Sage'}
                        disabled={isSubmittingBootstrap}
                      />
                    </FormField>
                    <div className="app-chat-status-notice__actions">
                      <AppButton
                        type="submit"
                        tone="primary"
                        disabled={isSubmittingBootstrap || !bootstrapAnswer.trim()}
                      >
                        {isSubmittingBootstrap ? 'Saving…' : 'Save and continue'}
                      </AppButton>
                    </div>
                  </form>
                </AppNotice>
              ) : null}

              {showBlankTranscript ? (
                <div className={`app-chat-empty-state${recentRunRows.length > 0 ? ' app-chat-empty-state--recent' : ''}`}>
                  {recentRunRows.length > 0 ? (
                    <div className="app-chat-empty-state__recent">
                      {recentRunRows.map((run, index) => (
                        <button
                          key={run.runId ?? run.threadId ?? `${run.createdAt ?? 'run'}:${index}`}
                          type="button"
                          className="app-chat-empty-run-row"
                          onClick={() => {
                            void startNewThread({
                              title: run.title,
                              sourceRunId: run.runId,
                              sourceThreadId: run.threadId,
                            });
                          }}
                        >
                          <span className="app-chat-empty-run-row__time">{formatRelativeTime(run.createdAt)}</span>
                          <span className="app-chat-empty-run-row__preview" title={run.preview}>
                            {run.preview}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {visibleTranscriptCells.map((cell, index) => (
                <CodexChatCell
                  key={`${cell.kind}:${cell.id}:${index}`}
                  cell={cell}
                  resolvingApprovalId={resolvingApprovalId}
                  onResolveApproval={handleResolveCodexApproval}
                />
              ))}

              {pinnedTimelineCells.map((cell, index) => (
                <CodexChatCell
                  key={`pinned:${cell.kind}:${cell.id}:${index}`}
                  cell={cell}
                  resolvingApprovalId={resolvingApprovalId}
                  onResolveApproval={handleResolveCodexApproval}
                />
              ))}
            </div>
          </ScrollRegion>
        </section>

        <div className="app-chat-notices">
          {sendFailureNotice ? (
            <AppNotice
              tone="warning"
              role="status"
              aria-live="polite"
              className="app-chat-status-notice"
            >
              <div className="app-chat-status-notice__copy">
                <strong>Action needed</strong>
                <span>{sendFailureNotice.message}</span>
              </div>
              <div className="app-chat-status-notice__actions">
                {(sendFailureNotice.actions ?? []).map((action) => (
                  <AppButton
                    key={`${action.target}:${action.label}`}
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      setSendFailureNotice(null);
                      router.push(action.target === 'gateway' ? gatewayHref : integrationsHref);
                    }}
                  >
                    {action.label}
                  </AppButton>
                ))}
                {sendFailureNotice.retryable ? (
                  <AppButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      if (sendFailureNotice.retryDraft) {
                        setDraft(sendFailureNotice.retryDraft);
                      }
                      setSendFailureNotice(null);
                    }}
                  >
                    Try again
                  </AppButton>
                ) : null}
                <AppButton
                  type="button"
                  tone="ghost"
                  onClick={() => {
                    setSendFailureNotice(null);
                  }}
                >
                  Dismiss
                </AppButton>
              </div>
            </AppNotice>
          ) : null}

          {!sendFailureNotice && statusMessage ? (
            <AppNotice
              tone={statusNotice?.tone ?? 'neutral'}
              role="status"
              aria-live="polite"
              className="app-chat-status-notice"
            >
              <div className="app-chat-status-notice__copy">
                <strong>{statusNotice?.title ?? 'Notice'}</strong>
                <span>{statusNotice?.body ?? statusMessage}</span>
              </div>
              <div className="app-chat-status-notice__actions">
                <AppButton
                  type="button"
                  tone="secondary"
                  onClick={() => {
                    if (statusNotice?.actionTarget === 'gateway') {
                      setStatusMessage(null);
                      router.push(gatewayHref);
                      return;
                    }
                    if (statusNotice?.actionTarget === 'integrations') {
                      setStatusMessage(null);
                      router.push(integrationsHref);
                      return;
                    }
                    setStatusMessage(null);
                  }}
                >
                  {statusNotice?.actionLabel ?? (statusNotice?.requiresLocalAccess ? 'Got it' : 'Dismiss')}
                </AppButton>
              </div>
            </AppNotice>
          ) : null}
        </div>

      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={() => {
          void sendMessage();
        }}
        onStop={stopStreamingResponse}
        onOpenIntegrations={() => {
          router.push(integrationsHref);
        }}
        runTarget={selectedExecutionPlacement}
        runTargetOptions={runTargetOptions}
        onRunTargetChange={() => {}}
        autonomyMode={autonomyMode}
        autonomyOptions={autonomyOptions}
        onAutonomyModeChange={(nextValue) => {
          if (nextValue === 'approval' || nextValue === 'full') {
            setAutonomyMode(nextValue);
          }
        }}
        targetLabel={composerTargetLabel}
        model={effectiveSelectedModel}
        modelOptions={composerModelOptions}
        onModelChange={handleModelChange}
        reasoningEffort={reasoningEffort}
        reasoningOptions={reasoningOptions}
        onReasoningEffortChange={(nextValue) => {
          if (selectedModelOption.reasoningLevels.includes(nextValue as ChatReasoningEffort)) {
            setReasoningEffort(nextValue as ChatReasoningEffort);
          }
        }}
        contextWindowLabel={contextWindowLabel}
        busy={isSending}
        controlsDisabled={isPersistingModelSelection}
        sendDisabled={false}
        placeholder="Message Sage..."
        providerGateVisible={!activeProviderSummary.connected}
        providerSummary={{
          label: activeProviderSummary.label,
          actionLabel: 'Set up in Integrations',
        }}
        runtimeStatusLabel={runtimeStatus.label}
        runtimeStatusTone={runtimeStatus.tone}
        toolGroups={composerToolGroups}
        smallModelWarning={smallModelWarningVisible
          ? "You're using a small model. For best results with tools and complex tasks, we recommend switching to a larger model (7B+)."
          : null}
        preRunCostEstimate={preRunCostEstimate}
        onDismissSmallModelWarning={() => {
          setSmallModelWarningVisible(false);
        }}
        showAutonomySelector={localCompanionConnected}
        autonomyFallbackLabel="Offline"
      />

      <CommandSheet
        open={isApprovalsSheetOpen}
        title="Needs your OK"
        description="Review pending requests that need your OK for this conversation."
        onClose={() => {
          setIsApprovalsSheetOpen(false);
        }}
      >
        <div className="app-stack-3">
          {approvals.length === 0 ? (
            <AppNotice>No pending approvals.</AppNotice>
          ) : approvals.map((approval, index) => (
            <section key={readString(approval.approval_id) || readString(approval.id) || `approval-${index}`} className="app-surface-notice">
              <strong className="app-surface-title">{readString(approval.prompt) || `Approval ${index + 1}`}</strong>
              <span className="app-surface-description">
                {readString(approval.status) || 'pending'}
              </span>
              <div className="app-inline-actions">
                <AppButton
                  type="button"
                  disabled={Boolean(resolvingApprovalId)}
                  onClick={() => {
                    void handleResolveApproval(readString(approval.approval_id || approval.id), 'approved');
                  }}
                >
                  {resolvingApprovalId && resolvingApprovalId === readString(approval.approval_id || approval.id)
                    ? 'Allowing…'
                    : 'Allow this time'}
                </AppButton>
                <AppButton
                  type="button"
                  tone="danger"
                  disabled={Boolean(resolvingApprovalId)}
                  onClick={() => {
                    void handleResolveApproval(readString(approval.approval_id || approval.id), 'rejected');
                  }}
                >
                  Deny
                </AppButton>
              </div>
            </section>
          ))}
          <div>
            <Link href={`/w/${encodeURIComponent(bootstrap.workspace.id)}/tasks`} className="app-link-button app-link-button--primary">
              Open Tasks
            </Link>
          </div>
        </div>
      </CommandSheet>

      <CommandSheet
        open={isMemorySheetOpen}
        title={memoryDraft.entryId ? 'Correct memory' : 'Save memory'}
        description="Memory saves are explicit here. Save only facts or context Sage should carry into future turns."
        onClose={() => {
          setIsMemorySheetOpen(false);
          setMemoryDraft(defaultSageMemoryDraft());
        }}
        actions={(
          <>
            <AppButton
              type="button"
              tone="secondary"
              onClick={() => {
                setIsMemorySheetOpen(false);
                setMemoryDraft(defaultSageMemoryDraft());
              }}
              disabled={Boolean(mutatingMemory)}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              tone="primary"
              onClick={() => {
                void submitMemoryDraft();
              }}
              disabled={Boolean(mutatingMemory)}
            >
              {mutatingMemory ? 'Saving…' : memoryDraft.entryId ? 'Save correction' : 'Save memory'}
            </AppButton>
          </>
        )}
      >
        <FormSection
          title="Memory entry"
          description="Choose the category carefully so Sage can use this memory the right way."
        >
          <FormGrid columns="repeat(2, minmax(0, 1fr))">
            <FormField label="Category">
              <select
                className="app-select"
                value={memoryDraft.category}
                onChange={(event) => {
                  const nextCategory = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    category: nextCategory,
                  }));
                }}
              >
                {memorySnapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Pin now">
              <div className="app-inline-actions app-inline-actions--tight">
                <AppButton
                  type="button"
                  tone={memoryDraft.pinned ? 'primary' : 'secondary'}
                  onClick={() => {
                    setMemoryDraft((current) => ({
                      ...current,
                      pinned: !current.pinned,
                    }));
                  }}
                >
                  {memoryDraft.pinned ? 'Pinned' : 'Pin memory'}
                </AppButton>
              </div>
            </FormField>
          </FormGrid>
          <FormGrid columns="1fr">
            <FormField label="Title" hint="Short enough to scan quickly in future turns.">
              <FormInput
                value={memoryDraft.title}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    title: nextValue,
                  }));
                }}
                placeholder="Example: Preferred working style"
              />
            </FormField>
            <FormField label="Content" hint="Keep it factual and explicit. Avoid dumping raw notes.">
              <FormTextarea
                rows={5}
                value={memoryDraft.content}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setMemoryDraft((current) => ({
                    ...current,
                    content: nextValue,
                  }));
                }}
                placeholder="Example: Prefers concise status updates and direct next steps."
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
      </main>
    </>
  );
}
