import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "./api";
import type {
  MobileBillingSummaryResponse,
  MobileConnectionStatusItem,
  MobileCreditUsageResponse,
} from "./api";
import { useSessionState } from "./session-context";
import type {
  ActivitySummary,
  ApprovalSummary,
  ArtifactSummary,
  ConnectorSummary,
  MachineSummary,
  NotificationSummary,
  RuntimeAttachmentSummary,
  RunSummary,
  SchedulerSummary,
  UnifiedMemorySummary,
} from "./types";

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
        summary: item?.summary ?? item?.reason ?? item?.note ?? undefined,
        requested_at: item?.requested_at ?? item?.ts ?? item?.created_at ?? undefined,
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
      .map((item: any) => {
        const connector = String(item?.connector ?? item?.provider ?? item?.id ?? "");
        const hasExplicitConnection = typeof item?.connected === "boolean"
          || typeof item?.authenticated === "boolean"
          || typeof item?.runtime_usable === "boolean";
        const connected = hasExplicitConnection
          ? Boolean(item?.connected ?? item?.authenticated ?? item?.runtime_usable)
          : Boolean(connector);
        return {
          id: String(item?.id ?? item?.connector_id ?? item?.provider ?? ""),
          label: String(item?.label ?? item?.display_name ?? item?.provider ?? "Connector"),
          connector,
          status: String(item?.status ?? (connected ? "connected" : "not_connected")),
          connected,
          runtime_usable: typeof item?.runtime_usable === "boolean" ? item.runtime_usable : undefined,
          summary: typeof item?.summary === "string" ? item.summary : undefined,
        };
      })
      .filter((item) => item.id || item.connector),
    (item) => item.id || item.connector,
  );
}

function normalizeConnectionStatus(payload: any): MobileConnectionStatusItem[] {
  const candidates = Array.isArray(payload?.items) ? payload.items : [];
  return dedupeBy(
    candidates
      .filter((item: unknown) => item && typeof item === "object")
      .map((item: any): MobileConnectionStatusItem => ({
        id: String(item.id ?? "").trim(),
        display_name: String(item.display_name ?? item.label ?? item.id ?? "").trim(),
        label: String(item.label ?? item.display_name ?? item.id ?? "").trim(),
        description: typeof item.description === "string" ? item.description : undefined,
        lane: typeof item.lane === "string" ? item.lane : undefined,
        surface: typeof item.surface === "string" ? item.surface : undefined,
        launch_status: typeof item.launch_status === "string" ? item.launch_status : undefined,
        requires_gateway: typeof item.requires_gateway === "boolean" ? item.requires_gateway : undefined,
        connected: typeof item.connected === "boolean" ? item.connected : undefined,
        configured: typeof item.configured === "boolean" ? item.configured : undefined,
        runtime_usable: typeof item.runtime_usable === "boolean" ? item.runtime_usable : undefined,
        setup_available: typeof item.setup_available === "boolean" ? item.setup_available : undefined,
        health_status: typeof item.health_status === "string" ? item.health_status : undefined,
        next_action: typeof item.next_action === "string" ? item.next_action : undefined,
        status_label: typeof item.status_label === "string" ? item.status_label : undefined,
        selected_gateway_id: typeof item.selected_gateway_id === "string" ? item.selected_gateway_id : null,
        gateway_count: Number.isFinite(Number(item.gateway_count)) ? Number(item.gateway_count) : undefined,
        provider: typeof item.provider === "string" ? item.provider : null,
        metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : null,
      }))
      .filter((item: MobileConnectionStatusItem) => item.id),
    (item) => item.id,
  );
}

function normalizeNotifications(payload: any): NotificationSummary[] {
  const candidates = Array.isArray(payload?.items) ? payload.items : [];
  const normalized: NotificationSummary[] = candidates.map((item: any) => ({
    id: String(item?.id ?? item?.ts ?? item?.run_id ?? ""),
    text: String(item?.text ?? item?.message ?? item?.action ?? "Runtime notification"),
    action: item?.action ?? undefined,
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
        runtime_access_mode: typeof item.runtime_access_mode === "string" ? item.runtime_access_mode : undefined,
        runtime_access_label: typeof item.runtime_access_label === "string" ? item.runtime_access_label : undefined,
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

function normalizeRecentActivity(payload: unknown): MobileChatContextSnapshot["recentActivity"] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        id: String(item.id ?? ""),
        actor_type: typeof item.actor_type === "string" ? item.actor_type : undefined,
        actor_id: typeof item.actor_id === "string" ? item.actor_id : undefined,
        event_class: typeof item.event_class === "string" ? item.event_class : undefined,
        action: typeof item.action === "string" ? item.action : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        summary: typeof item.summary === "string" ? item.summary : undefined,
        created_at: typeof item.created_at === "string" ? item.created_at : undefined,
        review_required: item.review_required === true,
        artifacts: Array.isArray(item.artifacts)
          ? item.artifacts
              .filter((artifact: unknown) => artifact && typeof artifact === "object")
              .map((artifact: any) => ({
                path: typeof artifact.path === "string" ? artifact.path : undefined,
                label: typeof artifact.label === "string" ? artifact.label : undefined,
                preview_url: typeof artifact.preview_url === "string" ? artifact.preview_url : undefined,
                review_required: artifact.review_required === true,
              }))
          : [],
      }))
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
  return {
    threadId: typeof record.thread_id === "string" ? record.thread_id : undefined,
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
    recentActivity: normalizeRecentActivity(record.recent_activity),
    unifiedMemory: normalizeUnifiedMemory(record.unified_memory),
    scheduler: normalizeScheduler(record.scheduler),
  };
}

export function useMobileOverviewData() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const safeRunsQuery = async () => {
    try {
      return normalizeRuns(await mobileApi.getRuns(session!));
    } catch {
      return [] as RunSummary[];
    }
  };

  const safeApprovalsQuery = async () => {
    try {
      return normalizeApprovals(await mobileApi.getApprovals(session!));
    } catch {
      return [] as ApprovalSummary[];
    }
  };

  const safeArtifactsQuery = async () => {
    try {
      return normalizeArtifacts(await mobileApi.getArtifacts(session!));
    } catch {
      return [] as ArtifactSummary[];
    }
  };

  const runsQuery = useQuery({
    queryKey: ["mobile", "runs", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: safeRunsQuery,
  });

  const approvalsQuery = useQuery({
    queryKey: ["mobile", "approvals", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 5_000 : false,
    queryFn: safeApprovalsQuery,
  });

  const artifactsQuery = useQuery({
    queryKey: ["mobile", "artifacts", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 20_000 : false,
    queryFn: safeArtifactsQuery,
  });

  return {
    agents: [],
    runs: runsQuery.data ?? [],
    approvals: approvalsQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    loading: runsQuery.isLoading || approvalsQuery.isLoading || artifactsQuery.isLoading,
    refreshing: runsQuery.isFetching || approvalsQuery.isFetching || artifactsQuery.isFetching,
    error:
      runsQuery.error ??
      approvalsQuery.error ??
      artifactsQuery.error ??
      null,
    refetchAll: () => Promise.all([runsQuery.refetch(), approvalsQuery.refetch(), artifactsQuery.refetch()]),
  };
}

export function useMobileArtifacts() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "artifacts-browser", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 20_000 : false,
    queryFn: async () => normalizeArtifacts(await mobileApi.getArtifacts(session!)),
  });
}

export function useMobileMachines() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "machines", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async () => normalizeMachines(await mobileApi.getMachines(session!)),
  });
}

export function usePrimaryGatewayDoctor() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey && session?.workspaceId);

  const registrationsQuery = useQuery({
    queryKey: ["mobile", "gateway-registrations", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async () => {
      const payload = await mobileApi.listGatewayRegistrations(session!);
      return Array.isArray(payload?.items)
        ? payload.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        : [];
    },
  });

  const selectedGateway = (registrationsQuery.data ?? []).find((item) => {
    const status = String(item.status ?? item.connection_status ?? "").trim().toLowerCase();
    return status === "online" || status === "healthy" || status === "active";
  }) ?? (registrationsQuery.data ?? [])[0] ?? null;

  const gatewayId = typeof selectedGateway?.gateway_id === "string" ? selectedGateway.gateway_id.trim() : "";

  const doctorQuery = useQuery({
    queryKey: ["mobile", "gateway-doctor", session?.runtimeUrl, session?.workspaceId, gatewayId],
    enabled: enabled && Boolean(gatewayId),
    retry: false,
    refetchInterval: enabled && gatewayId ? 15_000 : false,
    queryFn: async () => mobileApi.getGatewayDoctor(session!, gatewayId),
  });

  return {
    gateway: selectedGateway,
    doctor: doctorQuery.data ?? null,
    loading: registrationsQuery.isLoading || doctorQuery.isLoading,
    refreshing: registrationsQuery.isFetching || doctorQuery.isFetching,
    error: registrationsQuery.error ?? doctorQuery.error ?? null,
  };
}

export function useMobileConnectors() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "connectors", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => normalizeConnectors(await mobileApi.getVaultConnectors(session!)),
  });
}

export function useMobileConnectionStatus(surface = "sage") {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey && session?.workspaceId);
  return useQuery({
    queryKey: ["mobile", "connection-status", surface, session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async () => {
      try {
        return normalizeConnectionStatus(await mobileApi.getConnectionStatus(session!, surface));
      } catch {
        return [] as MobileConnectionStatusItem[];
      }
    },
  });
}

export function useMobileBillingSummary() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey && session?.workspaceId);
  return useQuery<MobileBillingSummaryResponse>({
    queryKey: ["mobile", "billing-summary", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () => mobileApi.getBillingSummary(session!),
  });
}

export function useMobileCreditUsage() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey && session?.workspaceId);
  return useQuery<MobileCreditUsageResponse>({
    queryKey: ["mobile", "credit-usage", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () => mobileApi.getCreditUsage(session!),
  });
}

export function useMobileApprovals() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "approvals-live", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 5_000 : false,
    queryFn: async () => normalizeApprovals(await mobileApi.getApprovals(session!)),
  });
}

export function useMobileNotifications() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "notifications", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 10_000 : false,
    queryFn: async () => normalizeNotifications(await mobileApi.getNotifications(session!, {
      workspace_id: session?.workspaceId,
      include_backlog: true,
      limit: 25,
    })),
  });
}

export function useMobileChatContext() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
  return useQuery({
    queryKey: ["mobile", "chat-context", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    refetchInterval: enabled ? 15_000 : false,
    queryFn: async () => normalizeChatContext(await mobileApi.getChatContext(session!)),
  });
}
