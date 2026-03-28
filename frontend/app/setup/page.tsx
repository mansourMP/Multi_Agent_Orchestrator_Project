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
  X,
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
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { fetchDoctorRunGate, type DoctorRunGateDecision } from '@/lib/doctorPreflight';
import { getExecutionTargetGuides } from '@/lib/executionTargets';
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

const WORKSPACE_ID = 'default';
const SETUP_FLOW_STORAGE_KEY = 'hekor.setup-flow.v1';
const EXAMPLE_PROMPTS = [
  'Summarize my emails every morning',
  'Follow up with new leads automatically',
  'Research competitors and send me a weekly report',
  'Alert me on Telegram when a high-priority customer message arrives',
] as const;
const TOTAL_STEPS = 5;
const SETUP_STEP_META = [
  {
    title: 'Tell Empyralis what needs to happen.',
    copy: 'Start with plain language. Empyralis will outline the plan, tell you what it needs, and help you run it.',
  },
  {
    title: 'Review the plan before anything starts.',
    copy: 'Check the steps, confirm the tools, and make sure the task still matches what you want.',
  },
  {
    title: 'Choose the AI account for this task.',
    copy: 'Connect a direct provider account for this run, then continue when the task is ready to proceed.',
  },
  {
    title: 'Connect only the tools this task needs.',
    copy: 'Empyralis should ask for the minimum useful access, not the whole directory.',
  },
  {
    title: 'Check the route and start the task.',
    copy: 'Review the run setup, confirm the destination, and start when everything looks right.',
  },
] as const;

type SetupProviderId = 'openai' | 'anthropic' | 'gemini';
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

function providerCredentialGuidance(provider: SetupProviderId): string {
  if (provider === 'anthropic') return 'Use a direct Anthropic API key. It is encrypted and stored securely on this workspace.';
  if (provider === 'gemini') return 'Use a direct Google Gemini API key. It is encrypted and stored securely on this workspace.';
  return 'Use a direct OpenAI API key. It is encrypted and stored securely on this workspace.';
}

function defaultProviderModel(provider: SetupProviderId): string {
  return DEFAULT_PROVIDER_OPTIONS.find((item) => item.id === provider)?.defaultModel || 'gpt-4o-mini';
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
  return 'Smart routing';
}

function executionTargetDescription(target: SetupExecutionTarget, hasLocalRuntime: boolean): string {
  if (target === 'local_companion') {
    return hasLocalRuntime
      ? 'Run this on an available local machine.'
      : 'No local machine is online right now.';
  }
  if (target === 'cloud') return 'Run this in the cloud runtime.';
  return hasLocalRuntime
    ? 'Prefer a local machine, then fall back to cloud if needed.'
    : 'No local machine is online, so this will use the cloud runtime.';
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
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState('');
  const [planSteps, setPlanSteps] = useState<SetupPlanStep[]>([]);
  const [tools, setTools] = useState<SetupTool[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
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

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const loadRuntimeState = useCallback(async () => {
    setProfilesLoading(true);
    setConnectorsLoading(true);
    try {
      const [profilesRes, connectorsRes, machinesRes] = await Promise.all([
        controlPlaneFetch(`/api/control-plane/providers/profiles/health?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`),
        controlPlaneFetch(`/api/control-plane/connectors?workspace_id=${encodeURIComponent(WORKSPACE_ID)}`),
        controlPlaneFetch('/api/runtime/machines'),
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
  }, [controlPlaneFetch]);

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
      provider: selectedProvider,
      selectedProfileId,
      executionTarget: selectedExecutionTarget,
    });
  }, [hydrated, planSteps, prompt, selectedExecutionTarget, selectedProfileId, selectedProvider, step, tools]);

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
  const hasOptionalToolsRemaining = useMemo(
    () => tools.some((tool) => !tool.blocking && !isToolConnected(tool)),
    [isToolConnected, tools],
  );

  const connectedSummaryTools = useMemo(
    () => tools.filter((tool) => isToolConnected(tool)),
    [isToolConnected, tools],
  );
  const currentStepMeta = SETUP_STEP_META[Math.max(0, Math.min(step - 1, SETUP_STEP_META.length - 1))];
  const setupTaskPreview = useMemo(() => {
    const trimmed = prompt.trim();
    return trimmed ? buildTaskSummary(trimmed, 96) : 'Describe the work and Empyralis will build the setup around it.';
  }, [prompt]);
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
      return `Requested ${selectedExecutionTargetLabel}. Empyralis will use ${effectiveExecutionTargetLabel}.`;
    }
    return `Empyralis will use ${effectiveExecutionTargetLabel}.`;
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

    try {
      await ensureControlPlaneSession();
      const response = await fetch('/api/builder/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
  }, [activeProfile?.id, activeProfile?.model]);

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
    const payload = buildRunStartPayload(activeProfile);
    if (!payload) {
      setRunPrecheck(null);
      setDoctorDecision(null);
      setDoctorChecking(false);
      return null;
    }

    setDoctorChecking(true);
    try {
      const response = await controlPlaneFetch('/api/runs/precheck', {
        method: 'POST',
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
      );
      setRunPrecheck(null);
      setDoctorDecision(fallbackDecision);
      return { doctor_preflight: fallbackDecision } satisfies RunPrecheckPayload;
    } finally {
      setDoctorChecking(false);
    }
  }, [activeProfile, buildRunStartPayload, controlPlaneFetch, currentProvider, selectedExecutionTarget]);

  const handleSaveApiKey = useCallback(async () => {
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
      const credentials = { api_key: secret, auth_mode: authMode };

      const credentialRes = await controlPlaneFetch('/api/control-plane/credentials', {
        method: 'POST',
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
      const profileRes = await controlPlaneFetch('/api/control-plane/providers/profiles', {
        method: 'POST',
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
    controlPlaneFetch,
    generatePlan,
    loadRuntimeState,
    proceedAfterSource,
    prompt,
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

      const response = await controlPlaneFetch('/api/runs/start', {
        method: 'POST',
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
  }, [activeProfile, buildRunStartPayload, controlPlaneFetch, loadRunPrecheck, prompt, router, showSourceStep]);

  useEffect(() => {
    if (!hydrated || step !== 5) return;
    void loadRunPrecheck();
  }, [hydrated, loadRunPrecheck, step]);

  if (!hydrated) {
    return <div className="orion-page-shell is-setup-flow" />;
  }

  return (
    <div className="orion-page-shell is-setup-flow orion-animate-in">
      <div className="hekor-setup-shellbar">
        <div className="hekor-setup-shellbar-leading">
          {step > 1 ? (
            <button type="button" className="btn-secondary hekor-setup-back" onClick={handleBack}>
              <ArrowLeft size={14} />
              Back
            </button>
          ) : (
            <div className="hekor-setup-shellbar-note">Agent setup</div>
          )}
        </div>
        <Link href="/home" className="orion-btn orion-btn-ghost hekor-setup-close" aria-label="Close setup">
          <X size={14} />
          Close
        </Link>
      </div>

      <PageHero
        kicker={`Setup · Step ${step} of ${TOTAL_STEPS}`}
        title={currentStepMeta.title}
        copy={currentStepMeta.copy}
        aside={
          step === 1 ? (
            <>
              <PageHeroCard label="What happens next">
                <div className="hekor-setup-hero-note">
                  Empyralis turns your task into a plan first. You review the plan, add AI access, connect only the needed tools, then start.
                </div>
              </PageHeroCard>
              <PageHeroCard label="Keep it concrete">
                <div className="hekor-setup-hero-note">
                  Mention the source, the job, and where the result should go. One clear sentence works better than a long brief.
                </div>
              </PageHeroCard>
            </>
          ) : (
            <>
              <PageHeroCard label="Current task">
                <div className="hekor-setup-hero-note">{setupTaskPreview}</div>
              </PageHeroCard>
              <PageHeroCard label="Run summary">
                <div className="orion-home-side-stats">
                  <div>
                    <div className="orion-home-side-value">{connectedSummaryTools.length}</div>
                    <div className="orion-home-side-note">Tools ready</div>
                  </div>
                  <div>
                    <div className="orion-home-side-value">{activeProfile ? providerLabel(activeProfile.provider) : 'Need AI'}</div>
                    <div className="orion-home-side-note">AI access</div>
                  </div>
                </div>
                <div className="orion-runs-overview-side-note">
                  {step >= 5 ? `Route: ${effectiveExecutionTargetLabel}` : `Next: ${step < TOTAL_STEPS ? `step ${step + 1}` : 'ready to run'}`}
                </div>
              </PageHeroCard>
            </>
          )
        }
        className="hekor-setup-hero"
      />

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

      {step === 1 ? (
        <section className="hekor-setup-stage is-launch">
          <div className="hekor-setup-launch-panel">
            <div className="hekor-setup-launch-copy">
              <div className="hekor-setup-launch-kicker">Start with one concrete task</div>
              <div className="hekor-setup-launch-note">
                Describe one thing the agent should do. Empyralis will draft the plan before anything runs.
              </div>
            </div>

            <div className="hekor-setup-composer">
              <textarea
                className="orion-input hekor-setup-textarea"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Example: Summarize my emails every morning and send the highlights to Slack"
              />
              <div className="hekor-setup-composer-footer">
                <div className="hekor-setup-composer-note">
                  Best results mention the source, the action, and where the result should go.
                </div>
                <button type="button" className="btn-primary hekor-setup-submit" onClick={handleSubmitTask}>
                  Create plan
                </button>
              </div>
            </div>
          </div>

          <div className="hekor-setup-example-grid">
            {EXAMPLE_PROMPTS.map((item) => (
              <button
                key={item}
                type="button"
                className="hekor-setup-example-card"
                onClick={() => setPrompt(item)}
              >
                <span className="hekor-setup-example-title">{item}</span>
                <span className="hekor-setup-example-meta">Use this as a starting point</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="hekor-setup-stage">
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
              Change task
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="hekor-setup-stage">
          <div className="orion-panel hekor-setup-panel">
            <div className="hekor-setup-inline-note">
              Connect a direct provider account for this task. Proxy or managed routing is not used here.
            </div>

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
              <div className="hekor-setup-muted">{providerCredentialGuidance(selectedProvider)}</div>
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
        </section>
      ) : null}

      {step === 4 ? (
        <section className="hekor-setup-stage">
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
                        <div className="hekor-setup-tool-title-row">
                          <span className="hekor-setup-tool-title">{tool.label}</span>
                          <span className={`hekor-setup-tool-badge${tool.blocking ? ' is-required' : ''}`}>
                            {tool.blocking ? 'Required' : 'Optional'}
                          </span>
                          {!tool.supported ? (
                            <span className="hekor-setup-tool-badge is-muted">Open in Integrations</span>
                          ) : null}
                        </div>
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
                        {tool.supported ? 'Connect now' : 'Open Integrations'}
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
              {hasOptionalToolsRemaining ? 'Continue without optional tools' : 'Continue'}
            </button>
          </div>
          {canSkipToolsStep ? (
            <div className="hekor-setup-action-note">
              Optional tools can be added later from Integrations. Only the tools this task truly depends on need to be connected before it starts.
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 5 ? (
        <section className="hekor-setup-stage">
          <div className="orion-panel hekor-setup-panel">
            <div className="hekor-setup-summary">
              <div className="hekor-setup-summary-row">
                <span>Task</span>
                <div className="hekor-setup-summary-value is-clamped">{buildTaskSummary(prompt, 140)}</div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>Model access</span>
                <div className="hekor-setup-summary-value">
                  {activeProfile ? `${providerLabel(activeProfile.provider)} account` : 'Direct provider account'}
                </div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>Where it runs</span>
                <div className="hekor-setup-summary-value">{effectiveExecutionTargetLabel}</div>
              </div>
              <div className="hekor-setup-summary-row">
                <span>Tools ready</span>
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
              <span>Empyralis will not send work blindly. You still get a chance to review and approve when needed.</span>
            </div>

            <div className="hekor-setup-advanced">
              <button
                type="button"
                className="btn-secondary hekor-setup-advanced-toggle"
                onClick={() => setShowAdvancedRouteOptions((current) => !current)}
              >
                {showAdvancedRouteOptions ? 'Hide run details' : 'Run details'}
              </button>
              {showRouteDetails ? (
                <div className="hekor-setup-advanced-panel">
                  <div className="hekor-setup-targets">
                    <div className="hekor-setup-tools-needed-title">Choose where this task runs</div>
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
                          ? 'Waiting for an available machine'
                          : precheckWaitingForRuntime
                            ? 'Waiting for the right machine'
                            : 'Run plan'}
                      </div>
                      <div className="hekor-setup-route-decision-copy">{routeDecisionSummary}</div>
                      {precheckRouteFallback ? (
                        <div className="hekor-setup-route-decision-copy is-secondary">{precheckRouteFallback}</div>
                      ) : null}
                      {precheckRequiredCapabilities.length > 0 ? (
                        <div className="hekor-setup-route-capability-group">
                          <div className="hekor-setup-route-capability-title">Needed for this task</div>
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
                          <div className="hekor-setup-route-capability-title">Not available right now</div>
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
                          <div className="hekor-setup-route-capability-title">Machines already in use</div>
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
                          <div className="hekor-setup-route-capability-title">Wait estimate</div>
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
                'Start agent'
              )}
            </button>
            <button type="button" className="btn-secondary" onClick={handleBack}>
              Edit setup
            </button>
          </div>
          <div className="hekor-setup-action-note">
            This starts one task now. If it works well, you can save or turn it into a reusable workflow later.
          </div>
          <div className={`hekor-setup-action-note${runTargetBlocked || precheckWaitingForRuntime || precheckWaitingForCapacity ? ' is-warning' : ''}`.trim()}>
            {runTargetBlocked
              ? 'Local machine is selected, but no local runtime is online. Switch to Smart routing or Cloud runtime to continue.'
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
