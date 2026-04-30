'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { EmptyPanel } from '@/lib/ui/empty-panel';
import { AppButton, joinClassNames } from '@/lib/ui/primitives';
import { SkeletonBlock } from '@/lib/ui/skeleton-block';
import type {
  DeployedAgentAdminDashboardMessage,
  DeployedAgentAdminDashboardQuestion,
  DeployedAgentAdminDashboardRecord,
  DeployedAgentCustomerEntryRecord,
  DeployedAgentAdminDashboardUserRow,
} from '@/lib/workspace/workstation-client';
import { useWorkspaceServices } from '@/lib/workspace/workspace-services';

type DashboardSnapshot = {
  deployedAgentId: string;
  totalUsers: number;
  messagesToday: number;
  messagesThisCalendarMonth: number;
  ordersToday: number;
  revenueTodayUsd: number;
  usersAtLimitToday: number;
  upgradeClicksThisMonth: number;
  commonQuestions: DeployedAgentAdminDashboardQuestion[];
  customerEntry: DeployedAgentCustomerEntryRecord | null;
  specialistProfile: Record<string, unknown>;
  userRows: DeployedAgentAdminDashboardUserRow[];
  limit: number;
  hasMore: boolean;
  nextCursorLastMessageAt: string | null;
  nextCursorExternalUserId: string | null;
};

type DashboardCursor = {
  lastMessageAt: string;
  externalUserId: string;
};

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readItems<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeDashboard(payload: unknown): DashboardSnapshot {
  const record = (payload && typeof payload === 'object' ? payload : {}) as DeployedAgentAdminDashboardRecord;
  return {
    deployedAgentId: readString(record.deployed_agent_id),
    totalUsers: readNumber(record.total_users),
    messagesToday: readNumber((record as Record<string, unknown>).messages_today),
    messagesThisCalendarMonth: readNumber(record.messages_this_calendar_month),
    ordersToday: readNumber((record as Record<string, unknown>).orders_today),
    revenueTodayUsd: readNumber((record as Record<string, unknown>).revenue_today_usd),
    usersAtLimitToday: readNumber(record.users_at_limit_today),
    upgradeClicksThisMonth: readNumber(record.upgrade_clicks_this_month),
    commonQuestions: readItems<DeployedAgentAdminDashboardQuestion>((record as Record<string, unknown>).common_questions),
    customerEntry:
      record.customer_entry && typeof record.customer_entry === 'object'
        ? record.customer_entry as DeployedAgentCustomerEntryRecord
        : null,
    specialistProfile:
      record.specialist_profile && typeof record.specialist_profile === 'object'
        ? record.specialist_profile as Record<string, unknown>
        : {},
    userRows: readItems<DeployedAgentAdminDashboardUserRow>(record.user_rows),
    limit: Math.max(1, readNumber(record.limit) || 50),
    hasMore: record.has_more === true,
    nextCursorLastMessageAt: readString((record as Record<string, unknown>).next_cursor_last_message_at) || null,
    nextCursorExternalUserId: readString((record as Record<string, unknown>).next_cursor_external_user_id) || null,
  };
}

function truncateExternalUserId(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'Unknown user';
  }
  return token.length <= 12 ? token : `${token.slice(0, 12)}…`;
}

function buildDashboardPath({
  workspaceId,
  agentId,
  limit,
  cursor,
}: {
  workspaceId: string;
  agentId: string;
  limit: number;
  cursor?: DashboardCursor | null;
}): string {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    limit: String(limit),
  });
  if (cursor?.lastMessageAt) {
    params.set('cursor_last_message_at', cursor.lastMessageAt);
  }
  if (cursor?.externalUserId) {
    params.set('cursor_external_user_id', cursor.externalUserId);
  }
  return `/api/deployed-agents/${encodeURIComponent(agentId)}/admin-dashboard?${params.toString()}`;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const detail = readString((payload as Record<string, unknown>).detail);
    if (detail) {
      return detail;
    }
    const errorRecord = (payload as Record<string, unknown>).error;
    if (errorRecord && typeof errorRecord === 'object') {
      const message = readString((errorRecord as Record<string, unknown>).message);
      if (message) {
        return message;
      }
    }
  }
  return `Analytics could not be loaded (${status}).`;
}

function compareUserRows(
  left: DeployedAgentAdminDashboardUserRow,
  right: DeployedAgentAdminDashboardUserRow,
): number {
  const leftTime = Date.parse(readString(left.last_message_at));
  const rightTime = Date.parse(readString(right.last_message_at));
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (safeLeftTime !== safeRightTime) {
    return safeRightTime - safeLeftTime;
  }
  const leftId = readString(left.external_user_id);
  const rightId = readString(right.external_user_id);
  return rightId.localeCompare(leftId);
}

function mergeUserRows(
  currentRows: DeployedAgentAdminDashboardUserRow[],
  nextRows: DeployedAgentAdminDashboardUserRow[],
): DeployedAgentAdminDashboardUserRow[] {
  const byExternalUserId = new Map<string, DeployedAgentAdminDashboardUserRow>();
  for (const row of [...currentRows, ...nextRows]) {
    const externalUserId = readString(row.external_user_id);
    if (!externalUserId) {
      continue;
    }
    const existing = byExternalUserId.get(externalUserId);
    if (!existing || compareUserRows(row, existing) < 0) {
      byExternalUserId.set(externalUserId, row);
    }
  }
  return Array.from(byExternalUserId.values()).sort(compareUserRows);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRelativeTime(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'No activity';
  }
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) {
    return token;
  }
  const diffMs = Date.now() - parsed;
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return `${Math.max(1, Math.abs(diffMinutes))}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${Math.max(1, Math.abs(diffHours))}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return `${Math.max(1, Math.abs(diffDays))}d ago`;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
}

function formatTimestamp(value: unknown): string {
  const token = readString(value);
  if (!token) {
    return 'Unknown time';
  }
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) {
    return token;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
}

function messageRoleLabel(message: DeployedAgentAdminDashboardMessage): string {
  return readString(message.role).toLowerCase() === 'agent' ? 'Agent' : 'User';
}

function profileBlock(
  profile: Record<string, unknown>,
  key: 'knowledge' | 'live_data' | 'memory' | 'actions' | 'channel',
): Record<string, unknown> {
  const value = profile[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function DashboardSkeleton() {
  return (
    <div className="deployed-agent-analytics">
      <div className="deployed-agent-analytics__stats">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`analytics-stat-skeleton-${index}`} className="deployed-agent-analytics__stat">
            <SkeletonBlock height="2rem" width="5rem" />
            <SkeletonBlock height="0.875rem" width="8rem" />
          </div>
        ))}
      </div>
      <div className="deployed-agent-analytics__table">
        <div className="deployed-agent-analytics__table-head">
          <span>User</span>
          <span>Last Active</span>
          <span>Messages</span>
          <span>Memory</span>
          <span aria-hidden="true" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={`analytics-row-skeleton-${index}`} className="deployed-agent-analytics__table-row deployed-agent-analytics__table-row--skeleton">
            <SkeletonBlock height="1rem" width="9rem" />
            <SkeletonBlock height="1rem" width="6rem" />
            <SkeletonBlock height="1rem" width="4rem" />
            <SkeletonBlock height="1rem" width="4rem" />
            <SkeletonBlock height="1rem" width="1.5rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkstationDeployedAgentAnalyticsPane({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}) {
  const services = useWorkspaceServices();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const activeRequestControllerRef = useRef<AbortController | null>(null);

  async function loadDashboard(options?: { append?: boolean; cursor?: DashboardCursor | null }) {
    const append = options?.append === true;
    const requestedCursor = options?.cursor ?? null;
    if (!agentId) {
      setDashboard(null);
      setLoading(false);
      return;
    }
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError(null);
    activeRequestControllerRef.current?.abort();
    const requestController = new AbortController();
    activeRequestControllerRef.current = requestController;
    try {
      const response = await services.transport.request(
        buildDashboardPath({
          workspaceId,
          agentId,
          limit: 50,
          cursor: requestedCursor,
        }),
        {
          method: 'GET',
          signal: requestController.signal,
        },
      );
      const text = await response.text();
      let payload: unknown = null;
      if (text.trim()) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status));
      }
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return;
      }
      const normalized = normalizeDashboard(payload);
      setDashboard((current) => {
        if (!append || !current) {
          return normalized;
        }
        return {
          ...normalized,
          userRows: mergeUserRows(current.userRows, normalized.userRows),
        };
      });
    } catch (loadError) {
      if (requestController.signal.aborted || activeRequestControllerRef.current !== requestController) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Analytics could not be loaded.');
      if (!append) {
        setDashboard(null);
      }
    } finally {
      if (activeRequestControllerRef.current === requestController) {
        activeRequestControllerRef.current = null;
      }
      if (requestController.signal.aborted) {
        return;
      }
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    setExpandedUsers({});
    void loadDashboard({ cursor: null });
    return () => {
      activeRequestControllerRef.current?.abort();
      activeRequestControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, workspaceId]);

  const userRows = useMemo(
    () => dashboard?.userRows ?? [],
    [dashboard],
  );
  const customerEntry = dashboard?.customerEntry ?? null;

  if (loading && !dashboard) {
    return <DashboardSkeleton />;
  }

  if (error && !dashboard) {
    return (
      <div className="deployed-agent-analytics">
        <EmptyPanel
          title="Analytics could not be loaded"
          body="Refresh analytics when the service is ready."
          actions={(
            <AppButton type="button" onClick={() => { void loadDashboard({ cursor: null }); }}>
              Retry
            </AppButton>
          )}
        />
      </div>
    );
  }

  if (!dashboard || userRows.length === 0) {
    return (
      <div className="deployed-agent-analytics">
        <div className="deployed-agent-analytics__stats">
          {[
            ['Total Users', dashboard?.totalUsers ?? 0],
            ['Messages Today', dashboard?.messagesToday ?? 0],
            ['Messages This Month', dashboard?.messagesThisCalendarMonth ?? 0],
            ['Orders Today', dashboard?.ordersToday ?? 0],
            ['Revenue Today', formatUsd(dashboard?.revenueTodayUsd ?? 0)],
            ['Users At Limit Today', dashboard?.usersAtLimitToday ?? 0],
            ['Upgrade Clicks This Month', dashboard?.upgradeClicksThisMonth ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="deployed-agent-analytics__stat">
              <strong className="deployed-agent-analytics__stat-value">
                {typeof value === 'string' ? value : formatCount(Number(value))}
              </strong>
              <span className="deployed-agent-analytics__stat-label">{label}</span>
            </div>
          ))}
        </div>
        <EmptyPanel
          title="No users have messaged this agent yet."
          body="Analytics will appear here once customer messages start flowing through this specialist."
        />
      </div>
    );
  }

  return (
    <div className="deployed-agent-analytics">
      {error ? (
        <div className="deployed-agent-analytics__error">
          <span>Analytics could not refresh. Try again when ready.</span>
          <AppButton type="button" tone="secondary" onClick={() => { void loadDashboard({ cursor: null }); }}>
            Retry
          </AppButton>
        </div>
      ) : null}
      <div className="deployed-agent-analytics__stats">
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.totalUsers)}</strong>
          <span className="deployed-agent-analytics__stat-label">Total Users</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.messagesToday)}</strong>
          <span className="deployed-agent-analytics__stat-label">Messages Today</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.messagesThisCalendarMonth)}</strong>
          <span className="deployed-agent-analytics__stat-label">Messages This Month</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.ordersToday)}</strong>
          <span className="deployed-agent-analytics__stat-label">Orders Today</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatUsd(dashboard.revenueTodayUsd)}</strong>
          <span className="deployed-agent-analytics__stat-label">Revenue Today</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.usersAtLimitToday)}</strong>
          <span className="deployed-agent-analytics__stat-label">Users At Limit Today</span>
        </div>
        <div className="deployed-agent-analytics__stat">
          <strong className="deployed-agent-analytics__stat-value">{formatCount(dashboard.upgradeClicksThisMonth)}</strong>
          <span className="deployed-agent-analytics__stat-label">Upgrade Clicks This Month</span>
        </div>
      </div>

      <div className="deployed-agent-analytics__expanded">
        <div className="deployed-agent-analytics__message">
          <div className="deployed-agent-analytics__message-meta">
            <span className="deployed-agent-analytics__role deployed-agent-analytics__role--agent">Customer entry</span>
            <span>{readString(customerEntry?.qr_target, 'waiting')}</span>
          </div>
          <div className="deployed-agent-analytics__message-body">
            {readString(customerEntry?.entry_url, 'No QR entry URL configured yet.')}
          </div>
          {readString(customerEntry?.qr_image_url) ? (
            <div className="app-stack-2">
              <img
                src={readString(customerEntry?.qr_image_url)}
                alt="Customer entry QR code"
                className="deployed-agent-analytics__qr"
              />
              {readString(customerEntry?.telegram_deep_link) ? (
                <a href={readString(customerEntry?.telegram_deep_link)} target="_blank" rel="noreferrer">
                  Open Telegram entry
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="deployed-agent-analytics__message">
          <div className="deployed-agent-analytics__message-meta">
            <span className="deployed-agent-analytics__role deployed-agent-analytics__role--agent">Common questions</span>
            <span>{dashboard.commonQuestions.length > 0 ? `${dashboard.commonQuestions.length} tracked` : 'No repeats yet'}</span>
          </div>
          <div className="deployed-agent-analytics__message-body">
            {dashboard.commonQuestions.length > 0
              ? dashboard.commonQuestions.map((item) => `${readString(item.question, 'Question')} (${formatCount(readNumber(item.count) ?? 0)})`).join(' · ')
              : 'Repeated menu and ordering questions will appear here once customers start asking them.'}
          </div>
        </div>

        <div className="deployed-agent-analytics__table">
          <div className="deployed-agent-analytics__table-head">
            <span>Block</span>
            <span>Mode</span>
            <span>Summary</span>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
          {(['knowledge', 'live_data', 'memory', 'actions', 'channel'] as const).map((key) => {
            const block = profileBlock(dashboard.specialistProfile, key);
            return (
              <div key={key} className="deployed-agent-analytics__table-row">
                <span className="deployed-agent-analytics__cell">
                  <strong>{readString(block.title, key.replace('_', ' '))}</strong>
                </span>
                <span className="deployed-agent-analytics__cell">{readString(block.mode, 'Configured')}</span>
                <span className="deployed-agent-analytics__cell">{readString(block.summary, 'Configured')}</span>
                <span className="deployed-agent-analytics__cell" />
                <span className="deployed-agent-analytics__cell" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="deployed-agent-analytics__table">
        <div className="deployed-agent-analytics__table-head">
          <span>User</span>
          <span>Last Active</span>
          <span>Messages</span>
          <span>Memory</span>
          <span aria-hidden="true" />
        </div>
        {userRows.map((row, index) => {
          const externalUserId = readString(row.external_user_id, `user-${index}`);
          const truncatedExternalUserId = truncateExternalUserId(externalUserId);
          const expanded = expandedUsers[externalUserId] === true;
          const lastMessages = readItems<DeployedAgentAdminDashboardMessage>(row.last_5_messages);
          return (
            <div key={externalUserId} className="deployed-agent-analytics__row-group">
              <button
                type="button"
                className={joinClassNames(
                  'deployed-agent-analytics__table-row',
                  expanded && 'deployed-agent-analytics__table-row--expanded',
                )}
                onClick={() => {
                  setExpandedUsers((current) => ({
                    ...current,
                    [externalUserId]: !expanded,
                  }));
                }}
              >
                <span className="deployed-agent-analytics__cell deployed-agent-analytics__cell--user">
                  <strong title={externalUserId}>{truncatedExternalUserId}</strong>
                  <span className="deployed-agent-analytics__user-id-secondary" title={externalUserId}>{truncatedExternalUserId}</span>
                </span>
                <span className="deployed-agent-analytics__cell">
                  {formatRelativeTime(row.last_message_at)}
                </span>
                <span className="deployed-agent-analytics__cell">
                  {formatCount(readNumber(row.total_message_count))}
                </span>
                <span className="deployed-agent-analytics__cell">
                  {formatCount(readNumber(row.memory_entry_count))}
                </span>
                <span className="deployed-agent-analytics__cell deployed-agent-analytics__cell--expand">
                  {expanded ? <ChevronDown size={16} strokeWidth={1.9} /> : <ChevronRight size={16} strokeWidth={1.9} />}
                </span>
              </button>
              {expanded ? (
                <div className="deployed-agent-analytics__expanded">
                  {lastMessages.length === 0 ? (
                    <div className="deployed-agent-analytics__expanded-empty">No recent messages recorded for this user yet.</div>
                  ) : (
                    lastMessages.map((message, messageIndex) => (
                      <div
                        key={readString(message.id, `${externalUserId}-message-${messageIndex}`)}
                        className="deployed-agent-analytics__message"
                      >
                        <div className="deployed-agent-analytics__message-meta">
                          <span className={joinClassNames(
                            'deployed-agent-analytics__role',
                            readString(message.role).toLowerCase() === 'agent'
                              ? 'deployed-agent-analytics__role--agent'
                              : 'deployed-agent-analytics__role--user',
                          )}
                          >
                            {messageRoleLabel(message)}
                          </span>
                          <span>{formatTimestamp(message.created_at)}</span>
                        </div>
                        <div className="deployed-agent-analytics__message-body">
                          {readString(message.content, 'No message content available.')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {dashboard.hasMore ? (
        <div className="deployed-agent-analytics__footer">
          <AppButton
            type="button"
            tone="secondary"
            onClick={() => {
              if (!dashboard.nextCursorLastMessageAt || !dashboard.nextCursorExternalUserId) {
                return;
              }
              void loadDashboard({
                append: true,
                cursor: {
                  lastMessageAt: dashboard.nextCursorLastMessageAt,
                  externalUserId: dashboard.nextCursorExternalUserId,
                },
              });
            }}
            disabled={loadingMore || !dashboard.nextCursorLastMessageAt || !dashboard.nextCursorExternalUserId}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}
