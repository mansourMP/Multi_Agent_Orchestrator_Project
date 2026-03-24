import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "./api";
import { useSessionState } from "./session-context";
import type { AgentSummary, ApprovalSummary, ArtifactSummary, RunSummary } from "./types";

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

function normalizeAgents(payload: any): AgentSummary[] {
  const candidates = [
    ...(Array.isArray(payload?.agents) ? payload.agents : []),
    ...(Array.isArray(payload?.items) ? payload.items : []),
  ];

  return dedupeBy(
    candidates
      .map((item: any) => ({
        id: String(item?.id ?? item?.agent_role ?? item?.label ?? ""),
        label: String(item?.label ?? item?.name ?? item?.title ?? item?.agent_role ?? "Agent"),
        subtitle: item?.subtitle ?? item?.role_summary ?? item?.status_reason ?? undefined,
        status: item?.status ?? undefined,
      }))
      .filter((item) => item.id),
    (item) => item.id,
  );
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
      }))
      .filter((item) => item.id),
    (item) => `${item.id}:${item.run_id ?? ""}`,
  );
}

export function useMobileOverviewData() {
  const { session } = useSessionState();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const safeAgentsQuery = async () => {
    try {
      return normalizeAgents(await mobileApi.getAgentSnapshot(session!));
    } catch {
      return [] as AgentSummary[];
    }
  };

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

  const agentsQuery = useQuery({
    queryKey: ["mobile", "agents", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    queryFn: safeAgentsQuery,
  });

  const runsQuery = useQuery({
    queryKey: ["mobile", "runs", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    queryFn: safeRunsQuery,
  });

  const approvalsQuery = useQuery({
    queryKey: ["mobile", "approvals", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    queryFn: safeApprovalsQuery,
  });

  const artifactsQuery = useQuery({
    queryKey: ["mobile", "artifacts", session?.runtimeUrl, session?.workspaceId],
    enabled,
    retry: false,
    queryFn: safeArtifactsQuery,
  });

  return {
    agents: agentsQuery.data ?? [],
    runs: runsQuery.data ?? [],
    approvals: approvalsQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    loading: agentsQuery.isLoading || runsQuery.isLoading || approvalsQuery.isLoading || artifactsQuery.isLoading,
    refreshing: agentsQuery.isFetching || runsQuery.isFetching || approvalsQuery.isFetching || artifactsQuery.isFetching,
    error:
      agentsQuery.error ??
      runsQuery.error ??
      approvalsQuery.error ??
      artifactsQuery.error ??
      null,
    refetchAll: () => Promise.all([agentsQuery.refetch(), runsQuery.refetch(), approvalsQuery.refetch(), artifactsQuery.refetch()]),
  };
}
