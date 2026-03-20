'use client';

import { useCallback, useMemo, useEffect } from 'react';
import {
  UI,
  BUSINESS_PRESETS,
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_CONNECTOR_LABELS,
  OUTCOME_PACKS,
  OUTCOME_CONTRACTS,
  normalizeAgentRoleId,
  DEFAULT_OUTCOME_PACK_ID,
  DEFAULT_PROVIDER_OPTIONS,
  isAgentRoleId,
  isProviderId,
  isConnectorId,
  formatDurationMs,
  formatPercent,
  normalizeConnectionMode,
  normalizeProviderId,
  normalizeTrustMode,
  RUNTIME_KEY_STORAGE_KEYS,
  SETUP_SESSION_ID_STORAGE_KEYS,
  SETUP_STORAGE_KEYS,
} from './page.catalog';
import { type PageState } from './page.state';
import { type usePlatformApi } from './page.api';
import { writeRuntimeApiKeyToStorage } from '@/lib/runtimeKey';

export function usePageActions(state: PageState, api: ReturnType<typeof usePlatformApi>) {
  const {
    packResult,
    lastRunPayload,
    runId,
    lastRouteInfo,
    status,
    logs,
    runtimeMetrics,
    localWorkerStatus,
    selectedPackId,
    selectedPresetId,
    selectedAgentRole,
    provider,
    providerAuthMode,
    providerOptions,
    credentials,
    setupStatus,
    setupSession,
    connectionMode,
    credentialId,
    connectorType,
    setupHydrated,
    runtimeApiKey,
    setupSessionId,
    showSetupWizard,
    showPackInputs,
    showAdvancedControls,
    showKpis,
    guidedDefaultsEnabled,
    weeklyAutopilotEnabled,
    weeklyAutopilotDay,
    weeklyAutopilotTime,
    weeklyAutopilotTimezone,
    model,
    trustMode,
    setGoal,
    setSelectedPackId,
    setSelectedPresetId,
    setSelectedAgentRole,
    setInboxInput,
    setLeadsInput,
    setSlotsInput,
    setShowPackInputs,
    setTrustMode,
    setCredentialLabel,
    setConnectorLabel,
    setProvider,
    setProviderAuthMode,
    setSetupStatus,
    setCredentialId,
    setRuntimeApiKey,
    setSetupSessionId,
    setSetupSession,
    setSetupHydrated,
    setShowSetupWizard,
    setConnectionMode,
    setModel,
    setConnectorCredentialId,
    setConnectorType,
    setShowAdvancedControls,
    setShowKpis,
    setGuidedDefaultsEnabled,
    setWeeklyAutopilotEnabled,
    setWeeklyAutopilotDay,
    setWeeklyAutopilotTime,
    setWeeklyAutopilotTimezone,
  } = state;

  const {
    runRuntimeCheck,
    testConnection,
    setupAction,
    appendLog,
    refreshCredentials,
    refreshConnectors,
    refreshProviderModels,
    refreshProviderCatalog,
    fetchRuntimeMetrics,
    fetchLocalWorkerStatus,
    loadWeeklySchedule,
    refreshSetupSession,
    createSetupSession,
  } = api;

  const statusBadge = useMemo(() => {
    if (status === 'queued_local') return { label: 'Queued for Local Companion', color: UI.warning };
    if (status === 'running') return { label: 'Running', color: UI.accent };
    if (status === 'waiting') return { label: 'Needs your approval', color: UI.warning };
    if (status === 'completed') return { label: 'Completed', color: UI.success };
    if (status === 'error') return { label: 'Error', color: UI.error };
    return { label: 'Ready', color: UI.textMuted };
  }, [status]);

  const selectedPack = useMemo(
    () => OUTCOME_PACKS.find((pack) => pack.id === selectedPackId) || OUTCOME_PACKS[0],
    [selectedPackId],
  );
  const selectedContract = useMemo(
    () => OUTCOME_CONTRACTS[selectedPack.id] || OUTCOME_CONTRACTS[DEFAULT_OUTCOME_PACK_ID],
    [selectedPack.id],
  );
  const selectedPreset = useMemo(
    () => BUSINESS_PRESETS.find((preset) => preset.id === selectedPresetId) || BUSINESS_PRESETS[0],
    [selectedPresetId],
  );
  const selectedProviderOption = useMemo(
    () => providerOptions.find((item) => item.id === provider) || DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider) || DEFAULT_PROVIDER_OPTIONS[0],
    [provider, providerOptions],
  );
  const providerCredentialOptions = useMemo(
    () => credentials.filter((item) => item.provider === provider),
    [credentials, provider],
  );

  const setupReady = setupStatus.runtimeReady && setupStatus.accountConnected && setupStatus.connectionTested;
  const setupSteps = useMemo(
    () => [
      { label: 'System', done: setupStatus.runtimeReady },
      { label: 'Account', done: setupStatus.accountConnected },
      { label: 'Connection', done: setupStatus.connectionTested },
    ],
    [setupStatus],
  );
  const setupProgressCount = useMemo(
    () => setupSteps.filter((step) => step.done).length,
    [setupSteps],
  );
  const onboardingNextStep = useMemo(() => {
    const sessionNext = String(setupSession?.next_step || '').trim().toLowerCase();
    if (sessionNext) {
      if (sessionNext === 'done') return 'done' as const;
      if (sessionNext === 'verify' || sessionNext === 'complete') return 'connection' as const;
      if (sessionNext === 'risk_ack') return 'runtime' as const;
      return 'account' as const;
    }
    if (!setupStatus.runtimeReady) return 'runtime' as const;
    if (!setupStatus.accountConnected) return 'account' as const;
    if (!setupStatus.connectionTested) return 'connection' as const;
    return 'done' as const;
  }, [setupSession?.next_step, setupStatus]);

  const nextSetupStep = useMemo(() => {
    const sessionNext = String(setupSession?.next_step || '').trim().toLowerCase();
    const allowedActions = Array.isArray(setupSession?.allowed_actions)
      ? new Set(setupSession.allowed_actions.map((item) => String(item)))
      : null;
    const canSessionAction = (action: string) => !allowedActions || allowedActions.has(action);

    if (sessionNext === 'risk_ack') {
      return {
        label: 'Acknowledge security notice',
        action: canSessionAction('risk_ack')
          ? async () => {
              await setupAction('risk_ack', { accepted: true, source: 'web_setup' });
            }
          : null,
        blocked: !canSessionAction('risk_ack'),
      };
    }
    if (sessionNext === 'verify' || sessionNext === 'complete') {
      return {
        label: 'Run connection test',
        action: canSessionAction('verify') ? testConnection : null,
        blocked: !canSessionAction('verify'),
      };
    }
    if (sessionNext === 'done') {
      return null;
    }

    if (!setupStatus.runtimeReady) {
      return { label: 'Run system check', action: runRuntimeCheck, blocked: false };
    }
    if (!setupStatus.accountConnected) {
      return {
        label:
          connectionMode === 'byok'
            ? 'Save your AI account in step 2'
            : connectionMode === 'local_companion'
            ? 'Confirm Local Companion mode in step 2'
            : 'Select connection mode in step 2',
        action: null,
        blocked: true,
      };
    }
    if (!setupStatus.connectionTested) {
      return { label: 'Run connection test', action: testConnection, blocked: false };
    }
    return null;
  }, [
    connectionMode,
    runRuntimeCheck,
    setupAction,
    setupSession?.allowed_actions,
    setupSession?.next_step,
    setupStatus.accountConnected,
    setupStatus.connectionTested,
    setupStatus.runtimeReady,
    testConnection,
  ]);

  // Effects migrated from page.tsx
  useEffect(() => {
    if (!guidedDefaultsEnabled) return;
    setTrustMode('guarded');
    setShowPackInputs(false);
  }, [guidedDefaultsEnabled, setTrustMode, setShowPackInputs]);

  useEffect(() => {
    const defaults = new Set(Object.values(DEFAULT_PROVIDER_LABELS));
    setCredentialLabel((prev: string) => {
      if (!prev.trim() || defaults.has(prev.trim())) {
        if (provider === 'anthropic' && providerAuthMode === 'local_cli') {
          return DEFAULT_PROVIDER_LABELS.claude_code_cli;
        }
        return DEFAULT_PROVIDER_LABELS[provider];
      }
      return prev;
    });
  }, [provider, providerAuthMode, setCredentialLabel]);

  useEffect(() => {
    const option = providerOptions.find((item) => item.id === provider) || DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider) || DEFAULT_PROVIDER_OPTIONS[0];
    const nextAuthMode = option.defaultAuthMode || option.auth[0] || 'api_key';
    setProviderAuthMode((prev: string) => (option.auth.includes(prev) ? prev : nextAuthMode));
  }, [provider, providerOptions, setProviderAuthMode]);

  useEffect(() => {
    const defaults = new Set(Object.values(DEFAULT_CONNECTOR_LABELS));
    setConnectorLabel((prev: string) => {
      if (!prev.trim() || defaults.has(prev.trim())) {
        return DEFAULT_CONNECTOR_LABELS[connectorType];
      }
      return prev;
    });
  }, [connectorType, setConnectorLabel]);

  useEffect(() => {
    void refreshProviderCatalog();
  }, [refreshProviderCatalog]);

  useEffect(() => {
    if (connectionMode !== 'byok' && provider !== 'openai') {
      setProvider('openai');
    }
  }, [connectionMode, provider, setProvider]);

  useEffect(() => {
    if (connectionMode === 'byok') {
      refreshCredentials();
    } else {
      setSetupStatus((prev) => ({ ...prev, accountConnected: true }));
    }
    refreshConnectors();
  }, [connectionMode, refreshCredentials, refreshConnectors, setSetupStatus]);

  useEffect(() => {
    if (connectionMode !== 'byok') return;
    const matches = credentials.filter((item) => item.provider === provider);
    if (matches.length > 0) {
      if (!matches.some((item) => item.id === credentialId)) {
        setCredentialId(matches[0].id);
      }
      setSetupStatus((prev) => ({ ...prev, accountConnected: true }));
      return;
    }
    setCredentialId('');
    setSetupStatus((prev) => ({ ...prev, accountConnected: false }));
  }, [connectionMode, credentials, credentialId, provider, setCredentialId, setSetupStatus]);

  useEffect(() => {
    const selectedCredential =
      connectionMode === 'byok'
        ? providerCredentialOptions.find((item) => item.id === credentialId)?.id
        : undefined;
    void refreshProviderModels(provider, selectedCredential);
  }, [connectionMode, credentialId, provider, providerCredentialOptions, refreshProviderModels]);

  useEffect(() => {
    void fetchRuntimeMetrics();
    void fetchLocalWorkerStatus(true);
    const timer = window.setInterval(() => {
      void fetchRuntimeMetrics();
      void fetchLocalWorkerStatus(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchLocalWorkerStatus, fetchRuntimeMetrics]);

  useEffect(() => {
    void loadWeeklySchedule();
  }, [loadWeeklySchedule]);

  useEffect(() => {
    try {
      const storedRuntime = RUNTIME_KEY_STORAGE_KEYS
        .map((key) => window.localStorage.getItem(key))
        .find((value) => Boolean(value && value.trim()));
      if (storedRuntime) setRuntimeApiKey(storedRuntime);

      const storedSession = SETUP_SESSION_ID_STORAGE_KEYS
        .map((key) => window.localStorage.getItem(key))
        .find((value) => Boolean(value && value.trim()));
      if (storedSession) setSetupSessionId(storedSession);
    } catch {
      // ignore localStorage read errors
    }
  }, [setRuntimeApiKey, setSetupSessionId]);

  useEffect(() => {
    try {
      const raw = SETUP_STORAGE_KEYS
        .map((key) => window.localStorage.getItem(key))
        .find((value) => Boolean(value && value.trim()));
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.setupStatus) {
          const nextStatus = {
            runtimeReady: Boolean(saved.setupStatus.runtimeReady),
            accountConnected: Boolean(saved.setupStatus.accountConnected),
            connectionTested: Boolean(saved.setupStatus.connectionTested),
          };
          setSetupStatus(nextStatus);
          setShowSetupWizard(!(nextStatus.runtimeReady && nextStatus.accountConnected && nextStatus.connectionTested));
        }
        if (typeof saved?.connectionMode === 'string') {
          setConnectionMode(normalizeConnectionMode(saved.connectionMode));
        }
        if (typeof saved?.provider === 'string' && isProviderId(saved.provider)) {
          setProvider(normalizeProviderId(saved.provider));
        }
        if (typeof saved?.providerAuthMode === 'string' && saved.providerAuthMode.trim()) {
          setProviderAuthMode(saved.providerAuthMode.trim());
        }
        if (typeof saved?.model === 'string' && saved.model.trim()) {
          setModel(saved.model.trim());
        }
        if (typeof saved?.credentialId === 'string') {
          setCredentialId(saved.credentialId);
        }
        if (typeof saved?.connectorCredentialId === 'string') {
          setConnectorCredentialId(saved.connectorCredentialId);
        }
        if (typeof saved?.connectorType === 'string' && isConnectorId(saved.connectorType)) {
          setConnectorType(saved.connectorType);
        }
        if (typeof saved?.trustMode === 'string') {
          setTrustMode(normalizeTrustMode(saved.trustMode));
        }
        if (typeof saved?.selectedPackId === 'string') {
          const pack = OUTCOME_PACKS.find((item) => item.id === saved.selectedPackId);
          if (pack) setSelectedPackId(pack.id);
        }
        if (typeof saved?.selectedPresetId === 'string') {
          const preset = BUSINESS_PRESETS.find((item) => item.id === saved.selectedPresetId);
          if (preset) setSelectedPresetId(preset.id);
        }
        if (isAgentRoleId(saved?.selectedAgentRole)) {
          setSelectedAgentRole(normalizeAgentRoleId(saved.selectedAgentRole));
        }
        if (typeof saved?.showSetupWizard === 'boolean') setShowSetupWizard(saved.showSetupWizard);
        if (typeof saved?.showPackInputs === 'boolean') setShowPackInputs(saved.showPackInputs);
        if (typeof saved?.showAdvancedControls === 'boolean') setShowAdvancedControls(saved.showAdvancedControls);
        if (typeof saved?.showKpis === 'boolean') setShowKpis(saved.showKpis);
        if (typeof saved?.guidedDefaultsEnabled === 'boolean') setGuidedDefaultsEnabled(saved.guidedDefaultsEnabled);
        if (typeof saved?.weeklyAutopilotEnabled === 'boolean') setWeeklyAutopilotEnabled(saved.weeklyAutopilotEnabled);
        if (typeof saved?.weeklyAutopilotDay === 'string' && saved.weeklyAutopilotDay.trim()) setWeeklyAutopilotDay(saved.weeklyAutopilotDay);
        if (typeof saved?.weeklyAutopilotTime === 'string' && /^\d{2}:\d{2}$/.test(saved.weeklyAutopilotTime)) setWeeklyAutopilotTime(saved.weeklyAutopilotTime);
        if (saved?.weeklyAutopilotTimezone === 'local' || saved?.weeklyAutopilotTimezone === 'utc') setWeeklyAutopilotTimezone(saved.weeklyAutopilotTimezone);
        if (typeof saved?.setupSessionId === 'string' && saved.setupSessionId.trim()) setSetupSessionId(saved.setupSessionId.trim());
      }
    } catch {
      // ignore localStorage parsing errors
    } finally {
      setSetupHydrated(true);
    }
  }, [setSetupStatus, setShowSetupWizard, setConnectionMode, setProvider, setProviderAuthMode, setModel, setCredentialId, setConnectorCredentialId, setConnectorType, setTrustMode, setSelectedPackId, setSelectedPresetId, setSelectedAgentRole, setShowPackInputs, setShowAdvancedControls, setShowKpis, setGuidedDefaultsEnabled, setWeeklyAutopilotEnabled, setWeeklyAutopilotDay, setWeeklyAutopilotTime, setWeeklyAutopilotTimezone, setSetupSessionId, setSetupHydrated]);

  useEffect(() => {
    if (!setupHydrated) return;
    try {
      writeRuntimeApiKeyToStorage(runtimeApiKey);

      for (const key of SETUP_SESSION_ID_STORAGE_KEYS) {
        if (setupSessionId) window.localStorage.setItem(key, setupSessionId);
        else window.localStorage.removeItem(key);
      }

      const setupPayload = JSON.stringify({
        setupStatus, connectionMode, provider, providerAuthMode, model, credentialId, connectorCredentialId: state.connectorCredentialId, connectorType, trustMode, selectedPackId, selectedPresetId, selectedAgentRole, showSetupWizard, showPackInputs, showAdvancedControls, showKpis, guidedDefaultsEnabled, weeklyAutopilotEnabled, weeklyAutopilotDay, weeklyAutopilotTime, weeklyAutopilotTimezone, setupSessionId, updatedAt: new Date().toISOString(),
      });
      for (const key of SETUP_STORAGE_KEYS) {
        window.localStorage.setItem(key, setupPayload);
      }
    } catch { /* ignore */ }
  }, [setupHydrated, setupStatus, connectionMode, provider, providerAuthMode, model, credentialId, state.connectorCredentialId, connectorType, runtimeApiKey, trustMode, selectedPackId, selectedPresetId, selectedAgentRole, showSetupWizard, showPackInputs, showAdvancedControls, showKpis, guidedDefaultsEnabled, weeklyAutopilotEnabled, weeklyAutopilotDay, weeklyAutopilotTime, weeklyAutopilotTimezone, setupSessionId]);

  useEffect(() => {
    if (setupReady) setShowSetupWizard(false);
  }, [setupReady, setShowSetupWizard]);

  useEffect(() => {
    if (!setupHydrated) return;
    let cancelled = false;
    const ensureSetupSession = async () => {
      try {
        if (setupSessionId) {
          const session = await refreshSetupSession(setupSessionId);
          if (!cancelled) setSetupSession(session);
          return;
        }
        const created = await createSetupSession();
        if (!cancelled) {
          setSetupSession(created);
          setSetupSessionId(created.id);
        }
      } catch { /* ignore */ }
    };
    void ensureSetupSession();
    return () => { cancelled = true; };
  }, [createSetupSession, refreshSetupSession, setupHydrated, setupSessionId, setSetupSession, setSetupSessionId]);

  const copyResultSummary = useCallback(async () => {
    if (!packResult) return;
    const text = packResult.summary || 'No summary available.';
    try {
      await navigator.clipboard.writeText(text);
      appendLog('Summary copied to clipboard.');
    } catch {
      appendLog('Failed to copy summary.', 'warn');
    }
  }, [appendLog, packResult]);

  const exportRunJson = useCallback(() => {
    if (!packResult && !lastRunPayload) {
      appendLog('No run output to export yet.', 'warn');
      return;
    }
    const payload = lastRunPayload || {
      run_id: runId,
      result_data: packResult,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `empyralis-run-${runId || 'latest'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    appendLog('Run JSON exported.');
  }, [appendLog, lastRunPayload, packResult, runId]);

  const createFollowUpTask = useCallback(() => {
    if (!packResult || !Array.isArray(packResult.next_steps) || packResult.next_steps.length === 0) {
      appendLog('No follow-up task available yet.', 'warn');
      return;
    }
    const first = packResult.next_steps[0];
    setGoal(`Follow-up task: ${first}`);
    appendLog('Follow-up task created from latest result.');
  }, [appendLog, packResult, setGoal]);

  const runReceipt = useMemo(() => {
    const payload = lastRunPayload || {};
    const id = typeof payload.run_id === 'string' ? payload.run_id : runId;
    if (!id) return null;

    const payloadStatus = typeof payload.status === 'string' ? payload.status : null;
    const currentStatus = payloadStatus || status;
    const createdAt = typeof payload.created_at === 'string' ? payload.created_at : null;
    const durationMs = typeof payload.duration_ms === 'number' ? payload.duration_ms : null;
    const firstValueMs = typeof payload.time_to_first_value_ms === 'number' ? payload.time_to_first_value_ms : null;
    const hitlWaitMs = typeof payload.hitl_wait_total_ms === 'number' ? payload.hitl_wait_total_ms : null;
    const route = payload.route && typeof payload.route === 'object' ? payload.route as Record<string, unknown> : null;
    const context = payload.context && typeof payload.context === 'object' ? payload.context as Record<string, unknown> : null;
    const metadata = context?.metadata && typeof context.metadata === 'object' ? context.metadata as Record<string, unknown> : null;

    const data = payload.result_data && typeof payload.result_data === 'object' ? payload.result_data as Record<string, unknown> : null;
    const packId = typeof data?.pack_id === 'string' ? data.pack_id : selectedPack.id;
    const summary = typeof data?.summary === 'string'
      ? data.summary
      : packResult?.summary || 'Run completed with no summary text.';
    const routeSelected =
      (typeof route?.selected === 'string' ? route.selected : null)
      || (typeof metadata?.execution_target_selected === 'string' ? String(metadata.execution_target_selected) : null)
      || (typeof lastRouteInfo?.selected === 'string' ? lastRouteInfo.selected : null);
    const routeRequested =
      (typeof route?.requested === 'string' ? route.requested : null)
      || (typeof metadata?.execution_target_requested === 'string' ? String(metadata.execution_target_requested) : null)
      || (typeof lastRouteInfo?.requested === 'string' ? lastRouteInfo.requested : null);
    const routeReason =
      (typeof route?.reason === 'string' ? route.reason : null)
      || (typeof metadata?.execution_target_reason === 'string' ? String(metadata.execution_target_reason) : null)
      || (typeof lastRouteInfo?.reason === 'string' ? lastRouteInfo.reason : null);

    return {
      id,
      status: currentStatus,
      createdAt,
      durationMs,
      firstValueMs,
      hitlWaitMs,
      packId,
      summary,
      routeSelected,
      routeRequested,
      routeReason,
    };
  }, [lastRouteInfo, lastRunPayload, packResult, runId, selectedPack.id, status]);

  const copyRunReceipt = useCallback(async () => {
    if (!runReceipt) {
      appendLog('No receipt available yet.', 'warn');
      return;
    }
    const lines = [
      `Run ID: ${runReceipt.id}`,
      `Status: ${runReceipt.status}`,
      `Pack: ${runReceipt.packId}`,
      runReceipt.createdAt ? `Started: ${runReceipt.createdAt}` : '',
      runReceipt.durationMs !== null ? `Duration: ${formatDurationMs(runReceipt.durationMs)}` : '',
      runReceipt.firstValueMs !== null ? `Time-to-first-value: ${formatDurationMs(runReceipt.firstValueMs)}` : '',
      runReceipt.hitlWaitMs !== null ? `Human wait: ${formatDurationMs(runReceipt.hitlWaitMs)}` : '',
      runReceipt.routeSelected ? `Route: ${runReceipt.routeSelected}` : '',
      runReceipt.routeRequested ? `Requested route: ${runReceipt.routeRequested}` : '',
      runReceipt.routeReason ? `Route reason: ${runReceipt.routeReason}` : '',
      '',
      `Summary: ${runReceipt.summary}`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      appendLog('Run receipt copied to clipboard.');
    } catch {
      appendLog('Failed to copy run receipt.', 'warn');
    }
  }, [appendLog, runReceipt]);

  const applyStarterTemplate = useCallback((presetId: string) => {
    const preset = BUSINESS_PRESETS.find((item) => item.id === presetId) || BUSINESS_PRESETS[0];
    const pack = OUTCOME_PACKS.find((item) => item.id === preset.packId) || OUTCOME_PACKS[0];
    setSelectedPresetId(preset.id);
    setSelectedPackId(pack.id);
    setGoal(preset.goal);
    setInboxInput(preset.inputs.primary);
    setLeadsInput(preset.inputs.secondary);
    setSlotsInput(preset.inputs.tertiary);
    setShowPackInputs(true);
    appendLog(`Starter template applied: ${preset.label}.`);
  }, [appendLog, setSelectedPresetId, setSelectedPackId, setGoal, setInboxInput, setLeadsInput, setSlotsInput, setShowPackInputs]);

  const autonomyStages = useMemo(() => {
    const hasEvent = (name: string) => logs.some((entry) => entry.event === name);
    const hasNode = (nodeId: string) =>
      logs.some((entry) => entry.event === 'dag_node_complete' && entry.nodeId === nodeId);

    const observeDone = hasNode('runtime.resolve') || hasEvent('route_decision') || hasEvent('run_start');
    const decideDone = hasNode('plan.generate') || hasEvent('orion_plan');
    const approveDone = hasEvent('approval_skipped') || hasEvent('approval_received');
    const approveWaiting = hasEvent('approval_required') || status === 'waiting';
    const actDone = hasNode('result.generate') || hasEvent('orion_result');
    const verifyDone = hasNode('usage.finalize') || hasEvent('run_complete') || status === 'completed';

    const ordered = [
      { id: 'observe', label: 'Observe', done: observeDone, waiting: false },
      { id: 'decide', label: 'Decide', done: decideDone, waiting: false },
      { id: 'approve', label: 'Approve', done: approveDone, waiting: approveWaiting && !approveDone },
      { id: 'act', label: 'Act', done: actDone, waiting: false },
      { id: 'verify', label: 'Verify', done: verifyDone, waiting: false },
    ] as const;

    const activeIndex = ordered.findIndex((stage) => !stage.done && !stage.waiting);
    return ordered.map((stage, index) => {
      let state: 'done' | 'waiting' | 'active' | 'pending' = 'pending';
      if (stage.done) state = 'done';
      else if (stage.waiting) state = 'waiting';
      else if (activeIndex === index) state = 'active';
      return { ...stage, state };
    });
  }, [logs, status]);

  const executionSummary = useMemo(() => packResult?.execution_summary, [packResult]);
  const riskColor = useMemo(() =>
    executionSummary?.risk_level === 'high'
      ? UI.error
      : executionSummary?.risk_level === 'medium'
      ? UI.warning
      : UI.success,
  [executionSummary]);

  const showBuilderWorkspace = false;

  const kpiCards = [
    {
      label: 'Completion',
      value: runtimeMetrics ? formatPercent(runtimeMetrics.runs.completion_rate) : '--',
    },
    {
      label: 'Avg run time',
      value: runtimeMetrics ? formatDurationMs(runtimeMetrics.kpis.avg_run_duration_ms) : '--',
    },
    {
      label: 'Time-to-first-value',
      value: runtimeMetrics ? formatDurationMs(runtimeMetrics.kpis.avg_time_to_first_value_ms) : '--',
    },
    {
      label: 'Human wait',
      value: runtimeMetrics ? formatDurationMs(runtimeMetrics.kpis.avg_human_wait_ms) : '--',
    },
  ];

  const workerSummary = useMemo(() => {
    const metricsLocal = runtimeMetrics?.local_companion;
    const statusSummary = localWorkerStatus?.summary;
    return {
      enabled: Boolean(localWorkerStatus?.enabled ?? metricsLocal?.enabled ?? false),
      online: Number(statusSummary?.online ?? metricsLocal?.online_workers ?? 0),
      known: Number(statusSummary?.known ?? metricsLocal?.known_workers ?? 0),
      busy: Number(statusSummary?.busy ?? 0),
      pending: Number(statusSummary?.pending_runs ?? metricsLocal?.pending_runs ?? 0),
      claimed: Number(statusSummary?.claimed_runs ?? metricsLocal?.claimed_runs ?? 0),
    };
  }, [localWorkerStatus, runtimeMetrics]);

  return {
    copyResultSummary,
    exportRunJson,
    createFollowUpTask,
    runReceipt,
    copyRunReceipt,
    applyStarterTemplate,
    autonomyStages,
    kpiCards,
    workerSummary,
    statusBadge,
    selectedPack,
    selectedContract,
    selectedPreset,
    selectedProviderOption,
    providerCredentialOptions,
    setupReady,
    setupSteps,
    setupProgressCount,
    onboardingNextStep,
    nextSetupStep,
    executionSummary,
    riskColor,
    showBuilderWorkspace,
  };
}
