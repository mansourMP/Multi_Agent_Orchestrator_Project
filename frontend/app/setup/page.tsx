'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Loader2,
  Mail,
  MessageSquare,
  NotebookPen,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  DEFAULT_PROVIDER_LABELS,
  DEFAULT_PROVIDER_OPTIONS,
  normalizeProviderId,
  type ConnectorId,
  type ProviderId,
} from '@/app/page.catalog';
import { useToast } from '@/components/Toast';
import DoctorPreflightNotice from '@/components/orion/DoctorPreflightNotice';
import LocalRuntimeRecoveryCard from '@/components/orion/LocalRuntimeRecoveryCard';
import { API_BASE } from '@/lib/config';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';
import { getExecutionTargetGuides } from '@/lib/executionTargets';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { upsertSeededRuntimeRun } from '@/lib/runtimeRunSeed';
import {
  buildFallbackPlan,
  buildTaskSummary,
  inferRequiredTools,
  type SetupPlanStep,
  type SetupTool,
  type SetupToolId,
  workflowToPlainSteps,
} from '@/lib/setupFlow';

const ORION_API_URL = API_BASE;
const WORKSPACE_ID = 'default';
const SETUP_FLOW_STORAGE_KEY = 'hekor.setup-flow.v1';
const EXAMPLE_PROMPTS = [
  'Summarize my emails every morning',
  'Follow up with new leads automatically',
  'Research competitors and send me a weekly report',
] as const;
const TOTAL_STEPS = 5;

type SetupProviderId = 'openai' | 'anthropic' | 'gemini';
type SetupSourceMode = 'credits' | 'byok';
type SetupExecutionTarget = 'auto' | 'local_companion' | 'cloud';

type RuntimeProfile = {
  id: string;
  provider: SetupProviderId;
  label: string;
  model: string;
  enabled: boolean;
  health: string | null;
  priority: number;
  credentialId: string;
};

type ConnectorRow = {
  id: string;
  connector: ConnectorId;
  label: string;
};

type PersistedSetupState = {
  step: number;
  prompt: string;
  planSteps: SetupPlanStep[];
  tools: SetupTool[];
  sourceMode: SetupSourceMode;
  provider: SetupProviderId;
  selectedProfileId: string;
  executionTarget: SetupExecutionTarget;
};

type RuntimeMachinesPayload = {
  items?: Array<{
    runtime_type?: string | null;
    online?: boolean | null;
    execution_targets?: string[] | null;
  }>;
};

type RunPrecheckPayload = {
  route?: {
    requested?: string | null;
    selected?: string | null;
    reason?: string | null;
    fallback?: string | null;
    required_capabilities?: string[] | null;
    missing_capabilities?: string[] | null;
    matching_runtime_ids?: string[] | null;
    available_runtime_ids?: string[] | null;
    busy_runtime_ids?: string[] | null;
    busy_runtime_labels?: string[] | null;
    queued_ahead_count?: number | null;
    estimated_wait_band?: string | null;
    waiting_for_runtime?: boolean | null;
    waiting_for_capacity?: boolean | null;
  } | null;
  doctor_preflight?: DoctorRunGateDecision | null;
};

function normalizeSetupProvider(value: unknown): SetupProviderId {
  const provider = normalizeProviderId(value);
  if (provider === 'anthropic') return 'anthropic';
  if (provider === 'gemini') return 'gemini';
  return 'openai';
}

function providerLabel(provider: SetupProviderId): string {
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'gemini') return 'Google';
  return 'OpenAI';
}

function defaultProviderModel(provider: SetupProviderId): string {
  return DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider)?.defaultModel || 'gpt-4.1';
}

function parseProfiles(payload: unknown): RuntimeProfile[] {
  const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((payload as { items: unknown[] }).items)
    : [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const provider = normalizeSetupProvider(record.provider);
      if (!id) return null;
      return {
        id,
        provider,
        label: String(record.label || providerLabel(provider)).trim() || providerLabel(provider),
        model: String(record.model || defaultProviderModel(provider)).trim() || defaultProviderModel(provider),
        enabled: record.enabled !== false,
        health: typeof record.health === 'string' ? record.health : null,
        priority: typeof record.priority === 'number' ? record.priority : 100,
        credentialId: String(record.credential_id || '').trim(),
      } satisfies RuntimeProfile;
    })
    .filter((item): item is RuntimeProfile => item !== null)
    .sort((left, right) => {
      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.label.localeCompare(right.label);
    });
}

function parseConnectors(payload: unknown): ConnectorRow[] {
  const items = Array.isArray((payload as { items?: unknown[] } | null | undefined)?.items)
    ? ((payload as { items: unknown[] }).items)
    : [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const connector = String(record.connector || '').trim() as ConnectorId;
      if (!id || !connector) return null;
      return {
        id,
        connector,
        label: String(record.label || connector).trim() || connector,
      } satisfies ConnectorRow;
    })
    .filter((item): item is ConnectorRow => item !== null);
}

function readSetupState(): PersistedSetupState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SETUP_FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSetupState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      step: typeof parsed.step === 'number' ? Math.min(Math.max(parsed.step, 1), TOTAL_STEPS) : 1,
      prompt: String(parsed.prompt || '').trim(),
      planSteps: Array.isArray(parsed.planSteps) ? parsed.planSteps.filter(Boolean) as SetupPlanStep[] : [],
      tools: Array.isArray(parsed.tools) ? parsed.tools.filter(Boolean) as SetupTool[] : [],
      sourceMode: parsed.sourceMode === 'byok' ? 'byok' : 'credits',
      provider: normalizeSetupProvider(parsed.provider),
      selectedProfileId: String(parsed.selectedProfileId || '').trim(),
      executionTarget:
        parsed.executionTarget === 'cloud' || parsed.executionTarget === 'local_companion'
          ? parsed.executionTarget
          : 'auto',
    };
  } catch {
    return null;
  }
}

function persistSetupState(state: PersistedSetupState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SETUP_FLOW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors.
  }
}

function clearSetupState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SETUP_FLOW_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function hasOnlineLocalRuntime(payload: unknown): boolean {
  const items = Array.isArray((payload as RuntimeMachinesPayload | null | undefined)?.items)
    ? (payload as RuntimeMachinesPayload).items || []
    : [];

  return items.some((item) => {
    const runtimeType = String(item?.runtime_type || '').trim().toLowerCase();
    const executionTargets = Array.isArray(item?.execution_targets) ? item.execution_targets : [];
    return Boolean(item?.online)
      && (
        runtimeType === 'local'
        || executionTargets.includes('local')
        || executionTargets.includes('local_companion')
      );
  });
}

function formatExecutionTargetLabel(target: string | null | undefined): string {
  if (target === 'local_companion' || target === 'local') return 'Local machine';
  if (target === 'cloud') return 'Cloud runtime';
  return 'Automatic';
}

function executionTargetDescription(target: SetupExecutionTarget, hasLocalRuntime: boolean): string {
  if (target === 'local_companion') {
    return hasLocalRuntime
      ? 'Run this on an available local machine.'
      : 'No local machine is online right now.';
  }
  if (target === 'cloud') return 'Run this in Hekor cloud mode.';
  return hasLocalRuntime
    ? 'Prefer a local machine, then fall back to cloud if needed.'
    : 'No local machine is online, so this will run in cloud mode.';
}

function statusIconForTool(toolId: SetupToolId | null) {
  if (toolId === 'gmail') return Mail;
  if (toolId === 'slack') return MessageSquare;
  if (toolId === 'notion') return NotebookPen;
  if (toolId === 'calendar') return CalendarDays;
  if (toolId === 'hubspot') return BriefcaseBusiness;
  return Bot;
}

export default function SetupPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [runtimeApiKey] = useState(() => readRuntimeApiKeyFromStorage(''));
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [planSteps, setPlanSteps] = useState<SetupPlanStep[]>([]);
  const [tools, setTools] = useState<SetupTool[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [selectedSourceMode, setSelectedSourceMode] = useState<SetupSourceMode>('byok');
  const [selectedProvider, setSelectedProvider] = useState<SetupProviderId>('openai');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState('');
  const [hasLocalRuntime, setHasLocalRuntime] = useState(false);
  const [selectedExecutionTarget, setSelectedExecutionTarget] = useState<SetupExecutionTarget>('auto');
  const [doctorChecking, setDoctorChecking] = useState(false);
  const [doctorDecision, setDoctorDecision] = useState<DoctorRunGateDecision | null>(null);
  const [runPrecheck, setRunPrecheck] = useState<RunPrecheckPayload | null>(null);
  const [showAdvancedRouteOptions, setShowAdvancedRouteOptions] = useState(false);

  const buildHeaders = useCallback((withJson = false): HeadersInit => {
    const headers = new Headers();
    if (withJson) headers.set('Content-Type', 'application/json');
    if (runtimeApiKey) headers.set('X-API-Key', runtimeApiKey);
    return headers;
  }, [runtimeApiKey]);

  const loadRuntimeState = useCallback(async () => {
    if (!runtimeApiKey) {
      setProfiles([]);
      setConnectors([]);
      setProfilesLoading(false);
      setConnectorsLoading(false);
      setHasLocalRuntime(false);
      return;
    }

    setProfilesLoading(true);
    setConnectorsLoading(true);
    try {
      const [profilesRes, connectorsRes, machinesRes] = await Promise.all([
        fetch(`${ORION_API_URL}/providers/profiles/health?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
          headers: buildHeaders(false),
        }),
        fetch(`${ORION_API_URL}/connectors/vault?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, {
          headers: buildHeaders(false),
        }),
        fetch(`${ORION_API_URL}/runtime/runtimes/status`, {
          headers: buildHeaders(false),
        }),
      ]);

      const profilesPayload = profilesRes.ok ? await profilesRes.json().catch(() => ({ items: [] })) : { items: [] };
      const connectorsPayload = connectorsRes.ok ? await connectorsRes.json().catch(() => ({ items: [] })) : { items: [] };
      const machinesPayload = machinesRes.ok ? await machinesRes.json().catch(() => ({ items: [] })) : { items: [] };
      setProfiles(parseProfiles(profilesPayload));
      setConnectors(parseConnectors(connectorsPayload));
      setHasLocalRuntime(hasOnlineLocalRuntime(machinesPayload));
    } catch {
      setProfiles([]);
      setConnectors([]);
      setHasLocalRuntime(false);
    } finally {
      setProfilesLoading(false);
      setConnectorsLoading(false);
    }
  }, [buildHeaders, runtimeApiKey]);

  useEffect(() => {
    document.body.classList.add('orion-setup-focus');
    return () => {
      document.body.classList.remove('orion-setup-focus');
    };
  }, []);

  useEffect(() => {
    const restored = readSetupState();
    if (restored) {
      setStep(restored.step);
      setPrompt(restored.prompt);
      setPlanSteps(restored.planSteps);
      setTools(restored.tools);
      setSelectedSourceMode(restored.sourceMode);
      setSelectedProvider(restored.provider);
      setSelectedProfileId(restored.selectedProfileId);
      setSelectedExecutionTarget(restored.executionTarget);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistSetupState({
      step,
      prompt,
      planSteps,
      tools,
      sourceMode: selectedSourceMode,
      provider: selectedProvider,
      selectedProfileId,
      executionTarget: selectedExecutionTarget,
    });
  }, [hydrated, planSteps, prompt, selectedExecutionTarget, selectedProfileId, selectedProvider, selectedSourceMode, step, tools]);

  useEffect(() => {
    void loadRuntimeState();
  }, [loadRuntimeState]);

  useEffect(() => {
    const handleFocus = () => {
      void loadRuntimeState();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadRuntimeState]);

  const enabledProfiles = useMemo(
    () => profiles.filter((item) => item.enabled),
    [profiles],
  );
  const hasSavedAiSource = enabledProfiles.length > 0;
  const showSourceStep = !hasSavedAiSource;
  const showToolsStep = tools.length > 0;
  const activeProfile = useMemo(
    () => enabledProfiles.find((item) => item.id === selectedProfileId) || enabledProfiles[0] || null,
    [enabledProfiles, selectedProfileId],
  );
  const connectedConnectorIds = useMemo(
    () => new Set(connectors.map((item) => item.connector)),
    [connectors],
  );

  useEffect(() => {
    if (!enabledProfiles.length) return;
    if (selectedProfileId && enabledProfiles.some((item) => item.id === selectedProfileId)) return;
    setSelectedProfileId(enabledProfiles[0].id);
  }, [enabledProfiles, selectedProfileId]);

  useEffect(() => {
    if (step === 3 && !showSourceStep) {
      setStep(showToolsStep ? 4 : 5);
      return;
    }
    if (step === 4 && !showToolsStep) {
      setStep(5);
    }
  }, [showSourceStep, showToolsStep, step]);

  const isToolConnected = useCallback(
    (tool: SetupTool) => (tool.connectorId ? connectedConnectorIds.has(tool.connectorId) : false),
    [connectedConnectorIds],
  );

  const unresolvedBlockingTools = useMemo(
    () => tools.filter((tool) => tool.blocking && !isToolConnected(tool)),
    [isToolConnected, tools],
  );

  const canSkipToolsStep = useMemo(
    () => tools.some((tool) => !isToolConnected(tool)) && tools.every((tool) => !tool.blocking || isToolConnected(tool)),
    [isToolConnected, tools],
  );

  const connectedSummaryTools = useMemo(
    () => tools.filter((tool) => isToolConnected(tool)),
    [isToolConnected, tools],
  );
  const selectedExecutionTargetLabel = useMemo(
    () => formatExecutionTargetLabel(selectedExecutionTarget),
    [selectedExecutionTarget],
  );
  const selectedExecutionTargetDescription = useMemo(
    () => executionTargetDescription(selectedExecutionTarget, hasLocalRuntime),
    [hasLocalRuntime, selectedExecutionTarget],
  );
  const executionTargetGuides = useMemo(
    () => getExecutionTargetGuides(hasLocalRuntime),
    [hasLocalRuntime],
  );
  const runTargetBlocked = selectedExecutionTarget === 'local_companion' && !hasLocalRuntime;
  const doctorRunBlocked = Boolean(doctorDecision?.blocking);
  const currentProvider = activeProfile?.provider || null;
  const precheckRouteRequested = useMemo(
    () => String(runPrecheck?.route?.requested || '').trim() || null,
    [runPrecheck?.route?.requested],
  );
  const precheckRouteSelected = useMemo(
    () => String(runPrecheck?.route?.selected || '').trim() || null,
    [runPrecheck?.route?.selected],
  );
  const effectiveExecutionTargetLabel = useMemo(
    () => formatExecutionTargetLabel(precheckRouteSelected || selectedExecutionTarget),
    [precheckRouteSelected, selectedExecutionTarget],
  );
  const precheckRouteReason = useMemo(
    () => String(runPrecheck?.route?.reason || '').trim(),
    [runPrecheck?.route?.reason],
  );
  const precheckRouteFallback = useMemo(
    () => String(runPrecheck?.route?.fallback || '').trim(),
    [runPrecheck?.route?.fallback],
  );
  const precheckWaitingForRuntime = useMemo(
    () => Boolean(runPrecheck?.route?.waiting_for_runtime),
    [runPrecheck?.route?.waiting_for_runtime],
  );
  const precheckWaitingForCapacity = useMemo(
    () => Boolean(runPrecheck?.route?.waiting_for_capacity),
    [runPrecheck?.route?.waiting_for_capacity],
  );
  const precheckRequiredCapabilities = useMemo(() => {
    const value = runPrecheck?.route?.required_capabilities;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }, [runPrecheck?.route?.required_capabilities]);
  const precheckMissingCapabilities = useMemo(() => {
    const value = runPrecheck?.route?.missing_capabilities;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }, [runPrecheck?.route?.missing_capabilities]);
  const precheckBusyRuntimeIds = useMemo(() => {
    const value = runPrecheck?.route?.busy_runtime_ids;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }, [runPrecheck?.route?.busy_runtime_ids]);
  const precheckBusyRuntimeLabels = useMemo(() => {
    const value = runPrecheck?.route?.busy_runtime_labels;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }, [runPrecheck?.route?.busy_runtime_labels]);
  const precheckQueuedAheadCount = useMemo(
    () => Math.max(0, Number(runPrecheck?.route?.queued_ahead_count || 0)),
    [runPrecheck?.route?.queued_ahead_count],
  );
  const precheckEstimatedWaitBand = useMemo(() => {
    const value = String(runPrecheck?.route?.estimated_wait_band || '').trim().toLowerCase();
    if (value === 'short' || value === 'moderate' || value === 'long') return value;
    return null;
  }, [runPrecheck?.route?.estimated_wait_band]);
  const routeDecisionSummary = useMemo(() => {
    if (precheckRouteReason) return precheckRouteReason;
    if (precheckRouteSelected && precheckRouteRequested && precheckRouteSelected !== precheckRouteRequested) {
      return `Requested ${selectedExecutionTargetLabel}. Hekor will use ${effectiveExecutionTargetLabel}.`;
    }
    return `Hekor will use ${effectiveExecutionTargetLabel}.`;
  }, [
    effectiveExecutionTargetLabel,
    precheckRouteReason,
    precheckRouteRequested,
    precheckRouteSelected,
    selectedExecutionTargetLabel,
  ]);
  const routeDecisionNeedsAttention = useMemo(
    () =>
      runTargetBlocked
      || precheckWaitingForRuntime
      || precheckWaitingForCapacity
      || Boolean(precheckRouteFallback)
      || Boolean(precheckRouteReason && precheckRouteSelected && precheckRouteRequested && precheckRouteSelected !== precheckRouteRequested),
    [
      precheckRouteFallback,
      precheckRouteReason,
      precheckRouteRequested,
      precheckRouteSelected,
      precheckWaitingForCapacity,
      precheckWaitingForRuntime,
      runTargetBlocked,
    ],
  );
  const showRouteDetails = showAdvancedRouteOptions || routeDecisionNeedsAttention;

  const goToPlan = useCallback(() => {
    setStep(2);
  }, []);

  const proceedAfterPlan = useCallback(() => {
    if (showSourceStep) {
      setStep(3);
      return;
    }
    if (showToolsStep) {
      setStep(4);
      return;
    }
    setStep(5);
  }, [showSourceStep, showToolsStep]);

  const proceedAfterSource = useCallback(() => {
    if (showToolsStep) {
      setStep(4);
      return;
    }
    setStep(5);
  }, [showToolsStep]);

  const handleBack = useCallback(() => {
    if (step <= 1) return;
    if (step === 2) {
      setStep(1);
      return;
    }
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 4) {
      setStep(showSourceStep ? 3 : 2);
      return;
    }
    if (step === 5) {
      if (showToolsStep) {
        setStep(4);
      } else if (showSourceStep) {
        setStep(3);
      } else {
        setStep(2);
      }
    }
  }, [showSourceStep, showToolsStep, step]);

  const generatePlan = useCallback(async (nextPrompt: string, preferredProfileId = '') => {
    const trimmed = nextPrompt.trim();
    const inferredTools = inferRequiredTools(trimmed);
    setTools(inferredTools);
    setPlanLoading(true);
    setPlanError('');
    setRunError('');

    if (!runtimeApiKey) {
      setPlanSteps(buildFallbackPlan(trimmed, inferredTools));
      setPlanError('Connect the runtime first to generate a detailed plan. You can still continue with a draft plan.');
      setPlanLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          prompt: trimmed,
          workspace_id: WORKSPACE_ID,
          profile_id: preferredProfileId || activeProfile?.id || undefined,
          model: activeProfile?.model || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(String(payload?.error || payload?.detail || 'Unable to generate the plan.'));
      }

      const steps = workflowToPlainSteps(payload, trimmed, inferredTools);
      const mergedTools = inferRequiredTools(`${trimmed} ${steps.map((item) => `${item.title} ${item.description}`).join(' ')}`);
      setPlanSteps(steps);
      setTools(mergedTools);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the plan.';
      setPlanSteps(buildFallbackPlan(trimmed, inferredTools));
      setPlanError(message);
    } finally {
      setPlanLoading(false);
    }
  }, [activeProfile?.id, activeProfile?.model, buildHeaders, runtimeApiKey]);

  const handleSubmitTask = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      addToast({
        type: 'error',
        title: 'Describe the task',
        message: 'Enter the task in plain language first.',
      });
      return;
    }
    goToPlan();
    void generatePlan(trimmed);
  }, [addToast, generatePlan, goToPlan, prompt]);

  const buildRunStartPayload = useCallback((profile: RuntimeProfile | null) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !profile) return null;

    const connectedRows = connectors.filter((row) => tools.some((tool) => tool.connectorId === row.connector));
    const businessPlan = [
      `Goal: ${trimmedPrompt}`,
      'Plan:',
      ...planSteps.map((item, index) => `${index + 1}. ${item.description}`),
    ].join('\n');

    return {
      engine: 'orion',
      workspace_id: WORKSPACE_ID,
      user_goal: trimmedPrompt,
      business_plan: businessPlan,
      agent_role: 'assistant',
      provider: profile.provider,
      model: profile.model,
      credential_id: profile.credentialId || undefined,
      metadata: {
        workspace_id: WORKSPACE_ID,
        origin: 'setup_onboarding',
        profile_id: profile.id,
        runtime_profile_id: profile.id,
        provider: profile.provider,
        model: profile.model,
        execution_target: selectedExecutionTarget,
        required_tools: tools.map((tool) => tool.id),
        connector_credential_id: connectedRows[0]?.id || undefined,
        connected_connector_ids: connectedRows.map((row) => row.id),
      },
      agents: [
        {
          role: 'Operator',
          modelId: profile.model,
          provider: profile.provider,
          duty: planSteps.map((item) => item.description).join(' '),
        },
      ],
    };
  }, [connectors, planSteps, prompt, selectedExecutionTarget, tools]);

  const loadRunPrecheck = useCallback(async () => {
    if (!runtimeApiKey) {
      setRunPrecheck(null);
      setDoctorDecision(null);
      setDoctorChecking(false);
      return null;
    }

    const payload = buildRunStartPayload(activeProfile);
    if (!payload) {
      setRunPrecheck(null);
      setDoctorDecision(null);
      setDoctorChecking(false);
      return null;
    }

    setDoctorChecking(true);
    try {
      const response = await fetch(`${ORION_API_URL}/runs/precheck`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify(payload),
      });
      const nextBody = (await response.json().catch(() => null)) as RunPrecheckPayload | null;
      if (!response.ok) {
        throw new Error('Failed to check where this task will run.');
      }
      const nextDecision = nextBody?.doctor_preflight || null;
      setRunPrecheck(nextBody);
      setDoctorDecision(nextDecision);
      return nextBody;
    } catch {
      const fallbackDecision = await fetchDoctorRunGate(
        {
          executionTarget: selectedExecutionTarget,
          runtimeProvider: currentProvider,
          usesManagedOpenAi: false,
        },
        buildHeaders(false),
      );
      setRunPrecheck(null);
      setDoctorDecision(fallbackDecision);
      return { doctor_preflight: fallbackDecision } satisfies RunPrecheckPayload;
    } finally {
      setDoctorChecking(false);
    }
  }, [activeProfile, buildHeaders, buildRunStartPayload, currentProvider, runtimeApiKey, selectedExecutionTarget]);

  const handleSelectCredits = useCallback(() => {
    setSelectedSourceMode('credits');
    setSourceError('');
  }, []);

  const handleSelectByok = useCallback(() => {
    setSelectedSourceMode('byok');
    setSourceError('');
  }, []);

  const handleCreditsContinue = useCallback(() => {
    addToast({
      type: 'info',
      title: 'Coming soon',
      message: 'Add your own API key for now.',
    });
    setSelectedSourceMode('byok');
  }, [addToast]);

  const handleSaveApiKey = useCallback(async () => {
    if (!runtimeApiKey) {
      setSourceError('Add the runtime access key first, then save your AI source.');
      return;
    }
    if (!apiKeyInput.trim()) {
      setSourceError('Enter your API key to continue.');
      return;
    }

    setSourceBusy(true);
    setSourceError('');
    try {
      const provider = selectedProvider;
      const model = defaultProviderModel(provider);
      const authMode = 'api_key';
      const secret = apiKeyInput.trim();
      const credentials =
        provider === 'anthropic' || provider === 'gemini'
          ? { api_key: secret, auth_mode: authMode }
          : { api_key: secret, access_token: secret, oauth_token: secret, auth_mode: authMode };

      const credentialRes = await fetch(`${ORION_API_URL}/credentials/vault`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          label: DEFAULT_PROVIDER_LABELS[provider] || `${providerLabel(provider)} Key`,
          provider,
          workspace_id: WORKSPACE_ID,
          mode: 'byok',
          credentials,
        }),
      });
      const credentialBody = (await credentialRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!credentialRes.ok) {
        throw new Error(String(credentialBody?.detail || credentialBody?.message || 'Failed to save the API key.'));
      }

      const credentialId = String(credentialBody?.id || '').trim();
      const profileRes = await fetch(`${ORION_API_URL}/providers/profiles`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          provider,
          label: DEFAULT_PROVIDER_LABELS[provider] || `${providerLabel(provider)} Key`,
          credential_id: credentialId || undefined,
          auth_mode: authMode,
          workspace_id: WORKSPACE_ID,
          priority: 100,
          enabled: true,
          model,
        }),
      });
      const profileBody = (await profileRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!profileRes.ok) {
        throw new Error(String(profileBody?.detail || profileBody?.message || 'Failed to save the runtime profile.'));
      }

      const nextProfileId = String(profileBody?.id || '').trim();
      setApiKeyInput('');
      await loadRuntimeState();
      if (nextProfileId) setSelectedProfileId(nextProfileId);
      addToast({
        type: 'success',
        title: 'API key saved',
        message: 'Your AI source is ready.',
      });
      if (prompt.trim()) {
        await generatePlan(prompt.trim(), nextProfileId);
      }
      proceedAfterSource();
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Failed to save the API key.');
    } finally {
      setSourceBusy(false);
    }
  }, [
    addToast,
    apiKeyInput,
    buildHeaders,
    generatePlan,
    loadRuntimeState,
    proceedAfterSource,
    prompt,
    runtimeApiKey,
    selectedProvider,
  ]);

  const handleContinueFromTools = useCallback(() => {
    if (unresolvedBlockingTools.length > 0) return;
    setStep(5);
  }, [unresolvedBlockingTools.length]);

  const handleRunTask = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setRunError('Describe the task first.');
      setStep(1);
      return;
    }
    if (!runtimeApiKey) {
      setRunError('Add the runtime access key before running a task.');
      return;
    }
    const profile = activeProfile;
    if (!profile) {
      setRunError('Add an AI source before running this task.');
      if (showSourceStep) setStep(3);
      return;
    }
    const precheck = await loadRunPrecheck();
    const doctorGate = precheck?.doctor_preflight || null;
    if (doctorGate?.blocking) {
      setRunError(doctorGate.detail);
      return;
    }

    setRunBusy(true);
    setRunError('');
    try {
      const payload = buildRunStartPayload(profile);
      if (!payload) {
        throw new Error('The task is missing information needed to start.');
      }

      const response = await fetch(`${ORION_API_URL}/runs/start`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify(payload),
      });
      const responseBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(String(responseBody?.detail || responseBody?.error || 'Failed to start the task.'));
      }

      const runId = String(responseBody?.run_id || '').trim();
      if (!runId) {
        throw new Error('The run started but no run ID was returned.');
      }

      upsertSeededRuntimeRun({
        run_id: runId,
        status: 'running',
        workflow_name: 'New task',
        user_goal: trimmedPrompt,
        created_at: new Date().toISOString(),
        agent_role: 'assistant',
        triggered_by: 'Setup',
        active_profile_id: profile.id,
        active_profile_label: profile.label,
        active_profile_provider: profile.provider,
        active_profile_model: profile.model,
        execution_target_selected: selectedExecutionTarget,
      });
      clearSetupState();
      router.push(`/runs/${runId}`);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Failed to start the task.');
    } finally {
      setRunBusy(false);
    }
  }, [activeProfile, buildHeaders, buildRunStartPayload, loadRunPrecheck, prompt, router, runtimeApiKey, showSourceStep]);

  useEffect(() => {
    if (!hydrated || step !== 5) return;
    void loadRunPrecheck();
  }, [hydrated, loadRunPrecheck, step]);

  if (!hydrated) {
    return <div className="orion-page-shell is-setup-flow" />;
  }

  return (
    <div className="orion-page-shell is-setup-flow orion-animate-in">
      <div className="hekor-setup-progress" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
          const value = index + 1;
          return (
            <span
              key={value}
              className={`hekor-setup-progress-dot${value === step ? ' is-active' : value < step ? ' is-complete' : ''}`}
              aria-hidden
            />
          );
        })}
      </div>

      {step > 1 ? (
        <button type="button" className="btn-secondary hekor-setup-back" onClick={handleBack}>
          <ArrowLeft size={14} />
          Back
        </button>
      ) : null}

      {step === 1 ? (
        <section className="hekor-setup-stage">
          <div className="hekor-setup-copy">
            <h1>What do you want done?</h1>
            <p>Describe the task in plain language.</p>
          </div>

          <div className="hekor-setup-composer">
            <textarea
              className="orion-input hekor-setup-textarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Summarize my emails every morning and send the highlights to Slack"
            />
            <button type="button" className="btn-primary hekor-setup-submit" onClick={handleSubmitTask}>
              Try a task
            </button>
          </div>

          <div className="hekor-setup-chip-row">
            {EXAMPLE_PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                className="hekor-setup-chip"
                onClick={() => setPrompt(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="hekor-setup-stage">
          <div className="hekor-setup-copy">
            <h1>Here&apos;s how Hekor will handle it</h1>
            <p>Review the steps before the task starts.</p>
          </div>

          <div className="orion-panel hekor-setup-panel">
            {planLoading ? (
              <div className="hekor-setup-loading">
                <Loader2 size={18} className="hekor-spin" />
                <span>Generating the plan…</span>
              </div>
            ) : (
              <ol className="hekor-setup-plan-list">
                {planSteps.map((item, index) => {
                  const Icon = statusIconForTool(item.tool);
                  return (
                    <li key={item.id || `${item.type}:${index}`} className="hekor-setup-plan-step">
                      <div className="hekor-setup-step-index">{index + 1}</div>
                      <div className="hekor-setup-step-main">
                        <div className="hekor-setup-step-title-row">
                          <span className="hekor-setup-step-title">{item.title}</span>
                          <span className="hekor-setup-step-icon">
                            <Icon size={14} />
                          </span>
                        </div>
                        <div className="hekor-setup-step-copy">{item.description}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="hekor-setup-tools-needed">
              <div className="hekor-setup-tools-needed-title">Tools this task may use</div>
              {tools.length > 0 ? (
                <div className="hekor-setup-chip-row">
                  {tools.map((tool) => (
                    <span key={tool.id} className="hekor-setup-chip is-static">
                      {tool.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="hekor-setup-muted">This task can start without external tools.</div>
              )}
            </div>

            {planError ? <div className="hekor-setup-inline-note">{planError}</div> : null}
          </div>

          <div className="hekor-setup-actions">
            <button type="button" className="btn-primary" onClick={proceedAfterPlan} disabled={planLoading || planSteps.length === 0}>
              Continue
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              Edit task
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="hekor-setup-stage">
          <div className="hekor-setup-copy">
            <h1>Choose AI access</h1>
            <p>Pick the AI source for this task.</p>
          </div>

          <div className="hekor-setup-source-grid">
            <button
              type="button"
              className={`hekor-setup-source-card${selectedSourceMode === 'credits' ? ' is-selected' : ''}`}
              onClick={handleSelectCredits}
            >
              <div className="hekor-setup-source-head">
                <span className="hekor-setup-source-title">Hekor-managed access</span>
                <span className="hekor-setup-source-badge">Soon</span>
              </div>
              <div className="hekor-setup-source-copy">Available soon. Use your own API key for now.</div>
            </button>

            <button
              type="button"
              className={`hekor-setup-source-card${selectedSourceMode === 'byok' ? ' is-selected' : ''}`}
              onClick={handleSelectByok}
            >
              <div className="hekor-setup-source-head">
                <span className="hekor-setup-source-title">My own API key</span>
              </div>
              <div className="hekor-setup-source-copy">Use OpenAI, Anthropic, or Google.</div>
            </button>
          </div>

          {selectedSourceMode === 'byok' ? (
            <div className="orion-panel hekor-setup-panel">
              <div className="hekor-setup-provider-row">
                {(['openai', 'anthropic', 'gemini'] as SetupProviderId[]).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className={`btn-secondary hekor-setup-provider-btn${selectedProvider === provider ? ' is-selected' : ''}`}
                    onClick={() => setSelectedProvider(provider)}
                  >
                    {providerLabel(provider)}
                  </button>
                ))}
              </div>

              <div className="hekor-setup-field">
                <label htmlFor="setup-api-key">API key</label>
                <input
                  id="setup-api-key"
                  type="password"
                  className="orion-input"
                  placeholder={`Paste your ${providerLabel(selectedProvider)} API key`}
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                />
                <div className="hekor-setup-muted">Encrypted and stored securely. Change anytime.</div>
              </div>

              {sourceError ? <div className="hekor-setup-inline-error">{sourceError}</div> : null}

              <div className="hekor-setup-actions">
                <button type="button" className="btn-primary" onClick={() => void handleSaveApiKey()} disabled={sourceBusy}>
                  {sourceBusy ? (
                    <>
                      <Loader2 size={14} className="hekor-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save and continue'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="orion-panel muted hekor-setup-panel">
              <div className="hekor-setup-inline-note">
                Hekor-managed access is not available yet. Use your own API key for now.
              </div>
              <div className="hekor-setup-actions">
                <button type="button" className="btn-primary" onClick={handleCreditsContinue}>
                  Use my own API key
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {step === 4 ? (
        <section className="hekor-setup-stage">
          <div className="hekor-setup-copy">
            <h1>Connect the tools this task needs</h1>
            <p>Hekor only asks for access when it is needed for this task.</p>
          </div>

          <div className="orion-panel hekor-setup-panel">
            <div className="hekor-setup-tool-list">
              {tools.map((tool) => {
                const Icon = statusIconForTool(tool.id);
                const connected = isToolConnected(tool);
                return (
                  <div key={tool.id} className="hekor-setup-tool-row">
                    <div className="hekor-setup-tool-leading">
                      <span className="hekor-setup-tool-icon">
                        <Icon size={16} />
                      </span>
                      <div className="hekor-setup-tool-copy">
                        <div className="hekor-setup-tool-title">{tool.label}</div>
                        <div className="hekor-setup-tool-note">{tool.reason}</div>
                      </div>
                    </div>

                    {connected ? (
                      <span className="hekor-setup-tool-state is-connected">
                        <Check size={14} />
                        Connected
                      </span>
                    ) : (
                      <Link className="btn-secondary" href={tool.connectHref}>
                        Connect
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            {unresolvedBlockingTools.length > 0 ? (
              <div className="hekor-setup-inline-note">
                Connect {unresolvedBlockingTools.map((tool) => tool.label).join(' and ')} to continue.
              </div>
            ) : null}
          </div>

          <div className="hekor-setup-actions">
            <button type="button" className="btn-primary" onClick={handleContinueFromTools} disabled={unresolvedBlockingTools.length > 0}>
              Continue
            </button>
            {canSkipToolsStep ? (
              <button type="button" className="btn-secondary" onClick={() => setStep(5)}>
                Skip for now
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="hekor-setup-stage">
          <div className="hekor-setup-copy">
            <h1>Ready to run</h1>
            <p>Check the task, AI access, and tools before it starts.</p>
          </div>

          <div className="orion-panel hekor-setup-panel">
            <div className="hekor-setup-summary">
              <div className="hekor-setup-summary-row">
                <span>Task</span>
                <div className="hekor-setup-summary-value is-clamped">{buildTaskSummary(prompt, 140)}</div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>AI source</span>
                <div className="hekor-setup-summary-value">
                  {activeProfile ? providerLabel(activeProfile.provider) : 'Use my own API key'}
                </div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>Route</span>
                <div className="hekor-setup-summary-value">{effectiveExecutionTargetLabel}</div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>Tools connected</span>
                <div className="hekor-setup-icon-stack">
                  {connectedSummaryTools.length > 0 ? (
                    connectedSummaryTools.map((tool) => {
                      const Icon = statusIconForTool(tool.id);
                      return (
                        <span key={tool.id} className="hekor-setup-icon-pill" title={tool.label}>
                          <Icon size={14} />
                        </span>
                      );
                    })
                  ) : (
                    <span className="hekor-setup-muted">No tools connected yet</span>
                  )}
                </div>
              </div>
            </div>

            <div className="hekor-setup-trust">
              <ShieldCheck size={16} />
              <span>You can review and approve before anything is sent.</span>
            </div>

            <div className="hekor-setup-advanced">
              <button
                type="button"
                className="btn-secondary hekor-setup-advanced-toggle"
                onClick={() => setShowAdvancedRouteOptions((current) => !current)}
              >
                {showAdvancedRouteOptions ? 'Hide route options' : 'Route options'}
              </button>
              {showRouteDetails ? (
                <div className="hekor-setup-advanced-panel">
                  <div className="hekor-setup-targets">
                    <div className="hekor-setup-tools-needed-title">Execution route</div>
                    <div className="hekor-setup-target-grid">
                      {executionTargetGuides.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`hekor-setup-target-card${selectedExecutionTarget === option.value ? ' is-selected' : ''}`}
                          onClick={() => setSelectedExecutionTarget(option.value)}
                          disabled={option.value === 'local_companion' && !hasLocalRuntime}
                        >
                          <span className="hekor-setup-target-title">{option.label}</span>
                          <span className="hekor-setup-target-copy">{option.summary}</span>
                        </button>
                      ))}
                    </div>
                    <div className="hekor-setup-muted">{selectedExecutionTargetDescription}</div>
                    <div className="hekor-setup-route-guide">
                      {executionTargetGuides.map((option) => (
                        <div
                          key={`${option.value}-guide`}
                          className={`hekor-setup-route-guide-item${selectedExecutionTarget === option.value ? ' is-selected' : ''}`}
                        >
                          <div className="hekor-setup-route-guide-title">{option.label}</div>
                          <div className="hekor-setup-route-guide-copy">{option.hint}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {runPrecheck?.route ? (
                    <div className={`hekor-setup-route-decision${(precheckWaitingForRuntime || precheckWaitingForCapacity) ? ' is-warning' : ''}`}>
                      <div className="hekor-setup-route-decision-title">
                        {precheckWaitingForCapacity
                          ? 'Waiting on machine capacity'
                          : precheckWaitingForRuntime
                            ? 'Waiting on machine capabilities'
                            : 'Routing decision'}
                      </div>
                      <div className="hekor-setup-route-decision-copy">{routeDecisionSummary}</div>
                      {precheckRouteFallback ? (
                        <div className="hekor-setup-route-decision-copy is-secondary">{precheckRouteFallback}</div>
                      ) : null}
                      {precheckRequiredCapabilities.length > 0 ? (
                        <div className="hekor-setup-route-capability-group">
                          <div className="hekor-setup-route-capability-title">Required</div>
                          <div className="hekor-setup-chip-row">
                            {precheckRequiredCapabilities.map((item) => (
                              <span key={`required:${item}`} className="hekor-setup-chip is-static">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {precheckMissingCapabilities.length > 0 ? (
                        <div className="hekor-setup-route-capability-group">
                          <div className="hekor-setup-route-capability-title">Missing online now</div>
                          <div className="hekor-setup-chip-row">
                            {precheckMissingCapabilities.map((item) => (
                              <span key={`missing:${item}`} className="hekor-setup-chip is-static is-warning">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {precheckWaitingForCapacity && (precheckBusyRuntimeLabels.length > 0 || precheckBusyRuntimeIds.length > 0) ? (
                        <div className="hekor-setup-route-capability-group">
                          <div className="hekor-setup-route-capability-title">Busy machines</div>
                          <div className="hekor-setup-chip-row">
                            {(precheckBusyRuntimeLabels.length > 0 ? precheckBusyRuntimeLabels : precheckBusyRuntimeIds).map((item) => (
                              <span key={`busy:${item}`} className="hekor-setup-chip is-static">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {precheckWaitingForCapacity && (precheckQueuedAheadCount > 0 || precheckEstimatedWaitBand) ? (
                        <div className="hekor-setup-route-capability-group">
                          <div className="hekor-setup-route-capability-title">Queue outlook</div>
                          <div className="hekor-setup-route-decision-copy is-secondary">
                            {precheckQueuedAheadCount > 0
                              ? `${precheckQueuedAheadCount} similar local run${precheckQueuedAheadCount === 1 ? ' is' : 's are'} ahead.`
                              : 'No similar local runs are ahead right now.'}
                            {precheckEstimatedWaitBand ? ` Expected wait: ${precheckEstimatedWaitBand}.` : ''}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {runError ? <div className="hekor-setup-inline-error">{runError}</div> : null}
          </div>

          <div className="hekor-setup-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleRunTask()}
              disabled={runBusy || doctorChecking || profilesLoading || connectorsLoading || runTargetBlocked || doctorRunBlocked}
            >
              {runBusy || doctorChecking ? (
                <>
                  <Loader2 size={14} className="hekor-spin" />
                  {runBusy ? 'Starting…' : 'Checking…'}
                </>
              ) : (
                'Run task'
              )}
            </button>
            <button type="button" className="btn-secondary" onClick={handleBack}>
              Back
            </button>
          </div>
          <div className={`hekor-setup-action-note${runTargetBlocked || precheckWaitingForRuntime || precheckWaitingForCapacity ? ' is-warning' : ''}`.trim()}>
            {runTargetBlocked
              ? 'Local machine is selected, but no local runtime is online. Switch to Automatic or Cloud runtime to continue.'
              : (precheckWaitingForRuntime || precheckWaitingForCapacity) && precheckRouteReason
                ? precheckRouteReason
                : selectedExecutionTarget === 'auto' && !showAdvancedRouteOptions
                ? ''
                : `This task will start on ${effectiveExecutionTargetLabel.toLowerCase()}.`}
          </div>
          <DoctorPreflightNotice decision={doctorDecision} />
          {runTargetBlocked || precheckWaitingForRuntime ? (
            <LocalRuntimeRecoveryCard
              title="Local machine required"
              copy={
                precheckWaitingForRuntime
                  ? 'This task needs a local machine with the right capabilities. Bring a capable machine online, then return here and run the task.'
                  : 'Start the local runtime on this device, then return here and run the task locally.'
              }
              onStatusRefresh={loadRuntimeState}
            />
          ) : null}
        </section>
      ) : null}

    </div>
  );
}
