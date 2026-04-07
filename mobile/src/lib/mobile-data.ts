import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "./api";
import { useSessionState } from "./session-context";
import type {
  ApprovalSummary,
  ArtifactSummary,
  ConnectorSummary,
  MachineSummary,
  NotificationSummary,
  RunSummary,
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

export function useMobileConnectors() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);
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
