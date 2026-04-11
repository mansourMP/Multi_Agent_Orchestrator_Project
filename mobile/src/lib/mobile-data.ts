import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "./api";
import { sessionHasRuntimeAccess } from "./session";
import { useSessionState } from "./session-context";
import type {
  ActivitySummary,
  ApprovalSummary,
  ArtifactSummary,
  ConnectorSummary,
  MachineSummary,
  NotificationSummary,
  RuntimeAttachmentSummary,
  RuntimeTargetSummary,
  RunSummary,
  SchedulerSummary,
  UnifiedMemorySummary,
  MobileSession,
} from "./types";

const SURFACE_CACHE_PREFIX = "empyralis.mobile.surface-cache.v1";

type CachedSurfaceSnapshot<T> = {
  savedAt: number;
  data: T;
};

type PersistedMobileQueryState<T> = {
  data: T;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  degraded: boolean;
  hasCachedData: boolean;
  lastSyncedAt: number | null;
  statusMessage: string | null;
  refetch: () => Promise<unknown>;
};

function dedupeBy<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeRuns(payload: any): RunSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.runs) ? payload.runs : []),
    ...(Array.isArray(payload?.history) ? payload.history : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        run_id: String(item?.run_id ?? item?.id ?? ""),
        status: String(item?.status ?? "unknown"),
        summary: item?.summary ?? item?.result_summary ?? item?.result ?? item?.message ?? item?.title ?? undefined,
        agent_role: item?.agent_role ?? item?.owner_agent ?? undefined,
        started_at: item?.started_at ?? item?.updated_at ?? item?.created_at ?? item?.ts ?? undefined,
      }))
      .filter((item) => item.run_id),
    (item) => item.run_id,
  );
}

function normalizeApprovals(payload: any): ApprovalSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.pending) ? payload.pending : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.history) ? payload.history : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        approval_id: String(item?.approval_id ?? item?.id ?? ""),
        run_id: String(item?.run_id ?? ""),
        action: String(item?.action ?? item?.decision ?? item?.tool_id ?? "Approval"),
        status: String(item?.status ?? item?.decision_kind ?? "pending"),
        summary: item?.summary ?? item?.prompt ?? item?.reason ?? item?.note ?? undefined,
        requested_at: item?.requested_at ?? item?.ts ?? item?.created_at ?? undefined,
        expires_at: item?.expires_at ?? undefined,
        target: item?.target ?? item?.email_preview?.recipient ?? undefined,
        labels: Array.isArray(item?.labels)
          ? item.labels.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : undefined,
        capabilities: Array.isArray(item?.capabilities)
          ? item.capabilities.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
          : undefined,
        email_preview: item?.email_preview && typeof item.email_preview === "object"
          ? {
              recipient: item.email_preview.recipient ?? undefined,
              subject: item.email_preview.subject ?? undefined,
              body_preview: item.email_preview.body_preview ?? undefined,
              connector: item.email_preview.connector ?? undefined,
              action_id: item.email_preview.action_id ?? undefined,
              artifact_reference: item.email_preview.artifact_reference ?? undefined,
            }
          : undefined,
      }))
      .filter((item) => item.approval_id),
    (item) => `${item.approval_id}:${item.status}`,
  );
}

function normalizeArtifacts(payload: any): ArtifactSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.artifacts) ? payload.artifacts : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        id: String(item?.id ?? item?.uri_or_path ?? item?.label ?? ""),
        run_id: item?.run_id ?? undefined,
        label: String(item?.label ?? item?.summary ?? item?.uri_or_path ?? "Artifact"),
        kind: item?.kind ?? item?.type ?? undefined,
        preview_url: item?.preview_url ?? undefined,
        uri_or_path: item?.uri_or_path ?? undefined,
      }))
      .filter((item) => item.id),
    (item) => `${item.id}:${item.run_id ?? ""}`,
  );
}

function normalizeMachines(payload: any): MachineSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.runtimes) ? payload.runtimes : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        runtime_id: String(item?.runtime_id ?? item?.id ?? ""),
        display_name: String(item?.display_name ?? item?.label ?? item?.runtime_id ?? "Machine"),
        status: String(item?.status ?? "unknown"),
        online: Boolean(item?.online),
        current_lease_holder: item?.current_lease_holder ?? undefined,
        current_task_id: item?.current_task_id ?? undefined,
        platform: item?.platform ?? undefined,
        last_seen_at: item?.last_seen_at ?? undefined,
      }))
      .filter((item) => item.runtime_id),
    (item) => item.runtime_id,
  );
}

function normalizeConnectors(payload: any): ConnectorSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.items) ? payload.items : []),
    ...(Array.isArray(payload?.connectors) ? payload.connectors : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        id: String(item?.id ?? item?.connector_id ?? item?.provider ?? ""),
        label: String(item?.label ?? item?.display_name ?? item?.provider ?? "Connector"),
        connector: String(item?.connector ?? item?.provider ?? item?.id ?? ""),
        status: String(item?.status ?? (item?.connected ? "connected" : "not_connected")),
        connected: Boolean(item?.connected ?? item?.authenticated ?? item?.runtime_usable),
        runtime_usable: typeof item?.runtime_usable === "boolean" ? item.runtime_usable : undefined,
        summary: typeof item?.summary === "string" ? item.summary : undefined,
      }))
      .filter((item) => item.id || item.connector),
    (item) => item.id || item.connector,
  );
}

function normalizeNotifications(payload: any): NotificationSummary[] {
  const candidates = Array.isArray(payload?.items) ? payload.items : [];
  const normalized: NotificationSummary[] = candidates.map((item: any) => ({
    id: String(item?.id ?? item?.ts ?? item?.run_id ?? ""),
    text: String(item?.text ?? item?.message ?? item?.title ?? item?.action ?? "Runtime notification"),
    action: item?.title ?? item?.action ?? undefined,
    channel: item?.channel ?? undefined,
    ts: item?.ts ?? undefined,
    run_id: item?.run_id ?? undefined,
    read_at: item?.read_at ?? undefined,
  }));
  return dedupeBy(
    normalized.filter((item) => Boolean(item.id)),
    (item) => item.id,
  );
}

export type MobileChatContextSnapshot = {
  threadId?: string;
  thread: {
    id?: string;
    title?: string;
    turns: Array<{
      id?: string;
      role?: string;
      content?: string;
      approvals?: Record<string, any>[];
      interventions?: Record<string, any>[];
      createdAt?: string;
      updatedAt?: string;
    }>;
  };
  masterInstall: Record<string, any> | null;
  specialistInstalls: Record<string, any>[];
  personalContext: {
    recentChanges: Record<string, any>[];
    summary: Record<string, any>;
  };
  runtimeAttachments: {
    deploymentMode?: string;
    attachments: RuntimeAttachmentSummary[];
    selectionPolicy: Record<string, any>;
  };
  runtimeTargets: {
    deploymentMode?: string;
    defaultTargetId?: string;
    targets: RuntimeTargetSummary[];
    routingContract: Record<string, any>;
  };
  recentActivity: {
    items: ActivitySummary[];
    summary: Record<string, any>;
  };
  unifiedMemory: UnifiedMemorySummary;
  scheduler: SchedulerSummary;
};

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeRuntimeAttachments(payload: unknown): MobileChatContextSnapshot["runtimeAttachments"] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];
  return {
    deploymentMode: typeof record.deployment_mode === "string" ? record.deployment_mode : undefined,
    attachments: attachments
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        attachment_id: typeof item.attachment_id === "string" ? item.attachment_id : undefined,
        attachment_kind: typeof item.attachment_kind === "string" ? item.attachment_kind : undefined,
        label: typeof item.label === "string" ? item.label : undefined,
        runtime_id: typeof item.runtime_id === "string" ? item.runtime_id : undefined,
        machine_id: typeof item.machine_id === "string" ? item.machine_id : undefined,
        online: typeof item.online === "boolean" ? item.online : undefined,
        healthy: typeof item.healthy === "boolean" ? item.healthy : undefined,
        status: typeof item.status === "string" ? item.status : undefined,
        control_state: typeof item.control_state === "string" ? item.control_state : undefined,
        runtime_profile_label: typeof item.runtime_profile_label === "string" ? item.runtime_profile_label : undefined,
        note: typeof item.note === "string" ? item.note : undefined,
      })),
    selectionPolicy: record.selection_policy && typeof record.selection_policy === "object"
      ? record.selection_policy
      : {},
  };
}

function normalizeRuntimeTargets(payload: unknown): MobileChatContextSnapshot["runtimeTargets"] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const targets = Array.isArray(record.targets) ? record.targets : [];
  return {
    deploymentMode: typeof record.deployment_mode === "string" ? record.deployment_mode : undefined,
    defaultTargetId: typeof record.default_target_id === "string" ? record.default_target_id : undefined,
    targets: targets
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        target_id: typeof item.target_id === "string" ? item.target_id : undefined,
        label: typeof item.label === "string" ? item.label : undefined,
        description: typeof item.description === "string" ? item.description : undefined,
        attachment_kind: typeof item.attachment_kind === "string" ? item.attachment_kind : undefined,
        execution_target: typeof item.execution_target === "string" ? item.execution_target : undefined,
        connection_mode: typeof item.connection_mode === "string" ? item.connection_mode : undefined,
        available: typeof item.available === "boolean" ? item.available : undefined,
        online: typeof item.online === "boolean" ? item.online : undefined,
        healthy: typeof item.healthy === "boolean" ? item.healthy : undefined,
        status: typeof item.status === "string" ? item.status : undefined,
        attachment_count: typeof item.attachment_count === "number" ? item.attachment_count : undefined,
        default_for_workspace: typeof item.default_for_workspace === "boolean" ? item.default_for_workspace : undefined,
        product_default: typeof item.product_default === "boolean" ? item.product_default : undefined,
        routed_through_platform: typeof item.routed_through_platform === "boolean" ? item.routed_through_platform : undefined,
        direct_mobile_connection_required: typeof item.direct_mobile_connection_required === "boolean" ? item.direct_mobile_connection_required : undefined,
        workspace_scoped_identity: typeof item.workspace_scoped_identity === "boolean" ? item.workspace_scoped_identity : undefined,
        sample_attachment_label: typeof item.sample_attachment_label === "string" ? item.sample_attachment_label : undefined,
      })),
    routingContract: record.routing_contract && typeof record.routing_contract === "object"
      ? record.routing_contract
      : {},
  };
}

function normalizeRecentActivity(payload: unknown): MobileChatContextSnapshot["recentActivity"] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items
      .filter((item) => item && typeof item === "object")
      .map((item) => {
        const actor = item.actor && typeof item.actor === "object" ? (item.actor as Record<string, any>) : {};
        return {
          id: String(item.id ?? ""),
          actor_type: typeof item.actor_type === "string"
            ? item.actor_type
            : typeof actor.type === "string"
              ? actor.type
              : undefined,
          actor_id: typeof item.actor_id === "string"
            ? item.actor_id
            : typeof actor.id === "string"
              ? actor.id
              : undefined,
          event_class: typeof item.event_class === "string" ? item.event_class : undefined,
          action: typeof item.action === "string" ? item.action : undefined,
          title: typeof item.title === "string" ? item.title : undefined,
          summary: typeof item.summary === "string" ? item.summary : undefined,
          created_at: typeof item.created_at === "string"
            ? item.created_at
            : typeof item.ts === "string"
              ? item.ts
              : undefined,
          review_required: item.review_required === true,
          artifacts: Array.isArray(item.artifacts)
            ? item.artifacts
                .filter((artifact: unknown) => artifact && typeof artifact === "object")
                .map((artifact: unknown) => {
                  const artifactRecord = artifact as Record<string, any>;
                  return {
                    path: typeof artifactRecord.path === "string" ? artifactRecord.path : undefined,
                    label: typeof artifactRecord.label === "string"
                      ? artifactRecord.label
                      : typeof artifactRecord.name === "string"
                        ? artifactRecord.name
                        : typeof artifactRecord.path === "string"
                          ? artifactRecord.path
                          : undefined,
                    preview_url: typeof artifactRecord.preview_url === "string"
                      ? artifactRecord.preview_url
                      : typeof artifactRecord.preview_path === "string"
                        ? artifactRecord.preview_path
                        : undefined,
                    review_required: artifactRecord.review_required === true,
                  };
                })
            : [],
        };
      })
      .filter((item) => Boolean(item.id)),
    summary: record.summary && typeof record.summary === "object" ? record.summary : {},
  };
}

function normalizeUnifiedMemory(payload: unknown): UnifiedMemorySummary {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const boundaryMap = record.boundary_map && typeof record.boundary_map === "object"
    ? (record.boundary_map as Record<string, any>)
    : {};
  return {
    layerOrder: normalizeStringList(record.layer_order),
    summary: record.summary && typeof record.summary === "object" ? record.summary : {},
    boundaryMap: {
      neverSyncByDefault: normalizeStringList(boundaryMap.never_sync_by_default),
      cloudSyncedByDefault: normalizeStringList(boundaryMap.cloud_synced_by_default),
      explicitOptIn: normalizeStringList(boundaryMap.requires_explicit_opt_in_to_sync),
    },
  };
}

function normalizeScheduler(payload: unknown): SchedulerSummary {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  return {
    policy: record.policy && typeof record.policy === "object" ? record.policy : {},
    wakeQueue: record.wake_queue && typeof record.wake_queue === "object" ? record.wake_queue : {},
  };
}

function normalizeChatContext(payload: any): MobileChatContextSnapshot {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const threadRecord = record.thread && typeof record.thread === "object" ? (record.thread as Record<string, any>) : {};
  const threadTurns = Array.isArray(threadRecord.turns) ? threadRecord.turns : [];
  return {
    threadId: typeof record.thread_id === "string" ? record.thread_id : undefined,
    thread: {
      id: typeof threadRecord.id === "string" ? threadRecord.id : undefined,
      title: typeof threadRecord.title === "string" ? threadRecord.title : undefined,
      turns: threadTurns
        .filter((item: unknown) => item && typeof item === "object")
        .map((item) => {
          const turn = item as Record<string, any>;
          return {
            id: typeof turn.id === "string" ? turn.id : undefined,
            role: typeof turn.role === "string" ? turn.role : undefined,
            content: typeof turn.content === "string" ? turn.content : undefined,
            approvals: Array.isArray(turn.approvals) ? turn.approvals.filter((entry: unknown) => entry && typeof entry === "object") : [],
            interventions: Array.isArray(turn.interventions) ? turn.interventions.filter((entry: unknown) => entry && typeof entry === "object") : [],
            createdAt: typeof turn.created_at === "string" ? turn.created_at : undefined,
            updatedAt: typeof turn.updated_at === "string" ? turn.updated_at : undefined,
          };
        }),
    },
    masterInstall: record.master_install && typeof record.master_install === "object" ? record.master_install : null,
    specialistInstalls: Array.isArray(record.specialist_installs)
      ? record.specialist_installs.filter((item) => item && typeof item === "object")
      : [],
    personalContext: {
      recentChanges: Array.isArray(record.personal_context?.recent_changes)
        ? record.personal_context.recent_changes.filter((item: unknown) => item && typeof item === "object")
        : [],
      summary: record.personal_context?.summary && typeof record.personal_context.summary === "object"
        ? record.personal_context.summary
        : {},
    },
    runtimeAttachments: normalizeRuntimeAttachments(record.runtime_attachments),
    runtimeTargets: normalizeRuntimeTargets(record.runtime_targets),
    recentActivity: normalizeRecentActivity(record.recent_activity),
    unifiedMemory: normalizeUnifiedMemory(record.unified_memory),
    scheduler: normalizeScheduler(record.scheduler),
  };
}

function buildSurfaceCacheKey(
  scope: string,
  session?: Pick<MobileSession, "runtimeUrl" | "workspaceId" | "currentWorkspaceId" | "user"> | null,
) {
  const workspaceId = String(session?.currentWorkspaceId || session?.workspaceId || "default").trim() || "default";
  const runtimeUrl = String(session?.runtimeUrl || "cloud").trim() || "cloud";
  const userId = String(session?.user?.id || "anonymous").trim() || "anonymous";
  return `${SURFACE_CACHE_PREFIX}:${scope}:${userId}:${workspaceId}:${runtimeUrl}`;
}

async function loadCachedSurfaceSnapshot<T>(cacheKey: string): Promise<CachedSurfaceSnapshot<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSurfaceSnapshot<T> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "number" || !("data" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function persistSurfaceSnapshot<T>(cacheKey: string, data: T) {
  const snapshot: CachedSurfaceSnapshot<T> = {
    savedAt: Date.now(),
    data,
  };
  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(snapshot));
  } catch {
    // Degraded-mode cache is best-effort only.
  }
  return snapshot;
}

function useCachedSurfaceSnapshot<T>(cacheKey: string, liveData: T | undefined) {
  const [cached, setCached] = React.useState<CachedSurfaceSnapshot<T> | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadCachedSurfaceSnapshot<T>(cacheKey).then((snapshot) => {
      if (active) setCached(snapshot);
    });
    return () => {
      active = false;
    };
  }, [cacheKey]);

  React.useEffect(() => {
    if (typeof liveData === "undefined") return;
    const next: CachedSurfaceSnapshot<T> = {
      savedAt: Date.now(),
      data: liveData,
    };
    setCached(next);
    void persistSurfaceSnapshot(cacheKey, liveData);
  }, [cacheKey, liveData]);

  return cached;
}

function formatSyncTimestamp(timestamp?: number | null) {
  if (!timestamp || Number.isNaN(timestamp)) return "recently";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "recently";
  }
}

function buildDegradedMessage(scopeLabel: string, cachedAt: number | null, hasCachedData: boolean) {
  if (hasCachedData) {
    return `Empyralis cloud is degraded right now. Showing the last synced ${scopeLabel} from ${formatSyncTimestamp(cachedAt)}.`;
  }
  return `Empyralis cloud is unavailable right now. ${scopeLabel} will reappear when the connection recovers.`;
}

function usePersistedMobileQuery<T>(options: {
  scope: string;
  scopeLabel: string;
  session: MobileSession | null;
  enabled: boolean;
  queryKey: Array<string | undefined>;
  queryFn: () => Promise<T>;
  emptyValue: T;
  refetchInterval?: number | false;
}): PersistedMobileQueryState<T> {
  const query = useQuery({
    queryKey: options.queryKey,
    enabled: options.enabled,
    retry: false,
    refetchInterval: options.refetchInterval,
    queryFn: options.queryFn,
  });
  const cacheKey = React.useMemo(
    () => buildSurfaceCacheKey(options.scope, options.session),
    [options.scope, options.session?.currentWorkspaceId, options.session?.runtimeUrl, options.session?.user?.id, options.session?.workspaceId],
  );
  const cached = useCachedSurfaceSnapshot(cacheKey, query.data);
  const data = query.data ?? cached?.data ?? options.emptyValue;
  const lastSyncedAt = query.dataUpdatedAt > 0 ? query.dataUpdatedAt : cached?.savedAt ?? null;
  const hasCachedData = cached !== null;
  const error = query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null;
  const degraded = options.enabled && Boolean(error);
  const loading = options.enabled && typeof query.data === "undefined" && !hasCachedData && query.isLoading;

  return {
    data,
    loading,
    refreshing: query.isFetching,
    error,
    isLoading: loading,
    isFetching: query.isFetching,
    isError: Boolean(error),
    degraded,
    hasCachedData,
    lastSyncedAt,
    statusMessage: degraded ? buildDegradedMessage(options.scopeLabel, lastSyncedAt, hasCachedData) : null,
    refetch: query.refetch,
  };
}

type MobileOverviewSnapshot = {
  runs: RunSummary[];
  approvals: ApprovalSummary[];
  artifacts: ArtifactSummary[];
};

export function useMobileOverviewData() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  const overviewQuery = usePersistedMobileQuery<MobileOverviewSnapshot>({
    scope: "overview",
    scopeLabel: "runs, approvals, and artifacts",
    session,
    enabled,
    queryKey: ["mobile", "overview", session?.runtimeUrl, session?.workspaceId],
    refetchInterval: enabled ? 10_000 : false,
    queryFn: async () => {
      const [runs, approvals, artifacts] = await Promise.all([
        mobileApi.getRuns(session!),
        mobileApi.getApprovals(session!),
        mobileApi.getArtifacts(session!),
      ]);
      return {
        runs: normalizeRuns(runs),
        approvals: normalizeApprovals(approvals),
        artifacts: normalizeArtifacts(artifacts),
      };
    },
    emptyValue: {
      runs: [],
      approvals: [],
      artifacts: [],
    },
  });

  return {
    agents: [],
    runs: overviewQuery.data.runs,
    approvals: overviewQuery.data.approvals,
    artifacts: overviewQuery.data.artifacts,
    loading: overviewQuery.loading,
    refreshing: overviewQuery.refreshing,
    error: overviewQuery.error,
    degraded: overviewQuery.degraded,
    hasCachedData: overviewQuery.hasCachedData,
    lastSyncedAt: overviewQuery.lastSyncedAt,
    statusMessage: overviewQuery.statusMessage,
    refetchAll: () => overviewQuery.refetch(),
  };
}

export function useMobileArtifacts() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return usePersistedMobileQuery<ArtifactSummary[]>({
    scope: "artifacts",
    scopeLabel: "artifacts",
    session,
    enabled,
    queryKey: ["mobile", "artifacts-browser", session?.runtimeUrl, session?.workspaceId],
    refetchInterval: enabled ? 20_000 : false,
    queryFn: async () => normalizeArtifacts(await mobileApi.getArtifacts(session!)),
    emptyValue: [],
  });
}

export function useMobileMachines() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return useQuery({
    queryKey: ["mobile", "machines", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async () => normalizeMachines(await mobileApi.getMachines(session!)),
  });
}

export function useMobileConnectors() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return useQuery({
    queryKey: ["mobile", "connectors", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => normalizeConnectors(await mobileApi.getConnectors(session!)),
  });
}

export function useMobileApprovals() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return usePersistedMobileQuery<ApprovalSummary[]>({
    scope: "approvals",
    scopeLabel: "approvals",
    session,
    enabled,
    queryKey: ["mobile", "approvals-live", session?.runtimeUrl, session?.workspaceId],
    refetchInterval: enabled ? 5_000 : false,
    queryFn: async () => normalizeApprovals(await mobileApi.getApprovals(session!)),
    emptyValue: [],
  });
}

export function useMobileNotifications() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return usePersistedMobileQuery<NotificationSummary[]>({
    scope: "notifications",
    scopeLabel: "notifications",
    session,
    enabled,
    queryKey: ["mobile", "notifications", session?.runtimeUrl, session?.workspaceId],
    refetchInterval: enabled ? 10_000 : false,
    queryFn: async () => normalizeNotifications(await mobileApi.getNotifications(session!, {
      workspace_id: session?.workspaceId,
      include_backlog: true,
      limit: 25,
    })),
    emptyValue: [],
  });
}

export function useMobileChatContext() {
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);
  return usePersistedMobileQuery<MobileChatContextSnapshot>({
    scope: "chat-context",
    scopeLabel: "workspace context",
    session,
    enabled,
    queryKey: ["mobile", "chat-context", session?.runtimeUrl, session?.workspaceId],
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async () => normalizeChatContext(await mobileApi.getChatContext(session!)),
    emptyValue: normalizeChatContext(null),
  });
}
